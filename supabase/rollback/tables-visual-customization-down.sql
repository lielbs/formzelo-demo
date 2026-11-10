-- Rollback of 20261111090000_tables_visual_customization (Tables T9).
-- Restores the original public commands (the wrapped cores move back unchanged), removes the
-- validators/guards and the custom_answers columns. Published page designs and menu images stay
-- in the JSON documents; the previous application ignores them, so they are harmless.
--
-- Refuses to run while guest answers exist: export them first (tables_export_guest), then clear
-- them deliberately under an approved plan. Run BEFORE tables-down.sql if both are needed.
-- Never run against RAVO; selecting the right project is the operator's job.
begin;

do $$
begin
  if exists (select 1 from public.tables_reservations where custom_answers is not null)
     or exists (select 1 from public.tables_waitlist_entries where custom_answers is not null) then
    raise exception 'Guest answers exist: export them and clear custom_answers before rolling back';
  end if;
end;
$$;

-- Wrappers out, original commands back (same names, signatures and grants as before T9).
drop function public.tables_public_book(text, jsonb, uuid, uuid);
alter function private.tables_public_book_core(text, jsonb, uuid, uuid) set schema public;
alter function public.tables_public_book_core(text, jsonb, uuid, uuid) rename to tables_public_book;

drop function public.tables_public_waitlist_join(text, jsonb, uuid, uuid);
alter function private.tables_public_waitlist_join_core(text, jsonb, uuid, uuid) set schema public;
alter function public.tables_public_waitlist_join_core(text, jsonb, uuid, uuid) rename to tables_public_waitlist_join;

drop function public.tables_public_venue(text);
alter function private.tables_public_venue_core(text) set schema public;
alter function public.tables_public_venue_core(text) rename to tables_public_venue;

drop function public.tables_reservation_detail(uuid);
alter function private.tables_reservation_detail_core(uuid) set schema public;
alter function public.tables_reservation_detail_core(uuid) rename to tables_reservation_detail;

drop function public.tables_waitlist(uuid, date);
alter function private.tables_waitlist_core(uuid, date) set schema public;
alter function public.tables_waitlist_core(uuid, date) rename to tables_waitlist;

drop function public.tables_export_guest(uuid, uuid);
alter function private.tables_export_guest_core(uuid, uuid) set schema public;
alter function public.tables_export_guest_core(uuid, uuid) rename to tables_export_guest;

drop function public.tables_anonymize_guest(uuid, uuid);
alter function private.tables_anonymize_guest_core(uuid, uuid) set schema public;
alter function public.tables_anonymize_guest_core(uuid, uuid) rename to tables_anonymize_guest;

do $$
declare f text;
begin
  foreach f in array array['public.tables_public_book(text,jsonb,uuid,uuid)','public.tables_public_waitlist_join(text,jsonb,uuid,uuid)',
    'public.tables_public_venue(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['public.tables_reservation_detail(uuid)','public.tables_waitlist(uuid,date)',
    'public.tables_export_guest(uuid,uuid)','public.tables_anonymize_guest(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Guards and validators.
drop trigger tables_guard_public_pages on public.tables_venue_versions;
drop trigger tables_guard_public_pages on public.tables_venues;
drop function private.tables_guard_version_pages();
drop function private.tables_guard_draft_pages();
drop function private.tables_page_shows(jsonb, text, text);
drop function private.tables_custom_answers(jsonb, jsonb);
drop function private.tables_public_pages_problems(uuid, jsonb);
drop function private.tables_page_theme_problems(uuid, jsonb, text);

-- Menu problems: back to the original checker.
drop function private.tables_menu_problems(uuid, jsonb);
drop function private.tables_menu_media_problems(uuid, jsonb);
alter function private.tables_menu_core_problems(uuid, jsonb) rename to tables_menu_problems;
drop function private.tables_org_asset_ok(uuid, text);

alter table public.tables_waitlist_entries drop column custom_answers;
alter table public.tables_reservations drop column custom_answers;

commit;
