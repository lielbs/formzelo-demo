-- Formangle Tables rollback: returns the schema to the 11-migration Production V1 state.
-- Refuses to run if any Tables data exists (export first, then delete deliberately under an
-- approved incident plan). Never run against RAVO; the project guard is the operator's job.
begin;

do $$
begin
  if exists (select 1 from public.tables_venues) or exists (select 1 from public.tables_organization_features where enabled) then
    raise exception 'Tables data exists: export it and disable the module before rolling back';
  end if;
end;
$$;

-- Restore the Production V1 operator overview (without tablesEnabled).
create or replace function public.operator_list_organizations()
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

do $$
declare r record;
begin
  -- Functions first (they reference the tables), public and private.
  for r in select n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) args
           from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public','private') and (p.proname like 'tables\_%' escape '\' or p.proname = 'operator_set_tables_enabled') loop
    execute format('drop function %I.%I(%s) cascade', r.nspname, r.proname, r.args);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tables_shift_revisions') then
    alter publication supabase_realtime drop table public.tables_shift_revisions;
  end if;
end;
$$;

-- Tables in dependency order (children first).
drop table if exists private.tables_privacy_log;
drop table if exists private.tables_rate_events;
drop table if exists private.tables_access_tokens;
drop table if exists public.tables_menu_versions cascade;
drop table if exists public.tables_menus cascade;
drop table if exists public.tables_notes;
drop table if exists public.tables_shift_revisions;
drop table if exists public.tables_table_states;
drop table if exists public.tables_allocations;
drop table if exists public.tables_reservation_events;
drop table if exists public.tables_waitlist_entries cascade;
drop table if exists public.tables_reservations cascade;
drop table if exists public.tables_guests;
drop table if exists public.tables_service_exceptions;
drop table if exists public.tables_layout_table_snapshots;
drop table if exists public.tables_combination_members;
drop table if exists public.tables_combinations;
drop table if exists public.tables_physical_tables;
drop table if exists public.tables_zones;
alter table if exists public.tables_venues drop constraint if exists tables_venue_current_version;
drop table if exists public.tables_venue_versions;
drop table if exists public.tables_venue_staff;
drop table if exists public.tables_venues;
drop table if exists public.tables_organization_features;
-- btree_gist stays installed: extensions are harmless and may be used elsewhere later.

delete from supabase_migrations.schema_migrations where version in
  ('20261110090000','20261110100000','20261110110000','20261110120000','20261110130000','20261110140000','20261110150000','20261110160000');
commit;
