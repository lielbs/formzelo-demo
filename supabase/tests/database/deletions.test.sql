-- Deleting a process, a Tables venue and an account. Synthetic data, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a9000000-0000-4000-8000-000000000001','del-owner@example.invalid',clock_timestamp()),
 ('a9000000-0000-4000-8000-000000000002','del-staff@example.invalid',clock_timestamp()),
 ('a9000000-0000-4000-8000-000000000003','del-solo@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('b9000000-0000-4000-8000-000000000001','del-team','Del Team','active'),
 ('b9000000-0000-4000-8000-000000000002','del-solo','Del Solo','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','owner'),
 ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','staff'),
 ('b9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000003','owner');
insert into public.profiles(user_id, display_name) values ('a9000000-0000-4000-8000-000000000003','Solo');
insert into public.tables_organization_features(organization_id, enabled) values ('b9000000-0000-4000-8000-000000000001', true);

insert into public.workflows(id, organization_id, public_slug, status, draft_config, schema_version, created_by) values
 ('c9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','del-team-form','draft','{"title":"x"}',1,'a9000000-0000-4000-8000-000000000001');
insert into public.tables_venues(id, organization_id, slug, name, status, created_by) values
 ('d9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','del-venue','סניף בדיקה','draft','a9000000-0000-4000-8000-000000000001');

-- ---------- Processes ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.delete_workflow('b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'staff cannot delete a process');

set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.delete_workflow('b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001') $$,
  'the owner deletes a process');
select is((select count(*)::int from public.workflows where id = 'c9000000-0000-4000-8000-000000000001'), 0,
  'a deleted process is invisible to the workspace');
select throws_ok($$ select public.delete_workflow('b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001') $$,
  'P0002', null, 'deleting twice is refused');
reset role;
select is((select public_slug from public.workflows where id = 'c9000000-0000-4000-8000-000000000001'),
  'deleted-c9000000000040008000000000000001', 'the public link is released');
select throws_ok($$ update public.workflows set draft_config = '{"title":"y"}' where id = 'c9000000-0000-4000-8000-000000000001' $$,
  'P0002', null, 'a deleted process is frozen');

-- ---------- Venues ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select throws_ok($$ select public.tables_delete_venue('d9000000-0000-4000-8000-000000000001','שם אחר') $$,
  '22023', 'tables:confirm_mismatch', 'the venue name must be typed exactly');
reset role;
insert into public.tables_waitlist_entries(organization_id, venue_id, service_date, guest_name, party_size, source, idempotency_key)
  values ('b9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001', current_date, 'אורח', 2, 'staff', gen_random_uuid());
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select throws_ok($$ select public.tables_delete_venue('d9000000-0000-4000-8000-000000000001','סניף בדיקה') $$,
  '55000', 'tables:venue_has_guests', 'a venue with guests still waiting cannot be deleted');
reset role;
update public.tables_waitlist_entries set status = 'cancelled' where venue_id = 'd9000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.tables_delete_venue('d9000000-0000-4000-8000-000000000001',' סניף בדיקה ') $$,
  'the owner deletes the venue');
select is(jsonb_array_length(public.tables_list_venues('b9000000-0000-4000-8000-000000000001')->'venues'), 0,
  'the deleted venue leaves the list');
select throws_ok($$ select public.tables_get_venue('d9000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'and every staff command refuses it');
reset role;
select ok((select slug like 'deleted-%' and status = 'archived' from public.tables_venues where id = 'd9000000-0000-4000-8000-000000000001'),
  'its public address is released');

-- ---------- Accounts ----------
set local role authenticated;
select throws_ok($$ select public.server_prepare_account_deletion('a9000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'only the server may prepare an account deletion');
reset role;
set local role service_role;
select throws_ok($$ select public.server_prepare_account_deletion('a9000000-0000-4000-8000-000000000001') $$,
  '55000', 'team_needs_owner', 'the only owner of a team cannot leave it ownerless');
select is(public.server_prepare_account_deletion('a9000000-0000-4000-8000-000000000003')->>'closedOrganizations', '1',
  'a business run alone is closed with the account');
reset role;
select is((select status from public.organizations where id = 'b9000000-0000-4000-8000-000000000002'), 'suspended', 'closed business');
select is((select status from public.organization_memberships where user_id = 'a9000000-0000-4000-8000-000000000003'), 'suspended', 'membership ended');
select is((select display_name from public.profiles where user_id = 'a9000000-0000-4000-8000-000000000003'), 'משתמש שנמחק', 'name removed');

select * from finish();
rollback;
