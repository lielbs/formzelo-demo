-- Formangle Tables T8: privacy operations for owners (export and anonymize one guest), audited.
--  * Only organization owners; never for a guest with an upcoming active reservation.
--  * Anonymization removes name/phone/email/requests from the guest and their past reservations
--    and revokes their links; non-identifying facts (dates, party sizes, statuses) remain for
--    analytics. Staff notes are immutable records and are kept; deleting them is an operator
--    procedure under the retention policy (documented in OPERATIONS).
begin;

create table private.tables_privacy_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  guest_id uuid not null,
  action text not null check (action in ('export','anonymize')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table private.tables_privacy_log enable row level security;
revoke all on private.tables_privacy_log from public, anon, authenticated, service_role;

create function public.tables_find_guest(p_organization_id uuid, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare phone text := private.tables_normalize_phone(p_phone);
begin
  if not private.has_org_role(p_organization_id, array['owner']) or not private.tables_org_enabled(p_organization_id) then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  if phone is null then raise exception 'tables:phone_invalid' using errcode = '22023'; end if;
  return (select jsonb_build_object('id', g.id, 'name', g.display_name, 'reservations',
    (select count(*) from public.tables_reservations r where r.guest_id = g.id))
    from public.tables_guests g where g.organization_id = p_organization_id and g.phone_e164 = phone);
end;
$$;

create function public.tables_export_guest(p_organization_id uuid, p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.tables_guests%rowtype;
begin
  if not private.has_org_role(p_organization_id, array['owner']) or not private.tables_org_enabled(p_organization_id) then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  select * into g from public.tables_guests where id = p_guest_id and organization_id = p_organization_id;
  if not found then raise exception 'tables:not_found' using errcode = 'P0002'; end if;
  insert into private.tables_privacy_log(organization_id, guest_id, action, actor_user_id) values (p_organization_id, g.id, 'export', auth.uid());
  return jsonb_build_object(
    'guest', jsonb_build_object('name', g.display_name, 'phone', g.phone_e164, 'email', g.email, 'marketingConsent', g.marketing_consent, 'createdAt', g.created_at),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('venue', v.name, 'date', r.service_date, 'time', r.local_time, 'party', r.party_size,
        'status', r.status, 'source', r.source, 'name', r.guest_name, 'phone', r.guest_phone, 'email', r.guest_email, 'requests', r.requests,
        'createdAt', r.created_at) order by r.starts_at)
      from public.tables_reservations r join public.tables_venues v on v.id = r.venue_id where r.guest_id = g.id), '[]'),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('date', e.service_date, 'party', e.party_size, 'status', e.status, 'name', e.guest_name, 'phone', e.guest_phone))
      from public.tables_waitlist_entries e where e.guest_id = g.id), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'visibility', n.visibility, 'at', n.created_at) order by n.created_at)
      from public.tables_notes n where n.guest_id = g.id), '[]'),
    'exportedAt', clock_timestamp());
end;
$$;

create function public.tables_anonymize_guest(p_organization_id uuid, p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.tables_guests%rowtype;
  n integer;
begin
  if not private.has_org_role(p_organization_id, array['owner']) or not private.tables_org_enabled(p_organization_id) then
    raise exception 'Tables access denied' using errcode = '42501';
  end if;
  select * into g from public.tables_guests where id = p_guest_id and organization_id = p_organization_id for update;
  if not found then raise exception 'tables:not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.tables_reservations r where r.guest_id = g.id and r.status in ('pending_approval','confirmed','arrived','seated')
      and r.ends_at > clock_timestamp()) then
    raise exception 'tables:guest_has_active_reservation' using errcode = 'P0001';
  end if;
  update public.tables_reservations set guest_name = 'אורח/ת (נמחק)', guest_phone = null, guest_email = null, requests = null
   where guest_id = g.id;
  get diagnostics n = row_count;
  update public.tables_waitlist_entries set guest_name = 'אורח/ת (נמחק)', guest_phone = null, notes = null where guest_id = g.id;
  update private.tables_access_tokens t set revoked_at = clock_timestamp()
   where t.revoked_at is null and (t.reservation_id in (select id from public.tables_reservations where guest_id = g.id)
     or t.waitlist_entry_id in (select id from public.tables_waitlist_entries where guest_id = g.id));
  update public.tables_guests set display_name = 'אורח/ת (נמחק)', phone_e164 = null, email = null, marketing_consent = false where id = g.id;
  insert into private.tables_privacy_log(organization_id, guest_id, action, actor_user_id) values (p_organization_id, g.id, 'anonymize', auth.uid());
  return jsonb_build_object('reservations', n);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.tables_find_guest(uuid,text)','public.tables_export_guest(uuid,uuid)','public.tables_anonymize_guest(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
