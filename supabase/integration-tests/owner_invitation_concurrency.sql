-- Run against a freshly reset local stack; this is intentionally outside the pgTAP suite.
\set ON_ERROR_STOP on

create extension if not exists dblink with schema extensions;

insert into auth.users(id,email,email_confirmed_at) values
 ('22000000-0000-4000-8000-000000000001','concurrency-operator@example.invalid',clock_timestamp()),
 ('22000000-0000-4000-8000-000000000002','concurrency-owner@example.invalid',clock_timestamp());
insert into private.platform_operators(user_id)
values ('22000000-0000-4000-8000-000000000001');
insert into public.organizations(id,slug,name,status)
values ('32000000-0000-4000-8000-000000000001','invitation-concurrency-test','Invitation Concurrency Test','active');

create table private.owner_invitation_concurrency_secret(token text not null);
revoke all on private.owner_invitation_concurrency_secret from public, anon, authenticated, service_role;
insert into private.owner_invitation_concurrency_secret(token)
select invitation_token
from private.create_owner_invitation(
  '32000000-0000-4000-8000-000000000001',
  'concurrency-owner@example.invalid',
  '22000000-0000-4000-8000-000000000001',
  interval '48 hours'
);

create function private.pause_concurrent_invitation_acceptance() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.accepted_at is null and new.accepted_at is not null then
    perform pg_catalog.pg_sleep(1);
  end if;
  return new;
end;
$$;
create trigger pause_concurrent_invitation_acceptance
before update on private.owner_invitations
for each row execute function private.pause_concurrent_invitation_acceptance();

create function private.run_concurrent_invitation_acceptance()
returns table(organization_id uuid, membership_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',false);
  return query
  select accepted.organization_id, accepted.membership_created
  from private.owner_invitation_concurrency_secret secret
  cross join lateral private.accept_owner_invitation(
    secret.token,
    '32000000-0000-4000-8000-000000000001'
  ) accepted;
end;
$$;
revoke all on function private.run_concurrent_invitation_acceptance() from public, anon, authenticated, service_role;

create temporary table concurrency_results(
  attempt text primary key,
  organization_id uuid not null,
  membership_created boolean not null
);

select extensions.dblink_connect('accept_1','host=host.containers.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable');
select extensions.dblink_connect('accept_2','host=host.containers.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable');
select extensions.dblink_send_query('accept_1','select * from private.run_concurrent_invitation_acceptance()');
select extensions.dblink_send_query('accept_2','select * from private.run_concurrent_invitation_acceptance()');

insert into concurrency_results
select 'accept_1', result.*
from extensions.dblink_get_result('accept_1') as result(organization_id uuid,membership_created boolean);
insert into concurrency_results
select 'accept_2', result.*
from extensions.dblink_get_result('accept_2') as result(organization_id uuid,membership_created boolean);

do $$
begin
  if (select count(*) from concurrency_results) <> 2 then
    raise exception 'Expected two successful acceptance responses';
  end if;
  if (select count(*) from concurrency_results where membership_created) <> 1
    or (select count(*) from concurrency_results where not membership_created) <> 1 then
    raise exception 'Concurrent acceptance did not produce one create and one idempotent replay';
  end if;
  if (select count(*) from public.organization_memberships
      where organization_id='32000000-0000-4000-8000-000000000001'
        and user_id='22000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'Concurrent acceptance created duplicate memberships';
  end if;
  if (select count(*) from public.audit_events
      where organization_id='32000000-0000-4000-8000-000000000001'
        and resource_type='owner_invitation'
        and operation='UPDATE') <> 1 then
    raise exception 'Concurrent acceptance produced duplicate acceptance audit events';
  end if;
end;
$$;

select extensions.dblink_disconnect('accept_1');
select extensions.dblink_disconnect('accept_2');
drop function private.run_concurrent_invitation_acceptance();
drop trigger pause_concurrent_invitation_acceptance on private.owner_invitations;
drop function private.pause_concurrent_invitation_acceptance();
drop table private.owner_invitation_concurrency_secret;

select 'owner invitation concurrent acceptance: PASS' as result;
