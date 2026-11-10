-- Formangle Tables T1: module flag, venues, venue roles, draft configuration and immutable
-- published versions with stable zones, physical tables and combinations.
--
-- Trust model
--  * Tables is off for every organization until a platform operator enables it (kill switch).
--  * Organization owners have full access to every venue of their organization. Other active
--    members get venue-scoped roles (manager, host, viewer) through tables_venue_staff.
--  * The owner edits one draft document per venue. Nothing in the draft affects guests until
--    tables_publish_venue validates it and writes an immutable version. Physical table,
--    zone and combination identities are stable UUIDs; removed tables are archived, never deleted.
--  * Every privilege decision reads auth.uid() and live membership rows; no client-supplied
--    actor, role or organization is trusted.
begin;

-- ---------- Module flag (operator-controlled) ----------
create table public.tables_organization_features (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- ---------- Venues ----------
create table public.tables_venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  timezone text not null default 'Asia/Jerusalem' check (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){0,2}$'),
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 262144),
  lock_version bigint not null default 0 check (lock_version >= 0),
  current_version_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index tables_venues_org on public.tables_venues(organization_id, created_at);

create table public.tables_venue_staff (
  organization_id uuid not null,
  venue_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('manager','host','viewer')),
  status text not null default 'active' check (status in ('active','revoked')),
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (venue_id, user_id),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete restrict
);
create index tables_venue_staff_user on public.tables_venue_staff(user_id, venue_id) where status = 'active';

create table public.tables_venue_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 262144),
  published_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  unique (organization_id, venue_id, id),
  unique (venue_id, version_number)
);
alter table public.tables_venues add constraint tables_venue_current_version
  foreign key (organization_id, id, current_version_id)
  references public.tables_venue_versions(organization_id, venue_id, id) on delete restrict;

create table public.tables_zones (
  id uuid primary key,
  organization_id uuid not null,
  venue_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  unique (organization_id, venue_id, id)
);

create table public.tables_physical_tables (
  id uuid primary key,
  organization_id uuid not null,
  venue_id uuid not null,
  zone_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 20),
  min_covers integer not null check (min_covers between 1 and 60),
  max_covers integer not null check (max_covers between 1 and 60),
  shape text not null default 'square' check (shape in ('round','square','rect','bar')),
  accessible boolean not null default false,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_covers <= max_covers),
  check (active = (archived_at is null)),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  foreign key (organization_id, venue_id, zone_id) references public.tables_zones(organization_id, venue_id, id) on delete restrict,
  unique (organization_id, venue_id, id)
);
create unique index tables_physical_tables_label on public.tables_physical_tables(venue_id, lower(label)) where active;

create table public.tables_combinations (
  id uuid primary key,
  organization_id uuid not null,
  venue_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  min_covers integer not null check (min_covers between 1 and 120),
  max_covers integer not null check (max_covers between 1 and 120),
  priority integer not null default 0 check (priority between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_covers <= max_covers),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  unique (organization_id, venue_id, id)
);

create table public.tables_combination_members (
  organization_id uuid not null,
  venue_id uuid not null,
  combination_id uuid not null,
  physical_table_id uuid not null,
  primary key (combination_id, physical_table_id),
  foreign key (organization_id, venue_id, combination_id) references public.tables_combinations(organization_id, venue_id, id) on delete cascade,
  foreign key (organization_id, venue_id, physical_table_id) references public.tables_physical_tables(organization_id, venue_id, id) on delete restrict
);
create index tables_combination_members_table on public.tables_combination_members(physical_table_id);

-- Relational history of every table as it was in each published layout.
create table public.tables_layout_table_snapshots (
  organization_id uuid not null,
  venue_id uuid not null,
  version_id uuid not null,
  physical_table_id uuid not null,
  label text not null,
  zone_id uuid not null,
  zone_name text not null,
  min_covers integer not null,
  max_covers integer not null,
  shape text not null,
  geometry jsonb not null,
  primary key (version_id, physical_table_id),
  foreign key (organization_id, venue_id, version_id) references public.tables_venue_versions(organization_id, venue_id, id) on delete restrict,
  foreign key (organization_id, venue_id, physical_table_id) references public.tables_physical_tables(organization_id, venue_id, id) on delete restrict
);

-- Date closures and special hours take effect immediately (no republish) and never cancel guests.
create table public.tables_service_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  service_date date not null,
  service_key text,
  kind text not null check (kind in ('closed','manual_approval')),
  note text check (length(note) <= 200),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict
);
create unique index tables_service_exceptions_scope on public.tables_service_exceptions(venue_id, service_date, coalesce(service_key, '*'));

-- ---------- Triggers ----------
create function private.tables_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Organization is immutable' using errcode = '23514';
  end if;
  if to_jsonb(new) ? 'venue_id' and (to_jsonb(new)->>'venue_id') is distinct from (to_jsonb(old)->>'venue_id') then
    raise exception 'Venue is immutable' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.tables_touch() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['tables_organization_features','tables_venues','tables_venue_staff','tables_venue_versions','tables_zones',
    'tables_physical_tables','tables_combinations','tables_combination_members','tables_layout_table_snapshots','tables_service_exceptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['tables_venues','tables_venue_staff','tables_zones','tables_physical_tables','tables_combinations'] loop
    execute format('create trigger tables_touch before update on public.%I for each row execute function private.tables_touch()', t);
  end loop;
  foreach t in array array['tables_venues','tables_venue_staff','tables_venue_versions','tables_service_exceptions'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.record_change()', t);
  end loop;
  foreach t in array array['tables_venue_versions','tables_layout_table_snapshots'] loop
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function private.reject_mutation()', t);
  end loop;
end;
$$;
-- The audit trigger keys on organization_id/id; features rows have no id, so they audit by org.
create trigger audit_change after insert or update on public.tables_organization_features
  for each row execute function private.record_change();

-- ---------- Authorization helpers ----------
-- Effective Tables role of the caller for one venue: owner > manager > host > viewer, or null.
create function private.tables_role(p_venue uuid)
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
      join public.organization_memberships m on m.organization_id = v.organization_id and m.user_id = auth.uid() and m.status = 'active'
      where s.venue_id = p_venue and s.user_id = auth.uid() and s.status = 'active')
  end
$$;
revoke all on function private.tables_role(uuid) from public, anon;
grant execute on function private.tables_role(uuid) to authenticated;

create function private.tables_role_rank(p_role text)
returns integer language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 4 when 'manager' then 3 when 'host' then 2 when 'viewer' then 1 else 0 end
$$;
revoke all on function private.tables_role_rank(text) from public, anon;
grant execute on function private.tables_role_rank(text) to authenticated;

create function private.tables_can(p_venue uuid, p_min_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.tables_role_rank(private.tables_role(p_venue)) >= private.tables_role_rank(p_min_role)
$$;
revoke all on function private.tables_can(uuid, text) from public, anon;
grant execute on function private.tables_can(uuid, text) to authenticated;

-- Raises the generic access error used by every member command.
create function private.tables_require(p_venue uuid, p_min_role text)
returns public.tables_venues
language plpgsql
security definer
set search_path = ''
as $$
declare v public.tables_venues%rowtype;
begin
  if not private.tables_can(p_venue, p_min_role) then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  select * into v from public.tables_venues where id = p_venue;
  return v;
end;
$$;
revoke all on function private.tables_require(uuid, text) from public, anon, authenticated;

create function private.tables_org_enabled(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tables_organization_features f
    join public.organizations o on o.id = f.organization_id and o.status = 'active'
    where f.organization_id = p_org and f.enabled)
$$;
revoke all on function private.tables_org_enabled(uuid) from public, anon, authenticated;

create function private.tables_valid_timezone(p_tz text)
returns boolean language sql stable set search_path = '' as $$
  select p_tz is not null and length(p_tz) <= 64 and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz)
$$;
revoke all on function private.tables_valid_timezone(text) from public, anon, authenticated;

-- ---------- Read policies (configuration only; operational data is RPC-only) ----------
grant select on public.tables_venues, public.tables_zones, public.tables_physical_tables,
  public.tables_combinations, public.tables_combination_members, public.tables_venue_versions,
  public.tables_service_exceptions to authenticated;
create policy tables_venue_read on public.tables_venues for select to authenticated
  using (private.tables_can(id, 'viewer'));
do $$
declare t text;
begin
  foreach t in array array['tables_zones','tables_physical_tables','tables_combinations','tables_combination_members',
    'tables_venue_versions','tables_service_exceptions'] loop
    execute format('create policy tables_venue_read on public.%I for select to authenticated using (private.tables_can(venue_id, ''viewer''))', t);
  end loop;
end;
$$;
grant select on public.tables_organization_features to authenticated;
create policy tables_feature_member on public.tables_organization_features for select to authenticated
  using (private.has_org_role(organization_id, array['owner','staff']));

-- ---------- Draft document validation ----------
-- Returns a list of blocking problems ({code, path}) for a venue draft. Empty array = publishable.
-- The browser mirrors these rules for instant feedback; this function is authoritative.
create function private.tables_draft_problems(p_draft jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  problems jsonb := '[]'::jsonb;
  b jsonb := coalesce(p_draft->'basics', '{}');
  pol jsonb := coalesce(p_draft->'policy', '{}');
  g jsonb := coalesce(p_draft->'guest', '{}');
  s jsonb; t jsonb; c jsonb; z jsonb; r jsonb;
  zone_ids text[] := '{}';
  table_ids text[] := '{}';
  labels text[] := '{}';
  active_tables integer := 0;
  member text;
  member_count integer;
  member_max integer;
  n numeric;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  time_re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  i integer := 0;
begin
  if jsonb_typeof(p_draft) <> 'object' then return '[{"code":"invalid","path":""}]'; end if;
  if length(btrim(coalesce(b->>'name', ''))) not between 1 and 120 then
    problems := problems || '[{"code":"name_required","path":"basics.name"}]';
  end if;
  if not private.tables_valid_timezone(b->>'timezone') then
    problems := problems || '[{"code":"timezone_invalid","path":"basics.timezone"}]';
  end if;
  if coalesce(b->>'phone', '') <> '' and (b->>'phone') !~ '^\+?[0-9 ()-]{6,24}$' then
    problems := problems || '[{"code":"phone_invalid","path":"basics.phone"}]';
  end if;

  -- Services
  if jsonb_typeof(p_draft->'services') <> 'array' or jsonb_array_length(p_draft->'services') = 0 then
    problems := problems || '[{"code":"service_required","path":"services"}]';
  else
    if jsonb_array_length(p_draft->'services') > 12 then problems := problems || '[{"code":"too_many_services","path":"services"}]'; end if;
    i := 0;
    for s in select value from jsonb_array_elements(p_draft->'services') loop
      if coalesce(s->>'key', '') !~ '^[a-z0-9_-]{1,40}$' then problems := problems || jsonb_build_array(jsonb_build_object('code','service_key_invalid','path','services.'||i)); end if;
      if length(btrim(coalesce(s->>'name', ''))) not between 1 and 60 then problems := problems || jsonb_build_array(jsonb_build_object('code','service_name_required','path','services.'||i)); end if;
      if coalesce(s->>'start', '') !~ time_re or coalesce(s->>'lastSeating', '') !~ time_re then
        problems := problems || jsonb_build_array(jsonb_build_object('code','service_time_invalid','path','services.'||i));
      end if;
      if jsonb_typeof(s->'weekdays') <> 'array' or jsonb_array_length(s->'weekdays') = 0
         or exists (select 1 from jsonb_array_elements(s->'weekdays') d where jsonb_typeof(d) <> 'number' or (d::text)::int not between 0 and 6) then
        problems := problems || jsonb_build_array(jsonb_build_object('code','service_days_required','path','services.'||i));
      end if;
      if jsonb_typeof(s->'durationMinutes') <> 'number' or (s->>'durationMinutes')::numeric not between 30 and 480 then
        problems := problems || jsonb_build_array(jsonb_build_object('code','service_duration_invalid','path','services.'||i));
      end if;
      i := i + 1;
    end loop;
    if (select count(distinct value->>'key') from jsonb_array_elements(p_draft->'services')) <> jsonb_array_length(p_draft->'services') then
      problems := problems || '[{"code":"service_key_duplicate","path":"services"}]';
    end if;
  end if;

  -- Zones
  if jsonb_typeof(p_draft->'zones') <> 'array' or jsonb_array_length(p_draft->'zones') = 0 then
    problems := problems || '[{"code":"zone_required","path":"zones"}]';
  else
    i := 0;
    for z in select value from jsonb_array_elements(p_draft->'zones') loop
      if coalesce(z->>'id', '') !~ uuid_re then problems := problems || jsonb_build_array(jsonb_build_object('code','zone_invalid','path','zones.'||i));
      else zone_ids := zone_ids || (z->>'id'); end if;
      if length(btrim(coalesce(z->>'name', ''))) not between 1 and 60 then problems := problems || jsonb_build_array(jsonb_build_object('code','zone_name_required','path','zones.'||i)); end if;
      i := i + 1;
    end loop;
  end if;

  -- Tables
  if jsonb_typeof(p_draft->'tables') <> 'array' then
    problems := problems || '[{"code":"table_required","path":"tables"}]';
  else
    if jsonb_array_length(p_draft->'tables') > 250 then problems := problems || '[{"code":"too_many_tables","path":"tables"}]'; end if;
    i := 0;
    for t in select value from jsonb_array_elements(p_draft->'tables') loop
      if coalesce(t->>'id', '') !~ uuid_re then problems := problems || jsonb_build_array(jsonb_build_object('code','table_invalid','path','tables.'||i));
      else table_ids := table_ids || (t->>'id'); end if;
      if length(btrim(coalesce(t->>'label', ''))) not between 1 and 20 or left(btrim(t->>'label'), 1) = '~' then
        problems := problems || jsonb_build_array(jsonb_build_object('code','table_label_required','path','tables.'||i));
      elsif lower(btrim(t->>'label')) = any(labels) then
        problems := problems || jsonb_build_array(jsonb_build_object('code','table_label_duplicate','path','tables.'||i));
      else labels := labels || lower(btrim(t->>'label')); end if;
      if not ((t->>'zoneId') = any(zone_ids)) then problems := problems || jsonb_build_array(jsonb_build_object('code','table_zone_missing','path','tables.'||i)); end if;
      if jsonb_typeof(t->'minCovers') <> 'number' or jsonb_typeof(t->'maxCovers') <> 'number'
         or (t->>'minCovers')::numeric < 1 or (t->>'maxCovers')::numeric > 60 or (t->>'minCovers')::numeric > (t->>'maxCovers')::numeric then
        problems := problems || jsonb_build_array(jsonb_build_object('code','table_capacity_invalid','path','tables.'||i));
      end if;
      if coalesce(t->>'shape', '') not in ('round','square','rect','bar') then
        problems := problems || jsonb_build_array(jsonb_build_object('code','table_shape_invalid','path','tables.'||i));
      end if;
      foreach member in array array['x','y','w','h'] loop
        if jsonb_typeof(t->member) <> 'number' or (t->>member)::numeric not between 0 and 2000 then
          problems := problems || jsonb_build_array(jsonb_build_object('code','table_geometry_invalid','path','tables.'||i)); exit;
        end if;
      end loop;
      active_tables := active_tables + 1;
      i := i + 1;
    end loop;
    if active_tables = 0 then problems := problems || '[{"code":"table_required","path":"tables"}]'; end if;
  end if;

  -- Combinations
  if jsonb_typeof(coalesce(p_draft->'combinations', '[]')) <> 'array' then
    problems := problems || '[{"code":"combination_invalid","path":"combinations"}]';
  else
    i := 0;
    for c in select value from jsonb_array_elements(coalesce(p_draft->'combinations', '[]')) loop
      if coalesce(c->>'id', '') !~ uuid_re or length(btrim(coalesce(c->>'label', ''))) not between 1 and 40
         or jsonb_typeof(c->'tableIds') <> 'array' or jsonb_array_length(c->'tableIds') not between 2 and 8 then
        problems := problems || jsonb_build_array(jsonb_build_object('code','combination_invalid','path','combinations.'||i));
      else
        member_count := 0; member_max := 0;
        for member in select value from jsonb_array_elements_text(c->'tableIds') loop
          if not (member = any(table_ids)) then
            problems := problems || jsonb_build_array(jsonb_build_object('code','combination_table_missing','path','combinations.'||i)); exit;
          end if;
          member_count := member_count + 1;
          select coalesce((x->>'maxCovers')::int, 0) + member_max into member_max
            from jsonb_array_elements(p_draft->'tables') x where x->>'id' = member;
        end loop;
        if (select count(distinct value) from jsonb_array_elements_text(c->'tableIds')) <> jsonb_array_length(c->'tableIds') then
          problems := problems || jsonb_build_array(jsonb_build_object('code','combination_table_duplicate','path','combinations.'||i));
        end if;
        if jsonb_typeof(c->'minCovers') <> 'number' or jsonb_typeof(c->'maxCovers') <> 'number'
           or (c->>'minCovers')::numeric < 1 or (c->>'minCovers')::numeric > (c->>'maxCovers')::numeric
           or (c->>'maxCovers')::numeric > greatest(member_max, 1) then
          problems := problems || jsonb_build_array(jsonb_build_object('code','combination_capacity_invalid','path','combinations.'||i));
        end if;
      end if;
      i := i + 1;
    end loop;
  end if;

  -- Reservation policy
  foreach member in array array['slotMinutes','leadMinutes','horizonDays','minParty','maxParty','bufferMinutes',
    'cancelCutoffMinutes','modifyCutoffMinutes','pendingHoldMinutes'] loop
    if jsonb_typeof(pol->member) <> 'number' then
      problems := problems || jsonb_build_array(jsonb_build_object('code','policy_number_invalid','path','policy.'||member));
    end if;
  end loop;
  if jsonb_typeof(pol->'slotMinutes') = 'number' and (pol->>'slotMinutes')::int not in (15, 30, 60) then
    problems := problems || '[{"code":"policy_number_invalid","path":"policy.slotMinutes"}]';
  end if;
  if jsonb_typeof(pol->'horizonDays') = 'number' and (pol->>'horizonDays')::numeric not between 1 and 180 then
    problems := problems || '[{"code":"policy_number_invalid","path":"policy.horizonDays"}]';
  end if;
  if jsonb_typeof(pol->'leadMinutes') = 'number' and (pol->>'leadMinutes')::numeric not between 0 and 10080 then
    problems := problems || '[{"code":"policy_number_invalid","path":"policy.leadMinutes"}]';
  end if;
  if jsonb_typeof(pol->'bufferMinutes') = 'number' and (pol->>'bufferMinutes')::numeric not between 0 and 120 then
    problems := problems || '[{"code":"policy_number_invalid","path":"policy.bufferMinutes"}]';
  end if;
  if jsonb_typeof(pol->'minParty') = 'number' and jsonb_typeof(pol->'maxParty') = 'number'
     and ((pol->>'minParty')::numeric < 1 or (pol->>'maxParty')::numeric > 60 or (pol->>'minParty')::numeric > (pol->>'maxParty')::numeric) then
    problems := problems || '[{"code":"policy_party_invalid","path":"policy.maxParty"}]';
  end if;
  foreach member in array array['cancelCutoffMinutes','modifyCutoffMinutes'] loop
    if jsonb_typeof(pol->member) = 'number' and (pol->>member)::numeric not between 0 and 10080 then
      problems := problems || jsonb_build_array(jsonb_build_object('code','policy_number_invalid','path','policy.'||member));
    end if;
  end loop;
  if jsonb_typeof(pol->'pendingHoldMinutes') = 'number' and (pol->>'pendingHoldMinutes')::numeric not between 5 and 240 then
    problems := problems || '[{"code":"policy_number_invalid","path":"policy.pendingHoldMinutes"}]';
  end if;
  if coalesce(pol->>'approvalMode', '') not in ('auto','manual','conditional') then
    problems := problems || '[{"code":"policy_approval_invalid","path":"policy.approvalMode"}]';
  end if;
  if coalesce(pol->>'pendingMode', '') not in ('hold','unallocated') then
    problems := problems || '[{"code":"policy_pending_invalid","path":"policy.pendingMode"}]';
  end if;
  if jsonb_typeof(coalesce(pol->'rules', '[]')) <> 'array' or jsonb_array_length(coalesce(pol->'rules', '[]')) > 20 then
    problems := problems || '[{"code":"policy_rules_invalid","path":"policy.rules"}]';
  else
    i := 0;
    for r in select value from jsonb_array_elements(coalesce(pol->'rules', '[]')) loop
      if coalesce(r->>'then', '') not in ('require_manual','auto') or jsonb_typeof(coalesce(r->'when', '{}')) <> 'object'
         or coalesce(r->>'id', '') !~ '^[a-z0-9_-]{1,40}$' then
        problems := problems || jsonb_build_array(jsonb_build_object('code','policy_rule_invalid','path','policy.rules.'||i));
      end if;
      i := i + 1;
    end loop;
  end if;
  if jsonb_typeof(pol->'pacing') = 'object' then
    n := nullif(pol->'pacing'->>'windowMinutes', '')::numeric;
    if n is null or n not in (15, 30, 60) then problems := problems || '[{"code":"policy_pacing_invalid","path":"policy.pacing"}]'; end if;
  end if;

  -- Guest experience
  if length(btrim(coalesce(g->>'terms', ''))) not between 1 and 2000 then
    problems := problems || '[{"code":"terms_required","path":"guest.terms"}]';
  end if;
  if length(coalesce(g->>'intro', '')) > 1000 then
    problems := problems || '[{"code":"intro_too_long","path":"guest.intro"}]';
  end if;
  return problems;
exception when invalid_text_representation or numeric_value_out_of_range then
  return problems || '[{"code":"invalid","path":""}]';
end;
$$;
revoke all on function private.tables_draft_problems(jsonb) from public, anon, authenticated;

-- ---------- Commands ----------
create function public.tables_create_venue(p_organization_id uuid, p_name text, p_slug text, p_timezone text default 'Asia/Jerusalem')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.tables_venues%rowtype;
begin
  if not private.has_org_role(p_organization_id, array['owner']) or not private.tables_org_enabled(p_organization_id) then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  if (select count(*) from public.tables_venues v where v.organization_id = p_organization_id and v.status <> 'archived') >= 20 then
    raise exception 'Venue limit reached' using errcode = '54000';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Venue name required' using errcode = '22023'; end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 60 then raise exception 'Invalid venue address' using errcode = '22023'; end if;
  if not private.tables_valid_timezone(p_timezone) then raise exception 'Invalid timezone' using errcode = '22023'; end if;
  if exists (select 1 from public.tables_venues v where v.slug = p_slug) then raise exception 'Venue address taken' using errcode = '23505'; end if;
  insert into public.tables_venues(organization_id, slug, name, timezone, draft)
  values (p_organization_id, p_slug, btrim(p_name), p_timezone,
    jsonb_build_object('schema', 1, 'basics', jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone, 'venueType', 'restaurant', 'locale', 'he'),
      'progress', jsonb_build_object('step', 'basics')))
  returning * into created;
  return jsonb_build_object('id', created.id, 'slug', created.slug, 'lockVersion', created.lock_version);
end;
$$;

-- Draft saves are optimistic: a stale lock_version is a conflict, never a silent overwrite.
create function public.tables_save_draft(p_venue_id uuid, p_draft jsonb, p_expected_lock_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tables_venues%rowtype;
begin
  perform private.tables_require(p_venue_id, 'manager');
  if jsonb_typeof(p_draft) <> 'object' or octet_length(p_draft::text) > 262144 then
    raise exception 'Invalid draft' using errcode = '22023';
  end if;
  select * into v from public.tables_venues where id = p_venue_id for update;
  if v.lock_version <> p_expected_lock_version then
    raise exception 'Draft changed by another team member' using errcode = '40001',
      detail = jsonb_build_object('lockVersion', v.lock_version)::text;
  end if;
  update public.tables_venues set draft = p_draft, lock_version = lock_version + 1 where id = p_venue_id
  returning * into v;
  return jsonb_build_object('lockVersion', v.lock_version, 'savedAt', v.updated_at, 'problems', private.tables_draft_problems(p_draft));
end;
$$;

create function public.tables_publish_venue(p_venue_id uuid, p_expected_lock_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tables_venues%rowtype;
  problems jsonb;
  version_id uuid;
  next_number integer;
  z jsonb; t jsonb; c jsonb;
  touched integer;
  has_upcoming boolean;
  snapshot jsonb;
  tz text;
begin
  perform private.tables_require(p_venue_id, 'manager');
  select * into v from public.tables_venues where id = p_venue_id for update;
  if v.lock_version <> p_expected_lock_version then
    raise exception 'Draft changed by another team member' using errcode = '40001',
      detail = jsonb_build_object('lockVersion', v.lock_version)::text;
  end if;
  problems := private.tables_draft_problems(v.draft);
  if jsonb_array_length(problems) > 0 then
    raise exception 'Draft has blocking problems' using errcode = '22023', detail = problems::text;
  end if;
  tz := v.draft->'basics'->>'timezone';
  if tz <> v.timezone and v.current_version_id is not null and exists (
      select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tables_reservations') then
    execute 'select exists (select 1 from public.tables_reservations r where r.venue_id = $1 and r.ends_at > now()
      and r.status in (''pending_approval'',''confirmed'',''arrived'',''seated''))' into has_upcoming using p_venue_id;
    if has_upcoming then
      raise exception 'Timezone cannot change while upcoming reservations exist' using errcode = '22023';
    end if;
  end if;

  -- Zones: upsert by stable id; zones missing from the draft become inactive.
  for z in select value from jsonb_array_elements(v.draft->'zones') with ordinality as e(value, n) order by n loop
    insert into public.tables_zones(id, organization_id, venue_id, name, sort_order, active)
    values ((z->>'id')::uuid, v.organization_id, v.id, btrim(z->>'name'), coalesce((z->>'sort')::int, 0), true)
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, active = true
      where public.tables_zones.organization_id = v.organization_id and public.tables_zones.venue_id = v.id;
    get diagnostics touched = row_count;
    if touched = 0 then raise exception 'Zone belongs to another venue' using errcode = '42501'; end if;
  end loop;
  update public.tables_zones set active = false
   where venue_id = v.id and active and not (id::text in (select value->>'id' from jsonb_array_elements(v.draft->'zones')));

  -- Tables: archive removed ones first so a reused label is free, then upsert.
  update public.tables_physical_tables set active = false, archived_at = now()
   where venue_id = v.id and active and not (id::text in (select value->>'id' from jsonb_array_elements(v.draft->'tables')));
  update public.tables_physical_tables pt set label = '~' || x.n
    from (select id, row_number() over (order by id) n from public.tables_physical_tables where venue_id = v.id and active) x
   where pt.id = x.id;
  for t in select value from jsonb_array_elements(v.draft->'tables') loop
    insert into public.tables_physical_tables(id, organization_id, venue_id, zone_id, label, min_covers, max_covers, shape, accessible, active, archived_at)
    values ((t->>'id')::uuid, v.organization_id, v.id, (t->>'zoneId')::uuid, btrim(t->>'label'), (t->>'minCovers')::int,
      (t->>'maxCovers')::int, t->>'shape', coalesce((t->>'accessible')::boolean, false), true, null)
    on conflict (id) do update set zone_id = excluded.zone_id, label = excluded.label, min_covers = excluded.min_covers,
      max_covers = excluded.max_covers, shape = excluded.shape, accessible = excluded.accessible, active = true, archived_at = null
      where public.tables_physical_tables.organization_id = v.organization_id and public.tables_physical_tables.venue_id = v.id;
    get diagnostics touched = row_count;
    if touched = 0 then raise exception 'Table belongs to another venue' using errcode = '42501'; end if;
  end loop;

  -- Combinations: replace membership; old allocations reference physical tables, not combinations.
  update public.tables_combinations set active = false
   where venue_id = v.id and active and not (id::text in (select value->>'id' from jsonb_array_elements(coalesce(v.draft->'combinations', '[]'))));
  for c in select value from jsonb_array_elements(coalesce(v.draft->'combinations', '[]')) loop
    insert into public.tables_combinations(id, organization_id, venue_id, label, min_covers, max_covers, priority, active)
    values ((c->>'id')::uuid, v.organization_id, v.id, btrim(c->>'label'), (c->>'minCovers')::int, (c->>'maxCovers')::int,
      coalesce((c->>'priority')::int, 0), true)
    on conflict (id) do update set label = excluded.label, min_covers = excluded.min_covers, max_covers = excluded.max_covers,
      priority = excluded.priority, active = true
      where public.tables_combinations.organization_id = v.organization_id and public.tables_combinations.venue_id = v.id;
    get diagnostics touched = row_count;
    if touched = 0 then raise exception 'Combination belongs to another venue' using errcode = '42501'; end if;
    delete from public.tables_combination_members where combination_id = (c->>'id')::uuid;
    insert into public.tables_combination_members(organization_id, venue_id, combination_id, physical_table_id)
    select v.organization_id, v.id, (c->>'id')::uuid, m::uuid from jsonb_array_elements_text(c->'tableIds') m;
  end loop;

  snapshot := (v.draft - 'progress') || jsonb_build_object('venueId', v.id, 'slug', v.slug);
  select coalesce(max(version_number), 0) + 1 into next_number from public.tables_venue_versions where venue_id = v.id;
  insert into public.tables_venue_versions(organization_id, venue_id, version_number, snapshot, published_by)
  values (v.organization_id, v.id, next_number, snapshot, auth.uid()) returning id into version_id;
  insert into public.tables_layout_table_snapshots(organization_id, venue_id, version_id, physical_table_id, label, zone_id, zone_name,
    min_covers, max_covers, shape, geometry)
  select v.organization_id, v.id, version_id, (t2->>'id')::uuid, btrim(t2->>'label'), (t2->>'zoneId')::uuid,
    (select btrim(z2->>'name') from jsonb_array_elements(v.draft->'zones') z2 where z2->>'id' = t2->>'zoneId'),
    (t2->>'minCovers')::int, (t2->>'maxCovers')::int, t2->>'shape',
    jsonb_build_object('x', t2->'x', 'y', t2->'y', 'w', t2->'w', 'h', t2->'h', 'rotation', coalesce(t2->'rotation', '0'))
  from jsonb_array_elements(v.draft->'tables') t2;

  update public.tables_venues set current_version_id = version_id, status = case when status = 'paused' then 'paused' else 'published' end,
    name = btrim(v.draft->'basics'->>'name'), timezone = tz
   where id = v.id returning * into v;
  return jsonb_build_object('versionId', version_id, 'versionNumber', next_number, 'status', v.status, 'lockVersion', v.lock_version);
end;
$$;

-- Pausing stops new public bookings immediately; existing reservations are untouched.
create function public.tables_set_venue_status(p_venue_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.tables_venues%rowtype;
begin
  perform private.tables_require(p_venue_id, 'owner');
  if p_status not in ('published','paused') then raise exception 'Invalid status' using errcode = '22023'; end if;
  select * into v from public.tables_venues where id = p_venue_id for update;
  if v.current_version_id is null then raise exception 'Venue not published' using errcode = '22023'; end if;
  update public.tables_venues set status = p_status where id = p_venue_id returning * into v;
  return jsonb_build_object('status', v.status);
end;
$$;

create function public.tables_list_venues(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner','staff']) then
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

create function public.tables_get_venue(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.tables_venues%rowtype;
  role text := private.tables_role(p_venue_id);
begin
  if role is null then raise exception 'Tables access denied' using errcode = '42501'; end if;
  select * into v from public.tables_venues where id = p_venue_id;
  return jsonb_build_object('id', v.id, 'organizationId', v.organization_id, 'slug', v.slug, 'name', v.name, 'status', v.status,
    'timezone', v.timezone, 'role', role, 'lockVersion', v.lock_version,
    'draft', case when private.tables_role_rank(role) >= 3 then v.draft else null end,
    'problems', case when private.tables_role_rank(role) >= 3 then private.tables_draft_problems(v.draft) else null end,
    'published', (select jsonb_build_object('versionId', vv.id, 'versionNumber', vv.version_number, 'publishedAt', vv.created_at, 'snapshot', vv.snapshot)
      from public.tables_venue_versions vv where vv.id = v.current_version_id),
    'hasUnpublishedChanges', v.current_version_id is null or (v.draft - 'progress') || jsonb_build_object('venueId', v.id, 'slug', v.slug)
      is distinct from (select vv.snapshot from public.tables_venue_versions vv where vv.id = v.current_version_id),
    'updatedAt', v.updated_at);
end;
$$;

-- Owners assign venue roles to existing members of the organization. Revocation is immediate.
create function public.tables_assign_staff(p_venue_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.tables_venues%rowtype;
begin
  v := private.tables_require(p_venue_id, 'owner');
  if p_role is not null and p_role not in ('manager','host','viewer') then raise exception 'Invalid role' using errcode = '22023'; end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id = v.organization_id
      and m.user_id = p_user_id and m.status = 'active' and m.role = 'staff') then
    raise exception 'Not a team member' using errcode = '22023';
  end if;
  if p_role is null then
    update public.tables_venue_staff set status = 'revoked', updated_by = auth.uid() where venue_id = p_venue_id and user_id = p_user_id;
  else
    insert into public.tables_venue_staff(organization_id, venue_id, user_id, role, status, updated_by)
    values (v.organization_id, p_venue_id, p_user_id, p_role, 'active', auth.uid())
    on conflict (venue_id, user_id) do update set role = excluded.role, status = 'active', updated_by = auth.uid();
  end if;
  return public.tables_list_staff(p_venue_id);
end;
$$;

create function public.tables_list_staff(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.tables_venues%rowtype;
begin
  v := private.tables_require(p_venue_id, 'owner');
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'orgRole', m.role,
      'venueRole', case when m.role = 'owner' then 'owner' else s.role end) order by m.role desc, u.email)
    from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    left join public.tables_venue_staff s on s.venue_id = p_venue_id and s.user_id = m.user_id and s.status = 'active'
    where m.organization_id = v.organization_id and m.status = 'active'), '[]'::jsonb);
end;
$$;

-- Date closures and "approve manually on this date" rules. Returns affected reservations so the
-- manager sees the impact; nothing is cancelled automatically.
create function public.tables_set_exception(p_venue_id uuid, p_date date, p_kind text, p_note text, p_service_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.tables_venues%rowtype;
begin
  v := private.tables_require(p_venue_id, 'manager');
  if p_kind is not null and p_kind not in ('closed','manual_approval') then raise exception 'Invalid exception' using errcode = '22023'; end if;
  delete from public.tables_service_exceptions e where e.venue_id = p_venue_id and e.service_date = p_date
    and coalesce(e.service_key, '*') = coalesce(p_service_key, '*');
  if p_kind is not null then
    insert into public.tables_service_exceptions(organization_id, venue_id, service_date, service_key, kind, note)
    values (v.organization_id, p_venue_id, p_date, p_service_key, p_kind, nullif(btrim(coalesce(p_note, '')), ''));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('date', e.service_date, 'serviceKey', e.service_key, 'kind', e.kind, 'note', e.note) order by e.service_date)
    from public.tables_service_exceptions e where e.venue_id = p_venue_id and e.service_date >= (now() at time zone v.timezone)::date - 1), '[]'::jsonb);
end;
$$;

-- Operators switch the module on/off per organization (kill switch). Audited by trigger.
create function public.operator_set_tables_enabled(p_organization_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then raise exception 'Operator access denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Unknown organization' using errcode = 'P0002'; end if;
  insert into public.tables_organization_features(organization_id, enabled, updated_by, updated_at)
  values (p_organization_id, p_enabled, auth.uid(), now())
  on conflict (organization_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('organizationId', p_organization_id, 'enabled', p_enabled);
end;
$$;

-- Operator overview gains one field (tablesEnabled); everything else is unchanged.
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
      'tablesEnabled', exists (select 1 from public.tables_organization_features f where f.organization_id = o.id and f.enabled),
      'pendingOwnerInvitation', (select jsonb_build_object('email', i.email, 'expiresAt', i.expires_at) from private.owner_invitations i
        where i.organization_id = o.id and i.role = 'owner' and i.accepted_at is null and i.revoked_at is null and i.expired_at is null
          and i.expires_at > clock_timestamp() order by i.created_at desc limit 1)
    ) order by o.created_at desc)
    from public.organizations o), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.tables_create_venue(uuid,text,text,text)',
    'public.tables_save_draft(uuid,jsonb,bigint)',
    'public.tables_publish_venue(uuid,bigint)',
    'public.tables_set_venue_status(uuid,text)',
    'public.tables_list_venues(uuid)',
    'public.tables_get_venue(uuid)',
    'public.tables_assign_staff(uuid,uuid,text)',
    'public.tables_list_staff(uuid)',
    'public.tables_set_exception(uuid,date,text,text,text)',
    'public.operator_set_tables_enabled(uuid,boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
