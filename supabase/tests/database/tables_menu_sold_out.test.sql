-- Sold out today (UX audit 2026-11, A9.6): managers mark a menu item sold out; guests see it at once
-- without republishing; hosts and guests cannot set it; the mark belongs to today only.
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
set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', public.tables_create_venue('b2000000-0000-4000-8000-000000000001','מסעדת תפעול','ops-venue')->>'id';
select pg_temp.publish();
select lives_ok($$select public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a2000000-0000-4000-8000-000000000002','host')$$, 'host assigned');
insert into ctx select 'menu', public.tables_menu_create((select v::uuid from ctx where k='venue'),'תפריט ערב')->>'id';
select lives_ok($$select public.tables_menu_save((select v::uuid from ctx where k='menu'),'תפריט ערב',
  '{"sections":[{"title":"פתיחה","items":[{"id":"salad01","name":"סלט ירוק","price":"42"},{"id":"soup0001","name":"מרק","price":"38"}]}]}', 0)$$, 'menu with item ids saves');
select is((public.tables_menu_publish((select v::uuid from ctx where k='menu'),1)->>'versionNumber')::int, 1, 'menu published');

select is(public.tables_public_menus('ops-venue')->'menus'->0->'soldOut', '[]'::jsonb, 'nothing sold out at first');
select is(public.tables_menu_set_sold_out((select v::uuid from ctx where k='menu'), 'salad01', true), '["salad01"]'::jsonb, 'the owner marks an item sold out');
select is(public.tables_public_menus('ops-venue')->'menus'->0->'soldOut', '["salad01"]'::jsonb, 'guests see it at once, without republishing');
select is(public.tables_public_menus('ops-venue')->'menus'->0->'doc'->'sections'->0->'items'->0->>'name', 'סלט ירוק', 'the published menu itself is unchanged');
select is(public.tables_menu_sold_out((select v::uuid from ctx where k='venue'))->(select v from ctx where k='menu'), '["salad01"]'::jsonb, 'staff screens read today''s marks');
select throws_ok($$select public.tables_menu_set_sold_out((select v::uuid from ctx where k='menu'), 'Bad Id!', true)$$, '22023', null, 'item ids are validated');

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000002';
select throws_ok($$select public.tables_menu_set_sold_out((select v::uuid from ctx where k='menu'), 'soup0001', true)$$, '42501', null, 'a host cannot change the menu');
select lives_ok($$select public.tables_menu_sold_out((select v::uuid from ctx where k='venue'))$$, 'a host can read today''s marks');

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select is(public.tables_menu_set_sold_out((select v::uuid from ctx where k='menu'), 'salad01', false), '[]'::jsonb, 'clearing the mark');

-- A mark from an earlier day no longer counts.
reset role;
insert into public.tables_menu_item_state(menu_id, item_id, sold_out_on) values ((select v::uuid from ctx where k='menu'), 'soup0001', current_date - 2);
set local role anon;
select is(public.tables_public_menus('ops-venue')->'menus'->0->'soldOut', '[]'::jsonb, 'yesterday''s marks are gone today');
select throws_ok($$select public.tables_menu_set_sold_out((select v::uuid from ctx where k='menu'), 'soup0001', true)$$, '42501', null, 'guests cannot mark items');
reset role;

select * from finish();
rollback;
