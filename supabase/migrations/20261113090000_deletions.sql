-- Deleting things people no longer want: a process (form / landing page), a Tables venue, and a
-- user account (App Review 5.1.1(v)).
--
-- The schema keeps an immutable audit trail (every foreign key is ON DELETE RESTRICT and audit rows
-- reject mutation), so "delete" removes the item from the product instead of tearing rows out:
-- it disappears from every list and query, its public link is released and stops working, and it
-- can no longer be edited. The audit history stays, as the security design requires.
begin;

-- ---------- Processes ----------
alter table public.workflows add column if not exists deleted_at timestamptz;

-- Deleted processes and their requests are invisible to the app (restrictive = ANDed with tenant_read).
create policy workflows_not_deleted on public.workflows as restrictive for select to authenticated
  using (deleted_at is null);

create function private.workflow_live(p_workflow uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workflows w where w.id = p_workflow and w.deleted_at is null)
$$;
revoke all on function private.workflow_live(uuid) from public, anon;
grant execute on function private.workflow_live(uuid) to authenticated;

create policy submissions_of_live_workflows on public.submissions as restrictive for select to authenticated
  using (private.workflow_live(workflow_id));

-- A deleted process is frozen: no draft save, publish, restore or archive toggle reaches it again.
create function private.workflow_deleted_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null then
    raise exception 'Workflow is unavailable' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke all on function private.workflow_deleted_guard() from public, anon, authenticated;
create trigger workflow_deleted_guard before update on public.workflows
  for each row execute function private.workflow_deleted_guard();

-- Owner only. The public link is released (renamed) and the process stops taking requests at once.
create function public.delete_workflow(p_organization_id uuid, p_workflow_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  update public.workflows w
     set deleted_at = now(),
         status = 'archived',
         public_slug = 'deleted-' || replace(w.id::text, '-', '')
   where w.organization_id = p_organization_id and w.id = p_workflow_id and w.deleted_at is null;
  if not found then
    raise exception 'Workflow is unavailable' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.delete_workflow(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_workflow(uuid, uuid) to authenticated;

-- ---------- Tables venues ----------
-- Owner only, and only when no guest is still expected: upcoming bookings and an open waitlist must be
-- handled first (guests hold links to them). The venue is archived (every staff command already
-- refuses archived venues), and its public address is released.
create function public.tables_delete_venue(p_venue_id uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tables_venues%rowtype;
  upcoming integer;
  waiting integer;
begin
  v := private.tables_require(p_venue_id, 'owner');
  perform 1 from public.tables_venues where id = p_venue_id for update;
  if btrim(coalesce(p_confirm_name, '')) <> btrim(v.name) then
    raise exception 'tables:confirm_mismatch' using errcode = '22023';
  end if;
  select count(*) into upcoming from public.tables_reservations r
   where r.venue_id = p_venue_id and r.status in ('pending_approval','confirmed','arrived','seated') and r.ends_at > now();
  select count(*) into waiting from public.tables_waitlist_entries e
   where e.venue_id = p_venue_id and e.status in ('waiting','offered');
  if upcoming > 0 or waiting > 0 then
    raise exception 'tables:venue_has_guests'
      using errcode = '55000', detail = jsonb_build_object('upcoming', upcoming, 'waiting', waiting)::text;
  end if;
  update public.tables_venues
     set status = 'archived', slug = 'deleted-' || left(replace(id::text, '-', ''), 24)
   where id = p_venue_id;
  update public.tables_menus set status = 'archived' where venue_id = p_venue_id and status <> 'archived';
  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function public.tables_delete_venue(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.tables_delete_venue(uuid, text) to authenticated;

-- ---------- Accounts ----------
-- Called by the account-deletion Edge Function (service role) before the auth user is removed.
-- An owner who leaves a team without another owner is refused (the team would be locked out);
-- a business the user runs alone is closed with the account, so its public links stop.
create function public.server_prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  others integer;
  other_owners integer;
  closed integer := 0;
begin
  if p_user_id is null then raise exception 'invalid_request' using errcode = '22023'; end if;
  perform 1 from public.organization_memberships m
   where m.organization_id in (select organization_id from public.organization_memberships where user_id = p_user_id and status = 'active')
     and m.status = 'active' for update;

  for r in select m.organization_id, m.role from public.organization_memberships m
            where m.user_id = p_user_id and m.status = 'active' loop
    select count(*) filter (where m.user_id <> p_user_id),
           count(*) filter (where m.user_id <> p_user_id and m.role = 'owner')
      into others, other_owners
      from public.organization_memberships m
     where m.organization_id = r.organization_id and m.status = 'active';
    if r.role = 'owner' and other_owners = 0 and others > 0 then
      raise exception 'team_needs_owner' using errcode = '55000';
    end if;
  end loop;

  for r in select m.organization_id from public.organization_memberships m
            where m.user_id = p_user_id and m.status = 'active' and m.role = 'owner'
              and not exists (select 1 from public.organization_memberships o
                               where o.organization_id = m.organization_id and o.status = 'active' and o.user_id <> p_user_id) loop
    update public.organizations set status = 'suspended' where id = r.organization_id;
    closed := closed + 1;
  end loop;

  update public.tables_venue_staff set status = 'revoked' where user_id = p_user_id and status = 'active';
  update public.organization_memberships set status = 'suspended' where user_id = p_user_id and status = 'active';
  update public.profiles set display_name = 'משתמש שנמחק' where user_id = p_user_id;
  return jsonb_build_object('closedOrganizations', closed);
end;
$$;
revoke all on function public.server_prepare_account_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.server_prepare_account_deletion(uuid) to service_role;

commit;
