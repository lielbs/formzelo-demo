-- Returning guest while the host types a phone number (UX audit 2026-11, A6.4): "דנה לוי · 4 ביקורים
-- · אחרון 13.11", so a phone booking takes the name in one tap and the host knows who is calling.
--
-- Privacy: staff of the venue only (host or above), exact match on the full normalized number
-- (no prefix search, so the list of guests cannot be walked), one guest at most, and only what the
-- shift already shows for a booked guest (name, visits, no-shows, last visit at this venue).
-- Rollback: supabase/rollback/tables-guest-lookup-down.sql

create function public.tables_guest_lookup(p_venue_id uuid, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_phone text := private.tables_normalize_phone(p_phone);
begin
  if private.tables_role_rank(private.tables_role(p_venue_id)) < 2 then
    raise exception 'tables:forbidden' using errcode = '42501';
  end if;
  if v_phone is null then return null; end if;
  select v.organization_id into v_org from public.tables_venues v where v.id = p_venue_id;
  return (
    select jsonb_build_object(
      'name', g.display_name,
      'visits', count(r.id) filter (where r.status = 'completed'),
      'noShows', count(r.id) filter (where r.status = 'no_show'),
      'lastVisit', max(r.service_date) filter (where r.status = 'completed'))
    from public.tables_guests g
    left join public.tables_reservations r on r.guest_id = g.id and r.venue_id = p_venue_id
    where g.organization_id = v_org and g.phone_e164 = v_phone
    group by g.id, g.display_name
    limit 1);
end;
$$;
revoke all on function public.tables_guest_lookup(uuid, text) from public, anon;
grant execute on function public.tables_guest_lookup(uuid, text) to authenticated;
