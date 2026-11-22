-- Client error reports: anyone may report, nobody may read through the API, nothing personal is
-- kept (query, fragment, tokens, phones, emails are removed), and a flood is dropped quietly.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('private', 'client_errors', 'reports table exists');
select ok(has_function_privilege('anon', 'public.log_client_error(jsonb, uuid)', 'execute'), 'a guest page can report');
select ok(not has_table_privilege('anon', 'private.client_errors', 'select'), 'guests cannot read reports');
select ok(not has_table_privilege('authenticated', 'private.client_errors', 'select'), 'signed-in users cannot read reports');

set local role anon;
select lives_ok($$ select public.log_client_error(jsonb_build_object(
  'kind', 'error',
  'route', '/live/t/r?x=1#t=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  'message', 'TypeError at dana@example.com 050-555-1234 token AbCdEfGhIjKlMnOpQrStUvWxYz012345',
  'stack', 'at BookingPage (https://formangle.rockstackds.com/live/assets/BookingPage-Ab12.js:1:2)',
  'build', 'index-DGhDXxpu<script>',
  'browser', 'Chrome mobile'), 'e1000000-0000-4000-8000-000000000001'::uuid) $$, 'report accepted');
select lives_ok($$ select public.log_client_error('{"kind":"nonsense","message":"x"}'::jsonb, 'e1000000-0000-4000-8000-000000000001'::uuid) $$, 'unknown kind ignored, no error');
select lives_ok($$ select public.log_client_error('{"kind":"error","message":"   "}'::jsonb, 'e1000000-0000-4000-8000-000000000001'::uuid) $$, 'empty message ignored, no error');
reset role;

select is((select count(*)::int from private.client_errors), 1, 'only the valid report was stored');
select is((select route from private.client_errors), '/live/t/r', 'query and fragment removed from the path');
select ok((select message from private.client_errors) !~ '@|555|AbCdEfGh', 'email, phone and token masked in the message');
select ok((select message from private.client_errors) ~ '<email>' and (select message from private.client_errors) ~ '<number>' and (select message from private.client_errors) ~ '<token>', 'masks are visible');
select is((select build from private.client_errors), 'index-DGhDXxpuscript', 'build keeps only safe characters');
select is((select browser from private.client_errors), 'hrome mobile', 'browser keeps only lowercase safe characters');

-- A flood from one browser: at most 20 per 10 minutes are kept, the rest dropped without an error.
set local role anon;
select lives_ok($$ select public.log_client_error(jsonb_build_object('kind', 'error', 'message', 'loop ' || n), 'e1000000-0000-4000-8000-000000000002'::uuid)
  from generate_series(1, 30) n $$, 'flood never raises');
reset role;
select is((select count(*)::int from private.client_errors where message like 'loop %'), 20, 'flood capped at 20');

select * from finish();
rollback;
