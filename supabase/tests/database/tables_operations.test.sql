-- Formangle Tables T3–T7: manage links, modify/cancel cutoffs, approval and holds, host
-- transitions and conflicts, moves, notes/PII, waitlist offers, menus, analytics, pacing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a2000000-0000-4000-8000-000000000001','op-owner@example.invalid',clock_timestamp()),
 ('a2000000-0000-4000-8000-000000000002','op-host@example.invalid',clock_timestamp()),
 ('a2000000-0000-4000-8000-000000000003','op-viewer@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('b2000000-0000-4000-8000-000000000001','ops-a','Ops A','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','owner'),
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','staff'),
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','staff');
insert into public.tables_organization_features(organization_id, enabled) values ('b2000000-0000-4000-8000-000000000001', true);

create function pg_temp.draft(p_policy jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'schema', 1,
    'basics', jsonb_build_object('name','מסעדת תפעול','timezone','Asia/Jerusalem'),
    'services', jsonb_build_array(jsonb_build_object('key','dinner','name','ערב','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','18:00','lastSeating','22:00','durationMinutes',90)),
    'zones', '[{"id":"c2000000-0000-4000-8000-000000000001","name":"אולם"}]'::jsonb,
    'tables', '[{"id":"d2000000-0000-4000-8000-000000000001","label":"10","zoneId":"c2000000-0000-4000-8000-000000000001","minCovers":1,"maxCovers":2,"shape":"square","x":0,"y":0,"w":60,"h":60},
                {"id":"d2000000-0000-4000-8000-000000000002","label":"11","zoneId":"c2000000-0000-4000-8000-000000000001","minCovers":1,"maxCovers":4,"shape":"square","x":80,"y":0,"w":60,"h":60},
                {"id":"d2000000-0000-4000-8000-000000000003","label":"12","zoneId":"c2000000-0000-4000-8000-000000000001","minCovers":4,"maxCovers":8,"shape":"rect","x":160,"y":0,"w":120,"h":60}]'::jsonb,
    'combinations', '[]'::jsonb,
    'policy', jsonb_build_object('slotMinutes',30,'leadMinutes',0,'horizonDays',30,'minParty',1,'maxParty',8,'bufferMinutes',0,
      'approvalMode','auto','pendingMode','unallocated','pendingHoldMinutes',15,'cancelCutoffMinutes',240,'modifyCutoffMinutes',240,
      'allowGuestModify',true,'rules','[]'::jsonb,'waitlist',jsonb_build_object('publicEnabled',true,'offerMinutes',10)) || p_policy,
    'guest', jsonb_build_object('terms','תנאים'))
$$;
create temp table ctx(k text primary key, v text);
grant all on ctx to anon, authenticated;
insert into ctx values ('day', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 3)::text),
  ('today', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date)::text);

create function pg_temp.publish(p_policy jsonb default '{}') returns void language plpgsql as $$
declare vid uuid := (select v::uuid from ctx where k='venue'); lv bigint;
begin
  lv := (public.tables_get_venue(vid)->>'lockVersion')::bigint;
  lv := (public.tables_save_draft(vid, pg_temp.draft(p_policy), lv)->>'lockVersion')::bigint;
  perform public.tables_publish_venue(vid, lv);
end;
$$;
create function pg_temp.book(p_key text, p_party int, p_time text, p_phone text, p_client text default null) returns jsonb language sql as $$
  select public.tables_public_book('ops-venue', jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time',p_time,'party',p_party,
    'name','אורח','phone',p_phone,'email','guest@example.invalid','termsAccepted',true), p_key::uuid, coalesce(p_client, p_key)::uuid)
$$;
grant execute on function pg_temp.book(text,int,text,text,text) to anon;
-- Test-only readers (security definer): authenticated callers have no direct table grants by design.
create function pg_temp.res(p_ref text) returns public.tables_reservations language sql security definer as $$ select * from public.tables_reservations where reference = p_ref $$;
create function pg_temp.lv(p_id uuid) returns bigint language sql security definer as $$ select lock_version from public.tables_reservations where id = p_id $$;
create function pg_temp.wlv(p_id uuid) returns bigint language sql security definer as $$ select lock_version from public.tables_waitlist_entries where id = p_id $$;
create function pg_temp.ref_of(p_party int, p_time text) returns text language sql security definer as $$ select reference from public.tables_reservations where party_size = p_party and local_time = p_time and status = 'confirmed' $$;
create function pg_temp.status_of(p_id uuid) returns text language sql security definer as $$ select status from public.tables_reservations where id = p_id $$;
grant execute on function pg_temp.status_of(uuid) to authenticated, anon;
grant execute on function pg_temp.res(text), pg_temp.lv(uuid), pg_temp.wlv(uuid), pg_temp.ref_of(int,text) to authenticated, anon;

set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b2000000-0000-4000-8000-000000000001','מסעדת תפעול','ops-venue')->>'id';
select pg_temp.publish();
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a2000000-0000-4000-8000-000000000002','host')$$, 'host assigned');
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a2000000-0000-4000-8000-000000000003','viewer')$$, 'viewer assigned');
reset role;

-- ---------- Manage link ----------
set local role anon;
insert into ctx select 'g1', pg_temp.book('f9100000-0000-4000-8000-000000000001', 2, '19:00', '050-1000001')::text;
select is(public.tables_public_manage((select v::jsonb->>'token' from ctx where k='g1'),'f9000000-0000-4000-8000-000000000001')->>'status', 'confirmed', 'manage link opens the reservation');
select ok((public.tables_public_manage((select v::jsonb->>'token' from ctx where k='g1'),'f9000000-0000-4000-8000-000000000001')->>'canCancel')::boolean, 'cancellation allowed before the cutoff');
select ok(not (public.tables_public_manage((select v::jsonb->>'token' from ctx where k='g1'),'f9000000-0000-4000-8000-000000000001') ? 'guestPhone'), 'manage page does not echo the phone');
select is(public.tables_public_manage('A' || substr((select v::jsonb->>'token' from ctx where k='g1'),2),'f9000000-0000-4000-8000-000000000001'), null, 'altered token reveals nothing');
select is(public.tables_public_manage('short','f9000000-0000-4000-8000-000000000001'), null, 'malformed token reveals nothing');
select throws_ok($$select public.tables_public_cancel('A' || substr((select v::jsonb->>'token' from ctx where k='g1'),2),'f9000000-0000-4000-8000-000000000001')$$, 'P0002', 'tables:link_unavailable', 'wrong token cannot cancel');

-- Modify: 19:00 → 20:00 atomically.
select is(public.tables_public_modify((select v::jsonb->>'token' from ctx where k='g1'),
  jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','20:00','party',2), 0, 'f9000000-0000-4000-8000-000000000001')->>'result', 'modified', 'guest moves to 20:00');
select throws_ok($$select public.tables_public_modify((select v::jsonb->>'token' from ctx where k='g1'),
  jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','21:00','party',2), 0, 'f9000000-0000-4000-8000-000000000001')$$,
  '40001', 'tables:stale', 'modify with a stale version is a conflict');
reset role;
select is((select local_time from public.tables_reservations where reference=(select v::jsonb->>'reference' from ctx where k='g1')), '20:00', 'time changed');
select is((select count(*) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='g1') and a.state='confirmed'), 1::bigint, 'one active allocation after modify');
-- Fill 20:00 for a party of 8 is impossible when table 12 is busy: book a party of 6 on 12 at 20:00 first.
set local role anon;
select is(pg_temp.book('f9100000-0000-4000-8000-000000000002', 6, '20:00', '050-1000002')->>'result', 'confirmed', 'party of 6 takes table 12 at 20:00');
select is(public.tables_public_modify((select v::jsonb->>'token' from ctx where k='g1'),
  jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','20:00','party',7), 1, 'f9000000-0000-4000-8000-000000000001')->>'result', 'unavailable', 'enlarging to 7 at 20:00 is not possible');
reset role;
select is((select party_size from public.tables_reservations where reference=(select v::jsonb->>'reference' from ctx where k='g1')), 2, 'failed modification keeps the original party');
select is((select count(*) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='g1') and a.state='confirmed'), 1::bigint, 'failed modification keeps the original table');
-- Cancel.
set local role anon;
select is(public.tables_public_cancel((select v::jsonb->>'token' from ctx where k='g1'),'f9000000-0000-4000-8000-000000000001')->>'status', 'cancelled', 'guest cancels');
select is(public.tables_public_cancel((select v::jsonb->>'token' from ctx where k='g1'),'f9000000-0000-4000-8000-000000000001')->>'status', 'cancelled', 'second cancel is idempotent');
reset role;
select is((select count(*) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='g1') and a.state in ('held','confirmed','seated')), 0::bigint, 'cancellation releases the table in the same transaction');
update private.tables_access_tokens set revoked_at = clock_timestamp() where reservation_id = (select id from public.tables_reservations where reference=(select v::jsonb->>'reference' from ctx where k='g1'));
set local role anon;
select is(public.tables_public_manage((select v::jsonb->>'token' from ctx where k='g1'),'f9000000-0000-4000-8000-000000000001'), null, 'revoked link reveals nothing');
reset role;

-- Cutoff from the booked policy version: 7-day cutoff means a booking 3 days out cannot be cancelled.
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.publish('{"cancelCutoffMinutes":10080,"modifyCutoffMinutes":10080}');
reset role;
set local role anon;
insert into ctx select 'g2', pg_temp.book('f9100000-0000-4000-8000-000000000003', 2, '18:00', '050-1000003')::text;
select ok(not (public.tables_public_manage((select v::jsonb->>'token' from ctx where k='g2'),'f9000000-0000-4000-8000-000000000001')->>'canCancel')::boolean, 'cutoff passed: cancel not offered');
select throws_ok($$select public.tables_public_cancel((select v::jsonb->>'token' from ctx where k='g2'),'f9000000-0000-4000-8000-000000000001')$$, 'P0001', 'tables:cutoff_passed', 'server refuses cancellation after the cutoff');
select throws_ok($$select public.tables_public_modify((select v::jsonb->>'token' from ctx where k='g2'), jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','18:30','party',2), 0, 'f9000000-0000-4000-8000-000000000001')$$,
  'P0001', 'tables:cutoff_passed', 'server refuses modification after the cutoff');
reset role;

-- ---------- Conditional approval, unallocated pending ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.publish('{"approvalMode":"conditional","rules":[{"id":"big","priority":1,"when":{"partyAtLeast":5},"then":"require_manual"},{"id":"small","priority":2,"when":{"partyAtMost":4},"then":"auto"}]}');
reset role;
set local role anon;
insert into ctx select 'p1', pg_temp.book('f9100000-0000-4000-8000-000000000004', 5, '21:30', '050-1000004')::text;
select is((select v::jsonb->>'result' from ctx where k='p1'), 'pending', 'party of 5 requires approval');
select is(pg_temp.book('f9100000-0000-4000-8000-000000000005', 2, '21:30', '050-1000005')->>'result', 'confirmed', 'party of 2 is automatic');
reset role;
select is((select approval_rule from public.tables_reservations where reference=(select v::jsonb->>'reference' from ctx where k='p1')), 'big', 'deciding rule recorded');
select is((select count(*) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='p1')), 0::bigint, 'unallocated pending request holds no table');
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000003';
select throws_ok($$select public.tables_decide_pending((select id from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))),'approve',0)$$, '42501', null, 'viewer cannot approve');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select is(public.tables_decide_pending((select id from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))),'approve',0)->>'status', 'confirmed', 'host approves; tables allocated at approval');
select is(public.tables_decide_pending((select id from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))),'approve',0)->>'replayed', 'true', 'repeated approval is idempotent');
reset role;
select is((select count(*) from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='p1') and a.state='confirmed'), 1::bigint, 'approved request has a table');

-- ---------- Hold mode and expiry reclamation ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.publish('{"approvalMode":"manual","pendingMode":"hold","pendingHoldMinutes":15}');
reset role;
set local role anon;
insert into ctx select 'h1', pg_temp.book('f9100000-0000-4000-8000-000000000006', 7, '18:30', '050-1000006')::text;
select is((select v::jsonb->>'result' from ctx where k='h1'), 'pending', 'manual mode: pending');
reset role;
select is((select a.state from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='h1')), 'held', 'live hold blocks the table');
set local role anon;
select is(pg_temp.book('f9100000-0000-4000-8000-000000000007', 7, '18:30', '050-1000007')->>'result', 'unavailable', 'a live hold blocks a second large party');
reset role;
update public.tables_reservations set pending_expires_at = clock_timestamp() - interval '1 minute' where reference=(select v::jsonb->>'reference' from ctx where k='h1');
update public.tables_allocations set expires_at = clock_timestamp() - interval '1 minute' where state='held';
set local role anon;
select is(pg_temp.book('f9100000-0000-4000-8000-000000000008', 7, '18:30', '050-1000008')->>'result', 'pending', 'expired hold is reclaimed for the next guest');
reset role;
select is((select status from public.tables_reservations where reference=(select v::jsonb->>'reference' from ctx where k='h1')), 'expired', 'expired request is marked expired in the same transaction');
select is((select count(*) from public.tables_reservation_events e join public.tables_reservations r on r.id=e.reservation_id where r.reference=(select v::jsonb->>'reference' from ctx where k='h1') and e.event_type='expired'), 1::bigint, 'expiry audited once');

-- ---------- Host operations ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.publish('{}');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
insert into ctx select 'w1', public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','walk_in','serviceKey','dinner','date',(select v from ctx where k='today'),'party',2,'name','מזדמן','seatNow',true,'tableIds',jsonb_build_array('d2000000-0000-4000-8000-000000000001')),
  'f9200000-0000-4000-8000-000000000001')->>'reservationId';
select is(pg_temp.status_of((select v::uuid from ctx where k='w1')), 'seated', 'walk-in seated on table 10');
select throws_ok($$select public.tables_staff_create_reservation((select v::uuid from ctx where k='venue'),
  jsonb_build_object('source','walk_in','serviceKey','dinner','date',(select v from ctx where k='today'),'party',2,'name','שני','seatNow',true,'tableIds',jsonb_build_array('d2000000-0000-4000-8000-000000000001')),
  gen_random_uuid())$$, 'P0001', 'tables:table_conflict', 'a second walk-in cannot be seated on an occupied table');
select throws_ok($$select public.tables_transition((select v::uuid from ctx where k='w1'),'complete',99)$$, '40001', 'tables:stale', 'stale host action is a conflict');
select is(public.tables_transition((select v::uuid from ctx where k='w1'),'complete',pg_temp.lv((select v::uuid from ctx where k='w1')))->>'status', 'completed', 'host completes the visit');
select is(public.tables_transition((select v::uuid from ctx where k='w1'),'undo',pg_temp.lv((select v::uuid from ctx where k='w1')))->>'status', 'seated', 'undo re-seats on the same table');
select is(public.tables_transition((select v::uuid from ctx where k='w1'),'complete',pg_temp.lv((select v::uuid from ctx where k='w1')))->>'status', 'completed', 'complete again');
-- A future booking cannot be marked no-show or seated hours early.
select throws_ok($$select public.tables_transition((select id from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))),'no_show',(select lock_version from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))))$$,
  'P0001', 'tables:too_early', 'no-show before the start time is refused');
select throws_ok($$select public.tables_transition((select id from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))),'seat',(select lock_version from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))))$$,
  'P0001', 'tables:too_early', 'seating days early is refused');
-- Move: to a free table works; to an occupied table conflicts and keeps the original.
select is(public.tables_move((select id from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))), array['d2000000-0000-4000-8000-000000000003'::uuid],
  (select lock_version from pg_temp.res((select v::jsonb->>'reference' from ctx where k='p1'))))->>'status', 'confirmed', 'host moves the party of 5 to table 12');
insert into ctx select 'p2', pg_temp.ref_of(2, '21:30');
select throws_ok($$select public.tables_move((select id from pg_temp.res((select v from ctx where k='p2'))), array['d2000000-0000-4000-8000-000000000003'::uuid],
  (select lock_version from pg_temp.res((select v from ctx where k='p2'))))$$, 'P0001', 'tables:table_conflict', 'move onto an occupied table is refused');
reset role;
select is((select count(*) from public.tables_allocations a where a.reservation_id=(select id from pg_temp.res((select v from ctx where k='p2'))) and a.state='confirmed'), 1::bigint, 'refused move keeps the original allocation');
-- Viewer cannot act.
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000003';
select throws_ok($$select public.tables_transition((select id from pg_temp.res((select v from ctx where k='p2'))),'arrive',0)$$, '42501', null, 'viewer cannot change reservations');
select ok((public.tables_shift((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='day'))->'reservations'->0->>'guestPhone') is null, 'viewer sees no phone numbers');

-- Notes and PII boundary.
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select lives_ok($$select public.tables_add_note((select id from pg_temp.res((select v from ctx where k='p2'))),'מעדיפים פינה שקטה','host')$$, 'host adds a host note');
select throws_ok($$select public.tables_add_note((select id from pg_temp.res((select v from ctx where k='p2'))),'רגיש','manager')$$, '42501', null, 'host cannot write a manager note');
select ok((public.tables_shift((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='day'))->'reservations'->0->>'guestPhone') is not null, 'host sees phone numbers for calling');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select lives_ok($$select public.tables_add_note((select id from pg_temp.res((select v from ctx where k='p2'))),'הערת מנהל','manager')$$, 'owner adds a manager note');
select is(public.tables_reservation_detail((select id from pg_temp.res((select v from ctx where k='p2'))))->>'guestEmail', 'guest@example.invalid', 'owner sees email');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select is(jsonb_array_length(public.tables_reservation_detail((select id from pg_temp.res((select v from ctx where k='p2'))))->'notes'), 1, 'host sees only host notes');
select ok(public.tables_reservation_detail((select id from pg_temp.res((select v from ctx where k='p2'))))->'guestEmail' = 'null'::jsonb, 'host does not see email');
select ok(public.tables_reservation_detail((select id from pg_temp.res((select v from ctx where k='p2'))))->'history' = 'null'::jsonb, 'host does not see visit history');
reset role;
select throws_ok($$update public.tables_notes set body='x'$$, '55000', null, 'notes are immutable');

-- Table state.
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select lives_ok($$select public.tables_set_table_state((select v::uuid from ctx where k='venue'),'d2000000-0000-4000-8000-000000000002','unavailable','רגל שבורה',(select v::date from ctx where k='today'))$$, 'host marks table 11 unavailable');
reset role;
set local role anon;
select ok(not exists (select 1 from jsonb_array_elements(public.tables_public_availability('ops-venue',(select v::date from ctx where k='day'),3,null,'f9000000-0000-4000-8000-000000000002')->'services'->0->'slots') s where s->>'time'='18:00'), 'unavailable table is not offered (party of 3 needs table 11)');
reset role;
set local role authenticated;
select lives_ok($$select public.tables_set_table_state((select v::uuid from ctx where k='venue'),'d2000000-0000-4000-8000-000000000002','ready',null,(select v::date from ctx where k='today'))$$, 'table 11 ready again');

-- ---------- Waitlist ----------
insert into ctx select 'wl1', public.tables_waitlist_add((select v::uuid from ctx where k='venue'), '{"name":"משפחת כהן","phone":"052-3000001","party":3}', 'f9300000-0000-4000-8000-000000000001')->>'id';
select throws_ok($$select public.tables_waitlist_add((select v::uuid from ctx where k='venue'), '{"name":"שוב","phone":"052-3000001","party":2}', gen_random_uuid())$$, 'P0001', 'tables:already_waiting', 'one active entry per phone');
select throws_ok($$select public.tables_waitlist_add((select v::uuid from ctx where k='venue'), '{"name":"VIP","party":2,"priority":2}', gen_random_uuid())$$, '22023', 'tables:priority_reason_required', 'priority needs a reason');
select is(public.tables_waitlist_offer((select v::uuid from ctx where k='wl1'), null, 0)->>'status', 'offered', 'host offers a table');
reset role;
select is((select state from public.tables_allocations where waitlist_entry_id=(select v::uuid from ctx where k='wl1')), 'held', 'offer holds real inventory');
-- Timeout: the hold expires; a late seat with the old version fails.
update public.tables_waitlist_entries set offer_expires_at = clock_timestamp() - interval '1 second' where id=(select v::uuid from ctx where k='wl1');
update public.tables_allocations set expires_at = clock_timestamp() - interval '1 second' where waitlist_entry_id=(select v::uuid from ctx where k='wl1');
set local role authenticated;
select throws_ok($$select public.tables_waitlist_seat((select v::uuid from ctx where k='wl1'), null, 1)$$, '40001', 'tables:stale', 'late acceptance after timeout cannot seat');
select lives_ok($$select public.tables_shift((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='today'))$$, 'the next shift refresh applies the expiry under the day lock');
reset role;
select is((select status from public.tables_waitlist_entries where id=(select v::uuid from ctx where k='wl1')), 'waiting', 'timed-out offer returns the party to waiting');
select is((select count(*) from public.tables_allocations where waitlist_entry_id=(select v::uuid from ctx where k='wl1') and state='held'), 0::bigint, 'timed-out hold released once');
set local role authenticated;
select is(public.tables_waitlist_offer((select v::uuid from ctx where k='wl1'), null, pg_temp.wlv((select v::uuid from ctx where k='wl1')))->>'status', 'offered', 'offered again');
insert into ctx select 'wlres', public.tables_waitlist_seat((select v::uuid from ctx where k='wl1'), null, pg_temp.wlv((select v::uuid from ctx where k='wl1')))->>'reservationId';
reset role;
select is((select status||'/'||source from public.tables_reservations where id=(select v::uuid from ctx where k='wlres')), 'seated/waitlist', 'seated party has one authoritative reservation');
select is((select count(*) from public.tables_allocations where reservation_id=(select v::uuid from ctx where k='wlres') and state='seated'), 1::bigint, 'the held table became the seated allocation');
select is((select count(*) from public.tables_allocations where waitlist_entry_id=(select v::uuid from ctx where k='wl1') and state in ('held','confirmed','seated')), 0::bigint, 'no parallel hold remains');
-- Public join / status / leave.
set local role anon;
insert into ctx select 'pw', public.tables_public_waitlist_join('ops-venue','{"name":"דנה","phone":"054-4000001","party":2,"consent":true}','f9400000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000003')->>'token';
select is(public.tables_public_waitlist_status((select v from ctx where k='pw'),'f9000000-0000-4000-8000-000000000003')->>'status', 'waiting', 'guest sees waiting status');
select ok(public.tables_public_waitlist_status((select v from ctx where k='pw'),'f9000000-0000-4000-8000-000000000003') ? 'estimate', 'guest sees an estimate range');
select is(public.tables_public_waitlist_status('x'||substr((select v from ctx where k='pw'),2),'f9000000-0000-4000-8000-000000000003'), null, 'guessed waitlist token reveals nothing');
select is(public.tables_public_waitlist_leave((select v from ctx where k='pw'),'f9000000-0000-4000-8000-000000000003')->>'status', 'cancelled', 'guest leaves the waitlist');
select throws_ok($$select public.tables_public_waitlist_join('ops-venue','{"name":"x","phone":"054-4000002","party":2}',gen_random_uuid(),gen_random_uuid())$$, '22023', 'tables:terms_required', 'public join needs consent');
reset role;

-- ---------- Menus ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
insert into ctx select 'menu', public.tables_menu_create((select v::uuid from ctx where k='venue'),'תפריט ערב')->>'id';
select ok(jsonb_array_length(public.tables_menu_save((select v::uuid from ctx where k='menu'),'תפריט ערב',
  '{"sections":[{"title":"ראשונות","items":[{"name":"סלט","price":"₪42","dietary":["vegan","laser"]}]}]}',0)->'problems') > 0, 'unknown dietary tag is a problem');
select throws_ok($$select public.tables_menu_publish((select v::uuid from ctx where k='menu'),1)$$, '22023', 'tables:menu_problems', 'menu with problems cannot be published');
select lives_ok($$select public.tables_menu_save((select v::uuid from ctx where k='menu'),'תפריט ערב',
  '{"sections":[{"title":"ראשונות","items":[{"name":"סלט ירוק","price":"₪42","dietary":["vegan"],"allergens":["sesame"]}]}]}',1)$$, 'owner fixes the menu');
select is((public.tables_menu_publish((select v::uuid from ctx where k='menu'),2)->>'versionNumber')::int, 1, 'menu published');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_menu_save((select v::uuid from ctx where k='menu'),'x','{"sections":[]}',2)$$, '42501', null, 'host cannot edit menus');
reset role;
set local role anon;
select is(public.tables_public_menus('ops-venue')->'menus'->0->'doc'->'sections'->0->'items'->0->>'name', 'סלט ירוק', 'guest reads the published menu');
select ok(not (public.tables_public_menus('ops-venue')::text ~ '(order|cart|checkout)'), 'menu projection has no ordering semantics');
reset role;

-- ---------- Analytics ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_analytics((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='today'),(select v::date from ctx where k='day'))$$, '42501', null, 'host cannot read analytics');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000003';
select is(jsonb_array_length(public.tables_analytics((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='today'),(select v::date from ctx where k='day'))->'days'), 4, 'viewer reads one row per service date');
select ok(public.tables_analytics((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='today'),(select v::date from ctx where k='day'))::text !~ '(guestName|guestPhone|050-|\+972)', 'analytics carry no guest data');
select ok(public.tables_analytics((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='today'),(select v::date from ctx where k='day'))::text !~* 'revenue', 'analytics carry no revenue');
select is((public.tables_analytics((select v::uuid from ctx where k='venue'),(select v::date from ctx where k='today'),(select v::date from ctx where k='today'))->'waitlist'->>'seated')::int, 1, 'waitlist conversion counts the seated entry');
select throws_ok($$select public.tables_analytics((select v::uuid from ctx where k='venue'),'2026-01-01','2026-12-31')$$, '22023', null, 'analytics range is bounded');

-- ---------- Pacing ----------
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.publish('{"pacing":{"windowMinutes":30,"maxArrivals":1}}');
reset role;
set local role anon;
select is(pg_temp.book('f9100000-0000-4000-8000-000000000020', 2, '22:00', '050-1000020')->>'result', 'confirmed', 'first arrival in the 22:00 window');
select is(pg_temp.book('f9100000-0000-4000-8000-000000000021', 2, '22:00', '050-1000021')->>'reason', 'pacing_full', 'second arrival in the same window is refused by pacing');
reset role;

-- ---------- Public rate limit ----------
set local role anon;
select lives_ok($$select pg_temp.book('f9500000-0000-4000-8000-00000000000'||n, 2, '18:00', '050-200000'||n, 'f9600000-0000-4000-8000-000000000001') from generate_series(1,6) n$$, 'six attempts from one browser are accepted');
select throws_ok($$select pg_temp.book('f9500000-0000-4000-8000-000000000009', 2, '18:00', '050-2000009', 'f9600000-0000-4000-8000-000000000001')$$, '54000', 'tables:rate_limited', 'the seventh booking attempt from one browser is rate limited');
reset role;

-- ---------- Table free: planned range and seated overrun ----------
-- A party seated earlier whose planned end has passed still occupies its table until completed.
insert into public.tables_allocations(organization_id, venue_id, physical_table_id, group_id, reservation_id, occupied_during, state)
select r.organization_id, r.venue_id, 'd2000000-0000-4000-8000-000000000001', gen_random_uuid(), r.id,
       tstzrange(clock_timestamp() - interval '3 hours', clock_timestamp() - interval '1 hour', '[)'), 'seated'
  from public.tables_reservations r where r.venue_id = (select v::uuid from ctx where k='venue') limit 1;
select is(private.tables_table_free('d2000000-0000-4000-8000-000000000001', tstzrange(clock_timestamp(), clock_timestamp() + interval '1 hour', '[)'), null),
  false, 'a seated party running over its planned end keeps the table occupied now');
select is(private.tables_table_free('d2000000-0000-4000-8000-000000000001', tstzrange(clock_timestamp() + interval '10 minutes', clock_timestamp() + interval '1 hour', '[)'), null),
  true, 'the overrun does not block later times');
select is(private.tables_table_free('d2000000-0000-4000-8000-000000000001', tstzrange(clock_timestamp() - interval '2 hours', clock_timestamp() - interval '90 minutes', '[)'), null),
  false, 'the planned range itself is occupied');
update public.tables_allocations set state = 'confirmed'
 where physical_table_id = 'd2000000-0000-4000-8000-000000000001' and state = 'seated' and upper(occupied_during) < clock_timestamp();
select is(private.tables_table_free('d2000000-0000-4000-8000-000000000001', tstzrange(clock_timestamp(), clock_timestamp() + interval '1 hour', '[)'), null),
  true, 'a confirmed (not seated) allocation in the past does not block now');
select is(private.tables_table_free('d2000000-0000-4000-8000-000000000001', tstzrange(clock_timestamp() - interval '2 hours', clock_timestamp() - interval '90 minutes', '[)'), null),
  false, 'a confirmed allocation blocks its own planned range');

select * from finish();
rollback;
