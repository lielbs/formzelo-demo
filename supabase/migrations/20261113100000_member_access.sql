-- What each staff member may open: everything ('all'), only Formangle processes and requests
-- ('formangle'), or only Formangle Tables ('tables'). Owners always have everything.
-- Enforced in the database: the generic workspace check (has_org_role) refuses Tables-only staff,
-- and the Tables role check refuses Formangle-only staff.
begin;

alter table public.organization_memberships
  add column if not exists access text not null default 'all' check (access in ('all','formangle','tables'));
alter table public.organization_memberships
  add constraint memberships_owner_full_access check (role <> 'owner' or access = 'all');
alter table private.owner_invitations
  add column if not exists access text not null default 'all' check (access in ('all','formangle','tables'));

-- Formangle data (processes, requests, brand, team): Tables-only staff are not let in.
create or replace function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org and m.user_id = auth.uid()
      and m.status = 'active' and o.status = 'active' and m.role = any(allowed_roles)
      and (m.role = 'owner' or m.access <> 'tables')
  );
$$;

-- Any active member of an active workspace, whatever their access (Tables screens use it).
create function private.is_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org and m.user_id = auth.uid() and m.status = 'active' and o.status = 'active'
  );
$$;
revoke all on function private.is_member(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;

-- Signing in needs the workspace name and one's own membership, whatever the access.
drop policy if exists organizations_member on public.organizations;
create policy organizations_member on public.organizations for select to authenticated
  using (private.is_member(id));
drop policy if exists memberships_member on public.organization_memberships;
create policy memberships_member on public.organization_memberships for select to authenticated
  using (private.has_org_role(organization_id, array['owner','staff']) or user_id = (select auth.uid()));

-- Tables: staff need a venue assignment AND access that includes Tables.
create or replace function private.tables_role(p_venue uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when exists (
      select 1 from public.tables_venues v
      join public.organizations o on o.id = v.organization_id and o.status = 'active'
      join public.tables_organization_features f on f.organization_id = v.organization_id and f.enabled
      join public.organization_memberships m on m.organization_id = v.organization_id and m.user_id = auth.uid()
        and m.status = 'active' and m.role = 'owner'
      where v.id = p_venue and v.status <> 'archived') then 'owner'
    else (
      select s.role from public.tables_venue_staff s
      join public.tables_venues v on v.id = s.venue_id and v.status <> 'archived'
      join public.organizations o on o.id = v.organization_id and o.status = 'active'
      join public.tables_organization_features f on f.organization_id = v.organization_id and f.enabled
      join public.organization_memberships m on m.organization_id = v.organization_id and m.user_id = auth.uid()
        and m.status = 'active' and m.access <> 'formangle'
      where s.venue_id = p_venue and s.user_id = auth.uid() and s.status = 'active')
  end
$$;

drop policy if exists tables_feature_member on public.tables_organization_features;
create policy tables_feature_member on public.tables_organization_features for select to authenticated
  using (private.is_member(organization_id));

create or replace function public.tables_list_venues(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_organization_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'enabled', private.tables_org_enabled(p_organization_id),
    'canCreate', private.has_org_role(p_organization_id, array['owner']) and private.tables_org_enabled(p_organization_id),
    'venues', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'slug', v.slug, 'name', v.name, 'status', v.status, 'timezone', v.timezone,
        'role', private.tables_role(v.id), 'published', v.current_version_id is not null,
        'versionNumber', (select vv.version_number from public.tables_venue_versions vv where vv.id = v.current_version_id))
        order by v.created_at)
      from public.tables_venues v
      where v.organization_id = p_organization_id and v.status <> 'archived' and private.tables_role(v.id) is not null), '[]'::jsonb));
end;
$$;

-- The signed-in person's own access in each workspace (the app shows only what they may open).
create function public.my_access()
returns table(organization_id uuid, role text, access text)
language sql stable security definer set search_path = '' as $$
  select m.organization_id, m.role, m.access from public.organization_memberships m
  where m.user_id = auth.uid() and m.status = 'active'
$$;
revoke all on function public.my_access() from public, anon, authenticated, service_role;
grant execute on function public.my_access() to authenticated;

-- Team list now says what each person can open (owners see pending invitations' access too).
create or replace function public.list_team(p_organization_id uuid)
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
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'role', m.role, 'access', m.access, 'since', m.created_at, 'self', m.user_id = auth.uid())
        order by m.role desc, m.created_at)
      from public.organization_memberships m join auth.users u on u.id = m.user_id
      where m.organization_id = p_organization_id and m.status = 'active'), '[]'::jsonb),
    'invitations', case when not is_owner then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'access', i.access, 'expiresAt', i.expires_at) order by i.created_at desc)
      from private.owner_invitations i
      where i.organization_id = p_organization_id and i.accepted_at is null and i.revoked_at is null and i.expired_at is null
        and i.expires_at > clock_timestamp()), '[]'::jsonb) end);
end;
$$;

-- Owner: change what a staff member (or a pending invitation) can open. Applies on the next request.
create function public.set_member_access(p_organization_id uuid, p_user_id uuid, p_access text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_access not in ('all','formangle','tables') then raise exception 'invalid_access' using errcode = '22023'; end if;
  update public.organization_memberships m set access = p_access
   where m.organization_id = p_organization_id and m.user_id = p_user_id and m.status = 'active' and m.role = 'staff';
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.set_member_access(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_member_access(uuid, uuid, text) to authenticated;

create function public.set_invitation_access(p_organization_id uuid, p_invitation_id uuid, p_access text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_access not in ('all','formangle','tables') then raise exception 'invalid_access' using errcode = '22023'; end if;
  update private.owner_invitations i set access = p_access
   where i.organization_id = p_organization_id and i.id = p_invitation_id and i.role = 'staff'
     and i.accepted_at is null and i.revoked_at is null;
  if not found then raise exception 'invitation_closed' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.set_invitation_access(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_invitation_access(uuid, uuid, text) to authenticated;

-- A staff membership created from an invitation starts with the access written on it.
create function private.membership_access_from_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv_access text;
begin
  if new.role <> 'staff' or new.access <> 'all' then return new; end if;
  select i.access into inv_access
    from private.owner_invitations i join auth.users u on u.id = new.user_id
   where i.organization_id = new.organization_id and i.role = 'staff' and i.revoked_at is null
     and i.email = private.normalize_invitation_email(u.email)
   order by i.created_at desc limit 1;
  if inv_access is not null then new.access := inv_access; end if;
  return new;
end;
$$;
revoke all on function private.membership_access_from_invitation() from public, anon, authenticated;
create trigger membership_access_from_invitation before insert on public.organization_memberships
  for each row execute function private.membership_access_from_invitation();

commit;
