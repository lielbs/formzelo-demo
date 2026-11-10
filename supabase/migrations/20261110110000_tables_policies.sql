-- Formangle Tables T3: approval queue, guest manage link, modify/cancel cutoffs.
--  * Cutoffs come from the policy version the guest booked under and the server clock.
--  * A modification that moves inventory releases the old allocation and inserts the new one in
--    one subtransaction: any conflict restores the original booking untouched.
--  * Wrong, revoked, expired or malformed links all return the same null result.
begin;

create function private.tables_resolve_token(p_token text, p_cap text)
returns private.tables_access_tokens
language plpgsql set search_path = '' as $$
declare t private.tables_access_tokens%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select * into t from private.tables_access_tokens x
   where x.token_hash = private.hash_token(p_token) and x.revoked_at is null and x.expires_at > clock_timestamp()
     and p_cap = any(x.capabilities);
  if not found then return null; end if;
  if not private.tables_org_enabled(t.organization_id) then return null; end if;
  if t.last_used_at is null or t.last_used_at < clock_timestamp() - interval '5 minutes' then
    update private.tables_access_tokens set last_used_at = clock_timestamp() where id = t.id;
  end if;
  return t;
end;
$$;
revoke all on function private.tables_resolve_token(text, text) from public, anon, authenticated;

-- What a guest may see about their own reservation.
create function private.tables_guest_projection(p_res public.tables_reservations)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v public.tables_venues%rowtype;
  snap jsonb;
  cur jsonb;
  cancel_until timestamptz;
  modify_until timestamptz;
  open_status boolean := p_res.status in ('pending_approval','confirmed');
begin
  select * into v from public.tables_venues where id = p_res.venue_id;
  select snapshot into snap from public.tables_venue_versions where id = p_res.version_id;
  select snapshot into cur from public.tables_venue_versions where id = v.current_version_id;
  cancel_until := p_res.starts_at - make_interval(mins => coalesce((snap->'policy'->>'cancelCutoffMinutes')::int, 0));
  modify_until := p_res.starts_at - make_interval(mins => coalesce((snap->'policy'->>'modifyCutoffMinutes')::int, 0));
  return jsonb_build_object(
    'reference', p_res.reference, 'status', p_res.status, 'lockVersion', p_res.lock_version,
    'serviceKey', p_res.service_key, 'date', p_res.service_date, 'time', p_res.local_time, 'party', p_res.party_size,
    'startsAt', p_res.starts_at, 'pendingExpiresAt', p_res.pending_expires_at, 'guestName', p_res.guest_name,
    'venue', jsonb_build_object('name', v.name, 'slug', v.slug, 'timezone', v.timezone,
      'address', cur->'basics'->>'address', 'phone', cur->'basics'->>'phone',
      'showWhatsapp', coalesce((cur->'guest'->>'showWhatsapp')::boolean, false)),
    'terms', snap->'guest'->>'terms',
    'cancelUntil', cancel_until, 'modifyUntil', modify_until,
    'canCancel', (p_res.status = 'pending_approval' and clock_timestamp() < p_res.starts_at)
      or (p_res.status = 'confirmed' and clock_timestamp() < cancel_until),
    'canModify', p_res.status = 'confirmed' and clock_timestamp() < modify_until
      and coalesce((snap->'policy'->>'allowGuestModify')::boolean, true) and v.status = 'published',
    'policy', jsonb_build_object('minParty', cur->'policy'->'minParty', 'maxParty', cur->'policy'->'maxParty',
      'horizonDays', cur->'policy'->'horizonDays'),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('key', s->>'key', 'name', s->>'name', 'weekdays', s->'weekdays')), '[]')
      from jsonb_array_elements(cur->'services') s),
    'serverNow', clock_timestamp(),
    'open', open_status);
end;
$$;
revoke all on function private.tables_guest_projection(public.tables_reservations) from public, anon, authenticated;

create function private.tables_release(p_reservation uuid)
returns void language sql set search_path = '' as $$
  update public.tables_allocations set state = 'released', released_at = clock_timestamp()
  where reservation_id = p_reservation and state in ('held','confirmed','seated')
$$;
revoke all on function private.tables_release(uuid) from public, anon, authenticated;

-- Locks both service days in a fixed order (deadlock-free between concurrent moves).
create function private.tables_lock_days(p_venue uuid, p_a date, p_b date)
returns void language plpgsql set search_path = '' as $$
begin
  perform private.tables_lock_day(p_venue, least(p_a, p_b));
  if p_a <> p_b then perform private.tables_lock_day(p_venue, greatest(p_a, p_b)); end if;
end;
$$;
revoke all on function private.tables_lock_days(uuid, date, date) from public, anon, authenticated;

-- Atomic reschedule used by guests and staff. Raises tables:<reason> when the new slot is not
-- possible; the original booking is untouched in that case.
create function private.tables_reschedule(
  p_reservation uuid, p_expected_lock bigint, p_service_key text, p_date date, p_time text, p_party integer,
  p_actor text, p_check_rules boolean, p_reason text default null)
returns public.tables_reservations
language plpgsql set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  old public.tables_reservations%rowtype;
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
  ev jsonb;
  svc jsonb;
  table_ids uuid[];
  alloc_state text;
begin
  select * into res from public.tables_reservations where id = p_reservation;
  if not found then raise exception 'tables:not_found' using errcode = 'P0002'; end if;
  perform private.tables_lock_days(res.venue_id, res.service_date, p_date);
  select * into res from public.tables_reservations where id = p_reservation for update;
  old := res;
  if res.lock_version <> p_expected_lock then
    raise exception 'tables:stale' using errcode = '40001', detail = jsonb_build_object('status', res.status, 'lockVersion', res.lock_version)::text;
  end if;
  if res.status not in ('pending_approval','confirmed','arrived') then raise exception 'tables:not_modifiable' using errcode = 'P0001'; end if;
  select * into v from public.tables_venues where id = res.venue_id;
  select * into vv from public.tables_venue_versions where id = v.current_version_id;
  perform private.tables_expire(res.venue_id, p_date);
  ev := private.tables_evaluate(res.venue_id, vv.snapshot, v.timezone, p_service_key, p_date, p_time, p_party,
    res.zone_preference, case when p_actor = 'guest' then 'online' else 'staff' end, res.id, p_check_rules);
  if not (ev->>'ok')::boolean then
    raise exception 'tables:%', ev->>'reason' using errcode = 'P0001';
  end if;
  if p_actor = 'guest' and (ev->'approval'->>'manual')::boolean then
    raise exception 'tables:requires_approval' using errcode = 'P0001';
  end if;
  svc := private.tables_service(vv.snapshot, p_service_key);
  select array_agg(x::uuid order by x::uuid) into table_ids from jsonb_array_elements_text(ev->'candidate'->'tableIds') x;
  alloc_state := case when res.status = 'pending_approval' then 'held' else 'confirmed' end;
  begin
    perform private.tables_release(res.id);
    update public.tables_reservations set service_key = p_service_key, service_date = p_date, local_time = p_time,
      starts_at = (ev->>'startsAt')::timestamptz, ends_at = (ev->>'endsAt')::timestamptz,
      buffer_minutes = coalesce((ev->>'bufferMinutes')::int, 0), party_size = p_party, version_id = vv.id,
      pending_expires_at = case when status = 'pending_approval' then least(pending_expires_at, (ev->>'startsAt')::timestamptz) end,
      lock_version = lock_version + 1
     where id = res.id returning * into res;
    if not (res.status = 'pending_approval' and coalesce(vv.snapshot->'policy'->>'pendingMode', 'unallocated') = 'unallocated') then
      perform private.tables_allocate(res, table_ids, alloc_state, case when alloc_state = 'held' then res.pending_expires_at end);
    end if;
  exception when exclusion_violation then
    raise exception 'tables:table_conflict' using errcode = 'P0001';
  end;
  perform private.tables_event(res, 'modified', old.status, res.status, p_actor, p_reason,
    jsonb_build_object('from', jsonb_build_object('date', old.service_date, 'time', old.local_time, 'party', old.party_size),
      'to', jsonb_build_object('date', res.service_date, 'time', res.local_time, 'party', res.party_size)));
  perform private.tables_bump(res.organization_id, res.venue_id, old.service_date);
  if old.service_date <> res.service_date then perform private.tables_bump(res.organization_id, res.venue_id, res.service_date); end if;
  return res;
end;
$$;
revoke all on function private.tables_reschedule(uuid, bigint, text, date, text, integer, text, boolean, text) from public, anon, authenticated;

-- ---------- Guest manage link ----------
create function public.tables_public_manage(p_token text, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  res public.tables_reservations%rowtype;
begin
  perform private.tables_rate('manage', p_client, 60, 300, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'read');
  if t.id is null or t.reservation_id is null then return null; end if;
  select * into res from public.tables_reservations where id = t.reservation_id;
  if res.status = 'pending_approval' and res.pending_expires_at <= clock_timestamp() then
    perform private.tables_lock_day(res.venue_id, res.service_date);
    perform private.tables_expire(res.venue_id, res.service_date);
    select * into res from public.tables_reservations where id = t.reservation_id;
  end if;
  return private.tables_guest_projection(res);
end;
$$;

create function public.tables_public_cancel(p_token text, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  res public.tables_reservations%rowtype;
  proj jsonb;
begin
  perform private.tables_rate('manage', p_client, 60, 300, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'cancel');
  if t.id is null or t.reservation_id is null then raise exception 'tables:link_unavailable' using errcode = 'P0002'; end if;
  select * into res from public.tables_reservations where id = t.reservation_id;
  perform private.tables_lock_day(res.venue_id, res.service_date);
  select * into res from public.tables_reservations where id = t.reservation_id for update;
  if res.status = 'cancelled' then return private.tables_guest_projection(res); end if;
  proj := private.tables_guest_projection(res);
  if not (proj->>'canCancel')::boolean then raise exception 'tables:cutoff_passed' using errcode = 'P0001'; end if;
  perform private.tables_release(res.id);
  update public.tables_reservations set status = 'cancelled', cancelled_at = clock_timestamp(), lock_version = lock_version + 1
   where id = res.id returning * into res;
  perform private.tables_event(res, 'cancelled', proj->>'status', 'cancelled', 'guest');
  perform private.tables_bump(res.organization_id, res.venue_id, res.service_date);
  return private.tables_guest_projection(res);
end;
$$;

create function public.tables_public_modify(p_token text, p_input jsonb, p_expected_lock_version bigint, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  res public.tables_reservations%rowtype;
  proj jsonb;
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
begin
  perform private.tables_rate('modify', p_client, 20, 60, interval '15 minutes');
  t := private.tables_resolve_token(p_token, 'modify');
  if t.id is null or t.reservation_id is null then raise exception 'tables:link_unavailable' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 1024 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  select * into res from public.tables_reservations where id = t.reservation_id;
  proj := private.tables_guest_projection(res);
  if not (proj->>'canModify')::boolean then raise exception 'tables:cutoff_passed' using errcode = 'P0001'; end if;
  if (p_input->>'party')::int < coalesce((proj->'policy'->>'minParty')::int, 1) or (p_input->>'party')::int > coalesce((proj->'policy'->>'maxParty')::int, 20) then
    raise exception 'tables:party_size' using errcode = '22023';
  end if;
  begin
    res := private.tables_reschedule(res.id, p_expected_lock_version, p_input->>'serviceKey', (p_input->>'date')::date,
      p_input->>'time', (p_input->>'party')::int, 'guest', true);
  exception when sqlstate 'P0001' then
    if sqlerrm in ('tables:no_table','tables:pacing_full','tables:table_conflict') then
      select * into v from public.tables_venues where id = res.venue_id;
      select * into vv from public.tables_venue_versions where id = v.current_version_id;
      return jsonb_build_object('result', 'unavailable', 'reason', 'no_table',
        'alternatives', private.tables_alternatives(res.venue_id, vv.snapshot, v.timezone, (p_input->>'date')::date, p_input->>'time', (p_input->>'party')::int, res.zone_preference),
        'reservation', proj);
    end if;
    raise;
  end;
  return jsonb_build_object('result', 'modified', 'reservation', private.tables_guest_projection(res));
end;
$$;

-- Guest-side availability for a modification excludes the guest's own current tables.
create function public.tables_public_modify_options(p_token text, p_date date, p_party integer, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t private.tables_access_tokens%rowtype;
  res public.tables_reservations%rowtype;
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
  svc jsonb;
  tm text;
  ev jsonb;
  services jsonb := '[]';
  slots jsonb;
begin
  perform private.tables_rate('availability:modify', p_client, 90, 300, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'modify');
  if t.id is null or t.reservation_id is null then return null; end if;
  select * into res from public.tables_reservations where id = t.reservation_id;
  select * into v from public.tables_venues where id = res.venue_id;
  select * into vv from public.tables_venue_versions where id = v.current_version_id;
  if p_date is null or p_date < (clock_timestamp() at time zone v.timezone)::date
     or p_date > (clock_timestamp() at time zone v.timezone)::date + coalesce((vv.snapshot->'policy'->>'horizonDays')::int, 60) then
    return jsonb_build_object('date', p_date, 'state', 'out_of_range', 'services', '[]'::jsonb);
  end if;
  for svc in select value from jsonb_array_elements(vv.snapshot->'services') value order by value->>'start' loop
    if not (svc->'weekdays' @> to_jsonb(extract(dow from p_date)::int)) then continue; end if;
    slots := '[]';
    for tm in select s from private.tables_slot_times(svc, (vv.snapshot->'policy'->>'slotMinutes')::int) s loop
      ev := private.tables_evaluate(v.id, vv.snapshot, v.timezone, svc->>'key', p_date, tm, p_party, res.zone_preference, 'online', res.id);
      if (ev->>'ok')::boolean and not (ev->'approval'->>'manual')::boolean then
        slots := slots || jsonb_build_array(jsonb_build_object('time', tm, 'approval', 'instant'));
      end if;
    end loop;
    services := services || jsonb_build_array(jsonb_build_object('key', svc->>'key', 'name', svc->>'name', 'slots', slots));
  end loop;
  return jsonb_build_object('date', p_date, 'state', 'open', 'services', services);
end;
$$;

-- ---------- Approval queue ----------
create function public.tables_decide_pending(p_reservation_id uuid, p_decision text, p_expected_lock_version bigint, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  v public.tables_venues%rowtype;
  vv public.tables_venue_versions%rowtype;
  cand record;
  held integer;
begin
  select * into res from public.tables_reservations where id = p_reservation_id;
  if not found or not private.tables_can(res.venue_id, 'host') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  if p_decision not in ('approve','reject') then raise exception 'tables:invalid' using errcode = '22023'; end if;
  perform private.tables_lock_day(res.venue_id, res.service_date);
  perform private.tables_expire(res.venue_id, res.service_date);
  select * into res from public.tables_reservations where id = p_reservation_id for update;
  if (p_decision = 'approve' and res.status = 'confirmed') or (p_decision = 'reject' and res.status = 'rejected') then
    return jsonb_build_object('status', res.status, 'lockVersion', res.lock_version, 'replayed', true);
  end if;
  if res.lock_version <> p_expected_lock_version then
    raise exception 'tables:stale' using errcode = '40001', detail = jsonb_build_object('status', res.status, 'lockVersion', res.lock_version)::text;
  end if;
  if res.status <> 'pending_approval' then raise exception 'tables:not_pending' using errcode = 'P0001'; end if;
  if p_decision = 'reject' then
    perform private.tables_release(res.id);
    update public.tables_reservations set status = 'rejected', pending_expires_at = pending_expires_at, lock_version = lock_version + 1
     where id = res.id returning * into res;
    perform private.tables_event(res, 'rejected', 'pending_approval', 'rejected', 'staff', p_reason);
  else
    update public.tables_allocations set state = 'confirmed', expires_at = null where reservation_id = res.id and state = 'held';
    get diagnostics held = row_count;
    if held = 0 then
      select * into v from public.tables_venues where id = res.venue_id;
      select * into cand from private.tables_candidates(res.venue_id,
        tstzrange(res.starts_at, res.ends_at + make_interval(mins => res.buffer_minutes), '[)'), res.party_size, res.zone_preference, false, res.id, 1);
      if not found then raise exception 'tables:no_table' using errcode = 'P0001'; end if;
      begin
        perform private.tables_allocate(res, cand.table_ids, 'confirmed', null);
      exception when exclusion_violation then
        raise exception 'tables:table_conflict' using errcode = 'P0001';
      end;
    end if;
    update public.tables_reservations set status = 'confirmed', pending_expires_at = null, lock_version = lock_version + 1
     where id = res.id returning * into res;
    perform private.tables_event(res, 'approved', 'pending_approval', 'confirmed', 'staff', p_reason);
  end if;
  perform private.tables_bump(res.organization_id, res.venue_id, res.service_date);
  return jsonb_build_object('status', res.status, 'lockVersion', res.lock_version, 'replayed', false);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.tables_public_manage(text,uuid)','public.tables_public_cancel(text,uuid)',
    'public.tables_public_modify(text,jsonb,bigint,uuid)','public.tables_public_modify_options(text,date,integer,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  execute 'revoke all on function public.tables_decide_pending(uuid,text,bigint,text) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.tables_decide_pending(uuid,text,bigint,text) to authenticated';
end;
$$;

commit;
