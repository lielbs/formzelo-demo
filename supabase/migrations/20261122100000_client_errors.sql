-- Client error reports (UX audit 2026-11, C1/D10): browser errors from the production app reach the
-- team instead of disappearing on a guest's phone during a Friday shift. Free: a table and a function.
--
-- Privacy by design: no name, phone, email, token or form content is ever stored. The function
-- keeps only the error text and stack (shortened), the page path without query or fragment, the
-- build and a coarse browser class; long tokens, phone-like numbers and email addresses are masked
-- again on the server, whatever the client sent. Reports are dropped silently above a per-browser
-- and per-IP rate (reusing the hashed rate limiter of Tables), and deleted after 30 days.
-- Rollback: supabase/rollback/client-errors-down.sql

create table private.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('error', 'rejection', 'render')),
  route text not null check (char_length(route) <= 200),
  message text not null check (char_length(message) <= 300),
  stack text check (char_length(stack) <= 2000),
  build text check (char_length(build) <= 60),
  browser text check (char_length(browser) <= 40)
);
create index client_errors_created_idx on private.client_errors(created_at);
alter table private.client_errors enable row level security;
revoke all on private.client_errors from public, anon, authenticated;

-- Masks anything that could identify a person: emails, phone-like digit runs, long tokens.
create function private.client_error_scrub(p_text text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_text, ''), '[^\s@]+@[^\s@]+\.[^\s@]+', '<email>', 'g'),
        '\+?\d[\d\s().-]{6,}\d', '<number>', 'g'),
      '[A-Za-z0-9_-]{24,}', '<token>', 'g'),
    p_max)
$$;
revoke all on function private.client_error_scrub(text, integer) from public, anon, authenticated;

create function public.log_client_error(p_report jsonb, p_client uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := coalesce(p_report->>'kind', 'error');
  v_route text;
begin
  if v_kind not in ('error', 'rejection', 'render') then return; end if;
  if coalesce(btrim(p_report->>'message'), '') = '' then return; end if;
  begin
    perform private.tables_rate('client_error', p_client, 20, 60, interval '10 minutes');
  exception when sqlstate '54000' then
    return; -- over the limit: drop quietly, never an error back to a page that is already failing
  end;
  -- The path only: no query string, no fragment (manage links carry their token there).
  v_route := split_part(split_part(coalesce(p_report->>'route', ''), '?', 1), '#', 1);
  insert into private.client_errors(kind, route, message, stack, build, browser)
  values (
    v_kind,
    private.client_error_scrub(v_route, 200),
    private.client_error_scrub(p_report->>'message', 300),
    nullif(private.client_error_scrub(p_report->>'stack', 2000), ''),
    nullif(left(regexp_replace(coalesce(p_report->>'build', ''), '[^A-Za-z0-9._-]', '', 'g'), 60), ''),
    nullif(left(regexp_replace(coalesce(p_report->>'browser', ''), '[^a-z0-9 _-]', '', 'g'), 40), '')
  );
  if random() < 0.02 then
    delete from private.client_errors where id in (
      select id from private.client_errors where created_at < clock_timestamp() - interval '30 days' limit 500);
  end if;
end;
$$;
revoke all on function public.log_client_error(jsonb, uuid) from public;
grant execute on function public.log_client_error(jsonb, uuid) to anon, authenticated;
