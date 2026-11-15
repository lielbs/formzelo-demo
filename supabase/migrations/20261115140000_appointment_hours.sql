-- Appointments by opening hours (booking.schedule in a workflow version's config).
--
-- A workflow can now describe hours per weekday, a length per service and how many appointments
-- may run at once. A start time is free only while fewer than capacityPerSlot appointments overlap
-- it (with the buffer after each one). Mirrors src/engine/schedule.ts.
--
-- Additive only:
--  * submit_public_workflow is not touched. A schedule booking keeps booking.slots empty, so its
--    old exact-slot check is skipped; every other booking rule it applies (past, closed date,
--    notice, how far ahead, per-day cap, open weekdays) still runs there.
--  * The new rule is a BEFORE INSERT trigger on submissions, so it holds for every path that
--    creates a request. It takes a per-workflow advisory lock: two customers asking for the same
--    time at the same moment are checked one after the other and the second one is refused
--    ('booking_slot_full', field = the time field), never double-booked.
--  * The trigger records the appointment's length in answers.booking, so a later change of the
--    service lengths does not move appointments already taken.
--  * public_booking_times is a read-only helper for the customer form: times and counts only.
begin;

create function private.clock_minutes(p text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
    then split_part(p, ':', 1)::integer * 60 + split_part(p, ':', 2)::integer end
$$;
revoke all on function private.clock_minutes(text) from public, anon, authenticated, service_role;

-- Length of the requested appointment: the chosen service's length, or the default length.
create function private.booking_minutes(p_booking jsonb, p_values jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(5, least(720, coalesce(
    case when jsonb_typeof(p_values -> (p_booking #>> '{schedule,serviceKey}')) = 'string'
              and (p_booking #> '{schedule,durations}') ->> (p_values ->> (p_booking #>> '{schedule,serviceKey}')) ~ '^[0-9]{1,4}$'
         then ((p_booking #> '{schedule,durations}') ->> (p_values ->> (p_booking #>> '{schedule,serviceKey}')))::integer end,
    case when p_booking #>> '{schedule,duration}' ~ '^[0-9]{1,4}$' then (p_booking #>> '{schedule,duration}')::integer end,
    30)))
$$;
revoke all on function private.booking_minutes(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Start times (minutes after midnight) a weekday offers for an appointment of p_minutes.
create function private.booking_starts(p_schedule jsonb, p_dow integer, p_minutes integer)
returns setof integer
language sql
immutable
set search_path = ''
as $$
  select distinct s from (
    select pg_catalog.generate_series(private.clock_minutes(r ->> 'from'), private.clock_minutes(r ->> 'to') - p_minutes,
             greatest(5, coalesce(case when p_schedule ->> 'step' ~ '^[0-9]{1,3}$' then (p_schedule ->> 'step')::integer end, 30))) s
    from jsonb_array_elements(case when jsonb_typeof(p_schedule -> 'days' -> p_dow) = 'array' then p_schedule -> 'days' -> p_dow else '[]'::jsonb end) r
  ) x
  where s is not null
  order by s
$$;
revoke all on function private.booking_starts(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- Appointments holding a place on a date: start, end (with the buffer) and places taken.
create function private.booking_busy(p_workflow_id uuid, p_booking jsonb, p_date text)
returns table(b_start integer, b_end integer, b_units numeric)
language sql
stable
set search_path = ''
as $$
  select t.st,
         t.st + coalesce(case when s.answers #>> '{booking,minutes}' ~ '^[0-9]{1,4}$' then (s.answers #>> '{booking,minutes}')::integer end,
                         private.booking_minutes(p_booking, s.answers -> 'values'))
              + coalesce(case when p_booking #>> '{schedule,buffer}' ~ '^[0-9]{1,3}$' then (p_booking #>> '{schedule,buffer}')::integer end, 0),
         private.booking_units(p_booking, s.answers -> 'values')
  from public.submissions s
  cross join lateral (select private.clock_minutes(s.answers -> 'values' ->> (p_booking ->> 'timeKey')) st) t
  where s.workflow_id = p_workflow_id
    and private.holds_capacity(s.status)
    and s.answers -> 'values' ->> (p_booking ->> 'dateKey') = p_date
    and t.st is not null
$$;
revoke all on function private.booking_busy(uuid, jsonb, text) from public, anon, authenticated, service_role;

-- Most places in use at any moment of [p_from, p_to).
create function private.booking_peak(p_workflow_id uuid, p_booking jsonb, p_date text, p_from integer, p_to integer)
returns numeric
language sql
stable
set search_path = ''
as $$
  with busy as (select * from private.booking_busy(p_workflow_id, p_booking, p_date))
  select coalesce(max(u), 0) from (
    select (select coalesce(sum(b_units), 0) from busy where b_start <= p and b_end > p) u
    from (select p_from p union select b_start from busy where b_start > p_from and b_start < p_to) pts
  ) z
$$;
revoke all on function private.booking_peak(uuid, jsonb, text, integer, integer) from public, anon, authenticated, service_role;

-- The rule itself, for every new request of a workflow that books by opening hours.
create function private.guard_scheduled_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b jsonb;
  v jsonb;
  tk text;
  d date;
  st integer;
  minutes integer;
  buf integer;
  units numeric;
begin
  select wv.config -> 'booking' into b from public.workflow_versions wv where wv.id = new.workflow_version_id;
  if b is null or not coalesce((b ->> 'enabled')::boolean, false) or jsonb_typeof(b -> 'schedule') <> 'object' or b ->> 'timeKey' is null then
    return new;
  end if;
  if not private.holds_capacity(new.status) then return new; end if;
  v := new.answers -> 'values';
  tk := b ->> 'timeKey';
  if coalesce(v ->> (b ->> 'dateKey'), '') = '' or coalesce(v ->> tk, '') = '' then return new; end if;
  begin
    d := (v ->> (b ->> 'dateKey'))::date;
  exception when others then
    perform private.rule_error('booking_slot_unavailable', tk);
  end;
  st := private.clock_minutes(v ->> tk);
  minutes := private.booking_minutes(b, v);
  units := private.booking_units(b, v);
  buf := coalesce(case when b #>> '{schedule,buffer}' ~ '^[0-9]{1,3}$' then (b #>> '{schedule,buffer}')::integer end, 0);
  -- One new booking at a time per workflow, whichever path creates it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.workflow_id::text, 42));
  if st is null or not exists (
    select 1 from private.booking_starts(b -> 'schedule', extract(dow from d)::integer, minutes) s where s = st
  ) then
    perform private.rule_error('booking_slot_unavailable', tk);
  end if;
  if private.booking_peak(new.workflow_id, b, v ->> (b ->> 'dateKey'), st, st + minutes + buf) + units
     > coalesce((b ->> 'capacityPerSlot')::integer, 1) then
    perform private.rule_error('booking_slot_full', tk);
  end if;
  new.answers := new.answers || jsonb_build_object('booking',
    jsonb_build_object('date', v ->> (b ->> 'dateKey'), 'start', v ->> tk, 'minutes', minutes));
  return new;
end;
$$;
revoke all on function private.guard_scheduled_booking() from public, anon, authenticated, service_role;

create trigger scheduled_booking before insert on public.submissions
  for each row execute function private.guard_scheduled_booking();

-- Free times of a day for the customer form, for the chosen service and party size.
-- Times already past (or inside the notice) are left out; counts only, never answers.
create function public.public_booking_times(p_slug text, p_date text, p_values jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  b jsonb;
  d date;
  minutes integer;
  buf integer;
  units numeric;
  cap integer;
  earliest timestamp;
  day_full boolean;
begin
  if p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_values is null or jsonb_typeof(p_values) <> 'object'
     or octet_length(p_values::text) > 16384 then
    return '[]'::jsonb;
  end if;
  select * into t from private.public_target(p_slug);
  if not found then return '[]'::jsonb; end if;
  b := t.config -> 'booking';
  if not coalesce((b ->> 'enabled')::boolean, false) or jsonb_typeof(b -> 'schedule') <> 'object' or b ->> 'timeKey' is null then
    return '[]'::jsonb;
  end if;
  begin
    d := p_date::date;
  exception when others then
    return '[]'::jsonb;
  end;
  if d < private.local_today() or coalesce(b -> 'closedDates', '[]'::jsonb) ? p_date then return '[]'::jsonb; end if;
  minutes := private.booking_minutes(b, p_values);
  buf := coalesce(case when b #>> '{schedule,buffer}' ~ '^[0-9]{1,3}$' then (b #>> '{schedule,buffer}')::integer end, 0);
  units := private.booking_units(b, p_values);
  cap := coalesce((b ->> 'capacityPerSlot')::integer, 1);
  earliest := private.local_now() + make_interval(hours => coalesce((b ->> 'minNoticeHours')::integer, 0));
  day_full := b ->> 'maxPerDay' is not null
    and private.booking_used(t.workflow_id, b, p_date, null) + units > (b ->> 'maxPerDay')::numeric;
  return coalesce((
    with busy as (select * from private.booking_busy(t.workflow_id, b, p_date)),
    starts as (
      select s from private.booking_starts(b -> 'schedule', extract(dow from d)::integer, minutes) s
      where d + make_interval(mins => s) >= earliest
    ),
    load_at as (
      select s, (
        select coalesce(max(u), 0) from (
          select (select coalesce(sum(b_units), 0) from busy where b_start <= p and b_end > p) u
          from (select s p union select b_start from busy where b_start > s and b_start < s + minutes + buf) pts
        ) z
      ) used
      from starts
    )
    select jsonb_agg(jsonb_build_object(
      'time', lpad((s / 60)::text, 2, '0') || ':' || lpad((s % 60)::text, 2, '0'),
      'used', used, 'capacity', cap,
      'state', case when day_full or cap - used - units < 0 then 'full'
                    when cap > 1 and cap - used - units = 0 then 'limited' else 'available' end) order by s)
    from load_at
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.public_booking_times(text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.public_booking_times(text, text, jsonb) to anon, authenticated;

commit;
