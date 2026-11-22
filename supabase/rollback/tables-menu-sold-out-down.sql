-- Rollback of 20261122130000_tables_menu_sold_out.sql: guests get the menus without the sold-out
-- marks again; the marks themselves are dropped (they only ever meant "today").
begin;
drop function if exists public.tables_public_menus(text);
alter function private.tables_public_menus_core(text) set schema public;
alter function public.tables_public_menus_core(text) rename to tables_public_menus;
revoke all on function public.tables_public_menus(text) from public, anon, authenticated, service_role;
grant execute on function public.tables_public_menus(text) to anon, authenticated;
drop function if exists public.tables_menu_sold_out(uuid);
drop function if exists public.tables_menu_set_sold_out(uuid, text, boolean);
drop function if exists private.tables_venue_today(uuid);
drop table if exists public.tables_menu_item_state;
delete from supabase_migrations.schema_migrations where version = '20261122130000';
commit;
