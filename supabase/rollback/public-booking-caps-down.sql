-- Rollback of 20261119120000_public_booking_caps (security review 2026-11-19).
-- Restores the public booking and waitlist commands exactly as 20261111090000 defined them and
-- removes the venue-wide/phone limits. No data changes. Never run against RAVO.
begin;

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

drop function private.tables_public_caps(text, uuid, jsonb, uuid);

commit;
