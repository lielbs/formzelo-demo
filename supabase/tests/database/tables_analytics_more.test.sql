-- More venue data (UX audit 2026-11, A12): busy hours for viewers and up; regular guests and repeated
-- no-shows by name only for managers and owners; hosts get nothing.
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
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b2000000-0000-4000-8000-000000000001','מסעדת תפעול','ops-venue')->>'id';
select pg_temp.publish();
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a2000000-0000-4000-8000-000000000002','host')$$, 'host assigned');
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a2000000-0000-4000-8000-000000000003','viewer')$$, 'viewer assigned');
reset role;
set local role anon;
select pg_temp.book('f9300000-0000-4000-8000-000000000001', 2, '19:00', '050-3000001');
select pg_temp.book('f9300000-0000-4000-8000-000000000002', 4, '20:00', '050-3000001');
select pg_temp.book('f9300000-0000-4000-8000-000000000003', 2, '20:30', '050-3000002');
-- 21:30: table 11 frees at 21:30 (the 20:00 party of four), so this booking always fits.
select pg_temp.book('f9300000-0000-4000-8000-000000000004', 2, '21:30', '050-3000002');
reset role;
-- The first guest came twice; the second did not come twice.
update public.tables_reservations set status = 'completed' where venue_id = (select v::uuid from ctx where k='venue') and local_time in ('19:00','20:00');
update public.tables_reservations set status = 'no_show' where venue_id = (select v::uuid from ctx where k='venue') and local_time in ('20:30','21:30');

create function pg_temp.more() returns jsonb language sql as $$
  select public.tables_analytics_more((select v::uuid from ctx where k='venue'), (select v::date from ctx where k='today'), (select v::date from ctx where k='day'))
$$;
grant execute on function pg_temp.more() to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select throws_ok($$select pg_temp.more()$$, '42501', null, 'a host cannot read venue data');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000003';
select is((select sum((h->>'bookings')::int) from jsonb_array_elements(pg_temp.more()->'heat') h)::int, 4, 'a viewer sees busy hours');
select is(pg_temp.more()->'regulars', 'null'::jsonb, 'a viewer sees no guest names');
select ok(pg_temp.more()::text !~ '(050-|\+972)', 'never phone numbers');
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(pg_temp.more()->'regulars'), 1, 'the owner sees the regular guest');
select is((pg_temp.more()->'regulars'->0->>'visits')::int, 2, 'with two visits');
select is((pg_temp.more()->'noShows'->0->>'count')::int, 2, 'and the repeated no-show');
select throws_ok($$select public.tables_analytics_more((select v::uuid from ctx where k='venue'), current_date, current_date + 200)$$, '22023', null, 'ranges are limited');
reset role;

select * from finish();
rollback;
