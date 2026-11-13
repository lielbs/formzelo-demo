-- Staff access scopes: everything, Formangle only, Tables only. Synthetic data, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('aa000000-0000-4000-8000-000000000001','acc-owner@example.invalid',clock_timestamp()),
 ('aa000000-0000-4000-8000-000000000002','acc-tables@example.invalid',clock_timestamp()),
 ('aa000000-0000-4000-8000-000000000003','acc-forms@example.invalid',clock_timestamp()),
 ('aa000000-0000-4000-8000-000000000004','acc-new@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('ba000000-0000-4000-8000-000000000001','acc-org','Acc Org','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','owner'),
 ('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','staff'),
 ('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','staff');
insert into public.tables_organization_features(organization_id, enabled) values ('ba000000-0000-4000-8000-000000000001', true);
insert into public.workflows(id, organization_id, public_slug, status, draft_config, schema_version, created_by) values
 ('ca000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','acc-form','draft','{"title":"x"}',1,'aa000000-0000-4000-8000-000000000001');
insert into public.tables_venues(id, organization_id, slug, name, status, created_by) values
 ('da000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','acc-venue','מקום','draft','aa000000-0000-4000-8000-000000000001');
insert into public.tables_venue_staff(organization_id, venue_id, user_id, role) values
 ('ba000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','host'),
 ('ba000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','host');

set local role authenticated;
set local request.jwt.claim.sub = 'aa000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.set_member_access('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','tables') $$,
  '42501', null, 'staff cannot change access');
set local request.jwt.claim.sub = 'aa000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.set_member_access('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','tables') $$, 'owner: Tables only');
select lives_ok($$ select public.set_member_access('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','formangle') $$, 'owner: Formangle only');
select throws_ok($$ select public.set_member_access('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','tables') $$,
  'P0002', null, 'an owner always keeps full access');

set local request.jwt.claim.sub = 'aa000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.workflows), 0, 'Tables-only staff see no processes');
select throws_ok($$ select public.list_team('ba000000-0000-4000-8000-000000000001') $$, '42501', null, 'nor the Formangle team screen');
select is(jsonb_array_length(public.tables_list_venues('ba000000-0000-4000-8000-000000000001')->'venues'), 1, 'but do see their venue');
select is(private.tables_role('da000000-0000-4000-8000-000000000001'), 'host', 'and work the shift');
select is((select access from public.my_access()), 'tables', 'and the app knows their access');

set local request.jwt.claim.sub = 'aa000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.workflows), 1, 'Formangle-only staff see processes');
select is(private.tables_role('da000000-0000-4000-8000-000000000001'), null, 'but have no Tables role');
select is(jsonb_array_length(public.tables_list_venues('ba000000-0000-4000-8000-000000000001')->'venues'), 0, 'and no venues');

reset role;
insert into private.owner_invitations(id, organization_id, email, token_hash, expires_at, created_by, role)
  values ('ea000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','acc-new@example.invalid',
          extensions.digest('acc-token','sha256'), now() + interval '1 day','aa000000-0000-4000-8000-000000000001','staff');
set local role authenticated;
set local request.jwt.claim.sub = 'aa000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.set_invitation_access('ba000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','tables') $$, 'owner sets access on a pending invitation');
select is((public.list_team('ba000000-0000-4000-8000-000000000001')->'invitations'->0->>'access'), 'tables', 'the team list shows it');
reset role;
insert into public.organization_memberships(organization_id,user_id,role) values ('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000004','staff');
select is((select access from public.organization_memberships where user_id = 'aa000000-0000-4000-8000-000000000004'), 'tables', 'joining from the invitation keeps that access');

select * from finish();
rollback;
