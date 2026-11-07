-- Release V1 rollback: returns FORMANGLE to the four Milestone 0-1 migrations.
-- Verified locally: apply all migrations, run this script, and the public/private schema dump
-- equals a database with only the four baseline migrations (see docs/production/RELEASE-V1.md).
-- Intended for use right after the release, before real data exists. With data, restore the
-- pre-release backup instead (this script refuses to drop non-empty release tables).
begin;

do $$
begin
  if exists (select 1 from public.submissions) or exists (select 1 from public.workflows) or exists (select 1 from public.organizations) then
    raise exception 'Application data exists: restore the pre-release backup instead of running this script';
  end if;
end;
$$;

-- Storage: objects are removed through the Storage API (dashboard or CLI) first; the empty bucket
-- is then removed here. A bucket that still holds objects stops the rollback.
drop policy if exists brand_assets_member_insert on storage.objects;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'brand-assets') then
    raise exception 'brand-assets still holds objects: empty it through the Storage API first';
  end if;
end;
$$;
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'brand-assets';

-- Release tables (functions returning their row types are dropped with them).
drop table if exists public.organization_assets cascade;
drop table if exists private.password_recovery_tokens cascade;
drop table if exists public.quotes cascade;
drop table if exists public.customer_actions cascade;
drop table if exists public.submission_notes cascade;
drop table if exists private.submission_access_tokens cascade;

-- Every function added by the release (the baseline set stays).
do $$
declare f record;
begin
  for f in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and p.proname <> all (array['reject_mutation', 'guard_tenant_update', 'record_change', 'assert_verified_platform_operator', 'write_owner_invitation_audit', 'rls_auto_enable', 'has_org_role', 'normalize_invitation_email', 'create_owner_invitation', 'revoke_owner_invitation', 'expire_owner_invitations', 'accept_owner_invitation', 'server_create_owner_invitation', 'server_revoke_owner_invitation', 'server_expire_owner_invitations', 'create_owner_invitation_authorized', 'server_create_owner_invitation_authorized'])
  loop
    execute 'drop function ' || f.sig || ' cascade';
  end loop;
end;
$$;

-- Columns, constraints and indexes added to baseline tables.
drop index if exists public.submissions_workflow_holding;
drop index if exists public.submissions_public_rate;
alter table public.submissions drop column if exists lock_version, drop column if exists public_client_token;
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in ('received','approved','rejected','cancelled','completed'));
alter table public.workflows drop column if exists template_key, drop column if exists source_prompt, drop column if exists intake, drop column if exists published_lock_version;
alter table public.submission_events drop column if exists visibility, drop column if exists message;
alter table private.owner_invitations drop column if exists role;

-- The invitation acceptance function as it was before the release.
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
revoke all on function private.accept_owner_invitation(text,uuid) from public, anon, authenticated, service_role;
grant execute on function private.accept_owner_invitation(text,uuid) to authenticated;

delete from supabase_migrations.schema_migrations where version in (
  '20261104162858','20261104165034','20261107120000','20261107140000','20261107160000','20261108090000','20261108110000'
);

commit;
