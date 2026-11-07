-- The hosted project provisions this SECURITY DEFINER event-trigger helper in
-- public with explicit API-role EXECUTE grants. The event trigger itself does
-- not require callers to invoke the function as an RPC.
begin;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated, service_role;
  end if;
end;
$$;

commit;
