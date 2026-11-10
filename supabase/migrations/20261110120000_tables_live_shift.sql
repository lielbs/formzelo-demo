-- Formangle Tables T4: live shift projection, host transitions, moves, table states, notes.
--  * Every transition requires the reservation's lock_version; a stale host gets 40001 with the
--    current status so the UI can show "changed by another team member".
--  * Seat/move never report success before the allocation is written; a move releases the old
--    tables and claims the new ones in one subtransaction.
--  * Hosts see only operational guest fields; manager notes, email and history need manager+.
begin;

create table public.tables_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  reservation_id uuid,
  guest_id uuid,
  visibility text not null check (visibility in ('host','manager')),
  body text not null check (length(btrim(body)) between 1 and 500),
  author_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (reservation_id is not null or guest_id is not null),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  foreign key (organization_id, venue_id, reservation_id) references public.tables_reservations(organization_id, venue_id, id) on delete restrict,
  foreign key (organization_id, guest_id) references public.tables_guests(organization_id, id) on delete restrict
);
create index tables_notes_reservation on public.tables_notes(reservation_id, created_at);
create index tables_notes_guest on public.tables_notes(organization_id, guest_id, created_at);
alter table public.tables_notes enable row level security;
revoke all on public.tables_notes from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.tables_notes to service_role;
create trigger immutable_record before update or delete on public.tables_notes for each row execute function private.reject_mutation();
create trigger audit_change after insert on public.tables_notes for each row execute function private.record_change();

-- Locks the day and the reservation, checks role and expected version.
create function private.tables_lock_reservation(p_reservation uuid, p_min_role text, p_expected bigint)
returns public.tables_reservations
language plpgsql set search_path = '' as $$
declare res public.tables_reservations%rowtype;
begin
  select * into res from public.tables_reservations where id = p_reservation;
  if not found or not private.tables_can(res.venue_id, p_min_role) then raise exception 'Tables access denied' using errcode = '42501'; end if;
  perform private.tables_lock_day(res.venue_id, res.service_date);
  perform private.tables_expire(res.venue_id, res.service_date);
  select * into res from public.tables_reservations where id = p_reservation for update;
  if p_expected is not null and res.lock_version <> p_expected then
    raise exception 'tables:stale' using errcode = '40001', detail = jsonb_build_object('status', res.status, 'lockVersion', res.lock_version)::text;
  end if;
  return res;
end;
$$;
revoke all on function private.tables_lock_reservation(uuid, text, bigint) from public, anon, authenticated;

create function public.tables_transition(p_reservation_id uuid, p_action text, p_expected_lock_version bigint, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  before_status text;
  next_status text;
  n integer;
  last_group uuid;
begin
  res := private.tables_lock_reservation(p_reservation_id, 'host', p_expected_lock_version);
  before_status := res.status;
  if length(coalesce(p_reason, '')) > 300 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  case p_action
    when 'arrive' then
      if res.status <> 'confirmed' then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
      next_status := 'arrived';
      update public.tables_reservations set status = next_status, arrived_at = clock_timestamp(), lock_version = lock_version + 1 where id = res.id returning * into res;
    when 'seat' then
      if res.status not in ('confirmed','arrived') then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
      if res.starts_at > clock_timestamp() + interval '3 hours' then raise exception 'tables:too_early' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.tables_allocations where reservation_id = res.id and state = 'confirmed') then
        raise exception 'tables:needs_table' using errcode = 'P0001';
      end if;
      begin
        update public.tables_allocations set state = 'seated',
          occupied_during = case when lower(occupied_during) > clock_timestamp()
            then tstzrange(date_trunc('minute', clock_timestamp()), upper(occupied_during), '[)') else occupied_during end
         where reservation_id = res.id and state = 'confirmed';
      exception when exclusion_violation then
        raise exception 'tables:table_occupied' using errcode = 'P0001';
      end;
      next_status := 'seated';
      update public.tables_reservations set status = next_status, arrived_at = coalesce(arrived_at, clock_timestamp()),
        seated_at = clock_timestamp(), lock_version = lock_version + 1 where id = res.id returning * into res;
    when 'complete' then
      if res.status <> 'seated' then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
      perform private.tables_release(res.id);
      next_status := 'completed';
      update public.tables_reservations set status = next_status, completed_at = clock_timestamp(), lock_version = lock_version + 1 where id = res.id returning * into res;
    when 'no_show' then
      if res.status not in ('confirmed') then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
      if clock_timestamp() < res.starts_at then raise exception 'tables:too_early' using errcode = 'P0001'; end if;
      perform private.tables_release(res.id);
      next_status := 'no_show';
      update public.tables_reservations set status = next_status, lock_version = lock_version + 1 where id = res.id returning * into res;
    when 'cancel' then
      if res.status not in ('pending_approval','confirmed','arrived') then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
      perform private.tables_release(res.id);
      next_status := 'cancelled';
      update public.tables_reservations set status = next_status, cancelled_at = clock_timestamp(), lock_version = lock_version + 1 where id = res.id returning * into res;
    when 'undo' then
      -- Reverses the last host step. Re-activating a released table can conflict: then nothing changes.
      if res.status = 'arrived' then
        next_status := 'confirmed';
      elsif res.status = 'seated' then
        update public.tables_allocations set state = 'confirmed' where reservation_id = res.id and state = 'seated';
        next_status := 'arrived';
      elsif res.status in ('no_show','completed','cancelled') then
        if res.status = 'cancelled' and res.ends_at < clock_timestamp() then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
        select group_id into last_group from public.tables_allocations where reservation_id = res.id and state = 'released'
         order by released_at desc limit 1;
        if last_group is not null then
          begin
            update public.tables_allocations set state = case when res.status = 'completed' then 'seated' else 'confirmed' end, released_at = null
             where group_id = last_group;
          exception when exclusion_violation then
            raise exception 'tables:table_conflict' using errcode = 'P0001';
          end;
        end if;
        next_status := case res.status when 'completed' then 'seated' when 'no_show' then 'confirmed'
          else case when res.arrived_at is not null then 'arrived' else 'confirmed' end end;
      else
        raise exception 'tables:invalid_transition' using errcode = 'P0001';
      end if;
      update public.tables_reservations set status = next_status,
        arrived_at = case when next_status = 'confirmed' then null else arrived_at end,
        seated_at = case when next_status in ('confirmed','arrived') then null else seated_at end,
        completed_at = null, cancelled_at = null, lock_version = lock_version + 1
       where id = res.id returning * into res;
    else
      raise exception 'tables:invalid' using errcode = '22023';
  end case;
  get diagnostics n = row_count;
  perform private.tables_event(res, p_action, before_status, next_status, 'staff', p_reason);
  perform private.tables_bump(res.organization_id, res.venue_id, res.service_date);
  return jsonb_build_object('id', res.id, 'status', res.status, 'lockVersion', res.lock_version);
end;
$$;

-- Assign or move a reservation to explicit tables. Old tables stay claimed until the new ones succeed.
create function public.tables_move(p_reservation_id uuid, p_table_ids uuid[], p_expected_lock_version bigint, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  ids uuid[];
  new_state text;
  gid uuid := gen_random_uuid();
  capacity integer;
  old_labels text;
begin
  res := private.tables_lock_reservation(p_reservation_id, 'host', p_expected_lock_version);
  if res.status not in ('pending_approval','confirmed','arrived','seated') then raise exception 'tables:invalid_transition' using errcode = 'P0001'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_table_ids) x;
  if ids is null or cardinality(ids) not between 1 and 8 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  if (select count(*) from public.tables_physical_tables t where t.venue_id = res.venue_id and t.active and t.id = any(ids)) <> cardinality(ids) then
    raise exception 'tables:table_unknown' using errcode = '22023';
  end if;
  select sum(max_covers) into capacity from public.tables_physical_tables where id = any(ids);
  if capacity < res.party_size and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'tables:table_too_small' using errcode = 'P0001';
  end if;
  select string_agg(t.label, '+' order by t.label) into old_labels from public.tables_allocations a
    join public.tables_physical_tables t on t.id = a.physical_table_id where a.reservation_id = res.id and a.state in ('held','confirmed','seated');
  new_state := case res.status when 'seated' then 'seated' when 'pending_approval' then 'held' else 'confirmed' end;
  if new_state = 'held' and res.pending_expires_at is null then new_state := 'confirmed'; end if;
  if exists (select 1 from unnest(ids) x where not private.tables_table_free(x,
      tstzrange(case when new_state = 'seated' then date_trunc('minute', clock_timestamp()) else res.starts_at end,
        res.ends_at + make_interval(mins => res.buffer_minutes), '[)'), res.id)) then
    raise exception 'tables:table_conflict' using errcode = 'P0001';
  end if;
  begin
    perform private.tables_release(res.id);
    insert into public.tables_allocations(organization_id, venue_id, physical_table_id, group_id, reservation_id, occupied_during, state, expires_at)
    select res.organization_id, res.venue_id, x, gid, res.id,
      tstzrange(case when new_state = 'seated' then date_trunc('minute', clock_timestamp()) else res.starts_at end,
        greatest(res.ends_at + make_interval(mins => res.buffer_minutes), date_trunc('minute', clock_timestamp()) + interval '15 minutes'), '[)'),
      new_state, case when new_state = 'held' then res.pending_expires_at end
    from unnest(ids) x;
  exception when exclusion_violation then
    raise exception 'tables:table_conflict' using errcode = 'P0001';
  end;
  update public.tables_reservations set lock_version = lock_version + 1 where id = res.id returning * into res;
  perform private.tables_event(res, 'moved', res.status, res.status, 'staff', p_reason,
    jsonb_build_object('from', old_labels, 'to', (select string_agg(label, '+' order by label) from public.tables_physical_tables where id = any(ids))));
  perform private.tables_bump(res.organization_id, res.venue_id, res.service_date);
  return jsonb_build_object('id', res.id, 'status', res.status, 'lockVersion', res.lock_version);
end;
$$;

-- Staff edit: contact/requests always; date/time/party through the atomic reschedule.
create function public.tables_staff_update_reservation(p_reservation_id uuid, p_input jsonb, p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  phone text;
  override boolean := length(btrim(coalesce(p_input->>'overrideReason', ''))) > 0;
begin
  select * into res from public.tables_reservations where id = p_reservation_id;
  if not found or not private.tables_can(res.venue_id, 'host') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 4096 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  if override and not private.tables_can(res.venue_id, 'manager') then raise exception 'tables:override_requires_manager' using errcode = '42501'; end if;
  if p_input ? 'date' or p_input ? 'time' or p_input ? 'party' then
    res := private.tables_reschedule(res.id, p_expected_lock_version, coalesce(p_input->>'serviceKey', res.service_key),
      coalesce((p_input->>'date')::date, res.service_date), coalesce(p_input->>'time', res.local_time),
      coalesce((p_input->>'party')::int, res.party_size), 'staff', not override, p_input->>'overrideReason');
    p_expected_lock_version := res.lock_version;
  end if;
  if p_input ? 'name' or p_input ? 'phone' or p_input ? 'requests' then
    res := private.tables_lock_reservation(p_reservation_id, 'host', p_expected_lock_version);
    phone := private.tables_normalize_phone(p_input->>'phone');
    if coalesce(p_input->>'phone', '') <> '' and phone is null then raise exception 'tables:phone_invalid' using errcode = '22023'; end if;
    if p_input ? 'name' and length(btrim(coalesce(p_input->>'name', ''))) not between 1 and 120 then raise exception 'tables:name_required' using errcode = '22023'; end if;
    update public.tables_reservations set
      guest_name = case when p_input ? 'name' then btrim(p_input->>'name') else guest_name end,
      guest_phone = case when p_input ? 'phone' then phone else guest_phone end,
      requests = case when p_input ? 'requests' then left(nullif(btrim(coalesce(p_input->>'requests', '')), ''), 500) else requests end,
      lock_version = lock_version + 1
     where id = res.id returning * into res;
    perform private.tables_event(res, 'details_updated', res.status, res.status, 'staff');
    perform private.tables_bump(res.organization_id, res.venue_id, res.service_date);
  end if;
  return jsonb_build_object('id', res.id, 'status', res.status, 'lockVersion', res.lock_version);
end;
$$;

create function public.tables_set_table_state(p_venue_id uuid, p_table_id uuid, p_state text, p_reason text, p_service_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.tables_venues%rowtype;
begin
  v := private.tables_require(p_venue_id, 'host');
  if p_state not in ('ready','cleaning','unavailable') or length(coalesce(p_reason, '')) > 200 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  if not exists (select 1 from public.tables_physical_tables t where t.id = p_table_id and t.venue_id = p_venue_id and t.active) then
    raise exception 'tables:table_unknown' using errcode = '22023';
  end if;
  perform private.tables_lock_day(p_venue_id, p_service_date);
  if p_state = 'ready' then
    delete from public.tables_table_states where physical_table_id = p_table_id;
  else
    insert into public.tables_table_states(organization_id, venue_id, physical_table_id, state, reason, updated_by, updated_at)
    values (v.organization_id, p_venue_id, p_table_id, p_state, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid(), now())
    on conflict (physical_table_id) do update set state = excluded.state, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  end if;
  return jsonb_build_object('revision', private.tables_bump(v.organization_id, p_venue_id, p_service_date));
end;
$$;

create function public.tables_add_note(p_reservation_id uuid, p_body text, p_visibility text default 'host')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  n public.tables_notes%rowtype;
begin
  select * into res from public.tables_reservations where id = p_reservation_id;
  if not found or not private.tables_can(res.venue_id, case when p_visibility = 'manager' then 'manager' else 'host' end) then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  if p_visibility not in ('host','manager') or length(btrim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  insert into public.tables_notes(organization_id, venue_id, reservation_id, guest_id, visibility, body, author_user_id)
  values (res.organization_id, res.venue_id, res.id, res.guest_id, p_visibility, btrim(p_body), auth.uid()) returning * into n;
  perform private.tables_bump(res.organization_id, res.venue_id, res.service_date);
  return jsonb_build_object('id', n.id, 'createdAt', n.created_at);
end;
$$;

-- The shift: everything a host device needs for one venue/service date in one bounded call.
create function public.tables_shift(p_venue_id uuid, p_service_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.tables_venues%rowtype;
  role text := private.tables_role(p_venue_id);
  snap jsonb;
  can_phone boolean;
begin
  if role is null then raise exception 'Tables access denied' using errcode = '42501'; end if;
  select * into v from public.tables_venues where id = p_venue_id;
  select snapshot into snap from public.tables_venue_versions where id = v.current_version_id;
  can_phone := private.tables_role_rank(role) >= 2;
  if snap is not null then
    perform private.tables_lock_day(p_venue_id, p_service_date);
    perform private.tables_expire(p_venue_id, p_service_date);
  end if;
  return jsonb_build_object(
    'venue', jsonb_build_object('id', v.id, 'name', v.name, 'slug', v.slug, 'timezone', v.timezone, 'status', v.status),
    'role', role, 'serviceDate', p_service_date, 'serverNow', clock_timestamp(),
    'revision', coalesce((select revision from public.tables_shift_revisions r where r.venue_id = p_venue_id and r.service_date = p_service_date), 0),
    'published', snap is not null,
    'services', coalesce((select jsonb_agg(jsonb_build_object('key', s->>'key', 'name', s->>'name', 'start', s->>'start',
      'lastSeating', s->>'lastSeating', 'durationMinutes', s->'durationMinutes', 'weekdays', s->'weekdays')) from jsonb_array_elements(snap->'services') s), '[]'),
    'closed', coalesce((select jsonb_agg(jsonb_build_object('serviceKey', e.service_key, 'kind', e.kind, 'note', e.note))
      from public.tables_service_exceptions e where e.venue_id = p_venue_id and e.service_date = p_service_date), '[]'),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z->>'id', 'name', z->>'name') order by coalesce((z->>'sort')::int, 0))
      from jsonb_array_elements(snap->'zones') z), '[]'),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'zoneId', t.zone_id, 'shape', t.shape,
        'minCovers', t.min_covers, 'maxCovers', t.max_covers, 'accessible', t.accessible,
        'x', g->'x', 'y', g->'y', 'w', g->'w', 'h', g->'h', 'rotation', coalesce(g->'rotation', '0'),
        'opState', s.state, 'opReason', s.reason, 'opUpdatedAt', s.updated_at) order by t.label)
      from public.tables_physical_tables t
      left join lateral (select value g from jsonb_array_elements(snap->'tables') value where value->>'id' = t.id::text) gg on true
      left join public.tables_table_states s on s.physical_table_id = t.id
      where t.venue_id = p_venue_id and t.active), '[]'),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reference', r.reference, 'serviceKey', r.service_key, 'time', r.local_time, 'startsAt', r.starts_at, 'endsAt', r.ends_at,
        'party', r.party_size, 'status', r.status, 'source', r.source, 'approval', r.approval, 'approvalRule', r.approval_rule,
        'guestName', r.guest_name, 'guestPhone', case when can_phone then r.guest_phone end,
        'requests', r.requests, 'lockVersion', r.lock_version, 'pendingExpiresAt', r.pending_expires_at,
        'arrivedAt', r.arrived_at, 'seatedAt', r.seated_at, 'completedAt', r.completed_at, 'overrideReason', r.override_reason,
        'tableIds', coalesce((select jsonb_agg(a.physical_table_id order by a.physical_table_id) from public.tables_allocations a
          where a.reservation_id = r.id and a.state in ('held','confirmed','seated')), '[]'),
        'notesCount', (select count(*) from public.tables_notes n where n.reservation_id = r.id
          and (n.visibility = 'host' or private.tables_role_rank(role) >= 3)),
        'visits', (select count(*) from public.tables_reservations h where h.organization_id = r.organization_id and h.guest_id = r.guest_id and h.status = 'completed' and h.id <> r.id),
        'noShows', (select count(*) from public.tables_reservations h where h.organization_id = r.organization_id and h.guest_id = r.guest_id and h.status = 'no_show' and h.id <> r.id)
      ) order by r.starts_at, r.reference)
      from (select * from public.tables_reservations x where x.venue_id = p_venue_id and x.service_date = p_service_date
            order by x.starts_at limit 400) r), '[]'),
    'waitlist', '[]'::jsonb);
end;
$$;

create function public.tables_reservation_detail(p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  res public.tables_reservations%rowtype;
  role text;
  is_manager boolean;
begin
  select * into res from public.tables_reservations where id = p_reservation_id;
  if not found then raise exception 'Tables access denied' using errcode = '42501'; end if;
  role := private.tables_role(res.venue_id);
  if role is null then raise exception 'Tables access denied' using errcode = '42501'; end if;
  is_manager := private.tables_role_rank(role) >= 3;
  return jsonb_build_object(
    'id', res.id, 'reference', res.reference, 'status', res.status, 'lockVersion', res.lock_version,
    'guestName', res.guest_name, 'guestPhone', case when private.tables_role_rank(role) >= 2 then res.guest_phone end,
    'guestEmail', case when is_manager then res.guest_email end,
    'requests', res.requests, 'source', res.source, 'party', res.party_size, 'time', res.local_time, 'date', res.service_date,
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.event_type, 'from', e.from_status, 'to', e.to_status,
      'actor', e.actor_type, 'reason', e.reason, 'at', e.created_at, 'metadata', e.metadata) order by e.seq)
      from public.tables_reservation_events e where e.reservation_id = res.id), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'visibility', n.visibility, 'at', n.created_at,
      'mine', n.author_user_id = auth.uid()) order by n.created_at desc)
      from public.tables_notes n where (n.reservation_id = res.id or (n.guest_id = res.guest_id and n.organization_id = res.organization_id))
        and (n.visibility = 'host' or is_manager)), '[]'),
    'history', case when is_manager then coalesce((select jsonb_agg(jsonb_build_object('date', h.service_date, 'time', h.local_time,
        'party', h.party_size, 'status', h.status) order by h.starts_at desc)
      from (select * from public.tables_reservations h where h.organization_id = res.organization_id and h.guest_id = res.guest_id and h.id <> res.id
        order by h.starts_at desc limit 10) h), '[]') else null end,
    'visits', (select count(*) from public.tables_reservations h where h.organization_id = res.organization_id and h.guest_id = res.guest_id and h.status = 'completed' and h.id <> res.id),
    'noShows', (select count(*) from public.tables_reservations h where h.organization_id = res.organization_id and h.guest_id = res.guest_id and h.status = 'no_show' and h.id <> res.id));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.tables_transition(uuid,text,bigint,text)','public.tables_move(uuid,uuid[],bigint,text)',
    'public.tables_staff_update_reservation(uuid,jsonb,bigint)','public.tables_set_table_state(uuid,uuid,text,text,date)',
    'public.tables_add_note(uuid,text,text)','public.tables_shift(uuid,date)','public.tables_reservation_detail(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
