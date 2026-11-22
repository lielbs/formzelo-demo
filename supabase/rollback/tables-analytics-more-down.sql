-- Rollback of 20261122140000_tables_analytics_more.sql (read-only function).
begin;
drop function if exists public.tables_analytics_more(uuid, date, date);
delete from supabase_migrations.schema_migrations where version = '20261122140000';
commit;
