-- Password recovery without email and without anyone handling a password.
-- A platform operator (for any account) or an owner (for staff of their own workspace) issues a
-- single-use, two-hour, 256-bit link. Only its hash is stored. The account holder opens it and
-- chooses the new password; the account-onboarding Edge Function (service role) consumes the
-- token and sets the password. A new link revokes the previous unused one.
begin;

create table private.password_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index password_recovery_user on private.password_recovery_tokens(user_id, created_at desc);
alter table private.password_recovery_tokens enable row level security;
revoke all on private.password_recovery_tokens from public, anon, authenticated, service_role;

create function private.issue_password_recovery(p_user_id uuid, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text, 11));
  if (select count(*) from private.password_recovery_tokens t where t.created_by = p_actor and t.created_at > clock_timestamp() - interval '1 hour') >= 10 then
    raise exception 'Recovery rate limit exceeded' using errcode = '54000';
  end if;
  update private.password_recovery_tokens t set revoked_at = clock_timestamp()
   where t.user_id = p_user_id and t.used_at is null and t.revoked_at is null;
  insert into private.password_recovery_tokens(user_id, token_hash, created_by, expires_at)
  values (p_user_id, extensions.digest(raw, 'sha256'), p_actor, clock_timestamp() + interval '2 hours');
  insert into public.audit_events(organization_id, actor_user_id, resource_type, resource_id, operation)
  select m.organization_id, p_actor, 'password_recovery', p_user_id::text, 'INSERT'
  from public.organization_memberships m where m.user_id = p_user_id and m.status = 'active';
  return raw;
end;
$$;
revoke all on function private.issue_password_recovery(uuid, uuid) from public, anon, authenticated, service_role;

-- Operators: recovery for an account by its email (owners who forgot their password).
create function public.operator_issue_password_recovery(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if not public.is_platform_operator() then raise exception 'Operator access denied' using errcode = '42501'; end if;
  select u.id into target from auth.users u
   where private.normalize_invitation_email(u.email) = private.normalize_invitation_email(p_email) and u.deleted_at is null;
  if not found then raise exception 'account_not_found' using errcode = 'P0002'; end if;
  return private.issue_password_recovery(target, auth.uid());
end;
$$;

-- Owners: recovery for staff of their own workspace (never for another owner).
create function public.owner_issue_staff_recovery(p_organization_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.organization_memberships m
                 where m.organization_id = p_organization_id and m.user_id = p_user_id and m.role = 'staff' and m.status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  return private.issue_password_recovery(p_user_id, auth.uid());
end;
$$;

-- For the account-onboarding Edge Function only: consumes a valid link exactly once.
create function public.server_consume_password_recovery(recovery_token text)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_token private.password_recovery_tokens%rowtype;
begin
  if recovery_token is null or recovery_token !~ '^[0-9a-f]{64}$' then return; end if;
  select * into found_token from private.password_recovery_tokens t
   where t.token_hash = extensions.digest(recovery_token, 'sha256')
     and t.used_at is null and t.revoked_at is null and t.expires_at > clock_timestamp()
  for update;
  if not found then return; end if;
  update private.password_recovery_tokens set used_at = clock_timestamp() where id = found_token.id;
  return query select u.id, u.email::text from auth.users u where u.id = found_token.user_id and u.deleted_at is null;
end;
$$;

revoke all on function public.operator_issue_password_recovery(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_issue_staff_recovery(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.server_consume_password_recovery(text) from public, anon, authenticated, service_role;
grant execute on function public.operator_issue_password_recovery(text) to authenticated;
grant execute on function public.owner_issue_staff_recovery(uuid, uuid) to authenticated;
grant execute on function public.server_consume_password_recovery(text) to service_role;

commit;
