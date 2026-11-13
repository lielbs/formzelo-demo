-- Waitlist for future dates.
--  * A guest who finds the time they want taken can join the waitlist for that day and time
--    (today .. today + horizonDays), not only at the door today.
--  * Staff see the requested time; for a later day they book the party when a table frees up
--    (a normal reservation), and the entry is marked 'booked' and linked to it.
--  * Estimates and "seat now" stay for today only. Additive: one nullable column, one more status.
begin;

alter table public.tables_waitlist_entries add column if not exists desired_time time;
alter table public.tables_waitlist_entries drop constraint if exists tables_waitlist_entries_status_check;
alter table public.tables_waitlist_entries add constraint tables_waitlist_entries_status_check
  check (status in ('waiting','offered','seated','booked','declined','departed','no_response','cancelled','expired'));

-- ---------- Adding an entry: any day from today, an optional requested time ----------
create or replace function private.tables_add_entry(p_venue public.tables_venues, p_input jsonb, p_source text, p_idempotency uuid, p_client uuid)
returns public.tables_waitlist_entries language plpgsql set search_path = '' as $$
declare
  e public.tables_waitlist_entries%rowtype;
  phone text := private.tables_normalize_phone(p_input->>'phone');
  party integer := (p_input->>'party')::int;
  today date := (clock_timestamp() at time zone p_venue.timezone)::date;
  d date := coalesce((p_input->>'date')::date, today);
  wanted time;
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
  if d < today then raise exception 'tables:out_of_range' using errcode = '22023'; end if;
  if coalesce(p_input->>'time', '') <> '' then
    if (p_input->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'tables:invalid' using errcode = '22023'; end if;
    wanted := (p_input->>'time')::time;
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
  -- A wait estimate only makes sense for tonight's door list.
  if d = today then est := private.tables_wait_estimate(p_venue.id, party); end if;
  insert into public.tables_waitlist_entries(organization_id, venue_id, service_date, desired_time, guest_id, guest_name, guest_phone, party_size,
    zone_preference, notes, source, priority, priority_reason, quoted_min, quoted_max, idempotency_key, client_token, created_by)
  values (p_venue.organization_id, p_venue.id, d, wanted,
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

-- ---------- Public join: a day within the booking horizon and a requested time ----------
create or replace function private.tables_public_waitlist_join_core(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  v public.tables_venues%rowtype;
  e public.tables_waitlist_entries%rowtype;
  token text;
  today date;
  d date;
begin
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 1024 or p_idempotency_key is null then raise exception 'tables:invalid' using errcode = '22023'; end if;
  select * into target from private.tables_public_target(p_slug);
  if not found or target.status <> 'published' or not coalesce((target.snapshot->'policy'->'waitlist'->>'publicEnabled')::boolean, false) then
    raise exception 'tables:unavailable' using errcode = 'P0002';
  end if;
  if coalesce((p_input->>'consent')::boolean, false) is not true then raise exception 'tables:terms_required' using errcode = '22023'; end if;
  perform private.tables_rate('waitlist:' || target.venue_id, p_client, 4, 15, interval '30 minutes');
  if (p_input->>'party')::int > coalesce((target.snapshot->'policy'->>'maxParty')::int, 20) then raise exception 'tables:party_size' using errcode = '22023'; end if;
  today := (clock_timestamp() at time zone target.timezone)::date;
  if coalesce(p_input->>'date', '') !~ '^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'tables:invalid' using errcode = '22023'; end if;
  d := coalesce(nullif(p_input->>'date', '')::date, today);
  if d < today or d > today + coalesce((target.snapshot->'policy'->>'horizonDays')::int, 60) then raise exception 'tables:out_of_range' using errcode = '22023'; end if;
  select * into v from public.tables_venues where id = target.venue_id;
  e := private.tables_add_entry(v, (p_input - 'priority' - 'priorityReason') || jsonb_build_object('date', d), 'public', p_idempotency_key, p_client);
  if e.client_token is distinct from p_client then raise exception 'tables:idempotency_conflict' using errcode = '22023'; end if;
  -- The guest's status link lasts until the day after the requested day.
  token := private.tables_issue_token(e.organization_id, e.venue_id, null, e.id, array['read','leave_waitlist'],
    greatest(clock_timestamp() + interval '1 day', ((d + 2)::timestamp at time zone target.timezone)));
  return jsonb_build_object('token', token, 'status', e.status, 'date', e.service_date, 'time', to_char(e.desired_time, 'HH24:MI'));
end;
$$;
revoke all on function private.tables_public_waitlist_join_core(text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;

-- ---------- Staff list: requested time; table suggestion at that time ----------
create or replace function private.tables_waitlist_core(p_venue_id uuid, p_service_date date)
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
      'date', e.service_date, 'desiredTime', to_char(e.desired_time, 'HH24:MI'),
      'heldTableIds', coalesce((select jsonb_agg(a.physical_table_id) from public.tables_allocations a where a.waitlist_entry_id = e.id and a.state = 'held'), '[]'),
      'suggestion', (select jsonb_build_object('tableIds', to_jsonb(c.table_ids), 'label', c.label, 'kind', c.kind)
        from private.tables_candidates(e.venue_id,
          tstzrange(w.start_at, w.start_at + make_interval(mins => coalesce(duration, 90)), '[)'),
          e.party_size, e.zone_preference, false, null, 1, e.id) c),
      'rank', row_number() over (order by (e.status = 'offered') desc, e.priority desc, e.joined_at)) x
    from public.tables_waitlist_entries e
    -- Today's door list: a table free now. A requested time on a later day (or later today): free then.
    cross join lateral (select case
      when e.desired_time is not null and ((e.service_date + e.desired_time) at time zone v.timezone) > clock_timestamp()
        then date_trunc('minute', (e.service_date + e.desired_time) at time zone v.timezone)
      else date_trunc('minute', clock_timestamp()) end as start_at) w
    where e.venue_id = p_venue_id and e.service_date = p_service_date and e.status in ('waiting','offered')
    order by e.joined_at limit 150) s), '[]');
end;
$$;
revoke all on function private.tables_waitlist_core(uuid, date) from public, anon, authenticated, service_role;

-- ---------- Staff: the party was booked (a reservation made for them) ----------
create function public.tables_waitlist_book(p_entry_id uuid, p_reservation_id uuid, p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.tables_waitlist_entries%rowtype;
  r public.tables_reservations%rowtype;
begin
  e := private.tables_lock_entry(p_entry_id, p_expected_lock_version);
  if e.status <> 'waiting' then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
  select * into r from public.tables_reservations where id = p_reservation_id;
  if not found or r.venue_id <> e.venue_id or r.status not in ('pending_approval','confirmed') then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  update public.tables_waitlist_entries set status = 'booked', reservation_id = r.id, closed_at = clock_timestamp(), lock_version = lock_version + 1
   where id = e.id returning * into e;
  perform private.tables_bump(e.organization_id, e.venue_id, e.service_date);
  return jsonb_build_object('id', e.id, 'status', e.status, 'lockVersion', e.lock_version);
end;
$$;
revoke all on function public.tables_waitlist_book(uuid, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.tables_waitlist_book(uuid, uuid, bigint) to authenticated;

-- ---------- Guest status: the day, the requested time, and the booking when made ----------
create or replace function public.tables_public_waitlist_status(p_token text, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  e public.tables_waitlist_entries%rowtype;
  v public.tables_venues%rowtype;
  r public.tables_reservations%rowtype;
  today date;
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
  today := (clock_timestamp() at time zone v.timezone)::date;
  if e.reservation_id is not null then select * into r from public.tables_reservations where id = e.reservation_id; end if;
  return jsonb_build_object('status', e.status, 'party', e.party_size, 'joinedAt', e.joined_at, 'offerExpiresAt', e.offer_expires_at,
    'date', e.service_date, 'desiredTime', to_char(e.desired_time, 'HH24:MI'),
    'position', case when e.status = 'waiting' then (select count(*) + 1 from public.tables_waitlist_entries x where x.venue_id = e.venue_id
      and x.service_date = e.service_date and x.status = 'waiting' and (x.priority > e.priority or (x.priority = e.priority and x.joined_at < e.joined_at))) end,
    'estimate', case when e.status = 'waiting' and e.service_date = today then private.tables_wait_estimate(e.venue_id, e.party_size) end,
    'booking', case when e.status = 'booked' and r.id is not null then jsonb_build_object('time', r.local_time, 'date', r.service_date) end,
    'venue', jsonb_build_object('name', v.name, 'slug', v.slug, 'timezone', v.timezone),
    'serverNow', clock_timestamp());
end;
$$;

commit;
