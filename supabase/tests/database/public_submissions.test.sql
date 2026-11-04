begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

create function pg_temp.valid_design() returns jsonb language sql immutable as $$
  select '{"themeVersion":1,"presetId":"modern_minimal","source":"manual","palette":{"primary":"#EA580C","secondary":"#0F172A","accent":"#14B8A6","background":"#F8FAFC","surface":"#FFFFFF","surfaceAlt":"#F1F5F9","text":"#0F172A","muted":"#64748B"},"typography":"neutral","hero":{"layout":"compact"},"composition":"centered","decoration":"minimal","components":{"card":"soft","input":"outlined","option":"tile","button":"solid"},"radius":"lg","shadow":"soft","density":"comfortable","progress":"bar","motion":"subtle","optionArt":false,"mobile":{"compactHero":true,"stickySummary":false},"logo":{"showName":true}}'::jsonb
$$;

insert into auth.users(id,email,email_confirmed_at) values
 ('23000000-0000-4000-8000-000000000001','public-owner@example.invalid',clock_timestamp()),
 ('23000000-0000-4000-8000-000000000002','other-owner@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('33000000-0000-4000-8000-000000000001','public-tenant','Public Tenant','active'),
 ('33000000-0000-4000-8000-000000000002','other-tenant','Other Tenant','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('33000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','owner'),
 ('33000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000002','owner');

insert into public.workflows(id,organization_id,public_slug,status,draft_config,draft_design,schema_version,created_by,template_key)
values (
 '43000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','public-order','draft',
 '{"title":"הזמנה","description":"","mode":"public","caseFields":[],"steps":[{"id":"step","title":"פרטים","fields":[{"id":"name","key":"full_name","label":"שם","type":"text","required":true,"role":"customer_name","max":80},{"id":"email","key":"email","label":"אימייל","type":"email","required":true,"role":"customer_email"},{"id":"service","key":"service","label":"שירות","type":"select","required":true,"options":[{"id":"basic","label":"בסיסי","value":"basic","price":100},{"id":"premium","label":"פרימיום","value":"premium","price":250}]},{"id":"addon","key":"addon","label":"תוספת","type":"checkbox","required":false,"price":20},{"id":"quantity","key":"quantity","label":"כמות","type":"number","required":true,"min":1,"max":5,"price":10}]}],"pricing":{"enabled":true,"currency":"ILS","fees":[{"id":"fee","label":"דמי טיפול","amount":5}],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":true,"text":"מאשר"},"successMessage":"התקבל"}',
 pg_temp.valid_design(),8,'23000000-0000-4000-8000-000000000001','blank'
),(
 '43000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001','private-draft','draft',
 '{"title":"טיוטה","description":"","mode":"public","caseFields":[],"steps":[{"id":"s","title":"שלב","fields":[]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":false,"text":""},"successMessage":"התקבל"}',
 pg_temp.valid_design(),8,'23000000-0000-4000-8000-000000000001','blank'
);
insert into public.workflow_versions(id,organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by)
select '53000000-0000-4000-8000-000000000001',organization_id,id,1,schema_version,'test',draft_config,draft_design,'23000000-0000-4000-8000-000000000001'
from public.workflows where id='43000000-0000-4000-8000-000000000001';
update public.workflows set status='published',published_version_id='53000000-0000-4000-8000-000000000001'
where id='43000000-0000-4000-8000-000000000001';

set local role anon;
select ok((public.resolve_public_workflow('public-order')->'version'->>'id')='53000000-0000-4000-8000-000000000001','published slug resolves the immutable version');
select is(public.resolve_public_workflow('private-draft'),null,'draft slug remains private');
select throws_ok($$select * from public.submissions$$,'42501',null,'anonymous caller cannot read private submissions directly');
select throws_ok(
  $$select public.submit_public_workflow('public-order','{"full_name":"ישראל","email":"bad","service":"premium","addon":true,"quantity":2}',true,'73000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')$$,
  '22023','Invalid email','invalid field value is rejected server-side'
);
select throws_ok(
  $$select public.submit_public_workflow('public-order','{"full_name":"ישראל","email":"test@example.com","service":"forged","addon":true,"quantity":2}',true,'73000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001')$$,
  '22023','Answer is not an allowed option','forged option is rejected'
);
select throws_ok(
  $$select public.submit_public_workflow('public-order','{"full_name":"ישראל","email":"test@example.com","service":"premium","addon":true,"quantity":2,"total":1}',true,'73000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001')$$,
  '22023','Unknown answer field','client cannot submit a forged total or unknown field'
);
select lives_ok(
  $$select public.submit_public_workflow('public-order','{"full_name":"ישראל","email":"test@example.com","service":"premium","addon":true,"quantity":2}',true,'73000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001')$$,
  'valid anonymous submission persists'
);
reset role;
select is((select total_minor from public.submissions where idempotency_key='73000000-0000-4000-8000-000000000004'),29500::bigint,'server recalculates authoritative total from the immutable version');
set local role anon;
select lives_ok(
  $$select public.submit_public_workflow('public-order','{"full_name":"ישראל","email":"test@example.com","service":"premium","addon":true,"quantity":2}',true,'73000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001')$$,
  'identical idempotent retry returns the existing request'
);
reset role;
select is((select count(*) from public.submissions where idempotency_key='73000000-0000-4000-8000-000000000004'),1::bigint,'idempotent retry creates no duplicate row');
set local role anon;
select throws_ok(
  $$select public.submit_public_workflow('public-order','{"full_name":"אחר","email":"test@example.com","service":"basic","addon":false,"quantity":1}',true,'73000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001')$$,
  '22023','Idempotency key conflict','idempotency key cannot be replayed with a different payload'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub='23000000-0000-4000-8000-000000000001';
select is((select count(*) from public.submissions),1::bigint,'authorized owner sees the new inbox request');
select is((select answers->>'customerName' from public.submissions limit 1),'ישראל','customer identity projection is stored for the inbox');
select lives_ok(
  $$select * from public.transition_submission_status('33000000-0000-4000-8000-000000000001',(select id from public.submissions limit 1),0,'in_review')$$,
  'authorized owner performs a valid status transition'
);
select throws_ok(
  $$select * from public.transition_submission_status('33000000-0000-4000-8000-000000000001',(select id from public.submissions limit 1),0,'approved')$$,
  '40001','Submission changed or unavailable','stale status update is rejected'
);
select throws_ok(
  $$select * from public.transition_submission_status('33000000-0000-4000-8000-000000000001',(select id from public.submissions limit 1),1,'completed')$$,
  '22023','Invalid submission transition','invalid status transition is rejected'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='23000000-0000-4000-8000-000000000002';
select is((select count(*) from public.submissions),0::bigint,'another tenant cannot read inbox submissions');
select throws_ok(
  $$select * from public.transition_submission_status('33000000-0000-4000-8000-000000000001',(select id from public.submissions where false),1,'approved')$$,
  '42501','Workspace access denied','another tenant cannot write submission status'
);
reset role;

update public.workflows set status='archived' where id='43000000-0000-4000-8000-000000000001';
set local role anon;
select is(public.resolve_public_workflow('public-order'),null,'archived workflow becomes unavailable publicly');
select throws_ok(
  $$select public.submit_public_workflow('public-order','{}',false,'73000000-0000-4000-8000-000000000099','83000000-0000-4000-8000-000000000099')$$,
  'P0002','Published workflow unavailable','archived workflow rejects new submissions'
);
reset role;

select is((select count(*) from public.submission_events where event_type='submitted'),1::bigint,'submission transaction creates one auditable submitted event');
select is((select count(*) from public.submission_events where event_type='status:in_review'),1::bigint,'status transition is auditable');
select * from finish();
rollback;
