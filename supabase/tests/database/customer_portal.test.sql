begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('25000000-0000-4000-8000-000000000001','portal-owner@example.invalid',clock_timestamp()),
 ('25000000-0000-4000-8000-000000000002','portal-staff@example.invalid',clock_timestamp()),
 ('25000000-0000-4000-8000-000000000003','portal-other@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('35000000-0000-4000-8000-000000000001','portal-tenant','Portal Tenant','active'),
 ('35000000-0000-4000-8000-000000000002','portal-other','Other Tenant','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('35000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','owner'),
 ('35000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000002','staff'),
 ('35000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000003','owner');
insert into public.brand_configurations(organization_id,config) values
 ('35000000-0000-4000-8000-000000000001','{"displayName":"פורטל","palette":{"primary":"#112233"},"links":[]}');

create function pg_temp.config() returns jsonb language sql as $$
  select '{"title":"הזמנה","description":"","mode":"public","caseFields":[],"steps":[{"id":"s","title":"פרטים","fields":[{"id":"n","key":"full_name","label":"שם","type":"text","required":true,"role":"customer_name"},{"id":"p","key":"phone","label":"טלפון","type":"phone","required":true,"role":"customer_phone"}]}],"pricing":{"enabled":false,"currency":"ILS","fees":[],"depositPercent":0,"totalLabel":"סה״כ"},"branding":{"primaryColor":"#EA580C","logoText":"x"},"consent":{"required":false,"text":""},"successMessage":"ok"}'::jsonb
$$;
insert into public.workflows(id,organization_id,public_slug,status,draft_config,draft_design,schema_version,created_by,template_key,intake)
values ('45000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','portal-form','draft',pg_temp.config(),'{}',8,'25000000-0000-4000-8000-000000000001','t','{"paused":false,"onePerContact":false}');
insert into public.workflow_versions(id,organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by)
values ('45000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',1,8,'t',pg_temp.config(),'{}','25000000-0000-4000-8000-000000000001');
update public.workflows set status='published',published_version_id='45000000-0000-4000-8000-000000000001' where id='45000000-0000-4000-8000-000000000001';

-- Two customers submit.
set local role anon;
select lives_ok($$select public.submit_public_workflow('portal-form','{"full_name":"דנה","phone":"050-1111111"}',false,'75000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001')$$,'customer A submits');
select lives_ok($$select public.submit_public_workflow('portal-form','{"full_name":"רון","phone":"050-2222222"}',false,'75000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000002')$$,'customer B submits');
select throws_ok($$select public.public_request_tracking_token('portal-form','75000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002')$$,'P0002',null,'a tracking link needs both secrets of the same submission');
reset role;

create temp table tokens(name text primary key, token text);
grant all on tokens to anon, authenticated;
set local role anon;
insert into tokens values
 ('a', public.public_request_tracking_token('portal-form','75000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001')),
 ('b', public.public_request_tracking_token('portal-form','75000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000002'));
select ok((select token from tokens where name='a') ~ '^[A-Za-z0-9_-]{43}$','tracking token is 256-bit url-safe');
select is(public.public_track_request('x'||(select token from tokens where name='a')),null,'altered token opens nothing');
select is(public.public_track_request('short'),null,'malformed token opens nothing');
select throws_ok($$select * from public.quotes$$,'42501',null,'anonymous caller cannot read quotes');
select throws_ok($$select * from public.submission_notes$$,'42501',null,'anonymous caller cannot read notes');
reset role;
select is((select count(*) from private.submission_access_tokens where token_hash = (select token from tokens where name='a')),0::bigint,'raw tokens are never stored');

create temp table ids(name text primary key, id uuid);
grant all on ids to anon, authenticated;
insert into ids select 'a', id from public.submissions where idempotency_key='75000000-0000-4000-8000-000000000001';
insert into ids select 'b', id from public.submissions where idempotency_key='75000000-0000-4000-8000-000000000002';
set local role anon;
select is((public.public_track_request((select token from tokens where name='a'))->'request'->>'id')::uuid,(select id from ids where name='a'),'token A opens request A');
select is((public.public_track_request((select token from tokens where name='b'))->'request'->>'id')::uuid,(select id from ids where name='b'),'token B opens request B');
reset role;

-- Staff works the request: an internal note, an approval request and a quote.
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000002';
select lives_ok($$select public.add_submission_note('35000000-0000-4000-8000-000000000001',(select id from ids where name='a'),'לקוחה רגישה למחיר — סוד')$$,'staff adds an internal note');
insert into ids select 'action', id from public.create_customer_action('35000000-0000-4000-8000-000000000001',(select id from ids where name='a'),'{"kind":"approval","title":"תוספת עטיפה","amount":25}');
select throws_ok($$select public.save_quote_draft('35000000-0000-4000-8000-000000000001',(select id from ids where name='a'),null,'{"title":"","items":[]}',null)$$,'22023','quote_invalid','an invalid quote is refused');
insert into ids select 'q1', id from public.save_quote_draft('35000000-0000-4000-8000-000000000001',(select id from ids where name='a'),null,
 '{"title":"זר כלה","items":[{"id":"main","label":"זר","unitPrice":300,"quantity":1,"optional":false,"included":true,"adjustable":false},{"id":"vase","label":"אגרטל","unitPrice":45.5,"quantity":1,"optional":true,"included":false,"adjustable":true,"maxQuantity":3}],"adjustments":[{"label":"הנחת חג","kind":"discount","mode":"percent","value":10}],"vat":{"mode":"excluded","rate":18}}',null);
select is((select total_minor from public.quotes where id=(select id from ids where name='q1')),31860::bigint,'draft total: 300 - 10% + 18% VAT');
select throws_ok($$select public.send_quote('35000000-0000-4000-8000-000000000001',(select id from ids where name='q1'),5)$$,'40001',null,'a stale send is refused');
select lives_ok($$select public.send_quote('35000000-0000-4000-8000-000000000001',(select id from ids where name='q1'),0)$$,'staff sends the quote');
reset role;

-- Another tenant can do nothing with it.
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000003';
select throws_ok($$select public.add_submission_note('35000000-0000-4000-8000-000000000001',(select id from ids where name='a'),'x')$$,'42501',null,'another tenant cannot add notes');
select throws_ok($$select public.issue_tracking_link('35000000-0000-4000-8000-000000000001',(select id from ids where name='a'))$$,'42501',null,'another tenant cannot issue links');
select is((select count(*) from public.quotes),0::bigint,'another tenant sees no quotes');
reset role;

-- The customer sees customer-facing data only.
set local role anon;
select ok(position('סוד' in public.public_track_request((select token from tokens where name='a'))::text) = 0,'internal notes never reach the customer');
select ok(position('25000000' in public.public_track_request((select token from tokens where name='a'))::text) = 0,'staff identities never reach the customer');
select is(jsonb_array_length(public.public_track_request((select token from tokens where name='b'))->'quotes'),0,'customer B does not see customer A quote');
select is((public.public_track_request((select token from tokens where name='a'))->'quotes'->0->'totals'->>'total')::numeric,318.60,'customer sees the server total');
select throws_ok($$select public.public_respond_action((select token from tokens where name='b'),(select id from ids where name='action'),'a')$$,'P0002',null,'token B cannot answer request A');
select lives_ok($$select public.public_respond_action((select token from tokens where name='a'),(select id from ids where name='action'),'a')$$,'customer approves the extra');
select lives_ok($$select public.public_respond_action((select token from tokens where name='a'),(select id from ids where name='action'),'a')$$,'the same answer again is a harmless retry');
select throws_ok($$select public.public_respond_action((select token from tokens where name='a'),(select id from ids where name='action'),'b')$$,'55000','action_answered','a different answer after answering is refused');
select throws_ok($$select public.public_decide_quote((select token from tokens where name='a'),(select id from ids where name='q1'),'approved','{"vase":9}',null,'95000000-0000-4000-8000-000000000001')$$,'22023','selection_invalid','a quantity above the offer is refused');
select throws_ok($$select public.public_decide_quote((select token from tokens where name='a'),(select id from ids where name='q1'),'approved','{"main":0}',null,'95000000-0000-4000-8000-000000000001')$$,'22023','selection_invalid','a required item cannot be removed');
select is((public.public_decide_quote((select token from tokens where name='a'),(select id from ids where name='q1'),'approved','{"vase":2}','מעולה','95000000-0000-4000-8000-000000000001')->'decision'->'totals'->>'total')::numeric,
  round((300 + 91 - 39.1) * 1.18, 2),'approval recalculates the total with the chosen extras');
select is((public.public_decide_quote((select token from tokens where name='a'),(select id from ids where name='q1'),'approved','{"vase":2}','מעולה','95000000-0000-4000-8000-000000000001')->>'replayed')::boolean,true,'a replayed approval returns the stored decision');
select throws_ok($$select public.public_decide_quote((select token from tokens where name='a'),(select id from ids where name='q1'),'declined',null,null,'95000000-0000-4000-8000-000000000002')$$,'55000','quote_closed','a decided quote cannot be decided again');
reset role;
select is((select status from public.submissions where id=(select id from ids where name='a')),'approved','an approved quote approves the request');
select is((select viewed_at is not null from public.quotes where id=(select id from ids where name='q1')),true,'opening the link marks the quote as viewed');

-- Revisions, revocation and expiry.
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000001';
insert into ids select 'q2', id from public.save_quote_draft('35000000-0000-4000-8000-000000000001',(select id from ids where name='b'),null,
 '{"title":"הצעה","items":[{"id":"x","label":"שירות","unitPrice":100,"quantity":1,"optional":false,"included":true,"adjustable":false}],"vat":{"mode":"included","rate":18}}',null);
select lives_ok($$select public.send_quote('35000000-0000-4000-8000-000000000001',(select id from ids where name='q2'),0)$$,'owner sends a quote to B');
insert into ids select 'q3', id from public.save_quote_draft('35000000-0000-4000-8000-000000000001',(select id from ids where name='b'),null,
 '{"title":"הצעה מעודכנת","items":[{"id":"x","label":"שירות","unitPrice":90,"quantity":1,"optional":false,"included":true,"adjustable":false}],"vat":{"mode":"included","rate":18}}',null);
select throws_ok($$select public.save_quote_draft('35000000-0000-4000-8000-000000000001',(select id from ids where name='b'),null,'{"title":"עוד","items":[{"id":"x","label":"x","unitPrice":1,"quantity":1,"optional":false,"included":true,"adjustable":false}],"vat":{"mode":"exempt","rate":0}}',null)$$,'55000','quote_draft_exists','one draft at a time');
select lives_ok($$select public.send_quote('35000000-0000-4000-8000-000000000001',(select id from ids where name='q3'),0)$$,'owner sends a revision');
select is((select status from public.quotes where id=(select id from ids where name='q2')),'superseded','the earlier quote is superseded');
reset role;
set local role anon;
select throws_ok($$select public.public_decide_quote((select token from tokens where name='b'),(select id from ids where name='q2'),'approved',null,null,'95000000-0000-4000-8000-000000000003')$$,'55000','quote_closed','a superseded quote cannot be accepted');
select throws_ok($$select public.public_decide_quote((select token from tokens where name='b'),(select id from ids where name='q3'),'changes_requested',null,'  ','95000000-0000-4000-8000-000000000004')$$,'22023','comment_required','a change request needs words');
select lives_ok($$select public.public_decide_quote((select token from tokens where name='b'),(select id from ids where name='q3'),'changes_requested',null,'אפשר בשבוע הבא?','95000000-0000-4000-8000-000000000004')$$,'customer asks for changes');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000001';
select is(public.revoke_tracking_links('35000000-0000-4000-8000-000000000001',(select id from ids where name='b')),1,'owner revokes the customer links');
insert into tokens values ('b2', public.issue_tracking_link('35000000-0000-4000-8000-000000000001',(select id from ids where name='b')));
reset role;
set local role anon;
select is(public.public_track_request((select token from tokens where name='b')),null,'a revoked link opens nothing');
select isnt(public.public_track_request((select token from tokens where name='b2')),null,'a newly issued link works');
reset role;
update private.submission_access_tokens set expires_at = clock_timestamp() - interval '1 second' where token_hash = private.hash_token((select token from tokens where name='b2'));
set local role anon;
select is(public.public_track_request((select token from tokens where name='b2')),null,'an expired link opens nothing');
select throws_ok($$select public.public_cancel_request((select token from tokens where name='a'))$$,'55000','request_not_cancellable','an approved request cannot be cancelled by the customer');
reset role;

select is((select count(*) from public.submission_events where visibility='customer' and submission_id=(select id from ids where name='a')) >= 4,true,'customer-visible timeline records sends, answers and decisions');
select throws_ok($$update public.submission_notes set body='x'$$,'55000',null,'notes are immutable');
select * from finish();
rollback;
