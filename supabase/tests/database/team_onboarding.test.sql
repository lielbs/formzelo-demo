begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('26000000-0000-4000-8000-000000000001','team-owner@example.invalid',clock_timestamp()),
 ('26000000-0000-4000-8000-000000000002','new-staff@example.invalid',clock_timestamp()),
 ('26000000-0000-4000-8000-000000000003','outsider@example.invalid',clock_timestamp()),
 ('26000000-0000-4000-8000-000000000004','operator@example.invalid',clock_timestamp());
insert into private.platform_operators(user_id) values ('26000000-0000-4000-8000-000000000004');
insert into public.organizations(id,slug,name,status) values ('36000000-0000-4000-8000-000000000001','team-tenant','Team Tenant','active');
insert into public.organization_memberships(organization_id,user_id,role) values ('36000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','owner');

create temp table t(name text primary key, token text, id uuid);
grant all on t to authenticated, service_role;

set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000003';
select throws_ok($$select * from public.create_staff_invitation('36000000-0000-4000-8000-000000000001','x@example.invalid')$$,'42501',null,'an outsider cannot invite');
select throws_ok($$select public.operator_list_organizations()$$,'42501',null,'a non-operator gets no overview');
select is(public.is_platform_operator(),false,'an ordinary user is not an operator');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.create_staff_invitation('36000000-0000-4000-8000-000000000001','not-an-email')$$,'22023','invitation_email_invalid','a malformed address is refused');
insert into t select 'staff', invitation_token, invitation_id from public.create_staff_invitation('36000000-0000-4000-8000-000000000001',' New-Staff@Example.invalid ');
select is(jsonb_array_length(public.list_team('36000000-0000-4000-8000-000000000001')->'invitations'),1,'the owner sees the pending invitation');
select throws_ok($$select public.remove_member('36000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001')$$,'55000','last_owner','the last owner cannot be removed');
reset role;

set local role service_role;
select is((select email from public.server_invitation_onboarding_target((select token from t where name='staff'),'36000000-0000-4000-8000-000000000001')),'new-staff@example.invalid','onboarding resolves the invited address');
select is((select account_exists from public.server_invitation_onboarding_target((select token from t where name='staff'),'36000000-0000-4000-8000-000000000001')),true,'onboarding reports an existing account');
select is((select count(*) from public.server_invitation_onboarding_target((select token from t where name='staff'),'36000000-0000-4000-8000-000000000099')),0::bigint,'a token for another organization resolves nothing');
reset role;
set local role authenticated;
select throws_ok($$select * from public.server_invitation_onboarding_target('00','36000000-0000-4000-8000-000000000001')$$,'42501',null,'only the server may resolve onboarding targets');
reset role;

-- The wrong person cannot use the link; the invited person becomes staff.
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000003';
select is((select count(*) from public.accept_owner_invitation((select token from t where name='staff'),'36000000-0000-4000-8000-000000000001')),0::bigint,'another identity cannot accept');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000002';
select is((select membership_created from public.accept_owner_invitation((select token from t where name='staff'),'36000000-0000-4000-8000-000000000001')),true,'the invited person joins');
select is((select role from public.organization_memberships where user_id='26000000-0000-4000-8000-000000000002'),'staff','with the staff role');
select is((select count(*) from public.organizations),1::bigint,'staff sees the workspace');
select throws_ok($$select * from public.create_staff_invitation('36000000-0000-4000-8000-000000000001','y@example.invalid')$$,'42501',null,'staff cannot invite');
select is(jsonb_array_length(public.list_team('36000000-0000-4000-8000-000000000001')->'invitations'),0,'staff does not see invitations');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000001';
select lives_ok($$select public.remove_member('36000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000002')$$,'the owner removes the staff member');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000002';
select is((select count(*) from public.organizations),0::bigint,'a removed member immediately loses access');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000004';
select is(public.is_platform_operator(),true,'the operator is recognised');
select is((public.operator_list_organizations()->0->>'owners')::integer,1,'the operator sees counts, not tenant data');
select is((select count(*) from public.submissions),0::bigint,'the operator still cannot read tenant requests');
reset role;

select * from finish();
rollback;
