-- Formangle Tables T8: owner-only guest export and anonymization.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a3000000-0000-4000-8000-000000000001','pv-owner@example.invalid',clock_timestamp()),
 ('a3000000-0000-4000-8000-000000000002','pv-staff@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('b3000000-0000-4000-8000-000000000001','pv-a','PV','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','owner'),
 ('b3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002','staff');
insert into public.tables_organization_features(organization_id,enabled) values ('b3000000-0000-4000-8000-000000000001',true);
insert into public.tables_guests(id,organization_id,display_name,phone_e164,email) values
 ('c3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','דנה','+972501112233','dana@example.invalid');

set local role authenticated;
set local request.jwt.claim.sub = 'a3000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_export_guest('b3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')$$, '42501', null, 'staff cannot export a guest');
select throws_ok($$select public.tables_anonymize_guest('b3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')$$, '42501', null, 'staff cannot anonymize a guest');
set local request.jwt.claim.sub = 'a3000000-0000-4000-8000-000000000001';
select is((public.tables_find_guest('b3000000-0000-4000-8000-000000000001','050-111 2233')->>'id')::uuid, 'c3000000-0000-4000-8000-000000000001'::uuid, 'owner finds the guest by phone');
select is(public.tables_export_guest('b3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')->'guest'->>'email', 'dana@example.invalid', 'owner exports the guest');
select lives_ok($$select public.tables_anonymize_guest('b3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')$$, 'owner anonymizes the guest');
select is(public.tables_find_guest('b3000000-0000-4000-8000-000000000001','050-111 2233'), null, 'the phone no longer identifies anyone');
reset role;
select is((select count(*) from private.tables_privacy_log), 2::bigint, 'the export and the anonymization are both logged');
select is((select display_name from public.tables_guests where id='c3000000-0000-4000-8000-000000000001'), 'אורח/ת (נמחק)', 'name removed');
select * from finish();
rollback;
