begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values ('25000000-0000-4000-8000-000000000001','appt-owner@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('35000000-0000-4000-8000-000000000001','appt-tenant','Appointments Tenant','active');

create function pg_temp.publish(p_id uuid, p_slug text, p_config jsonb) returns void language plpgsql as $$
begin
  insert into public.workflows(id,organization_id,public_slug,status,draft_config,draft_design,schema_version,created_by,template_key,intake)
  values (p_id,'35000000-0000-4000-8000-000000000001',p_slug,'draft',p_config,'{}',8,'25000000-0000-4000-8000-000000000001','test','{"paused":false,"onePerContact":false}');
  insert into public.workflow_versions(id,organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by)
  values (p_id,'35000000-0000-4000-8000-000000000001',p_id,1,8,'test',p_config,'{}','25000000-0000-4000-8000-000000000001');
  update public.workflows set status='published',published_version_id=p_id where id=p_id;
end $$;

-- The next Sunday at least two days ahead (the schedule opens on Sundays only, 09:00–13:00).
create function pg_temp.sunday() returns text language sql as $$
  select d::date::text from generate_series((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 2, (clock_timestamp() at time zone 'Asia/Jerusalem')::date + 9, interval '1 day') d
  where extract(dow from d) = 0 limit 1
$$;

create function pg_temp.submit(p_service text, p_time text, p_phone text) returns jsonb language sql as $$
  select public.submit_public_workflow('appt-barber', jsonb_build_object('service', p_service, 'date', pg_temp.sunday(), 'time', p_time, 'phone', p_phone), false, gen_random_uuid(), gen_random_uuid())
$$;
grant execute on function pg_temp.sunday() to anon;
grant execute on function pg_temp.submit(text, text, text) to anon;

select pg_temp.publish('45000000-0000-4000-8000-000000000001','appt-barber',jsonb_build_object(
  'title','תור','description','','mode','public','caseFields','[]'::jsonb,
  'steps',jsonb_build_array(jsonb_build_object('id','s','title','מועד','fields',jsonb_build_array(
    jsonb_build_object('id','v','key','service','label','שירות','type','radio','required',true,'options',jsonb_build_array(
      jsonb_build_object('id','o1','label','תספורת','value','cut'),jsonb_build_object('id','o2','label','זקן','value','beard'))),
    jsonb_build_object('id','d','key','date','label','תאריך','type','date','required',true),
    jsonb_build_object('id','t','key','time','label','שעה','type','time','required',true),
    jsonb_build_object('id','p','key','phone','label','טלפון','type','phone','required',true,'role','customer_phone')))),
  'pricing',jsonb_build_object('enabled',false,'currency','ILS','fees','[]'::jsonb,'depositPercent',0,'totalLabel','סה״כ'),
  'branding',jsonb_build_object('primaryColor','#222222','logoText','x'),
  'consent',jsonb_build_object('required',false,'text',''),'successMessage','ok',
  'booking',jsonb_build_object('enabled',true,'unit','time','dateKey','date','timeKey','time','openWeekdays','[0]'::jsonb,
    'slots','[]'::jsonb,'capacityPerSlot',1,'capacityUnit','bookings',
    'schedule',jsonb_build_object('days','[[{"from":"09:00","to":"13:00"}],[],[],[],[],[],[]]'::jsonb,'step',15,'duration',30,
      'serviceKey','service','durations',jsonb_build_object('cut',30,'beard',45)))));

set local role anon;
select is((pg_temp.submit('beard', '10:00', '050-1111111')) #>> '{answers,booking,minutes}', '45', 'a 45-minute appointment is taken and its length is kept');
select throws_ok($$select pg_temp.submit('cut', '10:30', '050-2222222')$$, 'P0001', 'booking_slot_full', 'an overlapping appointment is refused');
select throws_ok($$select pg_temp.submit('cut', '09:45', '050-2222223')$$, 'P0001', 'booking_slot_full', 'an appointment that would run into a taken one is refused');
select lives_ok($$select pg_temp.submit('cut', '10:45', '050-3333333')$$, 'the time right after it is free');
select throws_ok($$select pg_temp.submit('beard', '12:30', '050-4444444')$$, 'P0001', 'booking_slot_unavailable', 'an appointment that ends after closing is refused');
select throws_ok($$select pg_temp.submit('cut', '10:10', '050-5555555')$$, 'P0001', 'booking_slot_unavailable', 'a time off the 15-minute grid is refused');
select is(
  (select string_agg(e ->> 'time', ',') from jsonb_array_elements(public.public_booking_times('appt-barber', pg_temp.sunday(), '{"service":"cut"}')) e where e ->> 'state' = 'full'),
  '09:45,10:00,10:15,10:30,10:45,11:00',
  'the form sees exactly the times that are taken for a 30-minute cut');
select ok(
  (select bool_and(not (e ? 'phone')) from jsonb_array_elements(public.public_booking_times('appt-barber', pg_temp.sunday(), '{"service":"cut"}')) e),
  'the times helper never returns answers');
select throws_ok($$select private.booking_busy('45000000-0000-4000-8000-000000000001', '{}'::jsonb, '2030-01-01')$$, '42501', null, 'private helpers are not callable by the public');
reset role;

select * from finish();
rollback;
