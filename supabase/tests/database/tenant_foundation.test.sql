begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
grant usage on schema extensions to authenticated, anon;
select no_plan();

insert into auth.users(id,email) values
 ('20000000-0000-4000-8000-000000000001','owner-a@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','owner-b@example.invalid'),
 ('20000000-0000-4000-8000-000000000003','staff-a@example.invalid');
insert into public.organizations(id,slug,name,status) values
 ('30000000-0000-4000-8000-000000000001','test-tenant-a','Test A','active'),
 ('30000000-0000-4000-8000-000000000002','test-tenant-b','Test B','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner'),
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','staff');
insert into public.organization_settings(organization_id) values
 ('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002');
insert into public.workflows(id,organization_id,public_slug,draft_config,schema_version,created_by) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','test-flow-a','{}',8,'20000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','test-flow-b','{}',8,'20000000-0000-4000-8000-000000000002');
insert into public.workflow_versions(id,organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,8,'test-v1','{}','{}','20000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',1,8,'test-v1','{}','{}','20000000-0000-4000-8000-000000000002');
insert into public.submissions(id,organization_id,workflow_id,workflow_version_id,answers,total_minor,currency,idempotency_key,request_hash) values
 ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','{}',100,'ILS','70000000-0000-4000-8000-000000000001',repeat('a',64)),
 ('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','{}',200,'ILS','70000000-0000-4000-8000-000000000002',repeat('b',64));
insert into public.integration_connections(organization_id,category,provider_key,display_name) values
 ('30000000-0000-4000-8000-000000000001','payments','unconfigured','Test metadata A'),
 ('30000000-0000-4000-8000-000000000002','payments','unconfigured','Test metadata B');

select is((select count(*) from pg_tables where schemaname = 'public' and tablename in
 ('organizations','profiles','organization_memberships','organization_settings','brand_configurations','workflows','workflow_versions','submissions','submission_events','integration_connections','workflow_integration_overrides','audit_events') and not rowsecurity),0::bigint,'all core tables enable RLS');

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
select is((select count(*) from organizations),1::bigint,'owner sees own organization only');
select is((select count(*) from workflows),1::bigint,'owner sees own workflow only');
select is((select count(*) from submissions),1::bigint,'owner sees own submission only');
select is((select count(*) from workflows where id='40000000-0000-4000-8000-000000000002'),0::bigint,'direct cross-tenant ID read denied');
select results_eq($$update organization_settings set config='{"locale":"he-IL"}' where organization_id='30000000-0000-4000-8000-000000000001' returning 1$$,array[1],'owner can update own safe settings');
select is_empty($$update organization_settings set config='{}' where organization_id='30000000-0000-4000-8000-000000000002' returning 1$$,'owner cannot update another tenant settings');
select throws_ok($$update organization_settings set organization_id='30000000-0000-4000-8000-000000000002'$$,'42501',null,'client cannot forge organization ownership');
select throws_ok($$insert into organization_memberships(organization_id,user_id,role) values ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','owner')$$,'42501',null,'owner cannot self-grant another tenant');
select throws_ok($$update workflow_versions set config='{"tampered":true}'$$,'42501',null,'authenticated cannot mutate publication');
select throws_ok($$update submissions set total_minor=1$$,'42501',null,'client cannot set authoritative price');
select throws_ok($$insert into private.platform_operators(user_id) values ('20000000-0000-4000-8000-000000000001')$$,'42501',null,'cannot become platform operator');
select is((select count(*) from integration_connections),1::bigint,'owner sees only own integration metadata');
select throws_ok($$delete from audit_events$$,'42501',null,'client cannot delete audit evidence');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000003';
select is((select count(*) from submissions),1::bigint,'staff reads authorized operational data');
select is_empty($$update organization_settings set config='{"locale":"en-US"}' returning 1$$,'staff cannot perform owner-only settings update');
select is((select count(*) from integration_connections),0::bigint,'staff cannot read integration metadata');
select throws_ok($$update organization_memberships set role='owner'$$,'42501',null,'staff cannot escalate role');
reset role;
update organization_memberships set status='suspended' where user_id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select is((select count(*) from submissions),0::bigint,'suspended member loses access with the same JWT subject');
reset role;
delete from organization_memberships where user_id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select is((select count(*) from workflows),0::bigint,'removed member loses access without token refresh');

set local request.jwt.claim.sub = '';
select is((select count(*) from organizations),0::bigint,'missing subject fails closed');
set local role anon;
select throws_ok($$select * from submissions$$,'42501',null,'anonymous cannot read private submissions');
select throws_ok($$update workflows set draft_config='{}'$$,'42501',null,'anonymous cannot modify workflows');
select throws_ok($$select * from integration_connections$$,'42501',null,'anonymous cannot read provider metadata');
reset role;

select throws_ok($$update workflow_versions set config='{}'$$,'55000','Immutable record','even privileged mutation cannot rewrite versions');
select throws_ok($$delete from audit_events$$,'55000','Immutable record','append-only audit trigger survives privileged DML');
select throws_ok($$update workflows set published_version_id='50000000-0000-4000-8000-000000000002' where id='40000000-0000-4000-8000-000000000001'$$,'23503',null,'published pointer cannot reference another tenant/workflow');
select throws_ok($$update submissions set workflow_version_id='50000000-0000-4000-8000-000000000002' where id='60000000-0000-4000-8000-000000000001'$$,'23503',null,'submission version cannot cross tenant');
select throws_ok($$update submissions set total_minor=-1 where id='60000000-0000-4000-8000-000000000001'$$,'23514',null,'negative prices rejected');
select throws_ok($$insert into submissions(organization_id,workflow_id,workflow_version_id,answers,total_minor,currency,idempotency_key,request_hash)
 select organization_id,workflow_id,workflow_version_id,answers,total_minor,currency,idempotency_key,request_hash from submissions where id='60000000-0000-4000-8000-000000000001'$$,'23505',null,'idempotency constraint rejects duplicate completion');
select throws_ok($$insert into organization_memberships(organization_id,user_id,role) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','super_admin')$$,'23514',null,'invalid organization role rejected');
select is((select count(*) from public.audit_events a left join private.outbox_events o on o.audit_event_id=a.id where o.id is null),0::bigint,'audit and outbox are appended together');
select ok(exists(select 1 from public.audit_events where actor_user_id='20000000-0000-4000-8000-000000000001' and resource_type='organization_settings'),'audit attributes actual caller');

-- Failure after the first write must roll back the entire nested transaction, including triggers.
do $$
begin
  begin
    update organization_settings set config='{"rollbackProbe":true}' where organization_id='30000000-0000-4000-8000-000000000001';
    raise exception 'rollback probe';
  exception when raise_exception then null;
  end;
end;
$$;
select ok(not exists(select 1 from organization_settings where config ? 'rollbackProbe'),'failed transaction leaves no partial settings write');
select * from finish();
rollback;
