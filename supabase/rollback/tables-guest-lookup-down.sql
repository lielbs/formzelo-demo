-- Rollback of 20261122120000_tables_guest_lookup.sql (read-only function; nothing else depends on it).
begin;
drop function if exists public.tables_guest_lookup(uuid, text);
delete from supabase_migrations.schema_migrations where version = '20261122120000';
commit;
