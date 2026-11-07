begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values ('24000000-0000-4000-8000-000000000001','limits-owner@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('34000000-0000-4000-8000-000000000001','limits-tenant','Limits Tenant','active');

-- A booking form: one table per slot, at most 2 bookings a day, every weekday open, one closed date.
create function pg_temp.publish(p_id uuid, p_slug text, p_config jsonb, p_intake jsonb default '{"paused":false,"onePerContact":false}') returns void language plpgsql as $$
begin
  insert into public.workflows(id,organization_id,public_slug,status,draft_config,draft_design,schema_version,created_by,template_key,intake)
  values (p_id,'34000000-0000-4000-8000-000000000001',p_slug,'draft',p_config,'{}',8,'24000000-0000-4000-8000-000000000001','test',p_intake);
  insert into public.workflow_versions(id,organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by)
  values (p_id,'34000000-0000-4000-8000-000000000001',p_id,1,8,'test',p_config,'{}','24000000-0000-4000-8000-000000000001');
  update public.workflows set status='published',published_version_id=p_id where id=p_id;
end $$;

create function pg_temp.day(p_offset integer) returns text language sql as $$
  select ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + p_offset)::text
$$;

select pg_temp.publish('44000000-0000-4000-8000-000000000001','limits-booking',jsonb_build_object(
  'title','תור','description','','mode','public','caseFields','[]'::jsonb,
  'steps',jsonb_build_array(jsonb_build_object('id','s','title','מועד','fields',jsonb_build_array(
    jsonb_build_object('id','d','key','date','label','תאריך','type','date','required',true),
    jsonb_build_object('id','t','key','time','label','שעה','type','time','required',true,'options',jsonb_build_array(
      jsonb_build_object('id','a','label','10:00','value','10:00'),jsonb_build_object('id','b','label','12:00','value','12:00'),jsonb_build_object('id','c','label','14:00','value','14:00'))),
    jsonb_build_object('id','p','key','phone','label','טלפון','type','phone','required',true,'role','customer_phone')))),
  'pricing',jsonb_build_object('enabled',false,'currency','ILS','fees','[]'::jsonb,'depositPercent',0,'totalLabel','סה״כ'),
  'branding',jsonb_build_object('primaryColor','#EA580C','logoText','x'),
  'consent',jsonb_build_object('required',false,'text',''),'successMessage','ok',
  'booking',jsonb_build_object('enabled',true,'dateKey','date','timeKey','time','openWeekdays','[0,1,2,3,4,5,6]'::jsonb,
    'slots','["10:00","12:00","14:00"]'::jsonb,'capacityPerSlot',1,'capacityUnit','bookings','maxPerDay',2,
    'maxDaysAhead',30,'closedDates',jsonb_build_array(pg_temp.day(9)))));

set local role anon;
select lives_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"10:00","phone":"050-1111111"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(5)),'first booking takes the slot');
select throws_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"10:00","phone":"050-2222222"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(5)),'P0001','booking_slot_full','a full slot rejects the next booking');
select lives_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"12:00","phone":"050-3333333"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(5)),'another slot on the same day is still free');
select throws_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"14:00","phone":"050-4444444"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(5)),'P0001','booking_day_full','the daily cap closes the day');
select throws_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"10:00","phone":"050-5555555"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(9)),'P0001','booking_closed_date','a closed date is refused');
select throws_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"10:00","phone":"050-5555555"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(45)),'P0001','booking_too_far','dates beyond the horizon are refused');
select throws_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"10:00","phone":"050-5555555"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(-1)),'P0001','booking_past','past dates are refused');
select throws_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"11:11","phone":"050-5555555"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(6)),'P0001','invalid_time','a time that is not offered is refused');
select is(
  (select jsonb_agg(x->>'state' order by x->>'time') from jsonb_array_elements(public.public_booking_availability('limits-booking',pg_temp.day(5))) x),
  '["full","full","full"]'::jsonb,'public availability shows taken slots and a full day without exposing answers');
select is(
  (select jsonb_agg(x->>'state' order by x->>'time') from jsonb_array_elements(public.public_booking_availability('limits-booking',pg_temp.day(6)))  x),
  '["limited","limited","limited"]'::jsonb,'a single-place slot is shown as limited, like the browser');
select is(public.public_booking_availability('limits-booking','not-a-date'),'[]'::jsonb,'malformed availability date returns nothing');
reset role;

-- A cancelled booking frees its slot.
update public.submissions set status='cancelled' where workflow_id='44000000-0000-4000-8000-000000000001' and answers->'values'->>'time'='10:00';
set local role anon;
select lives_ok(format($$select public.submit_public_workflow('limits-booking','{"date":"%s","time":"10:00","phone":"050-6666666"}',false,gen_random_uuid(),gen_random_uuid())$$,pg_temp.day(5)),'a cancelled booking frees its slot');
reset role;

-- Places per option, a daily intake cap and one open request per contact.
select pg_temp.publish('44000000-0000-4000-8000-000000000002','limits-workshop',jsonb_build_object(
  'title','הרשמה','description','','mode','public','caseFields','[]'::jsonb,
  'steps',jsonb_build_array(jsonb_build_object('id','s','title','הרשמה','fields',jsonb_build_array(
    jsonb_build_object('id','tr','key','track','label','מסלול','type','radio','required',true,'options',jsonb_build_array(
      jsonb_build_object('id','a','label','בוקר','value','morning','capacity',1),jsonb_build_object('id','b','label','ערב','value','evening'))),
    jsonb_build_object('id','p','key','phone','label','טלפון','type','phone','required',true,'role','customer_phone')))),
  'pricing',jsonb_build_object('enabled',false,'currency','ILS','fees','[]'::jsonb,'depositPercent',0,'totalLabel','סה״כ'),
  'branding',jsonb_build_object('primaryColor','#EA580C','logoText','x'),
  'consent',jsonb_build_object('required',false,'text',''),'successMessage','ok'),
  '{"paused":false,"onePerContact":true,"maxPerDay":3}'::jsonb);

set local role anon;
select lives_ok($$select public.submit_public_workflow('limits-workshop','{"track":"morning","phone":"054-555-0100"}',false,gen_random_uuid(),gen_random_uuid())$$,'the last morning place is taken');
select throws_ok($$select public.submit_public_workflow('limits-workshop','{"track":"morning","phone":"050-7777777"}',false,gen_random_uuid(),gen_random_uuid())$$,'P0001','option_full','a full option is refused');
select is(public.public_option_usage('limits-workshop'),'{"track":{"morning":1}}'::jsonb,'public option usage shows counts only');
select throws_ok($$select public.submit_public_workflow('limits-workshop','{"track":"evening","phone":"0545550100"}',false,gen_random_uuid(),gen_random_uuid())$$,'P0001','open_request_exists','the same phone written differently is one contact');
select lives_ok($$select public.submit_public_workflow('limits-workshop','{"track":"evening","phone":"050-8888888"}',false,gen_random_uuid(),gen_random_uuid())$$,'second request of the day');
select lives_ok($$select public.submit_public_workflow('limits-workshop','{"track":"evening","phone":"050-9999999"}',false,gen_random_uuid(),gen_random_uuid())$$,'third request of the day');
select is(public.public_intake_state('limits-workshop')->>'reason','day','intake state reports the daily cap');
select throws_ok($$select public.submit_public_workflow('limits-workshop','{"track":"evening","phone":"052-1234567"}',false,gen_random_uuid(),gen_random_uuid())$$,'P0001','intake_day','the daily cap closes the form');
reset role;

update public.workflows set intake='{"paused":true,"onePerContact":false}' where id='44000000-0000-4000-8000-000000000002';
set local role anon;
select is(public.public_intake_state('limits-workshop')->>'reason','paused','a paused form reports paused');
select is(public.public_intake_state('no-such-form'),null,'unknown slug reveals nothing');
select throws_ok($$select private.intake_state('44000000-0000-4000-8000-000000000002',null)$$,'42501',null,'private helpers are not callable by the public');
reset role;

select * from finish();
rollback;
