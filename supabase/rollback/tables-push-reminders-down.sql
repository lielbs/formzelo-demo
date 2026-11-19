-- Rollback of 20261119160000_tables_push_reminders.sql. Unschedule the sender first
-- (supabase/ops/tables-push-cron.sql has the matching unschedule line).
drop function if exists public.tables_push_result(uuid, text);
drop function if exists public.tables_push_claim(integer);
drop function if exists public.tables_push_key_init(text, jsonb);
drop function if exists public.tables_public_push_unsubscribe(text, uuid, text);
drop function if exists public.tables_public_push_subscribe(text, uuid, text);
drop function if exists public.tables_push_public_key(uuid);
drop function if exists private.tables_push_endpoint_ok(text);
drop table if exists private.tables_push_key;
drop table if exists private.tables_push_subscriptions;
