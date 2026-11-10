-- Formangle Tables T2: guests, reservations, table allocations, availability and booking.
--
-- Inventory invariants
--  1. One allocation row per physical table; active rows (held/confirmed/seated) on the same table
--     can never overlap: GiST exclusion on (organization, venue, table, half-open range).
--  2. Every inventory writer takes the same transaction advisory lock on (venue, service date)
--     before reading availability, so table choice and pacing are deterministic. The exclusion
--     constraint stays the final guard against any writer that forgets the lock.
--  3. A combination's member allocations are inserted in one statement inside a subtransaction:
--     all or nothing.
--  4. Expired holds are switched to 'expired' under the lock before a new decision is made.
--  5. Creates are idempotent (key + canonical request hash). Mutations of an existing
--     reservation require its lock_version; stale writes get 40001 and the current projection.
--  6. State change, allocations, reservation event, audit/outbox and the shift revision commit
--     in one transaction.
--  7. Guests never read tables directly; public functions return bounded safe projections.
begin;

create extension if not exists btree_gist with schema extensions;

-- ---------- Guests ----------
create table public.tables_guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index tables_guests_phone on public.tables_guests(organization_id, phone_e164) where phone_e164 is not null;

-- ---------- Reservations ----------
create table public.tables_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  version_id uuid not null,
  reference text not null check (reference ~ '^[A-Z2-9]{6}$'),
  service_key text not null,
  service_date date not null,
  local_time text not null check (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 120),
  party_size integer not null check (party_size between 1 and 120),
  status text not null check (status in ('pending_approval','confirmed','arrived','seated','completed','cancelled','rejected','no_show','expired')),
  source text not null check (source in ('online','phone','walk_in','staff','waitlist')),
  approval text not null check (approval in ('auto','manual','staff')),
  approval_rule text,
  guest_id uuid,
  guest_name text not null check (length(btrim(guest_name)) between 1 and 120),
  guest_phone text check (guest_phone ~ '^\+[1-9][0-9]{7,14}$'),
  guest_email text,
  requests text check (length(requests) <= 500),
  zone_preference uuid,
  override_reason text check (length(override_reason) <= 300),
  pending_expires_at timestamptz,
  terms_accepted_at timestamptz,
  arrived_at timestamptz,
  seated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  lock_version bigint not null default 0 check (lock_version >= 0),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  client_token uuid,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'pending_approval' or pending_expires_at is not null),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  foreign key (organization_id, venue_id, version_id) references public.tables_venue_versions(organization_id, venue_id, id) on delete restrict,
  foreign key (organization_id, guest_id) references public.tables_guests(organization_id, id) on delete restrict,
  unique (organization_id, venue_id, id),
  unique (venue_id, idempotency_key),
  unique (venue_id, reference)
);
create index tables_reservations_shift on public.tables_reservations(venue_id, service_date, starts_at);
create index tables_reservations_pending on public.tables_reservations(venue_id, pending_expires_at) where status = 'pending_approval';
create index tables_reservations_guest on public.tables_reservations(organization_id, guest_id, starts_at desc);
create index tables_reservations_rate on public.tables_reservations(venue_id, client_token, created_at desc) where client_token is not null;

create table public.tables_reservation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  reservation_id uuid not null,
  seq integer not null,
  event_type text not null check (length(event_type) between 1 and 60),
  from_status text,
  to_status text,
  actor_type text not null check (actor_type in ('guest','staff','system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  reason text check (length(reason) <= 300),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id, reservation_id) references public.tables_reservations(organization_id, venue_id, id) on delete restrict,
  unique (reservation_id, seq)
);

-- ---------- Waitlist entries (offers hold allocations; filled in T5) ----------
create table public.tables_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  service_date date not null,
  guest_id uuid,
  guest_name text not null check (length(btrim(guest_name)) between 1 and 120),
  guest_phone text check (guest_phone ~ '^\+[1-9][0-9]{7,14}$'),
  party_size integer not null check (party_size between 1 and 60),
  zone_preference uuid,
  notes text check (length(notes) <= 300),
  source text not null check (source in ('staff','public')),
  status text not null default 'waiting' check (status in ('waiting','offered','seated','declined','departed','no_response','cancelled','expired')),
  priority integer not null default 0 check (priority between 0 and 3),
  priority_reason text check (length(priority_reason) <= 200),
  quoted_min integer,
  quoted_max integer,
  offer_expires_at timestamptz,
  reservation_id uuid,
  joined_at timestamptz not null default now(),
  closed_at timestamptz,
  lock_version bigint not null default 0,
  idempotency_key uuid not null,
  client_token uuid,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (priority = 0 or length(btrim(coalesce(priority_reason, ''))) > 0),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  foreign key (organization_id, guest_id) references public.tables_guests(organization_id, id) on delete restrict,
  foreign key (organization_id, venue_id, reservation_id) references public.tables_reservations(organization_id, venue_id, id) on delete restrict,
  unique (organization_id, venue_id, id),
  unique (venue_id, idempotency_key)
);
create index tables_waitlist_active on public.tables_waitlist_entries(venue_id, service_date, status, joined_at);

-- ---------- Allocations ----------
create table public.tables_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  physical_table_id uuid not null,
  group_id uuid not null,
  reservation_id uuid,
  waitlist_entry_id uuid,
  occupied_during tstzrange not null check (not isempty(occupied_during) and lower_inc(occupied_during) and not upper_inc(occupied_during)),
  state text not null check (state in ('held','confirmed','seated','released','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  check ((reservation_id is null) <> (waitlist_entry_id is null)),
  check (state <> 'held' or expires_at is not null),
  foreign key (organization_id, venue_id, physical_table_id) references public.tables_physical_tables(organization_id, venue_id, id) on delete restrict,
  foreign key (organization_id, venue_id, reservation_id) references public.tables_reservations(organization_id, venue_id, id) on delete restrict,
  foreign key (organization_id, venue_id, waitlist_entry_id) references public.tables_waitlist_entries(organization_id, venue_id, id) on delete restrict,
  constraint tables_allocations_no_overlap exclude using gist (
    organization_id with =,
    venue_id with =,
    physical_table_id with =,
    occupied_during with &&
  ) where (state in ('held','confirmed','seated'))
);
create index tables_allocations_reservation on public.tables_allocations(reservation_id) where reservation_id is not null;
create index tables_allocations_waitlist on public.tables_allocations(waitlist_entry_id) where waitlist_entry_id is not null;
create index tables_allocations_held on public.tables_allocations(venue_id, expires_at) where state = 'held';
-- Per-table availability probes (private.tables_table_free); the exclusion index leads with the tenant.
create index tables_allocations_table_time on public.tables_allocations using gist (physical_table_id, occupied_during)
  where state in ('held','confirmed','seated');

-- Explicit operational table state. Reserved/occupied are derived from allocations.
create table public.tables_table_states (
  organization_id uuid not null,
  venue_id uuid not null,
  physical_table_id uuid primary key,
  state text not null check (state in ('cleaning','unavailable')),
  reason text check (length(reason) <= 200),
  until timestamptz,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id, physical_table_id) references public.tables_physical_tables(organization_id, venue_id, id) on delete restrict
);

-- One row per venue and service date. Every operational command increments it in the same
-- transaction; host devices subscribe to this row only (one narrow Realtime stream per device).
create table public.tables_shift_revisions (
  organization_id uuid not null,
  venue_id uuid not null,
  service_date date not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (venue_id, service_date),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict
);

-- ---------- Private: tokens and rate counters ----------
create table private.tables_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  reservation_id uuid,
  waitlist_entry_id uuid,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  capabilities text[] not null check (capabilities <@ array['read','modify','cancel','leave_waitlist']::text[]),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check ((reservation_id is null) <> (waitlist_entry_id is null)),
  foreign key (organization_id, venue_id, reservation_id) references public.tables_reservations(organization_id, venue_id, id) on delete restrict,
  foreign key (organization_id, venue_id, waitlist_entry_id) references public.tables_waitlist_entries(organization_id, venue_id, id) on delete restrict
);
create index tables_access_tokens_reservation on private.tables_access_tokens(reservation_id) where reservation_id is not null;

create table private.tables_rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index tables_rate_events_key on private.tables_rate_events(bucket, key_hash, created_at);

alter table private.tables_access_tokens enable row level security;
alter table private.tables_rate_events enable row level security;
revoke all on private.tables_access_tokens, private.tables_rate_events from public, anon, authenticated, service_role;

-- ---------- RLS / grants / triggers ----------
do $$
declare t text;
begin
  foreach t in array array['tables_guests','tables_reservations','tables_reservation_events','tables_waitlist_entries',
    'tables_allocations','tables_table_states','tables_shift_revisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['tables_guests','tables_reservations','tables_waitlist_entries'] loop
    execute format('create trigger tables_touch before update on public.%I for each row execute function private.tables_touch()', t);
  end loop;
  foreach t in array array['tables_reservations','tables_waitlist_entries','tables_table_states'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.record_change()', t);
  end loop;
end;
$$;
create trigger immutable_record before update or delete on public.tables_reservation_events
  for each row execute function private.reject_mutation();
-- Only the revision row is readable directly (it carries no guest data); needed for Realtime.
grant select on public.tables_shift_revisions to authenticated;
create policy tables_shift_revision_read on public.tables_shift_revisions for select to authenticated
  using (private.tables_can(venue_id, 'viewer'));
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tables_shift_revisions;
  end if;
end;
$$;

-- ---------- Helpers ----------
create function private.tables_normalize_phone(p_phone text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text;
begin
  if p_phone is null or btrim(p_phone) = '' then return null; end if;
  d := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  if d ~ '^\+' then d := '+' || replace(substr(d, 2), '+', '');
  elsif d ~ '^00' then d := '+' || substr(d, 3);
  elsif d ~ '^972' then d := '+' || d;
  elsif d ~ '^0[2-9][0-9]{7,8}$' then d := '+972' || substr(d, 2);
  else return null; end if;
  if d !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  return d;
end;
$$;
revoke all on function private.tables_normalize_phone(text) from public, anon, authenticated;

-- Local service date + local time -> exact instant. A time earlier than the service start belongs
-- to the next calendar day (service crossing midnight stays on its starting service date).
-- Returns null for a local time that does not exist (spring-forward gap).
create function private.tables_instant(p_tz text, p_service_date date, p_time text, p_service_start text)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare
  local_ts timestamp := (p_service_date + case when p_time < p_service_start then 1 else 0 end) + p_time::time;
  result timestamptz := local_ts at time zone p_tz;
begin
  if (result at time zone p_tz) <> local_ts then return null; end if;
  return result;
end;
$$;
revoke all on function private.tables_instant(text, date, text, text) from public, anon, authenticated;

create function private.tables_lock_day(p_venue uuid, p_date date)
returns void language sql set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tables:' || p_venue::text || ':' || p_date::text, 0))
$$;
revoke all on function private.tables_lock_day(uuid, date) from public, anon, authenticated;

create function private.tables_bump(p_org uuid, p_venue uuid, p_date date)
returns bigint language sql set search_path = '' as $$
  insert into public.tables_shift_revisions(organization_id, venue_id, service_date, revision, updated_at)
  values (p_org, p_venue, p_date, 1, now())
  on conflict (venue_id, service_date) do update set revision = public.tables_shift_revisions.revision + 1, updated_at = now()
  returning revision
$$;
revoke all on function private.tables_bump(uuid, uuid, date) from public, anon, authenticated;

create function private.tables_event(p_res public.tables_reservations, p_type text, p_from text, p_to text, p_actor text, p_reason text default null, p_meta jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into public.tables_reservation_events(organization_id, venue_id, reservation_id, seq, event_type, from_status, to_status, actor_type, actor_user_id, reason, metadata)
  values (p_res.organization_id, p_res.venue_id, p_res.id,
    coalesce((select max(e.seq) from public.tables_reservation_events e where e.reservation_id = p_res.id), 0) + 1,
    p_type, p_from, p_to, p_actor, case when p_actor = 'staff' then auth.uid() end, nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_meta, '{}'))
$$;
revoke all on function private.tables_event(public.tables_reservations, text, text, text, text, text, jsonb) from public, anon, authenticated;

create function private.tables_reference()
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '' order by i)
  from (select extensions.gen_random_bytes(6) b) x, generate_series(0, 5) i
$$;
revoke all on function private.tables_reference() from public, anon, authenticated;

create function private.tables_issue_token(p_org uuid, p_venue uuid, p_reservation uuid, p_entry uuid, p_caps text[], p_expires timestamptz)
returns text language plpgsql set search_path = '' as $$
declare raw text := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
begin
  update private.tables_access_tokens t set revoked_at = clock_timestamp()
   where t.id in (select x.id from private.tables_access_tokens x
     where x.revoked_at is null and ((p_reservation is not null and x.reservation_id = p_reservation) or (p_entry is not null and x.waitlist_entry_id = p_entry))
     order by x.created_at desc offset 4);
  insert into private.tables_access_tokens(organization_id, venue_id, reservation_id, waitlist_entry_id, token_hash, capabilities, expires_at)
  values (p_org, p_venue, p_reservation, p_entry, private.hash_token(raw), p_caps, p_expires);
  return raw;
end;
$$;
revoke all on function private.tables_issue_token(uuid, uuid, uuid, uuid, text[], timestamptz) from public, anon, authenticated;

-- Hashed caller signals for public rate limits. The IP header is used only when the API gateway
-- sets it; nothing raw is stored.
create function private.tables_caller_keys(p_client uuid)
returns text[] language plpgsql stable set search_path = '' as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  ip text := btrim(split_part(coalesce(headers->>'cf-connecting-ip', headers->>'x-forwarded-for', headers->>'x-real-ip', ''), ',', 1));
  keys text[] := array['c:' || coalesce(p_client::text, 'none')];
begin
  if ip <> '' then keys := keys || ('i:' || private.hash_token(ip)); end if;
  return keys;
exception when others then
  return array['c:' || coalesce(p_client::text, 'none')];
end;
$$;
revoke all on function private.tables_caller_keys(uuid) from public, anon, authenticated;

-- Counts one hit per key and raises 54000 when any key is above its limit in the window.
create function private.tables_rate(p_bucket text, p_client uuid, p_per_client integer, p_per_ip integer, p_window interval)
returns void language plpgsql set search_path = '' as $$
declare
  k text;
  h text;
  used integer;
begin
  foreach k in array private.tables_caller_keys(p_client) loop
    h := private.hash_token(p_bucket || '|' || k);
    select count(*) into used from private.tables_rate_events e
     where e.bucket = p_bucket and e.key_hash = h and e.created_at > clock_timestamp() - p_window;
    if (left(k, 2) = 'i:' and used >= p_per_ip) or (left(k, 2) <> 'i:' and used >= p_per_client) then
      raise exception 'tables:rate_limited' using errcode = '54000';
    end if;
    insert into private.tables_rate_events(bucket, key_hash) values (p_bucket, h);
  end loop;
  if random() < 0.02 then
    delete from private.tables_rate_events where id in (
      select id from private.tables_rate_events where created_at < clock_timestamp() - interval '1 day' limit 500);
  end if;
end;
$$;
revoke all on function private.tables_rate(text, uuid, integer, integer, interval) from public, anon, authenticated;

create function private.tables_upsert_guest(p_org uuid, p_name text, p_phone text, p_email text)
returns uuid language plpgsql set search_path = '' as $$
declare gid uuid;
begin
  if p_phone is not null then
    select id into gid from public.tables_guests where organization_id = p_org and phone_e164 = p_phone;
    if found then
      update public.tables_guests set email = coalesce(email, p_email) where id = gid and email is null and p_email is not null;
      return gid;
    end if;
  end if;
  insert into public.tables_guests(organization_id, display_name, phone_e164, email)
  values (p_org, btrim(p_name), p_phone, p_email) returning id into gid;
  return gid;
end;
$$;
revoke all on function private.tables_upsert_guest(uuid, text, text, text) from public, anon, authenticated;

-- Expire stale holds, offers and pending requests of one venue/day. Called under the day lock.
create function private.tables_expire(p_venue uuid, p_date date)
returns integer language plpgsql set search_path = '' as $$
declare
  r public.tables_reservations%rowtype;
  n integer := 0;
  w record;
begin
  for r in select * from public.tables_reservations
     where venue_id = p_venue and service_date = p_date and status = 'pending_approval' and pending_expires_at <= clock_timestamp()
     for update loop
    update public.tables_allocations set state = 'expired', released_at = clock_timestamp()
     where reservation_id = r.id and state in ('held','confirmed');
    update public.tables_reservations set status = 'expired', lock_version = lock_version + 1, pending_expires_at = pending_expires_at
     where id = r.id;
    perform private.tables_event(r, 'expired', 'pending_approval', 'expired', 'system');
    n := n + 1;
  end loop;
  for w in select e.id from public.tables_waitlist_entries e
     where e.venue_id = p_venue and e.service_date = p_date and e.status = 'offered' and e.offer_expires_at <= clock_timestamp()
     for update loop
    update public.tables_allocations set state = 'expired', released_at = clock_timestamp() where waitlist_entry_id = w.id and state = 'held';
    update public.tables_waitlist_entries set status = 'waiting', offer_expires_at = null, lock_version = lock_version + 1 where id = w.id;
    n := n + 1;
  end loop;
  update public.tables_allocations a set state = 'expired', released_at = clock_timestamp()
   where a.venue_id = p_venue and a.state = 'held' and a.expires_at <= clock_timestamp();
  return n;
end;
$$;
revoke all on function private.tables_expire(uuid, date) from public, anon, authenticated;

-- True when the table has no active allocation overlapping the range (a seated party that runs
-- over its planned end keeps occupying the table) and is not marked unavailable.
create function private.tables_table_free(p_table uuid, p_range tstzrange, p_ignore_reservation uuid, p_ignore_entry uuid default null)
returns boolean language sql stable set search_path = '' as $$
  -- Two probes with the same meaning as one: the planned range (uses tables_allocations_table_time),
  -- and a seated party's overrun up to now (few rows per table). One combined CASE expression
  -- could not use an index and made availability grow with the size of the whole table.
  select not exists (
    select 1 from public.tables_allocations a
    where a.physical_table_id = p_table and a.state in ('held','confirmed','seated')
      and a.occupied_during && p_range
      and (a.state <> 'held' or a.expires_at > clock_timestamp())
      and (p_ignore_reservation is null or a.reservation_id is distinct from p_ignore_reservation)
      and (p_ignore_entry is null or a.waitlist_entry_id is distinct from p_ignore_entry))
  and not exists (
    select 1 from public.tables_allocations a
    where a.physical_table_id = p_table and a.state = 'seated'
      and (p_ignore_reservation is null or a.reservation_id is distinct from p_ignore_reservation)
      and (p_ignore_entry is null or a.waitlist_entry_id is distinct from p_ignore_entry)
      and tstzrange(lower(a.occupied_during), greatest(upper(a.occupied_during), clock_timestamp() + interval '1 minute'), '[)') && p_range)
  and not exists (
    select 1 from public.tables_table_states s
    where s.physical_table_id = p_table and s.state = 'unavailable' and (s.until is null or s.until > lower(p_range)))
$$;
revoke all on function private.tables_table_free(uuid, tstzrange, uuid, uuid) from public, anon, authenticated;

-- Deterministic, explainable candidates: smallest fitting single table first, then the cheapest
-- combination; large tables are kept for large parties when choices are otherwise equal.
create function private.tables_candidates(
  p_venue uuid, p_range tstzrange, p_party integer, p_zone uuid, p_zone_hard boolean,
  p_ignore_reservation uuid, p_limit integer default 5, p_ignore_entry uuid default null)
returns table(kind text, table_ids uuid[], label text, max_covers integer, score integer, in_zone boolean)
language sql stable set search_path = '' as $$
  with free_tables as (
    select t.id, t.label, t.zone_id, t.min_covers, t.max_covers
    from public.tables_physical_tables t
    where t.venue_id = p_venue and t.active and private.tables_table_free(t.id, p_range, p_ignore_reservation, p_ignore_entry)
  ),
  singles as (
    select 'table'::text kind, array[f.id] table_ids, f.label, f.max_covers,
      (f.max_covers - p_party) * 10 + case when f.max_covers >= 8 then 3 else 0 end
        + case when p_zone is not null and f.zone_id <> p_zone then 40 else 0 end as score,
      (p_zone is null or f.zone_id = p_zone) in_zone
    from free_tables f
    where p_party between f.min_covers and f.max_covers
      and (not p_zone_hard or p_zone is null or f.zone_id = p_zone)
  ),
  combos as (
    select 'combination'::text kind, array_agg(m.physical_table_id order by m.physical_table_id) table_ids, c.label, c.max_covers,
      100 + (c.max_covers - p_party) * 10 + c.priority + count(*)::int * 5
        + case when p_zone is not null and bool_or(t.zone_id <> p_zone) then 40 else 0 end as score,
      (p_zone is null or bool_and(t.zone_id = p_zone)) in_zone
    from public.tables_combinations c
    join public.tables_combination_members m on m.combination_id = c.id
    join public.tables_physical_tables t on t.id = m.physical_table_id
    left join free_tables f on f.id = t.id
    where c.venue_id = p_venue and c.active and p_party between c.min_covers and c.max_covers
    group by c.id, c.label, c.max_covers, c.priority
    having bool_and(t.active and f.id is not null)
       and (not p_zone_hard or p_zone is null or bool_and(t.zone_id = p_zone))
  )
  select * from (select * from singles union all select * from combos) x
  order by x.score, x.label, x.table_ids
  limit greatest(1, least(p_limit, 50))
$$;
revoke all on function private.tables_candidates(uuid, tstzrange, integer, uuid, boolean, uuid, integer, uuid) from public, anon, authenticated;

-- Arrival/cover pacing per fixed window measured from the service start.
create function private.tables_pacing_ok(p_venue uuid, p_service_key text, p_date date, p_service_start timestamptz,
  p_starts timestamptz, p_party integer, p_pacing jsonb, p_ignore_reservation uuid)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  w integer := nullif(p_pacing->>'windowMinutes', '')::int;
  max_arrivals integer := nullif(p_pacing->>'maxArrivals', '')::int;
  max_covers integer := nullif(p_pacing->>'maxCovers', '')::int;
  bucket integer;
  arrivals integer;
  covers integer;
begin
  if p_pacing is null or jsonb_typeof(p_pacing) <> 'object' or w is null or (max_arrivals is null and max_covers is null) then return true; end if;
  bucket := floor(extract(epoch from (p_starts - p_service_start)) / 60 / w);
  select count(*), coalesce(sum(r.party_size), 0) into arrivals, covers
  from public.tables_reservations r
  where r.venue_id = p_venue and r.service_date = p_date and r.service_key = p_service_key
    and r.status in ('pending_approval','confirmed','arrived','seated','completed')
    and r.source not in ('walk_in','waitlist')
    and (p_ignore_reservation is null or r.id <> p_ignore_reservation)
    and floor(extract(epoch from (r.starts_at - p_service_start)) / 60 / w) = bucket;
  return (max_arrivals is null or arrivals + 1 <= max_arrivals) and (max_covers is null or covers + p_party <= max_covers);
end;
$$;
revoke all on function private.tables_pacing_ok(uuid, text, date, timestamptz, timestamptz, integer, jsonb, uuid) from public, anon, authenticated;

-- Approval decision. Precedence: date rule > conditional rules (require_manual beats auto) > default.
create function private.tables_approval(p_policy jsonb, p_exception text, p_party integer, p_time text, p_weekday integer,
  p_zone uuid, p_uses_combination boolean, p_source text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  r jsonb;
  w jsonb;
  manual_rule text;
  auto_rule text;
  matches boolean;
begin
  if p_source <> 'online' then return '{"manual":false,"rule":"staff"}'; end if;
  if p_exception = 'manual_approval' then return '{"manual":true,"rule":"date_rule"}'; end if;
  if p_policy->>'approvalMode' = 'manual' then return '{"manual":true,"rule":"venue_default"}'; end if;
  if p_policy->>'approvalMode' = 'conditional' then
    for r in select value from jsonb_array_elements(coalesce(p_policy->'rules', '[]')) value
       order by coalesce((value->>'priority')::int, 0), value->>'id' loop
      if coalesce((r->>'enabled')::boolean, true) is false then continue; end if;
      w := coalesce(r->'when', '{}');
      matches := (w->'partyAtLeast' is null or p_party >= (w->>'partyAtLeast')::int)
        and (w->'partyAtMost' is null or p_party <= (w->>'partyAtMost')::int)
        and (w->'weekdays' is null or jsonb_array_length(w->'weekdays') = 0 or w->'weekdays' @> to_jsonb(p_weekday))
        and (w->>'fromTime' is null or p_time >= w->>'fromTime')
        and (w->>'untilTime' is null or p_time < w->>'untilTime')
        and (w->'zoneIds' is null or jsonb_array_length(w->'zoneIds') = 0 or (p_zone is not null and w->'zoneIds' @> to_jsonb(p_zone::text)))
        and (w->'usesCombination' is null or (w->>'usesCombination')::boolean = p_uses_combination);
      if matches then
        if r->>'then' = 'require_manual' and manual_rule is null then manual_rule := r->>'id'; end if;
        if r->>'then' = 'auto' and auto_rule is null then auto_rule := r->>'id'; end if;
      end if;
    end loop;
    if manual_rule is not null then return jsonb_build_object('manual', true, 'rule', manual_rule); end if;
    if auto_rule is not null then return jsonb_build_object('manual', false, 'rule', auto_rule); end if;
  end if;
  return '{"manual":false,"rule":"venue_default"}';
end;
$$;
revoke all on function private.tables_approval(jsonb, text, integer, text, integer, uuid, boolean, text) from public, anon, authenticated;

-- Published venue + version for a slug, or nothing.
create function private.tables_public_target(p_slug text)
returns table(venue_id uuid, organization_id uuid, version_id uuid, timezone text, status text, snapshot jsonb, name text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.organization_id, v.current_version_id, v.timezone, v.status, vv.snapshot, v.name
  from public.tables_venues v
  join public.organizations o on o.id = v.organization_id and o.status = 'active'
  join public.tables_organization_features f on f.organization_id = v.organization_id and f.enabled
  join public.tables_venue_versions vv on vv.id = v.current_version_id
  where v.slug = p_slug and v.status in ('published','paused')
$$;
revoke all on function private.tables_public_target(text) from public, anon, authenticated;

-- The service of a version snapshot by key.
create function private.tables_service(p_snapshot jsonb, p_key text)
returns jsonb language sql immutable set search_path = '' as $$
  select value from jsonb_array_elements(p_snapshot->'services') value where value->>'key' = p_key limit 1
$$;
revoke all on function private.tables_service(jsonb, text) from public, anon, authenticated;

-- All bookable slot times of one service on one date (no inventory check).
create function private.tables_slot_times(p_service jsonb, p_slot_minutes integer)
returns setof text language sql immutable set search_path = '' as $$
  select to_char(t, 'HH24:MI')
  from generate_series(
    timestamp '2000-01-01' + (p_service->>'start')::time,
    timestamp '2000-01-01' + (p_service->>'lastSeating')::time
      + case when (p_service->>'lastSeating') < (p_service->>'start') then interval '1 day' else interval '0' end,
    make_interval(mins => p_slot_minutes)) t
$$;
revoke all on function private.tables_slot_times(jsonb, integer) from public, anon, authenticated;

-- Evaluates one requested slot. Never writes. Returns
--   {ok, reason, startsAt, endsAt, candidate:{kind,tableIds,label}, approval:{manual,rule}, serviceStart}
-- reason codes: invalid_time, closed, too_soon, too_far, party_size, pacing_full, no_table.
create function private.tables_evaluate(
  p_venue uuid, p_snapshot jsonb, p_tz text, p_service_key text, p_date date, p_time text, p_party integer,
  p_zone uuid, p_source text, p_ignore_reservation uuid, p_check_rules boolean default true)
returns jsonb language plpgsql set search_path = '' as $$
declare
  pol jsonb := p_snapshot->'policy';
  svc jsonb := private.tables_service(p_snapshot, p_service_key);
  service_start timestamptz;
  starts timestamptz;
  ends timestamptz;
  occupied tstzrange;
  exc text;
  cand record;
  approval jsonb;
  duration integer;
  buffer integer := coalesce((pol->>'bufferMinutes')::int, 0);
  weekday integer := extract(dow from p_date)::int;
  zone_hard boolean := coalesce(pol->>'zonePreference', 'soft') = 'hard';
begin
  if svc is null or not (svc->'weekdays' @> to_jsonb(weekday)) then return '{"ok":false,"reason":"closed"}'; end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or not exists (select 1 from private.tables_slot_times(svc, (pol->>'slotMinutes')::int) s where s = p_time) then
    return '{"ok":false,"reason":"invalid_time"}';
  end if;
  select e.kind into exc from public.tables_service_exceptions e
   where e.venue_id = p_venue and e.service_date = p_date and (e.service_key is null or e.service_key = p_service_key)
   order by (e.kind = 'closed') desc limit 1;
  if exc = 'closed' then return '{"ok":false,"reason":"closed"}'; end if;
  if p_party < coalesce((pol->>'minParty')::int, 1) or p_party > coalesce((pol->>'maxParty')::int, 20) then
    if p_source = 'online' then return '{"ok":false,"reason":"party_size"}'; end if;
  end if;
  service_start := private.tables_instant(p_tz, p_date, svc->>'start', svc->>'start');
  starts := private.tables_instant(p_tz, p_date, p_time, svc->>'start');
  if starts is null or service_start is null then return '{"ok":false,"reason":"invalid_time"}'; end if;
  if p_check_rules then
    if starts < clock_timestamp() + make_interval(mins => coalesce((pol->>'leadMinutes')::int, 0)) then return '{"ok":false,"reason":"too_soon"}'; end if;
    if p_date > (clock_timestamp() at time zone p_tz)::date + coalesce((pol->>'horizonDays')::int, 60) then return '{"ok":false,"reason":"too_far"}'; end if;
  end if;
  duration := coalesce((svc->>'durationMinutes')::int, 90);
  ends := starts + make_interval(mins => duration);
  occupied := tstzrange(starts, ends + make_interval(mins => buffer), '[)');
  if p_check_rules and not private.tables_pacing_ok(p_venue, p_service_key, p_date, service_start, starts, p_party, pol->'pacing', p_ignore_reservation) then
    return jsonb_build_object('ok', false, 'reason', 'pacing_full', 'startsAt', starts);
  end if;
  select * into cand from private.tables_candidates(p_venue, occupied, p_party, p_zone, zone_hard, p_ignore_reservation, 1);
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_table', 'startsAt', starts, 'endsAt', ends); end if;
  approval := private.tables_approval(pol, exc, p_party, p_time, weekday, p_zone, cand.kind = 'combination', p_source);
  return jsonb_build_object('ok', true, 'startsAt', starts, 'endsAt', ends, 'bufferMinutes', buffer, 'serviceStart', service_start,
    'candidate', jsonb_build_object('kind', cand.kind, 'tableIds', to_jsonb(cand.table_ids), 'label', cand.label, 'score', cand.score),
    'approval', approval);
end;
$$;
revoke all on function private.tables_evaluate(uuid, jsonb, text, text, date, text, integer, uuid, text, uuid, boolean) from public, anon, authenticated;

-- Inserts all member allocations of one group. Any overlap raises 23P01 for the whole statement.
create function private.tables_allocate(p_res public.tables_reservations, p_table_ids uuid[], p_state text, p_expires timestamptz)
returns uuid language plpgsql set search_path = '' as $$
declare gid uuid := gen_random_uuid();
begin
  insert into public.tables_allocations(organization_id, venue_id, physical_table_id, group_id, reservation_id, occupied_during, state, expires_at)
  select p_res.organization_id, p_res.venue_id, tid, gid, p_res.id,
    tstzrange(p_res.starts_at, p_res.ends_at + make_interval(mins => p_res.buffer_minutes), '[)'), p_state, p_expires
  from unnest(p_table_ids) tid
  order by tid;
  return gid;
end;
$$;
revoke all on function private.tables_allocate(public.tables_reservations, uuid[], text, timestamptz) from public, anon, authenticated;

-- Up to four nearby available times on the same date (public alternatives).
create function private.tables_alternatives(p_venue uuid, p_snapshot jsonb, p_tz text, p_date date, p_time text, p_party integer, p_zone uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  svc jsonb;
  t text;
  result jsonb := '[]';
  ev jsonb;
begin
  for svc in select value from jsonb_array_elements(p_snapshot->'services') value loop
    for t in select s from private.tables_slot_times(svc, (p_snapshot->'policy'->>'slotMinutes')::int) s
       order by abs(extract(epoch from (('2000-01-01 ' || s)::timestamp - ('2000-01-01 ' || coalesce(p_time, '19:00'))::timestamp))) loop
      exit when jsonb_array_length(result) >= 4;
      if t = p_time then continue; end if;
      ev := private.tables_evaluate(p_venue, p_snapshot, p_tz, svc->>'key', p_date, t, p_party, p_zone, 'online', null);
      if (ev->>'ok')::boolean then
        result := result || jsonb_build_array(jsonb_build_object('serviceKey', svc->>'key', 'time', t, 'approval', case when (ev->'approval'->>'manual')::boolean then 'request' else 'instant' end));
      end if;
    end loop;
  end loop;
  return (select coalesce(jsonb_agg(x order by x->>'time'), '[]') from jsonb_array_elements(result) x);
end;
$$;
revoke all on function private.tables_alternatives(uuid, jsonb, text, date, text, integer, uuid) from public, anon, authenticated;

-- Core create used by public and staff paths. Caller has validated identity, inputs and rate
-- limits; this function takes the day lock, decides and writes everything atomically.
create function private.tables_create_reservation(
  p_org uuid, p_venue uuid, p_version uuid, p_snapshot jsonb, p_tz text, p_input jsonb, p_source text,
  p_idempotency uuid, p_client uuid, p_actor uuid, p_override boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  service_key text := p_input->>'serviceKey';
  svc jsonb;
  d date := (p_input->>'date')::date;
  t text := p_input->>'time';
  party integer := (p_input->>'party')::int;
  zone uuid := nullif(p_input->>'zoneId', '')::uuid;
  phone text := private.tables_normalize_phone(p_input->>'phone');
  email text := nullif(lower(btrim(coalesce(p_input->>'email', ''))), '');
  name text := btrim(coalesce(p_input->>'name', ''));
  requests text := nullif(btrim(coalesce(p_input->>'requests', '')), '');
  explicit_tables uuid[];
  request_hash text;
  existing public.tables_reservations%rowtype;
  ev jsonb;
  res public.tables_reservations%rowtype;
  manual boolean;
  status text;
  pending_mode text := coalesce(p_snapshot->'policy'->>'pendingMode', 'unallocated');
  hold_minutes integer := coalesce((p_snapshot->'policy'->>'pendingHoldMinutes')::int, 15);
  table_ids uuid[];
  attempt integer := 0;
  ref text;
  seat_now boolean := coalesce((p_input->>'seatNow')::boolean, false) and p_source in ('walk_in','phone','staff');
  starts timestamptz;
  ends timestamptz;
  duration integer;
  buffer integer := coalesce((p_snapshot->'policy'->>'bufferMinutes')::int, 0);
  unassigned boolean := false;
  gid uuid;
  alloc_state text;
begin
  if jsonb_typeof(p_input->'tableIds') = 'array' and jsonb_array_length(p_input->'tableIds') > 0 then
    select array_agg(x::uuid order by x::uuid) into explicit_tables from jsonb_array_elements_text(p_input->'tableIds') x;
  end if;
  if length(name) not between 1 and 120 then raise exception 'tables:name_required' using errcode = '22023'; end if;
  if p_source = 'online' and phone is null then raise exception 'tables:phone_invalid' using errcode = '22023'; end if;
  if coalesce(p_input->>'phone', '') <> '' and phone is null then raise exception 'tables:phone_invalid' using errcode = '22023'; end if;
  if email is not null and (length(email) > 254 or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'tables:email_invalid' using errcode = '22023'; end if;
  if party is null or party not between 1 and 120 then raise exception 'tables:party_size' using errcode = '22023'; end if;
  if requests is not null and length(requests) > 500 then raise exception 'tables:requests_too_long' using errcode = '22023'; end if;

  request_hash := encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'v', p_venue, 's', p_source, 'k', service_key, 'd', d, 't', t, 'p', party, 'z', zone, 'n', name, 'ph', phone, 'e', email,
    'r', requests, 'tb', to_jsonb(explicit_tables), 'sn', seat_now)::text, 'UTF8'), 'sha256'), 'hex');

  perform private.tables_lock_day(p_venue, d);
  select * into existing from public.tables_reservations r where r.venue_id = p_venue and r.idempotency_key = p_idempotency;
  if found then
    if existing.request_hash <> request_hash then raise exception 'tables:idempotency_conflict' using errcode = '22023'; end if;
    return jsonb_build_object('replayed', true, 'reservationId', existing.id, 'reference', existing.reference,
      'status', existing.status, 'result', case when existing.status = 'pending_approval' then 'pending' else 'confirmed' end);
  end if;
  perform private.tables_expire(p_venue, d);

  if seat_now then
    -- Walk-in / immediate seating: starts now (venue time), on the host's current service date.
    svc := coalesce(private.tables_service(p_snapshot, service_key), p_snapshot->'services'->0);
    service_key := svc->>'key';
    duration := coalesce((p_input->>'durationMinutes')::int, (svc->>'durationMinutes')::int, 90);
    starts := date_trunc('minute', clock_timestamp());
    ends := starts + make_interval(mins => duration);
    t := to_char(starts at time zone p_tz, 'HH24:MI');
    table_ids := explicit_tables;
    if table_ids is null then
      select c.table_ids into table_ids from private.tables_candidates(p_venue, tstzrange(starts, ends + make_interval(mins => buffer), '[)'),
        party, zone, false, null, 1) c;
      if table_ids is null then raise exception 'tables:no_table' using errcode = 'P0001'; end if;
    end if;
    manual := false;
    ev := jsonb_build_object('approval', jsonb_build_object('manual', false, 'rule', 'staff'));
  else
    if service_key is null then raise exception 'tables:closed' using errcode = '22023'; end if;
    ev := private.tables_evaluate(p_venue, p_snapshot, p_tz, service_key, d, t, party, zone, p_source, null, not p_override);
    if not (ev->>'ok')::boolean then
      if ev->>'reason' = 'no_table' and explicit_tables is not null and p_source <> 'online' then
        null; -- staff chose tables explicitly; validated below
      elsif ev->>'reason' = 'no_table' and p_override and p_source <> 'online' then
        unassigned := true;
      else
        if p_source = 'online' then
          return jsonb_build_object('result', 'unavailable', 'reason', ev->>'reason',
            'alternatives', private.tables_alternatives(p_venue, p_snapshot, p_tz, d, t, party, zone));
        end if;
        raise exception 'tables:%', ev->>'reason' using errcode = 'P0001';
      end if;
    end if;
    svc := private.tables_service(p_snapshot, service_key);
    starts := private.tables_instant(p_tz, d, t, svc->>'start');
    if starts is null then raise exception 'tables:invalid_time' using errcode = '22023'; end if;
    ends := starts + make_interval(mins => coalesce((svc->>'durationMinutes')::int, 90));
    table_ids := coalesce(explicit_tables, case when unassigned then null else (select array_agg(x::uuid order by x::uuid) from jsonb_array_elements_text(ev->'candidate'->'tableIds') x) end);
    manual := coalesce((ev->'approval'->>'manual')::boolean, false);
  end if;

  if explicit_tables is not null then
    if (select count(*) from public.tables_physical_tables pt where pt.venue_id = p_venue and pt.active and pt.id = any(explicit_tables)) <> cardinality(explicit_tables) then
      raise exception 'tables:table_unknown' using errcode = '22023';
    end if;
    if not p_override and (select sum(pt.max_covers) from public.tables_physical_tables pt where pt.id = any(explicit_tables)) < party then
      raise exception 'tables:table_too_small' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(explicit_tables) x where not private.tables_table_free(x, tstzrange(starts, ends + make_interval(mins => buffer), '[)'), null)) then
      raise exception 'tables:table_conflict' using errcode = 'P0001';
    end if;
  end if;

  status := case when seat_now then 'seated' when manual then 'pending_approval' else 'confirmed' end;
  loop
    attempt := attempt + 1;
    ref := private.tables_reference();
    exit when not exists (select 1 from public.tables_reservations r where r.venue_id = p_venue and r.reference = ref) or attempt > 5;
  end loop;

  insert into public.tables_reservations(organization_id, venue_id, version_id, reference, service_key, service_date, local_time,
    starts_at, ends_at, buffer_minutes, party_size, status, source, approval, approval_rule, guest_id, guest_name, guest_phone, guest_email,
    requests, zone_preference, override_reason, pending_expires_at, terms_accepted_at, arrived_at, seated_at, idempotency_key, request_hash, client_token, created_by)
  values (p_org, p_venue, p_version, ref, service_key, d, t, starts, ends, buffer, party, status, p_source,
    case when p_source <> 'online' then 'staff' when manual then 'manual' else 'auto' end, ev->'approval'->>'rule',
    private.tables_upsert_guest(p_org, name, phone, email), name, phone, email, requests, zone,
    case when p_override then nullif(btrim(coalesce(p_input->>'overrideReason', '')), '') end,
    case when manual then case when pending_mode = 'hold' then least(clock_timestamp() + make_interval(mins => hold_minutes), starts)
      else starts end end,
    case when p_source = 'online' then clock_timestamp() end,
    case when seat_now then clock_timestamp() end, case when seat_now then clock_timestamp() end,
    p_idempotency, request_hash, p_client, p_actor)
  returning * into res;

  alloc_state := case when seat_now then 'seated' when manual then 'held' else 'confirmed' end;
  if table_ids is not null and not (manual and pending_mode = 'unallocated') then
    begin
      gid := private.tables_allocate(res, table_ids, alloc_state, case when alloc_state = 'held' then res.pending_expires_at end);
    exception when exclusion_violation then
      raise exception 'tables:table_conflict' using errcode = 'P0001';
    end;
  end if;
  perform private.tables_event(res, 'created', null, status, case when p_source = 'online' then 'guest' else 'staff' end,
    res.override_reason, jsonb_build_object('source', p_source, 'rule', ev->'approval'->>'rule', 'tables', coalesce(cardinality(table_ids), 0),
      'unassigned', unassigned or table_ids is null));
  perform private.tables_bump(p_org, p_venue, d);
  return jsonb_build_object('replayed', false, 'reservationId', res.id, 'reference', res.reference, 'status', res.status,
    'result', case when manual then 'pending' else 'confirmed' end, 'startsAt', res.starts_at, 'tableIds', to_jsonb(table_ids));
end;
$$;
revoke all on function private.tables_create_reservation(uuid, uuid, uuid, jsonb, text, jsonb, text, uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- ---------- Public API (anonymous) ----------
create function public.tables_public_venue(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  brand jsonb;
begin
  select * into target from private.tables_public_target(p_slug);
  if not found then return null; end if;
  select b.config into brand from public.brand_configurations b where b.organization_id = target.organization_id;
  return jsonb_build_object(
    'slug', p_slug, 'name', target.name, 'timezone', target.timezone, 'paused', target.status = 'paused',
    'address', target.snapshot->'basics'->>'address', 'phone', target.snapshot->'basics'->>'phone',
    'venueType', target.snapshot->'basics'->>'venueType',
    'intro', target.snapshot->'guest'->>'intro', 'terms', target.snapshot->'guest'->>'terms',
    'showWhatsapp', coalesce((target.snapshot->'guest'->>'showWhatsapp')::boolean, false),
    'policy', jsonb_build_object(
      'minParty', target.snapshot->'policy'->'minParty', 'maxParty', target.snapshot->'policy'->'maxParty',
      'horizonDays', target.snapshot->'policy'->'horizonDays', 'leadMinutes', target.snapshot->'policy'->'leadMinutes',
      'cancelCutoffMinutes', target.snapshot->'policy'->'cancelCutoffMinutes',
      'modifyCutoffMinutes', target.snapshot->'policy'->'modifyCutoffMinutes',
      'allowGuestModify', coalesce(target.snapshot->'policy'->'allowGuestModify', 'true'),
      'zoneChoice', coalesce(target.snapshot->'policy'->'zoneChoice', 'false'),
      'waitlistPublic', coalesce(target.snapshot->'policy'->'waitlist'->'publicEnabled', 'false')),
    'zones', case when coalesce((target.snapshot->'policy'->>'zoneChoice')::boolean, false)
      then (select coalesce(jsonb_agg(jsonb_build_object('id', z->>'id', 'name', z->>'name')), '[]') from jsonb_array_elements(target.snapshot->'zones') z)
      else '[]'::jsonb end,
    'services', (select coalesce(jsonb_agg(jsonb_build_object('key', s->>'key', 'name', s->>'name', 'weekdays', s->'weekdays',
      'start', s->>'start', 'lastSeating', s->>'lastSeating')), '[]') from jsonb_array_elements(target.snapshot->'services') s),
    'brand', jsonb_build_object('displayName', brand->>'displayName', 'palette', brand->'palette'),
    'serverNow', clock_timestamp());
end;
$$;

-- Available start times for one date. Only bookable times are returned (no counts, tables or
-- reasons that would expose occupancy).
create function public.tables_public_availability(p_slug text, p_date date, p_party integer, p_zone uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  svc jsonb;
  t text;
  ev jsonb;
  slots jsonb;
  services jsonb := '[]';
  closed_all boolean := true;
  today date;
begin
  select * into target from private.tables_public_target(p_slug);
  if not found then return null; end if;
  perform private.tables_rate('availability:' || target.venue_id, p_client, 90, 300, interval '5 minutes');
  today := (clock_timestamp() at time zone target.timezone)::date;
  if target.status = 'paused' then return jsonb_build_object('date', p_date, 'state', 'paused', 'services', '[]'::jsonb); end if;
  if p_date is null or p_date < today or p_date > today + coalesce((target.snapshot->'policy'->>'horizonDays')::int, 60) then
    return jsonb_build_object('date', p_date, 'state', 'out_of_range', 'services', '[]'::jsonb);
  end if;
  if p_party is null or p_party < coalesce((target.snapshot->'policy'->>'minParty')::int, 1)
     or p_party > coalesce((target.snapshot->'policy'->>'maxParty')::int, 20) then
    return jsonb_build_object('date', p_date, 'state', 'party_size', 'services', '[]'::jsonb);
  end if;
  for svc in select value from jsonb_array_elements(target.snapshot->'services') value order by value->>'start' loop
    if not (svc->'weekdays' @> to_jsonb(extract(dow from p_date)::int)) then continue; end if;
    if exists (select 1 from public.tables_service_exceptions e where e.venue_id = target.venue_id and e.service_date = p_date
        and e.kind = 'closed' and (e.service_key is null or e.service_key = svc->>'key')) then continue; end if;
    closed_all := false;
    slots := '[]';
    for t in select s from private.tables_slot_times(svc, (target.snapshot->'policy'->>'slotMinutes')::int) s loop
      ev := private.tables_evaluate(target.venue_id, target.snapshot, target.timezone, svc->>'key', p_date, t, p_party, p_zone, 'online', null);
      if (ev->>'ok')::boolean then
        slots := slots || jsonb_build_array(jsonb_build_object('time', t, 'approval', case when (ev->'approval'->>'manual')::boolean then 'request' else 'instant' end));
      end if;
    end loop;
    services := services || jsonb_build_array(jsonb_build_object('key', svc->>'key', 'name', svc->>'name', 'slots', slots));
  end loop;
  return jsonb_build_object('date', p_date, 'state', case when closed_all then 'closed'
      when not exists (select 1 from jsonb_array_elements(services) s where jsonb_array_length(s->'slots') > 0) then 'full' else 'open' end,
    'services', services);
end;
$$;

create function public.tables_public_book(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  result jsonb;
  token text;
  res public.tables_reservations%rowtype;
begin
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 4096 or p_idempotency_key is null then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  select * into target from private.tables_public_target(p_slug);
  if not found or target.status <> 'published' then raise exception 'tables:unavailable' using errcode = 'P0002'; end if;
  if coalesce((p_input->>'termsAccepted')::boolean, false) is not true then raise exception 'tables:terms_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.tables_reservations r where r.venue_id = target.venue_id and r.idempotency_key = p_idempotency_key) then
    perform private.tables_rate('book:' || target.venue_id, p_client, 6, 20, interval '15 minutes');
    if (select count(*) from public.tables_reservations r where r.venue_id = target.venue_id and r.source = 'online'
        and r.created_at > clock_timestamp() - interval '15 minutes') >= 300 then
      raise exception 'tables:rate_limited' using errcode = '54000';
    end if;
  end if;
  if (p_input->>'date')::date < (clock_timestamp() at time zone target.timezone)::date then
    raise exception 'tables:too_soon' using errcode = '22023';
  end if;
  result := private.tables_create_reservation(target.organization_id, target.venue_id, target.version_id, target.snapshot, target.timezone,
    p_input, 'online', p_idempotency_key, p_client, null, false);
  if result->>'result' = 'unavailable' then return result; end if;
  select * into res from public.tables_reservations where id = (result->>'reservationId')::uuid;
  -- A replay must come from the same browser (client token) to receive a fresh manage link.
  if (result->>'replayed')::boolean and res.client_token is distinct from p_client then
    raise exception 'tables:idempotency_conflict' using errcode = '22023';
  end if;
  token := private.tables_issue_token(res.organization_id, res.venue_id, res.id, null, array['read','modify','cancel'],
    greatest(res.ends_at, clock_timestamp()) + interval '30 days');
  return jsonb_build_object('result', result->>'result', 'reference', res.reference, 'token', token,
    'reservation', jsonb_build_object('date', res.service_date, 'time', res.local_time, 'party', res.party_size,
      'status', res.status, 'startsAt', res.starts_at, 'pendingExpiresAt', res.pending_expires_at));
end;
$$;

-- ---------- Staff create ----------
create function public.tables_staff_create_reservation(p_venue_id uuid, p_input jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
  source text := coalesce(p_input->>'source', 'phone');
  override boolean := length(btrim(coalesce(p_input->>'overrideReason', ''))) > 0;
begin
  v := private.tables_require(p_venue_id, 'host');
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 4096 or p_idempotency_key is null then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  if source not in ('phone','walk_in','staff') then raise exception 'tables:invalid' using errcode = '22023'; end if;
  if override and not private.tables_can(p_venue_id, 'manager') then raise exception 'tables:override_requires_manager' using errcode = '42501'; end if;
  if v.current_version_id is null then raise exception 'tables:not_published' using errcode = '22023'; end if;
  select * into vv from public.tables_venue_versions where id = v.current_version_id;
  return private.tables_create_reservation(v.organization_id, v.id, vv.id, vv.snapshot, v.timezone, p_input, source,
    p_idempotency_key, null, auth.uid(), override);
end;
$$;

-- Staff availability preview with explanations (tables, combination, reason codes).
create function public.tables_staff_availability(p_venue_id uuid, p_date date, p_party integer, p_zone uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
  svc jsonb;
  t text;
  ev jsonb;
  out jsonb := '[]';
  slots jsonb;
begin
  v := private.tables_require(p_venue_id, 'host');
  select * into vv from public.tables_venue_versions where id = v.current_version_id;
  if not found then return '[]'::jsonb; end if;
  if p_party is null or p_party not between 1 and 120 then raise exception 'tables:party_size' using errcode = '22023'; end if;
  for svc in select value from jsonb_array_elements(vv.snapshot->'services') value order by value->>'start' loop
    if not (svc->'weekdays' @> to_jsonb(extract(dow from p_date)::int)) then continue; end if;
    slots := '[]';
    for t in select s from private.tables_slot_times(svc, (vv.snapshot->'policy'->>'slotMinutes')::int) s loop
      ev := private.tables_evaluate(v.id, vv.snapshot, v.timezone, svc->>'key', p_date, t, p_party, p_zone, 'staff', null, false);
      slots := slots || jsonb_build_array(jsonb_build_object('time', t, 'ok', ev->'ok', 'reason', ev->'reason',
        'tables', (select coalesce(jsonb_agg(pt.label order by pt.label), '[]') from public.tables_physical_tables pt
          where pt.id::text in (select jsonb_array_elements_text(coalesce(ev->'candidate'->'tableIds', '[]')))),
        'kind', ev->'candidate'->'kind'));
    end loop;
    out := out || jsonb_build_array(jsonb_build_object('key', svc->>'key', 'name', svc->>'name', 'slots', slots));
  end loop;
  return out;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.tables_public_venue(text)','public.tables_public_availability(text,date,integer,uuid,uuid)',
    'public.tables_public_book(text,jsonb,uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['public.tables_staff_create_reservation(uuid,jsonb,uuid)','public.tables_staff_availability(uuid,date,integer,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
