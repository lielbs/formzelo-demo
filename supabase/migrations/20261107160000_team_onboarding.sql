-- Team onboarding: invitations carry a role, owners invite and remove staff, an invited person
-- creates their account from the invitation itself, and platform operators get a metadata-only
-- overview of the businesses they onboard.
--
-- Account creation: public sign-up stays disabled and Formangle sends no email. The single-use,
-- 256-bit, expiring invitation token is the credential: the account-onboarding Edge Function
-- (service role) may create exactly one confirmed account, for the invitation's own address, and
-- only while the invitation is pending. Acceptance itself still happens as that signed-in user.
begin;

alter table private.owner_invitations
  add column role text not null default 'owner' check (role in ('owner', 'staff'));

-- Owners invite staff to their own workspace. Raw token returned once; only its hash is stored.
create function public.create_staff_invitation(p_organization_id uuid, p_email text)
returns table(invitation_id uuid, invitation_token text, invitation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := private.normalize_invitation_email(p_email);
  raw_token text;
  created_id uuid;
  expires timestamptz := clock_timestamp() + interval '7 days';
begin
  if not private.has_org_role(p_organization_id, array['owner']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if normalized is null or length(normalized) not between 3 and 320 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invitation_email_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text, 7));
  if (select count(*) from private.owner_invitations i where i.organization_id = p_organization_id and i.created_at > clock_timestamp() - interval '1 hour') >= 10 then
    raise exception 'Invitation rate limit exceeded' using errcode = '54000';
  end if;
  if exists (
    select 1 from public.organization_memberships m join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and m.status = 'active' and private.normalize_invitation_email(u.email) = normalized
  ) then raise exception 'already_member' using errcode = '23505'; end if;
  -- A newer invitation replaces a pending one for the same address.
  update private.owner_invitations i set revoked_at = clock_timestamp(), revoked_by = auth.uid(), revocation_reason = 'replaced by a new invitation'
   where i.organization_id = p_organization_id and i.email = normalized and i.accepted_at is null and i.revoked_at is null and i.expired_at is null;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.owner_invitations(organization_id, email, token_hash, expires_at, created_by, role)
  values (p_organization_id, normalized, extensions.digest(raw_token, 'sha256'), expires, auth.uid(), 'staff')
  returning id into created_id;
  perform private.write_owner_invitation_audit(created_id, p_organization_id, auth.uid(), 'INSERT', 'owner_invitation.created');
  return query select created_id, raw_token, expires;
end;
$$;

create function public.revoke_team_invitation(p_organization_id uuid, p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  update private.owner_invitations i set revoked_at = clock_timestamp(), revoked_by = auth.uid(), revocation_reason = 'revoked by owner'
   where i.id = p_invitation_id and i.organization_id = p_organization_id and i.role = 'staff'
     and i.accepted_at is null and i.revoked_at is null and i.expired_at is null;
  if not found then raise exception 'invitation_closed' using errcode = '55000'; end if;
  perform private.write_owner_invitation_audit(p_invitation_id, p_organization_id, auth.uid(), 'UPDATE', 'owner_invitation.revoked');
end;
$$;

-- Members see who is on the team; owners also see pending invitations.
create function public.list_team(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_owner boolean := private.has_org_role(p_organization_id, array['owner']);
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'role', m.role, 'since', m.created_at, 'self', m.user_id = auth.uid())
        order by m.role desc, m.created_at)
      from public.organization_memberships m join auth.users u on u.id = m.user_id
      where m.organization_id = p_organization_id and m.status = 'active'), '[]'::jsonb),
    'invitations', case when not is_owner then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'expiresAt', i.expires_at) order by i.created_at desc)
      from private.owner_invitations i
      where i.organization_id = p_organization_id and i.accepted_at is null and i.revoked_at is null and i.expired_at is null
        and i.expires_at > clock_timestamp()), '[]'::jsonb) end);
end;
$$;

-- Removing access is immediate: RLS checks the membership on every request.
create function public.remove_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if not private.has_org_role(p_organization_id, array['owner']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  perform 1 from public.organization_memberships m where m.organization_id = p_organization_id and m.status = 'active' for update;
  select m.role into target_role from public.organization_memberships m
   where m.organization_id = p_organization_id and m.user_id = p_user_id and m.status = 'active';
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;
  if target_role = 'owner' and (select count(*) from public.organization_memberships m
      where m.organization_id = p_organization_id and m.role = 'owner' and m.status = 'active') <= 1 then
    raise exception 'last_owner' using errcode = '55000';
  end if;
  update public.organization_memberships m set status = 'suspended'
   where m.organization_id = p_organization_id and m.user_id = p_user_id;
end;
$$;

-- Acceptance now grants the role written on the invitation.
create or replace function private.accept_owner_invitation(invitation_token text, expected_organization_id uuid)
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
        and membership.role = invitation_record.role
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
    if existing_status = 'active' and existing_role <> invitation_record.role and existing_role = 'owner' then
      -- An owner keeps owning; a staff invitation never demotes them.
      null;
    elsif existing_status = 'active' and existing_role = invitation_record.role then
      null;
    else
      -- A removed member who is invited again comes back with the invited role.
      update public.organization_memberships
      set role = invitation_record.role, status = 'active'
      where organization_memberships.organization_id = invitation_record.organization_id
        and organization_memberships.user_id = actor_user_id;
      created_membership := true;
    end if;
  else
    insert into public.organization_memberships(organization_id, user_id, role, status)
    values (invitation_record.organization_id, actor_user_id, invitation_record.role, 'active');
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
revoke all on function private.accept_owner_invitation(text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.accept_owner_invitation(text, uuid) to authenticated;

-- For the account-onboarding Edge Function only (service role): who may get an account.
create function public.server_invitation_onboarding_target(invitation_token text, expected_organization_id uuid)
returns table(email text, account_exists boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record private.owner_invitations%rowtype;
begin
  if invitation_token is null or invitation_token !~ '^[0-9a-f]{64}$' then return; end if;
  select * into invitation_record from private.owner_invitations i
   where i.token_hash = extensions.digest(invitation_token, 'sha256') and i.organization_id = expected_organization_id
     and i.accepted_at is null and i.revoked_at is null and i.expired_at is null and i.expires_at > clock_timestamp();
  if not found then return; end if;
  return query select invitation_record.email,
    exists (select 1 from auth.users u where private.normalize_invitation_email(u.email) = invitation_record.email);
end;
$$;

-- ---------- Platform operators: metadata only, never tenant data ----------
create function public.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.platform_operators p join auth.users u on u.id = p.user_id
    where p.user_id = auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
  )
$$;

create function public.operator_list_organizations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then raise exception 'Operator access denied' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status, 'createdAt', o.created_at,
      'owners', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.role = 'owner' and m.status = 'active'),
      'staff', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.role = 'staff' and m.status = 'active'),
      'workflows', (select count(*) from public.workflows w where w.organization_id = o.id and w.status <> 'archived'),
      'pendingOwnerInvitation', (select jsonb_build_object('email', i.email, 'expiresAt', i.expires_at) from private.owner_invitations i
        where i.organization_id = o.id and i.role = 'owner' and i.accepted_at is null and i.revoked_at is null and i.expired_at is null
          and i.expires_at > clock_timestamp() order by i.created_at desc limit 1)
    ) order by o.created_at desc)
    from public.organizations o), '[]'::jsonb);
end;
$$;

revoke all on function public.create_staff_invitation(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_team_invitation(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_team(uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.server_invitation_onboarding_target(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_platform_operator() from public, anon, authenticated, service_role;
revoke all on function public.operator_list_organizations() from public, anon, authenticated, service_role;
grant execute on function public.create_staff_invitation(uuid, text) to authenticated;
grant execute on function public.revoke_team_invitation(uuid, uuid) to authenticated;
grant execute on function public.list_team(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.server_invitation_onboarding_target(text, uuid) to service_role;
grant execute on function public.is_platform_operator() to authenticated;
grant execute on function public.operator_list_organizations() to authenticated;

commit;
