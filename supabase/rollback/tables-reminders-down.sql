-- Rollback of 20261119150000_tables_reminders.sql (drops the "reminder sent" marks).
drop function if exists public.tables_mark_reminded(uuid, boolean);
drop function if exists public.tables_reminder_list(uuid, date);
drop table if exists public.tables_reminders;
