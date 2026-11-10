-- Formangle Tables T1/T2: roles, draft/publish, immutability, availability, booking, idempotency,
-- combinations, cross-midnight/DST time model and the exclusion guard. Synthetic data, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a1000000-0000-4000-8000-000000000001','tb-owner@example.invalid',clock_timestamp()),
 ('a1000000-0000-4000-8000-000000000002','tb-host@example.invalid',clock_timestamp()),
 ('a1000000-0000-4000-8000-000000000003','tb-manager@example.invalid',clock_timestamp()),
 ('a1000000-0000-4000-8000-000000000004','tb-other-owner@example.invalid',clock_timestamp()),
 ('a1000000-0000-4000-8000-000000000005','tb-staff-unassigned@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('b1000000-0000-4000-8000-000000000001','tables-a','Tables A','active'),
 ('b1000000-0000-4000-8000-000000000002','tables-b','Tables B','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner'),
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','staff'),
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','staff'),
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000005','staff'),
 ('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000004','owner');

create function pg_temp.draft(p_with_t4 boolean default true) returns jsonb language sql as $$
  select jsonb_build_object(
    'schema', 1,
    'basics', jsonb_build_object('name','ביסטרו בדיקה','timezone','Asia/Jerusalem','venueType','restaurant','locale','he','phone','03-1234567'),
    'services', jsonb_build_array(
      jsonb_build_object('key','dinner','name','ערב','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','18:00','lastSeating','22:00','durationMinutes',120),
      jsonb_build_object('key','late','name','לילה','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','22:30','lastSeating','01:00','durationMinutes',60)),
    'zones', '[{"id":"c1000000-0000-4000-8000-000000000001","name":"אולם","sort":0},{"id":"c1000000-0000-4000-8000-000000000002","name":"מרפסת","sort":1}]'::jsonb,
    'tables', (select jsonb_agg(t) from jsonb_array_elements(
      '[{"id":"d1000000-0000-4000-8000-000000000001","label":"1","zoneId":"c1000000-0000-4000-8000-000000000001","minCovers":1,"maxCovers":2,"shape":"square","x":10,"y":10,"w":60,"h":60},
        {"id":"d1000000-0000-4000-8000-000000000002","label":"2","zoneId":"c1000000-0000-4000-8000-000000000001","minCovers":2,"maxCovers":4,"shape":"rect","x":100,"y":10,"w":90,"h":60},
        {"id":"d1000000-0000-4000-8000-000000000003","label":"3","zoneId":"c1000000-0000-4000-8000-000000000001","minCovers":4,"maxCovers":6,"shape":"round","x":220,"y":10,"w":80,"h":80},
        {"id":"d1000000-0000-4000-8000-000000000004","label":"4","zoneId":"c1000000-0000-4000-8000-000000000002","minCovers":1,"maxCovers":2,"shape":"round","x":10,"y":200,"w":60,"h":60}]'::jsonb) t
      where p_with_t4 or t->>'label' <> '4'),
    'combinations', '[{"id":"e1000000-0000-4000-8000-000000000001","label":"2+3","tableIds":["d1000000-0000-4000-8000-000000000002","d1000000-0000-4000-8000-000000000003"],"minCovers":7,"maxCovers":10,"priority":0}]'::jsonb,
    'policy', jsonb_build_object('slotMinutes',30,'leadMinutes',0,'horizonDays',60,'minParty',1,'maxParty',12,'bufferMinutes',15,
      'approvalMode','auto','pendingMode','unallocated','pendingHoldMinutes',15,'cancelCutoffMinutes',240,'modifyCutoffMinutes',240,
      'allowGuestModify',true,'rules','[]'::jsonb),
    'guest', jsonb_build_object('intro','ברוכים הבאים','terms','ביטול עד 4 שעות לפני'),
    'progress', jsonb_build_object('step','review'))
$$;
create temp table ctx(k text primary key, v text);
grant all on ctx to anon, authenticated;
insert into ctx values ('day', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 7)::text);

-- ---------- Flag and roles ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select throws_ok($$select public.tables_create_venue('b1000000-0000-4000-8000-000000000001','ביסטרו','bistro-test')$$, '42501', null, 'module off: owner cannot create a venue');
select is((public.tables_list_venues('b1000000-0000-4000-8000-000000000001')->>'enabled')::boolean, false, 'list reports module disabled');
reset role;
insert into public.tables_organization_features(organization_id, enabled) values
 ('b1000000-0000-4000-8000-000000000001', true), ('b1000000-0000-4000-8000-000000000002', true);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b1000000-0000-4000-8000-000000000001','ביסטרו','bistro-test')->>'id';
select throws_ok($$select public.tables_create_venue('b1000000-0000-4000-8000-000000000001','שני','bistro-test')$$, '23505', null, 'venue address is unique');
select throws_ok($$select public.tables_create_venue('b1000000-0000-4000-8000-000000000001','שני','x','Mars/Base')$$, '22023', null, 'invalid address/timezone rejected');
select is(public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'role', 'owner', 'owner has implicit venue access');
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a1000000-0000-4000-8000-000000000002','host')$$, 'owner assigns a host');
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a1000000-0000-4000-8000-000000000003','manager')$$, 'owner assigns a manager');
select throws_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a1000000-0000-4000-8000-000000000004','host')$$, '22023', null, 'only members of the organization can be assigned');

-- Draft: stale save is a conflict.
select is((public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(), 0)->>'lockVersion')::bigint, 1::bigint, 'owner saves the draft');
select throws_ok($$select public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(), 0)$$, '40001', null, 'stale draft save is a conflict');
select is(jsonb_array_length(public.tables_get_venue((select v::uuid from ctx where k='venue'))->'problems'), 0, 'draft has no blocking problems');

-- Host: reads, cannot configure, sees no draft.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select is(public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'role', 'host', 'host sees the venue');
select ok(public.tables_get_venue((select v::uuid from ctx where k='venue'))->'draft' = 'null'::jsonb, 'host does not receive the draft');
select throws_ok($$select public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(), 1)$$, '42501', null, 'host cannot edit configuration');
select throws_ok($$select public.tables_publish_venue((select v::uuid from ctx where k='venue'), 1)$$, '42501', null, 'host cannot publish');
-- Unassigned staff member: nothing.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000005';
select throws_ok($$select public.tables_get_venue((select v::uuid from ctx where k='venue'))$$, '42501', null, 'unassigned staff has no venue access');
select is((select count(*) from public.tables_venues), 0::bigint, 'unassigned staff reads no venue rows');
-- Other tenant.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000004';
select throws_ok($$select public.tables_get_venue((select v::uuid from ctx where k='venue'))$$, '42501', null, 'other tenant owner is denied');
select is((select count(*) from public.tables_venues), 0::bigint, 'other tenant reads no venue rows');
select is((select count(*) from public.tables_physical_tables), 0::bigint, 'other tenant reads no tables');

-- Manager publishes.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select throws_ok($$select public.tables_publish_venue((select v::uuid from ctx where k='venue'), 0)$$, '40001', null, 'publish with stale version is a conflict');
select is((public.tables_publish_venue((select v::uuid from ctx where k='venue'), 1)->>'versionNumber')::int, 1, 'manager publishes version 1');
select is((select count(*) from public.tables_physical_tables where venue_id=(select v::uuid from ctx where k='venue') and active), 4::bigint, 'four physical tables are active');
select is((select count(*) from public.tables_combination_members), 2::bigint, 'combination has two members');
select is((public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'hasUnpublishedChanges')::boolean, false, 'published draft has no pending changes');
reset role;
select throws_ok($$update public.tables_venue_versions set snapshot='{}'$$, '55000', null, 'published versions are immutable');
select throws_ok($$delete from public.tables_layout_table_snapshots$$, '55000', null, 'layout snapshots are immutable');

-- Anonymous: no direct reads.
set local role anon;
select throws_ok($$select * from public.tables_venues$$, '42501', null, 'anon cannot read venues');
select throws_ok($$select * from public.tables_reservations$$, '42501', null, 'anon cannot read reservations');
select throws_ok($$select * from public.tables_guests$$, '42501', null, 'anon cannot read guests');
select throws_ok($$select public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),'{}',gen_random_uuid())$$, '42501', null, 'anon cannot call staff commands');
select ok(public.tables_public_venue('bistro-test')->>'name' = 'ביסטרו בדיקה', 'public venue projection by slug');
select ok(public.tables_public_venue('nope') is null, 'unknown slug reveals nothing');
select ok(not (public.tables_public_venue('bistro-test') ? 'tables'), 'public projection has no tables');

-- ---------- Availability and booking ----------
select is(public.tables_public_availability('bistro-test',(select v::date from ctx where k='day'),2,null,'f1000000-0000-4000-8000-000000000001')->>'state', 'open', 'availability is open');
select is(jsonb_array_length(public.tables_public_availability('bistro-test',(select v::date from ctx where k='day'),2,null,'f1000000-0000-4000-8000-000000000001')->'services'->0->'slots'), 9, 'dinner has nine half-hour slots 18:00–22:00');
select is(public.tables_public_availability('bistro-test',(select v::date from ctx where k='day'),50,null,'f1000000-0000-4000-8000-000000000001')->>'state', 'party_size', 'party above maximum is refused');

create function pg_temp.book(p_key text, p_party int, p_time text, p_service text default 'dinner', p_phone text default '050-1234567', p_client text default 'f1000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
  select public.tables_public_book('bistro-test', jsonb_build_object('serviceKey',p_service,'date',(select v from ctx where k='day'),'time',p_time,'party',p_party,
    'name','אורחת בדיקה','phone',p_phone,'termsAccepted',true), p_key::uuid, p_client::uuid)
$$;
grant execute on function pg_temp.book(text,int,text,text,text,text) to anon;
insert into ctx select 'b1', pg_temp.book('f2000000-0000-4000-8000-000000000001', 2, '19:00')::text;
select is((select v::jsonb->>'result' from ctx where k='b1'), 'confirmed', 'guest booking is confirmed');
select ok((select v::jsonb->>'token' from ctx where k='b1') ~ '^[A-Za-z0-9_-]{43}$', 'a 256-bit manage token is returned');
select ok((select v::jsonb->>'reference' from ctx where k='b1') ~ '^[A-Z2-9]{6}$', 'a short reference is returned');
select is((pg_temp.book('f2000000-0000-4000-8000-000000000001', 2, '19:00'))->>'reference', (select v::jsonb->>'reference' from ctx where k='b1'), 'idempotent retry returns the same reservation');
select throws_ok($$select pg_temp.book('f2000000-0000-4000-8000-000000000001', 3, '19:00')$$, '22023', 'tables:idempotency_conflict', 'same key with a different payload fails');
select throws_ok($$select pg_temp.book('f2000000-0000-4000-8000-000000000001', 2, '19:00', 'dinner', '050-1234567', 'f1000000-0000-4000-8000-000000000099')$$, '22023', 'tables:idempotency_conflict', 'replay from another browser gets no new link');
reset role;
select is((select count(*) from public.tables_reservations), 1::bigint, 'exactly one reservation after retries');
select is((select count(*) from public.tables_allocations), 1::bigint, 'exactly one allocation after retries');
select is((select pt.label from public.tables_allocations a join public.tables_physical_tables pt on pt.id=a.physical_table_id), '1', 'party of two gets the smallest fitting table (1)');
select is((select count(*) from private.tables_access_tokens where token_hash = (select v::jsonb->>'token' from ctx where k='b1')), 0::bigint, 'raw tokens are not stored');
select is((select count(*) from public.tables_reservation_events), 1::bigint, 'creation event recorded');
select is((select revision from public.tables_shift_revisions), 1::bigint, 'shift revision bumped');

set local role anon;
-- Combination: party of 8 occupies tables 2 and 3 together.
insert into ctx select 'b2', pg_temp.book('f2000000-0000-4000-8000-000000000002', 8, '19:00', 'dinner', '052-7654321')::text;
select is((select v::jsonb->>'result' from ctx where k='b2'), 'confirmed', 'party of 8 is confirmed on a combination');
reset role;
select is((select count(*) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.party_size=8), 2::bigint, 'combination allocates both member tables');
select is((select count(distinct group_id) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.party_size=8), 1::bigint, 'one allocation group');
set local role anon;
-- At 19:00 only table 4 is left (2 seats). A party of 4 cannot be seated → alternatives offered.
select is((pg_temp.book('f2000000-0000-4000-8000-000000000003', 4, '19:00', 'dinner', '053-1111111'))->>'result', 'unavailable', 'no table for 4 at 19:00');
select ok(jsonb_array_length((pg_temp.book('f2000000-0000-4000-8000-000000000004', 4, '19:00', 'dinner', '053-1111112'))->'alternatives') > 0, 'alternatives are offered');
select ok(not exists (select 1 from jsonb_array_elements(public.tables_public_availability('bistro-test',(select v::date from ctx where k='day'),4,null,'f1000000-0000-4000-8000-000000000001')->'services'->0->'slots') s where s->>'time' in ('18:00','18:30','19:00','19:30','20:00','20:30')), 'overlapping slots for 4 disappear (duration+buffer)');
select ok(exists (select 1 from jsonb_array_elements(public.tables_public_availability('bistro-test',(select v::date from ctx where k='day'),4,null,'f1000000-0000-4000-8000-000000000001')->'services'->0->'slots') s where s->>'time' = '21:30'), 'half-open range: 21:30 is free after 19:00+120+15');
select throws_ok($$select public.tables_public_book('bistro-test','{"serviceKey":"dinner","date":"2000-01-01","time":"19:00","party":2,"name":"x","phone":"0501234567","termsAccepted":true}',gen_random_uuid(),gen_random_uuid())$$, '22023', 'tables:too_soon', 'past date refused');
select throws_ok($$select public.tables_public_book('bistro-test','{"serviceKey":"dinner","date":"2099-01-01","time":"19:00","party":2,"name":"x","phone":"0501234567"}',gen_random_uuid(),gen_random_uuid())$$, '22023', 'tables:terms_required', 'terms must be accepted');
select throws_ok($$select public.tables_public_book('bistro-test',jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,'name','x','phone','12','termsAccepted',true),gen_random_uuid(),gen_random_uuid())$$, '22023', 'tables:phone_invalid', 'invalid phone refused');
select is((pg_temp.book('f2000000-0000-4000-8000-000000000005', 2, '19:10'))->>'reason', 'invalid_time', 'off-grid time refused');

-- Cross-midnight: 00:30 of the late service belongs to the starting service date.
insert into ctx select 'b3', pg_temp.book('f2000000-0000-4000-8000-000000000006', 2, '00:30', 'late', '054-2222222')::text;
reset role;
select is((select service_date from public.tables_reservations where local_time='00:30'), (select v::date from ctx where k='day'), 'cross-midnight booking keeps its service date');
select is((select (starts_at at time zone 'Asia/Jerusalem')::date from public.tables_reservations where local_time='00:30'), (select v::date + 1 from ctx where k='day'), 'cross-midnight instant is on the next calendar day');

-- Exclusion constraint is the final guard, even for a privileged writer.
select throws_ok($$insert into public.tables_allocations(organization_id,venue_id,physical_table_id,group_id,reservation_id,occupied_during,state)
  select organization_id,venue_id,physical_table_id,gen_random_uuid(),reservation_id,occupied_during,'confirmed' from public.tables_allocations limit 1$$,
  '23P01', null, 'overlapping active allocation on one table is impossible');
select lives_ok($$insert into public.tables_allocations(organization_id,venue_id,physical_table_id,group_id,reservation_id,occupied_during,state)
  select organization_id,venue_id,physical_table_id,gen_random_uuid(),reservation_id,tstzrange(upper(occupied_during), upper(occupied_during)+interval '1 hour'),'confirmed' from public.tables_allocations where state='confirmed' limit 1$$,
  'back-to-back allocation (half-open range) is allowed');

-- DST: a missing local time is rejected; America/New_York uses a different rule.
select is(private.tables_instant('Asia/Jerusalem','2027-03-26','02:30','00:00'), null, 'Israel spring-forward gap time does not exist');
select is(private.tables_instant('Asia/Jerusalem','2027-03-26','03:30','00:00'), '2027-03-26 00:30:00+00'::timestamptz, 'time after the gap resolves to IDT');
select is(private.tables_instant('America/New_York','2027-03-14','02:30','00:00'), null, 'New York gap time does not exist');
select is(private.tables_instant('Asia/Jerusalem','2027-10-31','01:30','00:00'), '2027-10-30 23:30:00+00'::timestamptz, 'ambiguous fall-back time resolves to the later (standard-time) instant');
select is(private.tables_instant('Asia/Jerusalem','2027-07-01','23:30','22:00'), '2027-07-01 20:30:00+00'::timestamptz, 'summer evening converts with +03:00');

-- Phone normalization.
select is(private.tables_normalize_phone('050-123 4567'), '+972501234567', 'Israeli mobile → E.164');
select is(private.tables_normalize_phone('+44 20 7946 0958'), '+442079460958', 'international number kept');
select is(private.tables_normalize_phone('abc'), null, 'garbage is not a phone');

-- Staff: walk-in seated now; host cannot override.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select is(public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','walk_in','date',(clock_timestamp() at time zone 'Asia/Jerusalem')::date,'party',2,'name','מזדמן','seatNow',true,'serviceKey','dinner'),
  'f3000000-0000-4000-8000-000000000001')->>'status', 'seated', 'walk-in is seated immediately');
select throws_ok($$select public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','phone','date',(select v from ctx where k='day'),'time','19:00','party',2,'name','x','overrideReason','VIP'),gen_random_uuid())$$,
  '42501', 'tables:override_requires_manager', 'host cannot override rules');
select is(public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','phone','serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,'name','טלפוני','phone','0509999999'),
  'f3000000-0000-4000-8000-000000000002')->>'status', 'confirmed', 'phone booking takes the last table at 19:00');
select throws_ok($$select public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','phone','serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,'name','x'),gen_random_uuid())$$,
  'P0001', 'tables:no_table', 'no double booking from the staff path either');
-- Manager may book an explicit unassigned overflow with a reason.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select is(public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','phone','serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,'name','חריגה','overrideReason','בעלים ביקשו'),
  'f3000000-0000-4000-8000-000000000003')->>'tableIds', null, 'manager override creates an unassigned booking, never a second allocation');

-- Revoked host loses access on the next call.
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a1000000-0000-4000-8000-000000000002',null)$$, 'owner revokes the host');
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_get_venue((select v::uuid from ctx where k='venue'))$$, '42501', null, 'revoked host is denied immediately');
reset role;
update public.organization_memberships set status='suspended' where user_id='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select throws_ok($$select public.tables_get_venue((select v::uuid from ctx where k='venue'))$$, '42501', null, 'suspended membership removes venue access');
reset role;

-- Republish without table 4: archived, history keeps it.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select lives_ok($$select public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(false), (public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'lockVersion')::bigint)$$, 'owner removes table 4 in the draft');
select is((public.tables_publish_venue((select v::uuid from ctx where k='venue'), (public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'lockVersion')::bigint)->>'versionNumber')::int, 2, 'version 2 published');
reset role;
select is((select archived_at is not null from public.tables_physical_tables where id='d1000000-0000-4000-8000-000000000004'), true, 'removed table is archived, not deleted');
select is((select count(*) from public.tables_layout_table_snapshots s join public.tables_venue_versions v on v.id=s.version_id where v.version_number=1), 4::bigint, 'version 1 layout still has four tables');
-- Feature off is a kill switch for the public page too.
update public.tables_organization_features set enabled=false where organization_id='b1000000-0000-4000-8000-000000000001';
set local role anon;
select ok(public.tables_public_venue('bistro-test') is null, 'module off hides the public page');
reset role;

select * from finish();
rollback;
