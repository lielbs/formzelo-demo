-- Formangle Tables T7: operational analytics. Aggregates only (no guest data), grain = venue
-- service date in the venue's timezone. No revenue: Formangle has no POS/payment source.
--
-- Definitions (also shown in the UI):
--  reservations      reservations on the service date, excluding rejected and expired requests
--  covers_booked     sum of party sizes of those reservations
--  covers_served     party sizes of reservations that were seated (seated or completed)
--  cancellation_rate cancelled / reservations
--  no_show_rate      no_show / (completed + no_show)
--  waitlist_conversion seated entries / closed entries (closed = any final state)
--  avg_seated_minutes  mean of completed_at - seated_at over completed visits (sample size shown)
--  seat_utilization  seated seat-minutes / available seat-minutes, where available = sum of active
--                    table capacity x minutes the service is open (first slot to last seating + duration)
begin;

create function public.tables_analytics(p_venue_id uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  role text := private.tables_role(p_venue_id);
  v public.tables_venues%rowtype;
  snap jsonb;
  seats integer;
begin
  if role is null or role = 'host' then raise exception 'Tables access denied' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  select * into v from public.tables_venues where id = p_venue_id;
  select snapshot into snap from public.tables_venue_versions where id = v.current_version_id;
  select coalesce(sum(max_covers), 0) into seats from public.tables_physical_tables where venue_id = p_venue_id and active;
  return jsonb_build_object(
    'timezone', v.timezone, 'from', p_from, 'to', p_to,
    'days', coalesce((select jsonb_agg(d order by d->>'date') from (
      select jsonb_build_object(
        'date', day::date,
        'reservations', count(r.id) filter (where r.status not in ('rejected','expired')),
        'coversBooked', coalesce(sum(r.party_size) filter (where r.status not in ('rejected','expired')), 0),
        'coversServed', coalesce(sum(r.party_size) filter (where r.seated_at is not null and r.status in ('seated','completed')), 0),
        'cancelled', count(r.id) filter (where r.status = 'cancelled'),
        'noShows', count(r.id) filter (where r.status = 'no_show'),
        'completed', count(r.id) filter (where r.status = 'completed'),
        'seatMinutesUsed', coalesce(sum(r.party_size * extract(epoch from (coalesce(r.completed_at, least(clock_timestamp(), r.ends_at)) - r.seated_at)) / 60)
          filter (where r.seated_at is not null and r.status in ('seated','completed')), 0)::int,
        'seatMinutesAvailable', case when exists (select 1 from public.tables_service_exceptions e where e.venue_id = p_venue_id and e.service_date = day::date and e.kind = 'closed' and e.service_key is null)
          then 0 else seats * coalesce((select sum(
            (extract(epoch from ((s->>'lastSeating')::time - (s->>'start')::time)) / 60
              + case when (s->>'lastSeating') < (s->>'start') then 1440 else 0 end) + (s->>'durationMinutes')::int)
            from jsonb_array_elements(snap->'services') s where s->'weekdays' @> to_jsonb(extract(dow from day)::int)), 0) end
      ) d
      from generate_series(p_from, p_to, interval '1 day') day
      left join public.tables_reservations r on r.venue_id = p_venue_id and r.service_date = day::date
      group by day) x), '[]'),
    'sources', coalesce((select jsonb_object_agg(source, n) from (select r.source, count(*) n from public.tables_reservations r
      where r.venue_id = p_venue_id and r.service_date between p_from and p_to and r.status not in ('rejected','expired') group by r.source) s), '{}'),
    'approvals', coalesce((select jsonb_object_agg(approval, n) from (select r.approval, count(*) n from public.tables_reservations r
      where r.venue_id = p_venue_id and r.service_date between p_from and p_to and r.status not in ('expired') group by r.approval) s), '{}'),
    'seated', (select jsonb_build_object('avgMinutes', round(avg(extract(epoch from (r.completed_at - r.seated_at)) / 60)), 'sample', count(*))
      from public.tables_reservations r where r.venue_id = p_venue_id and r.service_date between p_from and p_to
        and r.status = 'completed' and r.seated_at is not null and r.completed_at is not null),
    'waitlist', (select jsonb_build_object('closed', count(*) filter (where e.status not in ('waiting','offered')),
        'seated', count(*) filter (where e.status = 'seated'),
        'abandoned', count(*) filter (where e.status in ('departed','no_response','cancelled','expired','declined')))
      from public.tables_waitlist_entries e where e.venue_id = p_venue_id and e.service_date between p_from and p_to));
end;
$$;
revoke all on function public.tables_analytics(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.tables_analytics(uuid, date, date) to authenticated;

commit;
