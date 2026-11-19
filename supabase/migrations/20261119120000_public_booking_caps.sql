-- Security review 2026-11-19: tighter limits on public table bookings and waitlist joins.
--
-- The per-browser and per-IP limits stay as they are, but a browser id is chosen by the caller and
-- an IP can be rotated, so a script could still fill a venue with invented bookings. These limits
-- hold no matter who is calling:
--   * one phone number holds at most 4 upcoming online bookings at a venue ("too_many_bookings");
--   * a venue takes at most 120 new online bookings per 15 minutes (was 300);
--   * a venue takes at most 60 public waitlist joins per 30 minutes (there was no venue-wide limit).
-- A retry of the same request (same idempotency key) is never blocked, so a guest whose network
-- dropped still receives their manage link. Staff bookings and staff waitlist entries are untouched.
-- Rollback: supabase/rollback/public-booking-caps-down.sql.

create function private.tables_public_caps(p_kind text, p_venue uuid, p_input jsonb, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  phone text;
begin
  if p_venue is null or p_idempotency_key is null then return; end if;
  if p_kind = 'book' then
    if exists (select 1 from public.tables_reservations r where r.venue_id = p_venue and r.idempotency_key = p_idempotency_key) then return; end if;
    if (select count(*) from public.tables_reservations r
         where r.venue_id = p_venue and r.source = 'online' and r.created_at > clock_timestamp() - interval '15 minutes') >= 120 then
      raise exception 'tables:rate_limited' using errcode = '54000';
    end if;
    phone := private.tables_normalize_phone(p_input->>'phone');
    if phone is not null and (select count(*) from public.tables_reservations r
         where r.venue_id = p_venue and r.source = 'online' and r.guest_phone = phone
           and r.status in ('pending_approval', 'confirmed', 'arrived', 'seated') and r.ends_at > clock_timestamp()) >= 4 then
      raise exception 'tables:too_many_bookings' using errcode = '54000';
    end if;
  elsif p_kind = 'waitlist' then
    if exists (select 1 from public.tables_waitlist_entries e where e.venue_id = p_venue and e.idempotency_key = p_idempotency_key) then return; end if;
    if (select count(*) from public.tables_waitlist_entries e
         where e.venue_id = p_venue and e.source = 'public' and e.created_at > clock_timestamp() - interval '30 minutes') >= 60 then
      raise exception 'tables:rate_limited' using errcode = '54000';
    end if;
  end if;
end;
$$;
revoke all on function private.tables_public_caps(text, uuid, jsonb, uuid) from public, anon, authenticated, service_role;

-- The public commands: unchanged apart from the one check before the booking/join itself.
create or replace function public.tables_public_book(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  answers jsonb;
  input jsonb := p_input;
  result jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 12288 then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  select * into target from private.tables_public_target(p_slug);
  if found and target.status = 'published' then
    perform private.tables_public_caps('book', target.venue_id, p_input, p_idempotency_key);
    answers := private.tables_custom_answers(target.snapshot->'publicPages'->'booking'->'fields', p_input->'customAnswers');
    if private.tables_page_shows(target.snapshot->'publicPages', 'booking', 'email') is false then input := input - 'email'; end if;
    if private.tables_page_shows(target.snapshot->'publicPages', 'booking', 'requests') is false then input := input - 'requests'; end if;
  end if;
  result := private.tables_public_book_core(p_slug, input - 'customAnswers', p_idempotency_key, p_client);
  if answers is not null and result->>'result' in ('confirmed','pending') then
    update public.tables_reservations r set custom_answers = answers
     where r.venue_id = target.venue_id and r.idempotency_key = p_idempotency_key and r.custom_answers is null;
  end if;
  return result;
end;
$$;

create or replace function public.tables_public_waitlist_join(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  answers jsonb;
  input jsonb := p_input;
  result jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 8192 then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  select * into target from private.tables_public_target(p_slug);
  -- Guest notes only when the published page asks for them (the standard page never did).
  input := input - 'notes';
  if found and target.status = 'published' then
    perform private.tables_public_caps('waitlist', target.venue_id, p_input, p_idempotency_key);
    answers := private.tables_custom_answers(target.snapshot->'publicPages'->'waitlist'->'fields', p_input->'customAnswers');
    if private.tables_page_shows(target.snapshot->'publicPages', 'waitlist', 'notes') is true and p_input ? 'notes' then
      input := input || jsonb_build_object('notes', left(btrim(coalesce(p_input->>'notes', '')), 300));
    end if;
  end if;
  result := private.tables_public_waitlist_join_core(p_slug, input - 'customAnswers', p_idempotency_key, p_client);
  if answers is not null then
    update public.tables_waitlist_entries e set custom_answers = answers
     where e.venue_id = target.venue_id and e.idempotency_key = p_idempotency_key and e.custom_answers is null;
  end if;
  return result;
end;
$$;
