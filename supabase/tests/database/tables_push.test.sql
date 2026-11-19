-- Web Push reminders: a guest subscribes with their manage link only, to known push services only;
-- the sender functions are service-role only; a due push is claimed once, a failure is released,
-- a dead address is removed, and a sent push marks the booking as reminded.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a9000000-0000-4000-8000-000000000001','push-owner@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('b9000000-0000-4000-8000-000000000001','push-a','Push A','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','owner');
insert into public.tables_organization_features(organization_id, enabled) values ('b9000000-0000-4000-8000-000000000001', true);

create temp table ctx(k text primary key, v text);
grant all on ctx to anon, authenticated, service_role;
insert into ctx values ('day', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 1)::text);

create function pg_temp.draft() returns jsonb language sql as $$
  select jsonb_build_object(
    'schema', 1,
    'basics', jsonb_build_object('name','מקום התראות','timezone','Asia/Jerusalem'),
    'services', jsonb_build_array(jsonb_build_object('key','dinner','name','ערב','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','18:00','lastSeating','22:00','durationMinutes',90)),
    'zones', '[{"id":"c9000000-0000-4000-8000-000000000001","name":"אולם"}]'::jsonb,
    'tables', (select jsonb_agg(jsonb_build_object('id', format('d9000000-0000-4000-8000-%s', lpad(n::text, 12, '0')), 'label', n::text,
        'zoneId','c9000000-0000-4000-8000-000000000001','minCovers',1,'maxCovers',4,'shape','square','x',n*80,'y',0,'w',60,'h',60))
      from generate_series(1, 4) n),
    'combinations', '[]'::jsonb,
    'policy', jsonb_build_object('slotMinutes',30,'leadMinutes',0,'horizonDays',30,'minParty',1,'maxParty',8,'bufferMinutes',0,
      'approvalMode','auto','pendingMode','unallocated','pendingHoldMinutes',15,'cancelCutoffMinutes',0,'modifyCutoffMinutes',0,
      'allowGuestModify',true,'rules','[]'::jsonb,'waitlist',jsonb_build_object('publicEnabled',true,'offerMinutes',10)),
    'guest', jsonb_build_object('terms','תנאים'))
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b9000000-0000-4000-8000-000000000001','מקום התראות','push-venue')->>'id';
select lives_ok($$
  select public.tables_publish_venue((select v::uuid from ctx where k='venue'),
    (public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(),
      (public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'lockVersion')::bigint)->>'lockVersion')::bigint)
$$, 'venue published');
reset role;

set local role anon;
insert into ctx select 'token', public.tables_public_book('push-venue', jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,
  'name','דנה','phone','050-9000001','termsAccepted',true), 'f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001')->>'token';
select is(public.tables_push_public_key(), null, 'no public key before the sender has run');
select is(public.tables_public_push_subscribe((select v from ctx where k='token'), 'e9000000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/abc-123')->>'enabled', 'true', 'a guest subscribes with their manage link');
select lives_ok($$select public.tables_public_push_subscribe((select v from ctx where k='token'), 'e9000000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/abc-123')$$, 'subscribing twice is harmless');
select throws_ok($$select public.tables_public_push_subscribe((select v from ctx where k='token'), 'e9000000-0000-4000-8000-000000000001', 'https://evil.example/collect')$$,
  '22023', 'tables:invalid', 'only real push services are accepted (the server never calls an address of the guest''s choosing)');
select throws_ok($$select public.tables_public_push_subscribe('not-a-real-token', 'e9000000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/x')$$,
  'P0002', 'tables:link_unavailable', 'a wrong link cannot subscribe');
select throws_ok($$select public.tables_push_claim(10)$$, '42501', null, 'the public cannot claim pushes');
select throws_ok($$select public.tables_push_key_init(null, '{}'::jsonb)$$, '42501', null, 'the public cannot read the signing key');
select throws_ok($$select public.tables_push_result(gen_random_uuid(), 'sent')$$, '42501', null, 'the public cannot report pushes');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select throws_ok($$select public.tables_push_key_init(null, '{}'::jsonb)$$, '42501', null, 'staff cannot read the signing key either');
reset role;

set local role service_role;
select is(public.tables_push_key_init(null, '{}'::jsonb), null, 'no key yet');
select is(public.tables_push_key_init(repeat('B', 87), '{"kty":"EC","d":"secret"}'::jsonb)->>'publicKey', repeat('B', 87), 'the first key is stored');
select is(public.tables_push_key_init(repeat('C', 87), '{"kty":"EC","d":"other"}'::jsonb)->>'publicKey', repeat('B', 87), 'a second key never replaces it');
select is(jsonb_array_length(public.tables_push_claim(10)), 0, 'nothing is due a day ahead');
reset role;
set local role anon;
select is(public.tables_push_public_key(), repeat('B', 87), 'the public half is published');
reset role;

-- The booking is now two hours away.
update public.tables_reservations set starts_at = clock_timestamp() + interval '2 hours'
 where idempotency_key = 'f9000000-0000-4000-8000-000000000001';

set local role service_role;
insert into ctx select 'sub', public.tables_push_claim(10)->0->>'id';
select isnt((select v from ctx where k='sub'), null, 'the due push is claimed');
select is(jsonb_array_length(public.tables_push_claim(10)), 0, 'and only once');
select lives_ok($$select public.tables_push_result((select v::uuid from ctx where k='sub'), 'failed')$$, 'a failed push is reported');
select is(jsonb_array_length(public.tables_push_claim(10)), 1, 'a failed push is tried again next run');
select lives_ok($$select public.tables_push_result((select v::uuid from ctx where k='sub'), 'sent')$$, 'a sent push is reported');
reset role;
select is((select channel from public.tables_reminders where reservation_id = (select reservation_id from private.tables_push_subscriptions where id = (select v::uuid from ctx where k='sub'))),
  'push', 'a sent push marks the booking as reminded for the staff');

set local role service_role;
select lives_ok($$select public.tables_push_result((select v::uuid from ctx where k='sub'), 'gone')$$, 'a dead address is reported');
reset role;
select is((select count(*) from private.tables_push_subscriptions)::int, 0, 'and removed');

set local role anon;
select lives_ok($$select public.tables_public_push_subscribe((select v from ctx where k='token'), 'e9000000-0000-4000-8000-000000000001', 'https://web.push.apple.com/QWxs')$$, 'subscribe again (Safari)');
select is(public.tables_public_push_unsubscribe((select v from ctx where k='token'), 'e9000000-0000-4000-8000-000000000001', 'https://web.push.apple.com/QWxs')->>'enabled', 'false', 'a guest turns reminders off');
reset role;
select is((select count(*) from private.tables_push_subscriptions)::int, 0, 'turning off removes the address');

select * from finish();
rollback;
