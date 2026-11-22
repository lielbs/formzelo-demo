-- Returning guest lookup (UX audit 2026-11, A6.4): venue staff find a guest by the exact phone
-- number; other tenants, staff without the venue and anonymous callers cannot.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a4000000-0000-4000-8000-000000000001','gl-owner@example.invalid',clock_timestamp()),
 ('a4000000-0000-4000-8000-000000000002','gl-staff@example.invalid',clock_timestamp()),
 ('a4000000-0000-4000-8000-000000000003','gl-other@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('b4000000-0000-4000-8000-000000000001','gl-a','GL','active'),
 ('b4000000-0000-4000-8000-000000000002','gl-b','GL other','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','owner'),
 ('b4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','staff'),
 ('b4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000003','owner');
insert into public.tables_organization_features(organization_id,enabled) values ('b4000000-0000-4000-8000-000000000001',true);
insert into public.tables_guests(id,organization_id,display_name,phone_e164) values
 ('c4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','דנה לוי','+972501112233');

create temp table ctx(k text primary key, v text);
grant all on ctx to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000001';
insert into ctx values ('venue', public.tables_create_venue('b4000000-0000-4000-8000-000000000001','מקום בדיקה','gl-venue')->>'id');

select is(public.tables_guest_lookup((select v::uuid from ctx where k='venue'), '050-111 2233')->>'name', 'דנה לוי', 'the owner finds a returning guest by phone');
select is((public.tables_guest_lookup((select v::uuid from ctx where k='venue'), '050-111 2233')->>'visits')::int, 0, 'visits are counted at this venue');
select is(public.tables_guest_lookup((select v::uuid from ctx where k='venue'), '050-111 22'), null, 'a partial number finds nobody');
select is(public.tables_guest_lookup((select v::uuid from ctx where k='venue'), '050-999 0000'), null, 'an unknown number finds nobody');

set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_guest_lookup((select v::uuid from ctx where k='venue'), '0501112233')$$, '42501', null, 'staff not assigned to the venue cannot look guests up');
set local request.jwt.claim.sub = 'a4000000-0000-4000-8000-000000000003';
select throws_ok($$select public.tables_guest_lookup((select v::uuid from ctx where k='venue'), '0501112233')$$, '42501', null, 'another business cannot look guests up');
reset role;
select ok(not has_function_privilege('anon', 'public.tables_guest_lookup(uuid, text)', 'execute'), 'anonymous callers cannot look guests up');

select * from finish();
rollback;
