-- Rollback of 20261122100000_client_errors.sql. The reports are diagnostic only; dropping them loses nothing else.
begin;
drop function if exists public.log_client_error(jsonb, uuid);
drop function if exists private.client_error_scrub(text, integer);
drop table if exists private.client_errors;
delete from supabase_migrations.schema_migrations where version = '20261122100000';
commit;
