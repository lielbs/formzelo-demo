-- Formangle Tables T5: staff/public waitlist, offers with timed holds, seating conversion.
--  * A waitlist entry is not inventory. An offer holds real tables (state 'held', expires_at);
--    timeout releases them under the day lock; seating converts the same allocation rows into the
--    reservation's seated allocation (no parallel booking).
--  * Estimates are ranges labelled as estimates, never promises.
begin;

create unique index tables_waitlist_one_active_phone on public.tables_waitlist_entries(venue_id, service_date, guest_phone)
  where guest_phone is not null and status in ('waiting','offered');

create function private.tables_lock_entry(p_entry uuid, p_expected bigint)
returns public.tables_waitlist_entries language plpgsql set search_path = '' as $$
declare e public.tables_waitlist_entries%rowtype;
begin
  select * into e from public.tables_waitlist_entries where id = p_entry;
  if not found or not private.tables_can(e.venue_id, 'host') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  perform private.tables_lock_day(e.venue_id, e.service_date);
  perform private.tables_expire(e.venue_id, e.service_date);
  select * into e from public.tables_waitlist_entries where id = p_entry for update;
  if p_expected is not null and e.lock_version <> p_expected then
    raise exception 'tables:stale' using errcode = '40001', detail = jsonb_build_object('status', e.status, 'lockVersion', e.lock_version)::text;
  end if;
  return e;
end;
$$;
revoke all on function private.tables_lock_entry(uuid, bigint) from public, anon, authenticated;

-- Range estimate (minutes) for an entry: time until a compatible table is expected to free up.
create function private.tables_wait_estimate(p_venue uuid, p_party integer)
returns jsonb language sql stable set search_path = '' as $$
  with compatible as (
    select t.id from public.tables_physical_tables t
    where t.venue_id = p_venue and t.active and p_party between t.min_covers and t.max_covers
  ), frees as (
    select c.id, coalesce((
      select greatest(0, extract(epoch from (max(upper(a.occupied_during)) - clock_timestamp())) / 60)
      from public.tables_allocations a
      where a.physical_table_id = c.id and a.state in ('held','confirmed','seated')
        and a.occupied_during @> clock_timestamp()), 0) as minutes
    from compatible c
  )
  select case when not exists (select 1 from compatible) then null
    else jsonb_build_object('min', floor(min(minutes) / 5) * 5, 'max', floor(min(minutes) / 5) * 5 + 20) end
  from frees
$$;
revoke all on function private.tables_wait_estimate(uuid, integer) from public, anon, authenticated;

create function private.tables_add_entry(p_venue public.tables_venues, p_input jsonb, p_source text, p_idempotency uuid, p_client uuid)
returns public.tables_waitlist_entries language plpgsql set search_path = '' as $$
declare
  e public.tables_waitlist_entries%rowtype;
  phone text := private.tables_normalize_phone(p_input->>'phone');
  party integer := (p_input->>'party')::int;
  d date := coalesce((p_input->>'date')::date, (clock_timestamp() at time zone p_venue.timezone)::date);
  est jsonb;
begin
  if length(btrim(coalesce(p_input->>'name', ''))) not between 1 and 120 then raise exception 'tables:name_required' using errcode = '22023'; end if;
  if coalesce(p_input->>'phone', '') <> '' and phone is null then raise exception 'tables:phone_invalid' using errcode = '22023'; end if;
  if p_source = 'public' and phone is null then raise exception 'tables:phone_invalid' using errcode = '22023'; end if;
  if party is null or party not between 1 and 60 then raise exception 'tables:party_size' using errcode = '22023'; end if;
  if coalesce((p_input->>'priority')::int, 0) not between 0 and 3
     or (coalesce((p_input->>'priority')::int, 0) > 0 and length(btrim(coalesce(p_input->>'priorityReason', ''))) = 0) then
    raise exception 'tables:priority_reason_required' using errcode = '22023';
  end if;
  perform private.tables_lock_day(p_venue.id, d);
  select * into e from public.tables_waitlist_entries x where x.venue_id = p_venue.id and x.idempotency_key = p_idempotency;
  if found then return e; end if;
  if phone is not null and exists (select 1 from public.tables_waitlist_entries x where x.venue_id = p_venue.id and x.service_date = d
      and x.guest_phone = phone and x.status in ('waiting','offered')) then
    raise exception 'tables:already_waiting' using errcode = 'P0001';
  end if;
  if (select count(*) from public.tables_waitlist_entries x where x.venue_id = p_venue.id and x.service_date = d and x.status in ('waiting','offered')) >= 150 then
    raise exception 'tables:waitlist_full' using errcode = 'P0001';
  end if;
  est := private.tables_wait_estimate(p_venue.id, party);
  insert into public.tables_waitlist_entries(organization_id, venue_id, service_date, guest_id, guest_name, guest_phone, party_size,
    zone_preference, notes, source, priority, priority_reason, quoted_min, quoted_max, idempotency_key, client_token, created_by)
  values (p_venue.organization_id, p_venue.id, d,
    case when phone is not null then private.tables_upsert_guest(p_venue.organization_id, btrim(p_input->>'name'), phone, null) end,
    btrim(p_input->>'name'), phone, party, nullif(p_input->>'zoneId', '')::uuid,
    nullif(left(btrim(coalesce(p_input->>'notes', '')), 300), ''), p_source,
    coalesce((p_input->>'priority')::int, 0), nullif(btrim(coalesce(p_input->>'priorityReason', '')), ''),
    (est->>'min')::int, (est->>'max')::int, p_idempotency, p_client, auth.uid())
  returning * into e;
  perform private.tables_bump(p_venue.organization_id, p_venue.id, d);
  return e;
end;
$$;
revoke all on function private.tables_add_entry(public.tables_venues, jsonb, text, uuid, uuid) from public, anon, authenticated;

create function public.tables_waitlist_add(p_venue_id uuid, p_input jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.tables_venues%rowtype;
  e public.tables_waitlist_entries%rowtype;
begin
  v := private.tables_require(p_venue_id, 'host');
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 2048 or p_idempotency_key is null then raise exception 'tables:invalid' using errcode = '22023'; end if;
  e := private.tables_add_entry(v, p_input, 'staff', p_idempotency_key, null);
  return jsonb_build_object('id', e.id, 'status', e.status, 'lockVersion', e.lock_version);
end;
$$;

-- Offer a table now: holds real inventory for offerMinutes; the guest's status page shows it.
create function public.tables_waitlist_offer(p_entry_id uuid, p_table_ids uuid[], p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.tables_waitlist_entries%rowtype;
  v public.tables_venues%rowtype;
  snap jsonb;
  minutes integer;
  ids uuid[];
  span tstzrange;
  duration integer;
  gid uuid := gen_random_uuid();
begin
  e := private.tables_lock_entry(p_entry_id, p_expected_lock_version);
  if e.status <> 'waiting' then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
  select * into v from public.tables_venues where id = e.venue_id;
  select snapshot into snap from public.tables_venue_versions where id = v.current_version_id;
  minutes := coalesce((snap->'policy'->'waitlist'->>'offerMinutes')::int, 10);
  duration := coalesce((snap->'services'->0->>'durationMinutes')::int, 90);
  span := tstzrange(date_trunc('minute', clock_timestamp()), date_trunc('minute', clock_timestamp()) + make_interval(mins => duration), '[)');
  if p_table_ids is not null and cardinality(p_table_ids) > 0 then
    select array_agg(distinct x order by x) into ids from unnest(p_table_ids) x;
    if (select count(*) from public.tables_physical_tables t where t.venue_id = e.venue_id and t.active and t.id = any(ids)) <> cardinality(ids) then
      raise exception 'tables:table_unknown' using errcode = '22023';
    end if;
  else
    select c.table_ids into ids from private.tables_candidates(e.venue_id, span, e.party_size, e.zone_preference, false, null, 1) c;
  end if;
  if ids is null then raise exception 'tables:no_table' using errcode = 'P0001'; end if;
  begin
    insert into public.tables_allocations(organization_id, venue_id, physical_table_id, group_id, waitlist_entry_id, occupied_during, state, expires_at)
    select e.organization_id, e.venue_id, x, gid, e.id, span, 'held', clock_timestamp() + make_interval(mins => minutes)
    from unnest(ids) x where private.tables_table_free(x, span, null);
    if (select count(*) from public.tables_allocations where group_id = gid) <> cardinality(ids) then
      raise exception 'tables:table_conflict' using errcode = 'P0001';
    end if;
  exception when exclusion_violation then
    raise exception 'tables:table_conflict' using errcode = 'P0001';
  end;
  update public.tables_waitlist_entries set status = 'offered', offer_expires_at = clock_timestamp() + make_interval(mins => minutes),
    lock_version = lock_version + 1 where id = e.id returning * into e;
  perform private.tables_bump(e.organization_id, e.venue_id, e.service_date);
  return jsonb_build_object('id', e.id, 'status', e.status, 'lockVersion', e.lock_version, 'offerExpiresAt', e.offer_expires_at);
end;
$$;

-- Seat a waiting/offered party: converts the held offer (or finds tables now) into a seated
-- reservation with source 'waitlist' in one transaction.
create function public.tables_waitlist_seat(p_entry_id uuid, p_table_ids uuid[], p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.tables_waitlist_entries%rowtype;
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
  svc jsonb;
  ids uuid[];
  res public.tables_reservations%rowtype;
  starts timestamptz := date_trunc('minute', clock_timestamp());
  duration integer;
  held_count integer;
  local_t text;
  ref text;
begin
  e := private.tables_lock_entry(p_entry_id, p_expected_lock_version);
  if e.status not in ('waiting','offered') then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
  select * into v from public.tables_venues where id = e.venue_id;
  select * into vv from public.tables_venue_versions where id = v.current_version_id;
  local_t := to_char(starts at time zone v.timezone, 'HH24:MI');
  select value into svc from jsonb_array_elements(vv.snapshot->'services') value
   where (value->>'start') <= local_t order by value->>'start' desc limit 1;
  svc := coalesce(svc, vv.snapshot->'services'->0);
  duration := coalesce((svc->>'durationMinutes')::int, 90);
  select count(*) into held_count from public.tables_allocations where waitlist_entry_id = e.id and state = 'held';
  if held_count > 0 and (p_table_ids is null or cardinality(p_table_ids) = 0) then
    select array_agg(physical_table_id order by physical_table_id) into ids from public.tables_allocations where waitlist_entry_id = e.id and state = 'held';
  elsif p_table_ids is not null and cardinality(p_table_ids) > 0 then
    select array_agg(distinct x order by x) into ids from unnest(p_table_ids) x;
    if (select count(*) from public.tables_physical_tables t where t.venue_id = e.venue_id and t.active and t.id = any(ids)) <> cardinality(ids) then
      raise exception 'tables:table_unknown' using errcode = '22023';
    end if;
  else
    select c.table_ids into ids from private.tables_candidates(e.venue_id, tstzrange(starts, starts + make_interval(mins => duration), '[)'),
      e.party_size, e.zone_preference, false, null, 1) c;
  end if;
  if ids is null then raise exception 'tables:no_table' using errcode = 'P0001'; end if;
  loop
    ref := private.tables_reference();
    exit when not exists (select 1 from public.tables_reservations r where r.venue_id = e.venue_id and r.reference = ref);
  end loop;
  insert into public.tables_reservations(organization_id, venue_id, version_id, reference, service_key, service_date, local_time,
    starts_at, ends_at, buffer_minutes, party_size, status, source, approval, guest_id, guest_name, guest_phone, zone_preference,
    arrived_at, seated_at, idempotency_key, request_hash, created_by)
  values (e.organization_id, e.venue_id, vv.id, ref, svc->>'key', e.service_date, local_t, starts, starts + make_interval(mins => duration),
    0, e.party_size, 'seated', 'waitlist', 'staff', e.guest_id, e.guest_name, e.guest_phone, e.zone_preference,
    clock_timestamp(), clock_timestamp(), e.idempotency_key, encode(extensions.digest(convert_to('waitlist:' || e.id::text, 'UTF8'), 'sha256'), 'hex'), auth.uid())
  returning * into res;
  begin
    -- Release this entry's own hold first, then claim the chosen tables as seated in one statement.
    update public.tables_allocations set state = 'released', released_at = clock_timestamp() where waitlist_entry_id = e.id and state = 'held';
    perform private.tables_allocate(res, ids, 'seated', null);
  exception when exclusion_violation then
    raise exception 'tables:table_conflict' using errcode = 'P0001';
  end;
  update public.tables_waitlist_entries set status = 'seated', reservation_id = res.id, closed_at = clock_timestamp(),
    offer_expires_at = null, lock_version = lock_version + 1 where id = e.id;
  -- The guest's status link stays readable (it expires after a day) so they see "seated".
  perform private.tables_event(res, 'created', null, 'seated', 'staff', null, jsonb_build_object('source', 'waitlist', 'waitedMinutes',
    floor(extract(epoch from (clock_timestamp() - e.joined_at)) / 60)));
  perform private.tables_bump(e.organization_id, e.venue_id, e.service_date);
  return jsonb_build_object('id', e.id, 'status', 'seated', 'reservationId', res.id);
end;
$$;

create function public.tables_waitlist_close(p_entry_id uuid, p_status text, p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.tables_waitlist_entries%rowtype;
begin
  e := private.tables_lock_entry(p_entry_id, p_expected_lock_version);
  if p_status not in ('declined','departed','no_response','cancelled','waiting') then raise exception 'tables:invalid' using errcode = '22023'; end if;
  if e.status not in ('waiting','offered') then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
  if p_status = 'waiting' and e.status <> 'offered' then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
  update public.tables_allocations set state = 'released', released_at = clock_timestamp() where waitlist_entry_id = e.id and state = 'held';
  update public.tables_waitlist_entries set status = p_status, offer_expires_at = null,
    closed_at = case when p_status = 'waiting' then null else clock_timestamp() end, lock_version = lock_version + 1
   where id = e.id returning * into e;
  perform private.tables_bump(e.organization_id, e.venue_id, e.service_date);
  return jsonb_build_object('id', e.id, 'status', e.status, 'lockVersion', e.lock_version);
end;
$$;

create function public.tables_waitlist_priority(p_entry_id uuid, p_priority integer, p_reason text, p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.tables_waitlist_entries%rowtype;
begin
  e := private.tables_lock_entry(p_entry_id, p_expected_lock_version);
  if p_priority not between 0 and 3 or (p_priority > 0 and length(btrim(coalesce(p_reason, ''))) = 0) or length(coalesce(p_reason, '')) > 200 then
    raise exception 'tables:priority_reason_required' using errcode = '22023';
  end if;
  update public.tables_waitlist_entries set priority = p_priority, priority_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    lock_version = lock_version + 1 where id = e.id returning * into e;
  perform private.tables_bump(e.organization_id, e.venue_id, e.service_date);
  return jsonb_build_object('id', e.id, 'priority', e.priority, 'lockVersion', e.lock_version);
end;
$$;

-- Public: join, status, leave.
create function public.tables_public_waitlist_join(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  v public.tables_venues%rowtype;
  e public.tables_waitlist_entries%rowtype;
  token text;
begin
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 1024 or p_idempotency_key is null then raise exception 'tables:invalid' using errcode = '22023'; end if;
  select * into target from private.tables_public_target(p_slug);
  if not found or target.status <> 'published' or not coalesce((target.snapshot->'policy'->'waitlist'->>'publicEnabled')::boolean, false) then
    raise exception 'tables:unavailable' using errcode = 'P0002';
  end if;
  if coalesce((p_input->>'consent')::boolean, false) is not true then raise exception 'tables:terms_required' using errcode = '22023'; end if;
  perform private.tables_rate('waitlist:' || target.venue_id, p_client, 4, 15, interval '30 minutes');
  if (p_input->>'party')::int > coalesce((target.snapshot->'policy'->>'maxParty')::int, 20) then raise exception 'tables:party_size' using errcode = '22023'; end if;
  select * into v from public.tables_venues where id = target.venue_id;
  e := private.tables_add_entry(v, p_input - 'date' - 'priority' - 'priorityReason', 'public', p_idempotency_key, p_client);
  if e.client_token is distinct from p_client then raise exception 'tables:idempotency_conflict' using errcode = '22023'; end if;
  token := private.tables_issue_token(e.organization_id, e.venue_id, null, e.id, array['read','leave_waitlist'], clock_timestamp() + interval '1 day');
  return jsonb_build_object('token', token, 'status', e.status);
end;
$$;

create function public.tables_public_waitlist_status(p_token text, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  e public.tables_waitlist_entries%rowtype;
  v public.tables_venues%rowtype;
begin
  perform private.tables_rate('manage', p_client, 60, 300, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'read');
  if t.id is null or t.waitlist_entry_id is null then return null; end if;
  select * into e from public.tables_waitlist_entries where id = t.waitlist_entry_id;
  if e.status = 'offered' and e.offer_expires_at <= clock_timestamp() then
    perform private.tables_lock_day(e.venue_id, e.service_date);
    perform private.tables_expire(e.venue_id, e.service_date);
    select * into e from public.tables_waitlist_entries where id = t.waitlist_entry_id;
  end if;
  select * into v from public.tables_venues where id = e.venue_id;
  return jsonb_build_object('status', e.status, 'party', e.party_size, 'joinedAt', e.joined_at, 'offerExpiresAt', e.offer_expires_at,
    'position', case when e.status = 'waiting' then (select count(*) + 1 from public.tables_waitlist_entries x where x.venue_id = e.venue_id
      and x.service_date = e.service_date and x.status = 'waiting' and (x.priority > e.priority or (x.priority = e.priority and x.joined_at < e.joined_at))) end,
    'estimate', case when e.status = 'waiting' then private.tables_wait_estimate(e.venue_id, e.party_size) end,
    'venue', jsonb_build_object('name', v.name, 'slug', v.slug, 'timezone', v.timezone),
    'serverNow', clock_timestamp());
end;
$$;

create function public.tables_public_waitlist_leave(p_token text, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  e public.tables_waitlist_entries%rowtype;
begin
  perform private.tables_rate('manage', p_client, 60, 300, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'leave_waitlist');
  if t.id is null or t.waitlist_entry_id is null then raise exception 'tables:link_unavailable' using errcode = 'P0002'; end if;
  select * into e from public.tables_waitlist_entries where id = t.waitlist_entry_id;
  perform private.tables_lock_day(e.venue_id, e.service_date);
  select * into e from public.tables_waitlist_entries where id = t.waitlist_entry_id for update;
  if e.status in ('waiting','offered') then
    update public.tables_allocations set state = 'released', released_at = clock_timestamp() where waitlist_entry_id = e.id and state = 'held';
    update public.tables_waitlist_entries set status = 'cancelled', closed_at = clock_timestamp(), offer_expires_at = null,
      lock_version = lock_version + 1 where id = e.id returning * into e;
    perform private.tables_bump(e.organization_id, e.venue_id, e.service_date);
  end if;
  return jsonb_build_object('status', e.status);
end;
$$;

-- Shift projection now includes the waitlist with transparent ranking factors.
create function public.tables_waitlist(p_venue_id uuid, p_service_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  role text := private.tables_role(p_venue_id);
  duration integer;
  v public.tables_venues%rowtype;
begin
  if role is null then raise exception 'Tables access denied' using errcode = '42501'; end if;
  select * into v from public.tables_venues where id = p_venue_id;
  select coalesce((vv.snapshot->'services'->0->>'durationMinutes')::int, 90) into duration from public.tables_venue_versions vv where vv.id = v.current_version_id;
  return coalesce((select jsonb_agg(x order by (x->>'rank')::int) from (
    select jsonb_build_object('id', e.id, 'guestName', e.guest_name, 'guestPhone', case when private.tables_role_rank(role) >= 2 then e.guest_phone end,
      'party', e.party_size, 'status', e.status, 'source', e.source, 'priority', e.priority, 'priorityReason', e.priority_reason,
      'notes', e.notes, 'joinedAt', e.joined_at, 'offerExpiresAt', e.offer_expires_at, 'lockVersion', e.lock_version,
      'quotedMin', e.quoted_min, 'quotedMax', e.quoted_max,
      'heldTableIds', coalesce((select jsonb_agg(a.physical_table_id) from public.tables_allocations a where a.waitlist_entry_id = e.id and a.state = 'held'), '[]'),
      'suggestion', (select jsonb_build_object('tableIds', to_jsonb(c.table_ids), 'label', c.label, 'kind', c.kind)
        from private.tables_candidates(e.venue_id, tstzrange(date_trunc('minute', clock_timestamp()), date_trunc('minute', clock_timestamp()) + make_interval(mins => coalesce(duration, 90)), '[)'),
          e.party_size, e.zone_preference, false, null, 1, e.id) c),
      'rank', row_number() over (order by (e.status = 'offered') desc, e.priority desc, e.joined_at)) x
    from public.tables_waitlist_entries e
    where e.venue_id = p_venue_id and e.service_date = p_service_date and e.status in ('waiting','offered')
    order by e.joined_at limit 150) s), '[]');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.tables_waitlist_add(uuid,jsonb,uuid)','public.tables_waitlist_offer(uuid,uuid[],bigint)',
    'public.tables_waitlist_seat(uuid,uuid[],bigint)','public.tables_waitlist_close(uuid,text,bigint)',
    'public.tables_waitlist_priority(uuid,integer,text,bigint)','public.tables_waitlist(uuid,date)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.tables_public_waitlist_join(text,jsonb,uuid,uuid)','public.tables_public_waitlist_status(text,uuid)',
    'public.tables_public_waitlist_leave(text,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;

commit;
