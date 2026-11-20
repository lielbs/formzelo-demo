-- Staff reminders: host and above list a day's open bookings and mark the ones reminded; the mark
-- never changes the reservation (no lock_version bump); outsiders and the public cannot use it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a8000000-0000-4000-8000-000000000001','remind-owner@example.invalid',clock_timestamp()),
 ('a8000000-0000-4000-8000-000000000002','remind-outsider@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('b8000000-0000-4000-8000-000000000001','remind-a','Remind A','active'),
 ('b8000000-0000-4000-8000-000000000002','remind-b','Remind B','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','owner'),
 ('b8000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000002','owner');
insert into public.tables_organization_features(organization_id, enabled) values ('b8000000-0000-4000-8000-000000000001', true);

create temp table ctx(k text primary key, v text);
grant all on ctx to anon, authenticated;
insert into ctx values ('day', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 1)::text);

create function pg_temp.draft() returns jsonb language sql as $$
  select jsonb_build_object(
    'schema', 1,
    'basics', jsonb_build_object('name','מקום תזכורות','timezone','Asia/Jerusalem'),
    'services', jsonb_build_array(jsonb_build_object('key','dinner','name','ערב','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','18:00','lastSeating','22:00','durationMinutes',90)),
    'zones', '[{"id":"c8000000-0000-4000-8000-000000000001","name":"אולם"}]'::jsonb,
    'tables', (select jsonb_agg(jsonb_build_object('id', format('d8000000-0000-4000-8000-%s', lpad(n::text, 12, '0')), 'label', n::text,
        'zoneId','c8000000-0000-4000-8000-000000000001','minCovers',1,'maxCovers',4,'shape','square','x',n*80,'y',0,'w',60,'h',60))
      from generate_series(1, 4) n),
    'combinations', '[]'::jsonb,
    'policy', jsonb_build_object('slotMinutes',30,'leadMinutes',0,'horizonDays',30,'minParty',1,'maxParty',8,'bufferMinutes',0,
      'approvalMode','auto','pendingMode','unallocated','pendingHoldMinutes',15,'cancelCutoffMinutes',0,'modifyCutoffMinutes',0,
      'allowGuestModify',true,'rules','[]'::jsonb,'waitlist',jsonb_build_object('publicEnabled',true,'offerMinutes',10)),
    'guest', jsonb_build_object('terms','תנאים'))
$$;
create function pg_temp.book(p_key text, p_time text, p_phone text) returns jsonb language sql as $$
  select public.tables_public_book('remind-venue', jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time',p_time,'party',2,
    'name','דנה כהן','phone',p_phone,'termsAccepted',true), p_key::uuid, p_key::uuid)
$$;
grant execute on function pg_temp.book(text,text,text) to anon;

set local role authenticated;
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b8000000-0000-4000-8000-000000000001','מקום תזכורות','remind-venue')->>'id';
select lives_ok($$
  select public.tables_publish_venue((select v::uuid from ctx where k='venue'),
    (public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(),
      (public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'lockVersion')::bigint)->>'lockVersion')::bigint)
$$, 'venue published');
reset role;

set local role anon;
select is(pg_temp.book('f8000000-0000-4000-8000-000000000001', '19:00', '050-8000001')->>'result', 'confirmed', 'first booking');
select is(pg_temp.book('f8000000-0000-4000-8000-000000000002', '20:00', '050-8000002')->>'result', 'confirmed', 'second booking');
select throws_ok($$select public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))$$,
  '42501', null, 'the public cannot list reminders');
reset role;

insert into ctx select 'r1', id::text from public.tables_reservations where idempotency_key='f8000000-0000-4000-8000-000000000001';
insert into ctx select 'r2', id::text from public.tables_reservations where idempotency_key='f8000000-0000-4000-8000-000000000002';
insert into ctx select 'lock1', lock_version::text from public.tables_reservations where id=(select v::uuid from ctx where k='r1');

set local role authenticated;
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))->'reservations'), 2, 'owner sees both open bookings');
select is(public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))->'reservations'->0->>'guestPhone', '+972508000001', 'phones are there for the reminder');
select isnt(public.tables_mark_reminded((select v::uuid from ctx where k='r1'))->>'remindedAt', null, 'marking a reminder returns its time');
select isnt(public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))->'reservations'->0->>'remindedAt', null, 'the mark shows in the list for the whole team');
select is(public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))->'reservations'->1->>'remindedAt', null, 'the other booking is still unmarked');
reset role;

select is((select lock_version::text from public.tables_reservations where id=(select v::uuid from ctx where k='r1')), (select v from ctx where k='lock1'),
  'marking a reminder does not change the reservation (a host edit cannot conflict with it)');

set local role authenticated;
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is(public.tables_mark_reminded((select v::uuid from ctx where k='r1'), false)->>'remindedAt', null, 'a mark can be undone');
reset role;
select is((select count(*) from public.tables_reminders)::int, 0, 'undo removes the mark');

update public.tables_reservations set status='cancelled', cancelled_at=clock_timestamp() where id=(select v::uuid from ctx where k='r2');
set local role authenticated;
set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))->'reservations'), 1, 'cancelled bookings leave the list');
select throws_ok($$select public.tables_mark_reminded((select v::uuid from ctx where k='r2'))$$, '22023', 'tables:invalid', 'a cancelled booking cannot be marked');

set local request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_reminder_list((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='day'))$$,
  '42501', null, 'another business cannot list this venue''s reminders');
select throws_ok($$select public.tables_mark_reminded((select v::uuid from ctx where k='r1'))$$, '42501', null, 'another business cannot mark them');
select throws_ok($$select * from public.tables_reminders$$, '42501', null, 'the marks table is not readable directly');
reset role;

select * from finish();
rollback;
