-- Production only (not a migration: a local or CI database must never call the live function).
-- Runs the push reminder sender every 10 minutes. pg_cron and pg_net are included in Supabase at
-- no extra cost; about 4,400 function calls a month, well inside the plan's included calls.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'tables-push-reminders',
  '*/10 * * * *',
  $$select net.http_post(
      url := 'https://ppgdbqhwbzlgzwsjmkor.supabase.co/functions/v1/tables-push-reminders',
      headers := '{"content-type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 20000)$$
);

-- Rollback: select cron.unschedule('tables-push-reminders');
