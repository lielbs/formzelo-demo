-- Fix for 20261115140000_appointment_hours: a booking WITHOUT a schedule (the older fixed slots)
-- must be left alone by the appointment rule. jsonb_typeof(NULL) is NULL, so "<> 'object'" was NULL
-- and the early return was skipped; the trigger then refused every slot booking as unavailable.
-- Caught by rule_limits.test.sql in CI right after the release, before any slot form was used in
-- production (the only published form there has no booking). Same guard fixed in the times helper.
create or replace function private.guard_scheduled_booking()
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
  if b is null or not coalesce((b ->> 'enabled')::boolean, false) or coalesce(jsonb_typeof(b -> 'schedule'), '') <> 'object' or b ->> 'timeKey' is null then
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

create or replace function public.public_booking_times(p_slug text, p_date text, p_values jsonb)
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
  if not coalesce((b ->> 'enabled')::boolean, false) or coalesce(jsonb_typeof(b -> 'schedule'), '') <> 'object' or b ->> 'timeKey' is null then
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
