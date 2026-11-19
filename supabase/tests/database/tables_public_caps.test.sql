-- Public booking limits that hold whoever is calling (security review 2026-11-19): one phone
-- number holds at most 4 upcoming online bookings at a venue; a retry of the same request is
-- never blocked; another phone is unaffected.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a7000000-0000-4000-8000-000000000001','caps-owner@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('b7000000-0000-4000-8000-000000000001','caps-a','Caps A','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','owner');
insert into public.tables_organization_features(organization_id, enabled) values ('b7000000-0000-4000-8000-000000000001', true);

create temp table ctx(k text primary key, v text);
grant all on ctx to anon, authenticated;
insert into ctx values ('day', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 3)::text);

create function pg_temp.draft() returns jsonb language sql as $$
  select jsonb_build_object(
    'schema', 1,
    'basics', jsonb_build_object('name','מקום מגבלות','timezone','Asia/Jerusalem'),
    'services', jsonb_build_array(jsonb_build_object('key','dinner','name','ערב','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','18:00','lastSeating','22:00','durationMinutes',90)),
    'zones', '[{"id":"c7000000-0000-4000-8000-000000000001","name":"אולם"}]'::jsonb,
    'tables', (select jsonb_agg(jsonb_build_object('id', format('d7000000-0000-4000-8000-%s', lpad(n::text, 12, '0')), 'label', n::text,
        'zoneId','c7000000-0000-4000-8000-000000000001','minCovers',1,'maxCovers',4,'shape','square','x',n*80,'y',0,'w',60,'h',60))
      from generate_series(1, 8) n),
    'combinations', '[]'::jsonb,
    'policy', jsonb_build_object('slotMinutes',30,'leadMinutes',0,'horizonDays',30,'minParty',1,'maxParty',8,'bufferMinutes',0,
      'approvalMode','auto','pendingMode','unallocated','pendingHoldMinutes',15,'cancelCutoffMinutes',240,'modifyCutoffMinutes',240,
      'allowGuestModify',true,'rules','[]'::jsonb,'waitlist',jsonb_build_object('publicEnabled',true,'offerMinutes',10)),
    'guest', jsonb_build_object('terms','תנאים'))
$$;
create function pg_temp.book(p_key text, p_time text, p_phone text) returns jsonb language sql as $$
  select public.tables_public_book('caps-venue', jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time',p_time,'party',2,
    'name','אורח','phone',p_phone,'termsAccepted',true), p_key::uuid, p_key::uuid)
$$;
grant execute on function pg_temp.book(text,text,text) to anon;

set local role authenticated;
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b7000000-0000-4000-8000-000000000001','מקום מגבלות','caps-venue')->>'id';
select lives_ok($$
  select public.tables_publish_venue((select v::uuid from ctx where k='venue'),
    (public.tables_save_draft((select v::uuid from ctx where k='venue'), pg_temp.draft(),
      (public.tables_get_venue((select v::uuid from ctx where k='venue'))->>'lockVersion')::bigint)->>'lockVersion')::bigint)
$$, 'venue published');
reset role;

set local role anon;
select is(pg_temp.book('f7000000-0000-4000-8000-000000000001', '18:00', '050-7000001')->>'result', 'confirmed', 'first booking for the phone');
select is(pg_temp.book('f7000000-0000-4000-8000-000000000002', '18:30', '050-7000001')->>'result', 'confirmed', 'second booking for the phone');
select is(pg_temp.book('f7000000-0000-4000-8000-000000000003', '19:00', '050-7000001')->>'result', 'confirmed', 'third booking for the phone');
select is(pg_temp.book('f7000000-0000-4000-8000-000000000004', '19:30', '+972 50-7000001')->>'result', 'confirmed', 'fourth booking, same phone written differently');
select throws_ok($$select pg_temp.book('f7000000-0000-4000-8000-000000000005', '20:00', '050-7000001')$$,
  '54000', 'tables:too_many_bookings', 'a fifth upcoming booking for one phone is refused');
select is(pg_temp.book('f7000000-0000-4000-8000-000000000004', '19:30', '+972 50-7000001')->>'result', 'confirmed', 'a retry of an accepted booking is never blocked');
select is(pg_temp.book('f7000000-0000-4000-8000-000000000006', '20:00', '050-7000002')->>'result', 'confirmed', 'another phone books normally');
reset role;

select ok(not has_function_privilege('anon', 'private.tables_public_caps(text,uuid,jsonb,uuid)', 'EXECUTE'), 'the limit helper is not callable from the API');

select * from finish();
rollback;
