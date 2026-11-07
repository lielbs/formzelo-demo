begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('27000000-0000-4000-8000-000000000001','rec-owner@example.invalid',clock_timestamp()),
 ('27000000-0000-4000-8000-000000000002','rec-staff@example.invalid',clock_timestamp()),
 ('27000000-0000-4000-8000-000000000003','rec-operator@example.invalid',clock_timestamp()),
 ('27000000-0000-4000-8000-000000000004','rec-other-owner@example.invalid',clock_timestamp());
insert into private.platform_operators(user_id) values ('27000000-0000-4000-8000-000000000003');
insert into public.organizations(id,slug,name,status) values
 ('37000000-0000-4000-8000-000000000001','rec-tenant','Rec','active'),
 ('37000000-0000-4000-8000-000000000002','rec-other','Other','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000001','owner'),
 ('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000002','staff'),
 ('37000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000004','owner');
create temp table t(name text primary key, token text);
grant all on t to authenticated, service_role;

set local role authenticated;
set local request.jwt.claim.sub='27000000-0000-4000-8000-000000000004';
select throws_ok($$select public.operator_issue_password_recovery('rec-owner@example.invalid')$$,'42501',null,'a non-operator cannot issue recovery links');
select throws_ok($$select public.owner_issue_staff_recovery('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000002')$$,'42501',null,'another owner cannot reset someone else''s staff');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='27000000-0000-4000-8000-000000000001';
select throws_ok($$select public.owner_issue_staff_recovery('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000001')$$,'P0002','member_not_found','an owner link is never issued through the staff path');
insert into t values ('staff', public.owner_issue_staff_recovery('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000002'));
reset role;

set local role authenticated;
set local request.jwt.claim.sub='27000000-0000-4000-8000-000000000003';
insert into t values ('owner1', public.operator_issue_password_recovery(' Rec-Owner@Example.invalid '));
insert into t values ('owner2', public.operator_issue_password_recovery('rec-owner@example.invalid'));
select throws_ok($$select public.operator_issue_password_recovery('nobody@example.invalid')$$,'P0002','account_not_found','unknown accounts are reported to the operator');
reset role;

select is((select count(*) from private.password_recovery_tokens where token_hash = convert_to((select token from t where name='owner2'),'UTF8')),0::bigint,'raw recovery tokens are never stored');
set local role authenticated;
select throws_ok($$select * from public.server_consume_password_recovery((select token from t where name='owner2'))$$,'42501',null,'only the server consumes recovery links');
reset role;

set local role service_role;
select is((select count(*) from public.server_consume_password_recovery((select token from t where name='owner1'))),0::bigint,'a link replaced by a newer one no longer works');
select is((select email from public.server_consume_password_recovery((select token from t where name='owner2'))),'rec-owner@example.invalid','the current link resolves its own account');
select is((select count(*) from public.server_consume_password_recovery((select token from t where name='owner2'))),0::bigint,'a link works exactly once');
select is((select email from public.server_consume_password_recovery((select token from t where name='staff'))),'rec-staff@example.invalid','the staff link resolves the staff account');
select is((select count(*) from public.server_consume_password_recovery('zz')),0::bigint,'malformed tokens resolve nothing');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='27000000-0000-4000-8000-000000000001';
insert into t values ('late', public.owner_issue_staff_recovery('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000002'));
reset role;
update private.password_recovery_tokens set created_at = clock_timestamp() - interval '3 hours', expires_at = clock_timestamp() - interval '1 hour'
 where token_hash = extensions.digest((select token from t where name='late'), 'sha256');
set local role service_role;
select is((select count(*) from public.server_consume_password_recovery((select token from t where name='late'))),0::bigint,'an expired link no longer works');
reset role;
select * from finish();
rollback;
