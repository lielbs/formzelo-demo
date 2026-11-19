-- Reminders before a booking: the staff list of a day's open bookings, with "reminder sent" marks.
-- The mark lives in its own table, not on the reservation: marking a reminder never changes the
-- reservation's lock_version, so it cannot make a host's edit of the same booking fail.
-- Rollback: supabase/rollback/tables-reminders-down.sql

create table public.tables_reminders (
  reservation_id uuid primary key references public.tables_reservations(id) on delete cascade,
  organization_id uuid not null,
  venue_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'push')),
  sent_at timestamptz not null default clock_timestamp(),
  sent_by uuid
);
create index tables_reminders_venue_idx on public.tables_reminders(venue_id);
alter table public.tables_reminders enable row level security;
-- No policies and no grants: only the functions below read or write it.
revoke all on public.tables_reminders from public, anon, authenticated;

-- One day's bookings that still need a reminder (confirmed or awaiting approval), for staff who may
-- see guest phones (host and above, the same rule as the shift screen).
create function public.tables_reminder_list(p_venue_id uuid, p_service_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.tables_venues%rowtype;
begin
  if not private.tables_can(p_venue_id, 'host') then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  select * into v from public.tables_venues where id = p_venue_id;
  return jsonb_build_object(
    'venue', jsonb_build_object('id', v.id, 'name', v.name, 'slug', v.slug, 'timezone', v.timezone),
    'serviceDate', p_service_date,
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reference', r.reference, 'time', r.local_time, 'startsAt', r.starts_at,
        'party', r.party_size, 'status', r.status, 'guestName', r.guest_name, 'guestPhone', r.guest_phone,
        'remindedAt', m.sent_at, 'remindedVia', m.channel
      ) order by r.starts_at, r.reference)
      from public.tables_reservations r
      left join public.tables_reminders m on m.reservation_id = r.id
      where r.venue_id = p_venue_id and r.service_date = p_service_date
        and r.status in ('confirmed', 'pending_approval')
    ), '[]'::jsonb)
  );
end;
$$;

-- Mark (or unmark) that the staff sent a reminder for a booking.
create function public.tables_mark_reminded(p_reservation_id uuid, p_sent boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  res public.tables_reservations%rowtype;
  v_at timestamptz;
begin
  select * into res from public.tables_reservations where id = p_reservation_id;
  if not found or not private.tables_can(res.venue_id, 'host') then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  if not p_sent then
    delete from public.tables_reminders where reservation_id = res.id;
    return jsonb_build_object('remindedAt', null);
  end if;
  if res.status not in ('confirmed', 'pending_approval') then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  insert into public.tables_reminders(reservation_id, organization_id, venue_id, channel, sent_by)
  values (res.id, res.organization_id, res.venue_id, 'whatsapp', auth.uid())
  on conflict (reservation_id) do update set channel = 'whatsapp', sent_at = clock_timestamp(), sent_by = auth.uid()
  returning sent_at into v_at;
  return jsonb_build_object('remindedAt', v_at);
end;
$$;

revoke all on function public.tables_reminder_list(uuid, date) from public, anon;
revoke all on function public.tables_mark_reminded(uuid, boolean) from public, anon;
grant execute on function public.tables_reminder_list(uuid, date) to authenticated;
grant execute on function public.tables_mark_reminded(uuid, boolean) to authenticated;
