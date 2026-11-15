-- Stale writes ("someone else changed it first") are raised as PT409 instead of 40001.
--
-- Why: PostgREST treats SQLSTATE 40001 (serialization_failure) as a transient error and retries the
-- whole transaction, with no limit. A business conflict never resolves on retry, so one stale request
-- (a double tap on "complete", two hosts on the same booking) looped on the server at ~440 attempts a
-- second until the connection was killed (incident 2026-11-15, high CPU alert). PT409 is a custom
-- PostgREST status: the request ends at once with HTTP 409 and the same message and detail.
--
-- How: each function that raises 40001 is recreated from its own current definition with only the
-- errcode changed, so nothing else in the function moves (owner, grants, SECURITY DEFINER and
-- search_path are kept by CREATE OR REPLACE / pg_get_functiondef). The client accepts both codes.
do $$
declare
  f record;
  def text;
  changed integer := 0;
begin
  for f in
    select p.oid, n.nspname, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and p.prosrc ~ 'errcode\s*=\s*''40001'''
  loop
    def := regexp_replace(pg_get_functiondef(f.oid), 'errcode\s*=\s*''40001''', 'errcode = ''PT409''', 'g');
    execute def;
    changed := changed + 1;
  end loop;
  raise notice 'conflict errcode 40001 -> PT409 in % functions', changed;
end $$;

-- Nothing in the app schemas may raise 40001 any more.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~ '''40001'''
  ) then
    raise exception 'a function still raises 40001';
  end if;
end $$;
