-- RockStack-managed owner invitations. Raw tokens are returned once and never
-- persisted; all durable state stores only a SHA-256 digest.
begin;

create function private.normalize_invitation_email(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(btrim(value));
$$;
revoke all on function private.normalize_invitation_email(text) from public, anon, authenticated, service_role;

create table private.owner_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null check (
    email = private.normalize_invitation_email(email)
    and length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revocation_reason text check (revocation_reason is null or length(revocation_reason) between 1 and 500),
  expired_at timestamptz,
  expired_by uuid references auth.users(id) on delete restrict,
  check (expires_at > created_at),
  check ((accepted_at is null) = (accepted_by is null)),
  check ((revoked_at is null) = (revoked_by is null)),
  check ((expired_at is null) = (expired_by is null)),
  check ((revoked_at is null) = (revocation_reason is null)),
  check (num_nonnulls(accepted_at, revoked_at, expired_at) <= 1)
);
create unique index owner_invitations_one_pending_email
  on private.owner_invitations(organization_id, email)
  where accepted_at is null and revoked_at is null and expired_at is null;
create index owner_invitations_expiry
  on private.owner_invitations(expires_at, id)
  where accepted_at is null and revoked_at is null and expired_at is null;

alter table private.owner_invitations enable row level security;
revoke all on private.owner_invitations from public, anon, authenticated, service_role;
grant usage on schema private to service_role;

create function private.assert_verified_platform_operator(actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null or not exists (
    select 1
    from private.platform_operators operator_record
    join auth.users auth_user on auth_user.id = operator_record.user_id
    where operator_record.user_id = actor_user_id
      and auth_user.email_confirmed_at is not null
      and auth_user.deleted_at is null
      and (auth_user.banned_until is null or auth_user.banned_until <= clock_timestamp())
  ) then
    raise exception 'Verified platform operator required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_verified_platform_operator(uuid) from public, anon, authenticated, service_role;

create function private.write_owner_invitation_audit(
  invitation_id uuid,
  target_organization_id uuid,
  actor_user_id uuid,
  audit_operation text,
  event_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_id uuid;
begin
  if audit_operation not in ('INSERT', 'UPDATE')
    or event_type not in ('owner_invitation.created', 'owner_invitation.accepted', 'owner_invitation.expired', 'owner_invitation.revoked') then
    raise exception 'Unsupported invitation audit event' using errcode = '22023';
  end if;

  insert into public.audit_events(organization_id, actor_user_id, resource_type, resource_id, operation)
  values (target_organization_id, actor_user_id, 'owner_invitation', invitation_id::text, audit_operation)
  returning id into audit_id;

  insert into private.outbox_events(organization_id, audit_event_id, event_type, resource_id)
  values (target_organization_id, audit_id, event_type, invitation_id::text);
end;
$$;
revoke all on function private.write_owner_invitation_audit(uuid,uuid,uuid,text,text) from public, anon, authenticated, service_role;

create function private.create_owner_invitation(
  target_organization_id uuid,
  intended_email text,
  actor_user_id uuid,
  valid_for interval default interval '48 hours'
)
returns table(invitation_id uuid, invitation_token text, invitation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  raw_token text;
  new_invitation_id uuid;
  new_expires_at timestamptz;
  stale_invitation record;
begin
  perform private.assert_verified_platform_operator(actor_user_id);
  if not exists (
    select 1 from public.organizations organization_record
    where organization_record.id = target_organization_id
      and organization_record.status in ('onboarding', 'active')
  ) then
    raise exception 'Organization is not eligible for onboarding' using errcode = '22023';
  end if;
  if valid_for < interval '5 minutes' or valid_for > interval '7 days' then
    raise exception 'Invitation lifetime must be between 5 minutes and 7 days' using errcode = '22023';
  end if;

  normalized_email := private.normalize_invitation_email(intended_email);
  if normalized_email is null
    or length(normalized_email) not between 3 and 320
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invitation email' using errcode = '22023';
  end if;

  for stale_invitation in
    select invitation_record.id, invitation_record.organization_id
    from private.owner_invitations invitation_record
    where invitation_record.organization_id = target_organization_id
      and invitation_record.email = normalized_email
      and invitation_record.accepted_at is null
      and invitation_record.revoked_at is null
      and invitation_record.expired_at is null
      and invitation_record.expires_at <= clock_timestamp()
    for update
  loop
    update private.owner_invitations
    set expired_at = clock_timestamp(), expired_by = actor_user_id
    where id = stale_invitation.id;
    perform private.write_owner_invitation_audit(
      stale_invitation.id, stale_invitation.organization_id, actor_user_id, 'UPDATE', 'owner_invitation.expired'
    );
  end loop;

  if exists (
    select 1 from private.owner_invitations invitation_record
    where invitation_record.organization_id = target_organization_id
      and invitation_record.email = normalized_email
      and invitation_record.accepted_at is null
      and invitation_record.revoked_at is null
      and invitation_record.expired_at is null
  ) then
    raise exception 'An active invitation already exists' using errcode = '23505';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  new_expires_at := clock_timestamp() + valid_for;
  insert into private.owner_invitations(organization_id, email, token_hash, expires_at, created_by)
  values (
    target_organization_id,
    normalized_email,
    extensions.digest(raw_token, 'sha256'),
    new_expires_at,
    actor_user_id
  )
  returning id into new_invitation_id;

  perform private.write_owner_invitation_audit(
    new_invitation_id, target_organization_id, actor_user_id, 'INSERT', 'owner_invitation.created'
  );
  return query select new_invitation_id, raw_token, new_expires_at;
end;
$$;

create function private.revoke_owner_invitation(
  target_invitation_id uuid,
  expected_organization_id uuid,
  actor_user_id uuid,
  reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record private.owner_invitations%rowtype;
  normalized_reason text := btrim(reason);
begin
  perform private.assert_verified_platform_operator(actor_user_id);
  if normalized_reason is null or length(normalized_reason) not between 1 and 500 then
    raise exception 'Revocation reason is required' using errcode = '22023';
  end if;

  select * into invitation_record
  from private.owner_invitations invitation_row
  where invitation_row.id = target_invitation_id
    and invitation_row.organization_id = expected_organization_id
  for update;
  if not found then
    raise exception 'Invitation not found' using errcode = '22023';
  end if;
  if invitation_record.revoked_at is not null then return false; end if;
  if invitation_record.accepted_at is not null or invitation_record.expired_at is not null then
    raise exception 'Invitation is no longer revocable' using errcode = '55000';
  end if;

  update private.owner_invitations
  set revoked_at = clock_timestamp(), revoked_by = actor_user_id, revocation_reason = normalized_reason
  where id = invitation_record.id;
  perform private.write_owner_invitation_audit(
    invitation_record.id, invitation_record.organization_id, actor_user_id, 'UPDATE', 'owner_invitation.revoked'
  );
  return true;
end;
$$;

create function private.expire_owner_invitations(actor_user_id uuid, target_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record record;
  expired_count integer := 0;
begin
  perform private.assert_verified_platform_operator(actor_user_id);
  for invitation_record in
    select invitation_row.id, invitation_row.organization_id
    from private.owner_invitations invitation_row
    where (target_organization_id is null or invitation_row.organization_id = target_organization_id)
      and invitation_row.accepted_at is null
      and invitation_row.revoked_at is null
      and invitation_row.expired_at is null
      and invitation_row.expires_at <= clock_timestamp()
    order by invitation_row.expires_at, invitation_row.id
    for update skip locked
  loop
    update private.owner_invitations
    set expired_at = clock_timestamp(), expired_by = actor_user_id
    where id = invitation_record.id;
    perform private.write_owner_invitation_audit(
      invitation_record.id, invitation_record.organization_id, actor_user_id, 'UPDATE', 'owner_invitation.expired'
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create function private.accept_owner_invitation(invitation_token text, expected_organization_id uuid)
returns table(organization_id uuid, membership_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record private.owner_invitations%rowtype;
  actor_user_id uuid := auth.uid();
  actor_email text;
  existing_role text;
  existing_status text;
  created_membership boolean := false;
begin
  if actor_user_id is null or invitation_token is null or invitation_token !~ '^[0-9a-f]{64}$' then return; end if;

  select private.normalize_invitation_email(auth_user.email)
  into actor_email
  from auth.users auth_user
  where auth_user.id = actor_user_id
    and auth_user.email is not null
    and auth_user.email_confirmed_at is not null
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= clock_timestamp());
  if not found then return; end if;

  select * into invitation_record
  from private.owner_invitations invitation_row
  where invitation_row.token_hash = extensions.digest(invitation_token, 'sha256')
  for update;
  if not found or invitation_record.organization_id <> expected_organization_id then return; end if;

  if invitation_record.accepted_at is not null then
    if invitation_record.accepted_by = actor_user_id and exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = invitation_record.organization_id
        and membership.user_id = actor_user_id
        and membership.role = 'owner'
        and membership.status = 'active'
    ) then
      return query select invitation_record.organization_id, false;
    end if;
    return;
  end if;
  if invitation_record.revoked_at is not null or invitation_record.expired_at is not null then return; end if;
  if invitation_record.expires_at <= clock_timestamp() then
    update private.owner_invitations
    set expired_at = clock_timestamp(), expired_by = actor_user_id
    where id = invitation_record.id;
    perform private.write_owner_invitation_audit(
      invitation_record.id, invitation_record.organization_id, actor_user_id, 'UPDATE', 'owner_invitation.expired'
    );
    return;
  end if;
  if invitation_record.email <> actor_email then return; end if;

  select membership.role, membership.status
  into existing_role, existing_status
  from public.organization_memberships membership
  where membership.organization_id = invitation_record.organization_id
    and membership.user_id = actor_user_id
  for update;

  if found then
    if existing_role <> 'owner' or existing_status <> 'active' then return; end if;
  else
    insert into public.organization_memberships(organization_id, user_id, role, status)
    values (invitation_record.organization_id, actor_user_id, 'owner', 'active');
    created_membership := true;
  end if;

  update private.owner_invitations
  set accepted_at = clock_timestamp(), accepted_by = actor_user_id
  where id = invitation_record.id;
  perform private.write_owner_invitation_audit(
    invitation_record.id, invitation_record.organization_id, actor_user_id, 'UPDATE', 'owner_invitation.accepted'
  );
  return query select invitation_record.organization_id, created_membership;
end;
$$;

revoke all on function private.create_owner_invitation(uuid,text,uuid,interval) from public, anon, authenticated, service_role;
revoke all on function private.revoke_owner_invitation(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.expire_owner_invitations(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.accept_owner_invitation(text,uuid) from public, anon, authenticated, service_role;
grant execute on function private.create_owner_invitation(uuid,text,uuid,interval) to service_role;
grant execute on function private.revoke_owner_invitation(uuid,uuid,uuid,text) to service_role;
grant execute on function private.expire_owner_invitations(uuid,uuid) to service_role;
grant execute on function private.accept_owner_invitation(text,uuid) to authenticated;

create function public.server_create_owner_invitation(
  target_organization_id uuid,
  intended_email text,
  actor_user_id uuid,
  valid_for interval default interval '48 hours'
)
returns table(invitation_id uuid, invitation_token text, invitation_expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_owner_invitation(target_organization_id, intended_email, actor_user_id, valid_for);
$$;

create function public.server_revoke_owner_invitation(
  target_invitation_id uuid,
  expected_organization_id uuid,
  actor_user_id uuid,
  reason text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_owner_invitation(target_invitation_id, expected_organization_id, actor_user_id, reason);
$$;

create function public.server_expire_owner_invitations(actor_user_id uuid, target_organization_id uuid default null)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.expire_owner_invitations(actor_user_id, target_organization_id);
$$;

create function public.accept_owner_invitation(invitation_token text, expected_organization_id uuid)
returns table(organization_id uuid, membership_created boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.accept_owner_invitation(invitation_token, expected_organization_id);
$$;

revoke all on function public.server_create_owner_invitation(uuid,text,uuid,interval) from public, anon, authenticated, service_role;
revoke all on function public.server_revoke_owner_invitation(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.server_expire_owner_invitations(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_owner_invitation(text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.server_create_owner_invitation(uuid,text,uuid,interval) to service_role;
grant execute on function public.server_revoke_owner_invitation(uuid,uuid,uuid,text) to service_role;
grant execute on function public.server_expire_owner_invitations(uuid,uuid) to service_role;
grant execute on function public.accept_owner_invitation(text,uuid) to authenticated;

commit;
