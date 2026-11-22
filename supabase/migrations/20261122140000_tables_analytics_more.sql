-- More from the venue data (UX audit 2026-11, A12): when the venue is busy (bookings and covers by
-- weekday and booked hour) and who comes back (regular guests and repeated no-shows).
-- Same access as tables_analytics (viewer and up; never hosts). Guest names appear only for
-- managers and owners, and only the counts needed to recognise a regular.
-- Rollback: supabase/rollback/tables-analytics-more-down.sql

create function public.tables_analytics_more(p_venue_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  role text := private.tables_role(p_venue_id);
  names boolean;
begin
  if role is null or role = 'host' then raise exception 'Tables access denied' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  names := private.tables_role_rank(role) >= private.tables_role_rank('manager');
  return jsonb_build_object(
    -- weekday 0 = Sunday … 6 = Saturday (of the service date), hour of the booked local time.
    'heat', coalesce((select jsonb_agg(jsonb_build_object('dow', h.dow, 'hour', h.hour, 'bookings', h.bookings, 'covers', h.covers) order by h.dow, h.hour)
      from (select extract(dow from r.service_date)::int dow, split_part(r.local_time, ':', 1)::int hour,
                   count(*) bookings, sum(r.party_size)::int covers
            from public.tables_reservations r
            where r.venue_id = p_venue_id and r.service_date between p_from and p_to and r.status not in ('rejected','expired','cancelled')
            group by 1, 2) h), '[]'),
    'regulars', case when names then coalesce((select jsonb_agg(x order by x->>'visits' desc, x->>'last' desc) from (
        select jsonb_build_object('name', g.display_name, 'visits', count(*), 'last', max(r.service_date)) x
        from public.tables_reservations r join public.tables_guests g on g.id = r.guest_id
        where r.venue_id = p_venue_id and r.service_date between p_from and p_to and r.status = 'completed'
        group by g.id, g.display_name having count(*) >= 2
        order by count(*) desc, max(r.service_date) desc limit 10) q), '[]') else null end,
    'noShows', case when names then coalesce((select jsonb_agg(x order by x->>'count' desc) from (
        select jsonb_build_object('name', g.display_name, 'count', count(*), 'last', max(r.service_date)) x
        from public.tables_reservations r join public.tables_guests g on g.id = r.guest_id
        where r.venue_id = p_venue_id and r.service_date between p_from and p_to and r.status = 'no_show'
        group by g.id, g.display_name having count(*) >= 2
        order by count(*) desc limit 10) q), '[]') else null end
  );
end;
$$;
revoke all on function public.tables_analytics_more(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.tables_analytics_more(uuid, date, date) to authenticated;
