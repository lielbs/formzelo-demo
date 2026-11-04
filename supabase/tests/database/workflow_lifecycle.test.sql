begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

create temporary table workflow_test_state(key text primary key, value text not null);
grant all on workflow_test_state to authenticated, service_role;

create function pg_temp.valid_design() returns jsonb language sql immutable as $$
  select '{"themeVersion":1,"presetId":"modern_minimal","source":"manual","palette":{"primary":"#EA580C","secondary":"#0F172A","accent":"#14B8A6","background":"#F8FAFC","surface":"#FFFFFF","surfaceAlt":"#F1F5F9","text":"#0F172A","muted":"#64748B"},"typography":"neutral","hero":{"layout":"compact"},"composition":"centered","decoration":"minimal","components":{"card":"soft","input":"outlined","option":"tile","button":"solid"},"radius":"lg","shadow":"soft","density":"comfortable","progress":"bar","motion":"subtle","optionArt":false,"mobile":{"compactHero":true,"stickySummary":false},"logo":{"showName":true}}'::jsonb
$$;

insert into auth.users(id,email,email_confirmed_at) values
 ('22000000-0000-4000-8000-000000000001','workflow-owner-a@example.invalid',clock_timestamp()),
 ('22000000-0000-4000-8000-000000000002','workflow-owner-b@example.invalid',clock_timestamp()),
 ('22000000-0000-4000-8000-000000000003','workflow-staff@example.invalid',clock_timestamp()),
 ('22000000-0000-4000-8000-000000000004','workflow-suspended@example.invalid',clock_timestamp()),
 ('22000000-0000-4000-8000-000000000005','workflow-operator@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('32000000-0000-4000-8000-000000000001','workflow-tenant-a','Workflow Tenant A','active'),
 ('32000000-0000-4000-8000-000000000002','workflow-tenant-b','Workflow Tenant B','active');
insert into public.organization_memberships(organization_id,user_id,role,status) values
 ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','owner','active'),
 ('32000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','owner','active'),
 ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000003','staff','active'),
 ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000004','staff','suspended');
insert into public.organization_settings(organization_id,config) values
 ('32000000-0000-4000-8000-000000000001','{"workflowLimit":4}'),
 ('32000000-0000-4000-8000-000000000002','{"workflowLimit":4}');
insert into public.brand_configurations(organization_id,config) values
 ('32000000-0000-4000-8000-000000000001','{}'),
 ('32000000-0000-4000-8000-000000000002','{}');

set local role authenticated;
set local request.jwt.claim.sub = '22000000-0000-4000-8000-000000000001';
with created as (
  select * from public.create_workflow(
    '32000000-0000-4000-8000-000000000001',
    '{"title":"טופס מאובטח","description":"","mode":"public","caseFields":[],"steps":[{"id":"step_1","title":"פרטים","fields":[{"id":"field_1","key":"full_name","label":"שם","type":"text","required":true}]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":true,"text":"מאשר"},"successMessage":"התקבל"}'::jsonb,
    pg_temp.valid_design(),
    'blank',null,8
  )
)
insert into workflow_test_state(key,value) select 'workflow_id',id::text from created;
select is((select count(*) from public.workflows where organization_id='32000000-0000-4000-8000-000000000001'),1::bigint,'owner creates a workflow in the authorized tenant');
select is((select template_key from public.workflows where id=(select value::uuid from workflow_test_state where key='workflow_id')),'blank','template provenance persists');
select throws_ok(
  $$select * from public.create_workflow('32000000-0000-4000-8000-000000000002','{}','{}','blank',null,8)$$,
  '42501','Workspace access denied','cross-tenant workflow creation is denied'
);
select throws_ok(
  $$select * from public.create_workflow('32000000-0000-4000-8000-000000000001','{"title":""}','{}','blank',null,8)$$,
  '22023','Invalid workflow document','invalid draft schema is rejected server-side'
);
select lives_ok(
  format($$select * from public.save_workflow_draft('32000000-0000-4000-8000-000000000001',%L,0,
    '{"title":"טיוטה ערוכה","description":"","mode":"public","caseFields":[],"steps":[{"id":"step_1","title":"פרטים","fields":[{"id":"field_1","key":"full_name","label":"שם","type":"text","required":true}]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":true,"text":"מאשר"},"successMessage":"התקבל"}'::jsonb,
    pg_temp.valid_design(),8)$$,(select value from workflow_test_state where key='workflow_id')),
  'draft save succeeds at the expected revision'
);
select throws_ok(
  format($$select * from public.save_workflow_draft('32000000-0000-4000-8000-000000000001',%L,0,
    '{"title":"כתיבה ישנה","description":"","mode":"public","caseFields":[],"steps":[{"id":"step_1","title":"פרטים","fields":[]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":true,"text":"מאשר"},"successMessage":"התקבל"}'::jsonb,
    pg_temp.valid_design(),8)$$,(select value from workflow_test_state where key='workflow_id')),
  '40001','Workflow changed or is unavailable','stale draft updates are rejected'
);
select lives_ok(
  format($$select * from public.publish_workflow('32000000-0000-4000-8000-000000000001',%L,1,pg_temp.valid_design(),'formangle-test')$$,(select value from workflow_test_state where key='workflow_id')),
  'first immutable publication succeeds'
);
select is((select count(*) from public.workflow_versions where workflow_id=(select value::uuid from workflow_test_state where key='workflow_id')),1::bigint,'publication creates one version');
select is((select status from public.workflows where id=(select value::uuid from workflow_test_state where key='workflow_id')),'published','published pointer activates the workflow');
select is((select lock_version from public.workflows where id=(select value::uuid from workflow_test_state where key='workflow_id')),(select published_lock_version from public.workflows where id=(select value::uuid from workflow_test_state where key='workflow_id')),'fresh publication has no unpublished changes');
select lives_ok(
  format($$select * from public.save_workflow_draft('32000000-0000-4000-8000-000000000001',%L,2,
    '{"title":"גרסה שנייה","description":"","mode":"public","caseFields":[],"steps":[{"id":"step_1","title":"פרטים","fields":[{"id":"field_1","key":"full_name","label":"שם","type":"text","required":true}]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":true,"text":"מאשר"},"successMessage":"התקבל"}'::jsonb,
    pg_temp.valid_design(),8)$$,(select value from workflow_test_state where key='workflow_id')),
  'published workflow can receive a new draft without rewriting version one'
);
select is((select config->>'title' from public.workflow_versions where workflow_id=(select value::uuid from workflow_test_state where key='workflow_id') and version_number=1),'טיוטה ערוכה','version one remains immutable after draft edits');
select lives_ok(
  format($$select * from public.publish_workflow('32000000-0000-4000-8000-000000000001',%L,3,pg_temp.valid_design(),'formangle-test')$$,(select value from workflow_test_state where key='workflow_id')),
  'republishing creates a new version'
);
select results_eq(
  format($$select version_number from public.workflow_versions where workflow_id=%L order by version_number$$,(select value from workflow_test_state where key='workflow_id')),
  $$values (1),(2)$$,
  'published versions are monotonic and coexist'
);
select lives_ok(
  format($$select * from public.set_workflow_archived('32000000-0000-4000-8000-000000000001',%L,4,true)$$,(select value from workflow_test_state where key='workflow_id')),
  'authorized member archives a workflow with optimistic locking'
);
select is((select status from public.workflows where id=(select value::uuid from workflow_test_state where key='workflow_id')),'archived','archive state persists');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select * from public.create_workflow(
    '32000000-0000-4000-8000-000000000001',
    '{"title":"תהליך צוות","description":"","mode":"public","caseFields":[],"steps":[{"id":"s","title":"שלב","fields":[]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"עסק"},"consent":{"required":false,"text":""},"successMessage":"התקבל"}'::jsonb,
    pg_temp.valid_design(),'blank',null,8)$$,
  'active staff can create workflows within the assigned tenant'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select * from public.create_workflow('32000000-0000-4000-8000-000000000001','{}','{}','blank',null,8)$$,
  '42501','Workspace access denied','suspended membership cannot mutate workflows'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.create_workflow('32000000-0000-4000-8000-000000000001','{}','{}','blank',null,8)$$,
  '42501',null,'anonymous caller cannot execute workflow commands'
);
reset role;

insert into private.platform_operators(user_id) values ('22000000-0000-4000-8000-000000000005');
set local role authenticated;
set local request.jwt.claim.sub = '22000000-0000-4000-8000-000000000005';
select throws_ok(
  $$select * from public.server_provision_organization_authorized('provisioned-test','Provisioned Test','new-owner@example.invalid','22000000-0000-4000-8000-000000000005')$$,
  '42501',null,'browser cannot call organization provisioning wrapper'
);
reset role;
set local role service_role;
select lives_ok(
  $$select * from public.server_provision_organization_authorized('provisioned-test','Provisioned Test','new-owner@example.invalid','22000000-0000-4000-8000-000000000005')$$,
  'trusted server boundary provisions an organization and owner invitation transactionally'
);
reset role;
select is((select count(*) from public.organizations where slug='provisioned-test'),1::bigint,'provisioned organization persists exactly once');
select is((select count(*) from private.owner_invitations i join public.organizations o on o.id=i.organization_id where o.slug='provisioned-test'),1::bigint,'provisioning creates exactly one owner invitation');
select ok(exists(select 1 from public.audit_events where resource_type='organization_provisioning' and actor_user_id='22000000-0000-4000-8000-000000000005'),'provisioning records the verified operator');

select throws_ok(
  format($$update public.workflow_versions set config='{}' where workflow_id=%L$$,(select value from workflow_test_state where key='workflow_id')),
  '55000','Immutable record','even privileged SQL cannot rewrite a published version'
);
select * from finish();
rollback;
