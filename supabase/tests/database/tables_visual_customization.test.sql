-- Formangle Tables T9: menu images, customizable public pages and additional guest questions.
-- Covers asset ownership, bounded configuration, draft/published separation, server-side answer
-- validation, team-only projections, privacy, grants and tenant isolation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('a9000000-0000-4000-8000-000000000001','vc-owner@example.invalid',clock_timestamp()),
 ('a9000000-0000-4000-8000-000000000002','vc-host@example.invalid',clock_timestamp()),
 ('a9000000-0000-4000-8000-000000000003','vc-viewer@example.invalid',clock_timestamp()),
 ('a9000000-0000-4000-8000-000000000004','vc-other@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('b9000000-0000-4000-8000-000000000001','vc-a','VC A','active'),
 ('b9000000-0000-4000-8000-000000000002','vc-b','VC B','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','owner'),
 ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','staff'),
 ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000003','staff'),
 ('b9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000004','owner');
insert into public.brand_configurations(organization_id,config) values
 ('b9000000-0000-4000-8000-000000000001','{"displayName":"VC","palette":{"primary":"#1F6F5C","background":"#F8FAFC"},"typography":"editorial","button":"pill","logoAssetId":"ast_vcalogo01"}');
insert into public.tables_organization_features(organization_id,enabled) values
 ('b9000000-0000-4000-8000-000000000001',true),('b9000000-0000-4000-8000-000000000002',true);
insert into public.organization_assets(id,organization_id,kind,name,mime,bytes,width,height,created_by) values
 ('ast_vcalogo01','b9000000-0000-4000-8000-000000000001','logo','logo.webp','image/webp',100,100,100,'a9000000-0000-4000-8000-000000000001'),
 ('ast_vcahero01','b9000000-0000-4000-8000-000000000001','cover','hero.webp','image/webp',100,100,100,'a9000000-0000-4000-8000-000000000001'),
 ('ast_vcadish01','b9000000-0000-4000-8000-000000000001','image','dish.webp','image/webp',100,100,100,'a9000000-0000-4000-8000-000000000001'),
 ('ast_vcadish02','b9000000-0000-4000-8000-000000000001','image','dish2.webp','image/webp',100,100,100,'a9000000-0000-4000-8000-000000000001'),
 ('ast_vcbforeign','b9000000-0000-4000-8000-000000000002','image','b.webp','image/webp',100,100,100,'a9000000-0000-4000-8000-000000000004');

create function pg_temp.theme(p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('preset','cafe','inheritBrand',false,'palette',jsonb_build_object('accent','#9C5B32','background','#F6EFE6','surface','#FFFDF9','text','#3B2A20'),
    'typography','friendly','button','pill','card','soft','radius','lg','background','pattern','pattern','dots','showLogo',true,'heroStyle','banner') || p_extra
$$;
create function pg_temp.pages(p_theme jsonb default '{}', p_booking_fields jsonb default null, p_waitlist_fields jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object('version',1,'theme',pg_temp.theme(p_theme),
    'booking', jsonb_build_object('ownTheme',false,'copy',jsonb_build_object('title','שולחן אצלנו','submitLabel','להזמנה'),
      'fields', coalesce(p_booking_fields, '[{"key":"name","kind":"builtin","group":"contact"},{"key":"phone","kind":"builtin","group":"contact"},
        {"key":"email","kind":"builtin","group":"contact","hidden":true},{"key":"requests","kind":"builtin","group":"extra"},
        {"key":"q_allergy01","kind":"text","label":"אלרגיות?","group":"extra","required":true},
        {"key":"q_seat0001","kind":"select","label":"איפה לשבת?","group":"extra","options":["בפנים","בחוץ"]},
        {"key":"q_bday0001","kind":"checkbox","label":"חוגגים יום הולדת","group":"extra"},
        {"key":"q_hidden01","kind":"text","label":"מוסתרת","group":"extra","hidden":true}]'::jsonb)),
    'waitlist', jsonb_build_object('ownTheme',false,'copy','{}'::jsonb,
      'fields', coalesce(p_waitlist_fields, '[{"key":"name","kind":"builtin","group":"contact"},{"key":"phone","kind":"builtin","group":"contact"},
        {"key":"notes","kind":"builtin","group":"extra","hidden":true},{"key":"q_kids0001","kind":"checkbox","label":"יש ילדים","group":"extra","required":true}]'::jsonb)))
$$;
create function pg_temp.draft(p_pages jsonb, p_intro text default 'ברוכים הבאים') returns jsonb language sql as $$
  select jsonb_build_object(
    'schema', 1,
    'basics', jsonb_build_object('name','ביסטרו עיצוב','timezone','Asia/Jerusalem'),
    'services', jsonb_build_array(jsonb_build_object('key','dinner','name','ערב','weekdays','[0,1,2,3,4,5,6]'::jsonb,'start','18:00','lastSeating','22:00','durationMinutes',90)),
    'zones', '[{"id":"c9000000-0000-4000-8000-000000000001","name":"אולם"}]'::jsonb,
    'tables', '[{"id":"d9000000-0000-4000-8000-000000000001","label":"1","zoneId":"c9000000-0000-4000-8000-000000000001","minCovers":1,"maxCovers":4,"shape":"square","x":0,"y":0,"w":60,"h":60},
                {"id":"d9000000-0000-4000-8000-000000000002","label":"2","zoneId":"c9000000-0000-4000-8000-000000000001","minCovers":1,"maxCovers":4,"shape":"square","x":80,"y":0,"w":60,"h":60}]'::jsonb,
    'combinations', '[]'::jsonb,
    'policy', jsonb_build_object('slotMinutes',30,'leadMinutes',0,'horizonDays',30,'minParty',1,'maxParty',8,'bufferMinutes',0,
      'approvalMode','auto','pendingMode','unallocated','pendingHoldMinutes',15,'cancelCutoffMinutes',240,'modifyCutoffMinutes',240,
      'allowGuestModify',true,'rules','[]'::jsonb,'waitlist',jsonb_build_object('publicEnabled',true,'offerMinutes',10)),
    'guest', jsonb_build_object('terms','תנאים','intro',p_intro))
    || case when p_pages is null then '{}'::jsonb else jsonb_build_object('publicPages', p_pages) end
$$;
create function pg_temp.draft_b(p_pages jsonb) returns jsonb language sql as $$
  select replace(pg_temp.draft(p_pages)::text, '9000000-0000-4000-8000-00000000000', '8000000-0000-4000-8000-00000000000')::jsonb
$$;
create temp table ctx(k text primary key, v text);
grant all on ctx to anon, authenticated;
insert into ctx values ('day', ((clock_timestamp() at time zone 'Asia/Jerusalem')::date + 3)::text);
create function pg_temp.save(p_draft jsonb) returns jsonb language plpgsql as $$
declare vid uuid := (select v::uuid from ctx where k='venue');
begin
  return public.tables_save_draft(vid, p_draft, (public.tables_get_venue(vid)->>'lockVersion')::bigint);
end;
$$;
create function pg_temp.publish() returns jsonb language plpgsql as $$
declare vid uuid := (select v::uuid from ctx where k='venue');
begin
  return public.tables_publish_venue(vid, (public.tables_get_venue(vid)->>'lockVersion')::bigint);
end;
$$;
create function pg_temp.book(p_key text, p_time text, p_answers jsonb, p_slug text default 'vc-venue') returns jsonb language sql as $$
  select public.tables_public_book(p_slug, jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time',p_time,'party',2,
    'name','אורחת','phone','050-'||lpad((abs(hashtext(p_key)) % 10000000)::text,7,'0'),'email','guest@example.invalid','termsAccepted',true)
    || case when p_answers is null then '{}'::jsonb else jsonb_build_object('customAnswers', p_answers) end, p_key::uuid, p_key::uuid)
$$;
grant execute on function pg_temp.book(text,text,jsonb,text) to anon;
create function pg_temp.res_by_key(p_key text) returns public.tables_reservations language sql security definer as $$
  select * from public.tables_reservations where idempotency_key = p_key::uuid $$;
grant execute on function pg_temp.res_by_key(text) to anon, authenticated;

-- ---------- Owner: create venue, save and validate publicPages ----------
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
insert into ctx select 'venue', (public.tables_create_venue('b9000000-0000-4000-8000-000000000001','ביסטרו עיצוב','vc-venue')->>'id');
select lives_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"logoAssetId":"ast_vcalogo01","heroAssetId":"ast_vcahero01"}')))$$, 'a valid publicPages with own images saves');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"heroAssetId":"ast_vcbforeign"}')))$$, '22023', 'tables:public_pages_invalid', 'another organization''s image is rejected');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"heroAssetId":"https://evil.example/x.png"}')))$$, '22023', 'tables:public_pages_invalid', 'a URL instead of an asset id is rejected');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"script":"alert(1)"}')))$$, '22023', 'tables:public_pages_invalid', 'unknown theme keys are rejected (bounded config)');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"palette":{"accent":"red","background":"#FFFFFF","surface":"#FFFFFF","text":"#000000"}}')))$$, '22023', 'tables:public_pages_invalid', 'a non-hex colour is rejected');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{}', '[{"key":"name","kind":"builtin","group":"contact","hidden":true},{"key":"phone","kind":"builtin","group":"contact"}]')))$$,
  '22023', 'tables:public_pages_invalid', 'the mandatory name field cannot be hidden');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{}', '[{"key":"name","kind":"builtin","group":"contact"}]')))$$,
  '22023', 'tables:public_pages_invalid', 'the mandatory phone field cannot be removed');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{}', (select '[{"key":"name","kind":"builtin","group":"contact"},{"key":"phone","kind":"builtin","group":"contact"}]'::jsonb
    || jsonb_agg(jsonb_build_object('key','q_many000'||n,'kind','text','label','ש'||n,'group','extra')) from generate_series(1,7) n))))$$,
  '22023', 'tables:public_pages_invalid', 'more than six additional questions are rejected');
select throws_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{}', '[{"key":"name","kind":"builtin","group":"contact"},{"key":"phone","kind":"builtin","group":"contact"},{"key":"q_select01","kind":"select","label":"x","group":"extra","options":[]}]')))$$,
  '22023', 'tables:public_pages_invalid', 'a select question needs options');
select lives_ok($$select pg_temp.save(pg_temp.draft(null))$$, 'a draft without publicPages (standard pages) saves');
select lives_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"logoAssetId":"ast_vcalogo01","heroAssetId":"ast_vcahero01"}')))$$, 'restore the valid design');
select lives_ok($$select pg_temp.publish()$$, 'publish with publicPages');
select ok(public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a9000000-0000-4000-8000-000000000002','host') is not null, 'assign host');
select ok(public.tables_assign_staff((select v::uuid from ctx where k='venue'),'a9000000-0000-4000-8000-000000000003','viewer') is not null, 'assign viewer');

-- Draft/published separation: a new draft title does not reach guests until published.
select lives_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"logoAssetId":"ast_vcalogo01","heroAssetId":"ast_vcahero01"}') || '{"booking":{"ownTheme":false,"copy":{"title":"טיוטה בלבד"},"fields":[{"key":"name","kind":"builtin","group":"contact"},{"key":"phone","kind":"builtin","group":"contact"}]}}'))$$, 'save an unpublished draft change');

-- ---------- Public projection ----------
set local role anon;
select is(public.tables_public_venue('vc-venue')->'pages'->'booking'->'copy'->>'title', 'שולחן אצלנו', 'guests see the PUBLISHED wording, never the draft');
select is(public.tables_public_venue('vc-venue')->'pages'->'theme'->>'heroAssetId', 'ast_vcahero01', 'published page design is public');
select is(public.tables_public_venue('vc-venue')->>'assetOwner', 'b9000000-0000-4000-8000-000000000001', 'asset folder is the owning organization');
select is(public.tables_public_venue('vc-venue')->'brandKit'->>'typography', 'editorial', 'Brand Kit basics for inheritance');
select is(public.tables_public_venue('vc-venue')->'brandKit'->>'logoAssetId', 'ast_vcalogo01', 'Brand Kit logo id');
select ok(not (public.tables_public_venue('vc-venue') ? 'draft'), 'no draft in the public projection');

-- ---------- Additional questions: server-side validation ----------
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000001','18:00','{}')$$, '22023', 'tables:answer_required', 'a required answer is enforced by the server');
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000002','18:00','{"q_allergy01":"שומשום","q_unknown1":"x"}')$$, '22023', 'tables:answers_invalid', 'unknown question ids are rejected');
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000003','18:00','{"q_allergy01":"שומשום","q_seat0001":"על הגג"}')$$, '22023', 'tables:answers_invalid', 'a select answer must be one of the options');
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000004','18:00','{"q_allergy01":"שומשום","q_bday0001":"yes"}')$$, '22023', 'tables:answers_invalid', 'a checkbox answer must be boolean');
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000005','18:00','{"q_allergy01":"שומשום","q_hidden01":"x"}')$$, '22023', 'tables:answers_invalid', 'hidden questions cannot be answered');
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000006','18:00',jsonb_build_object('q_allergy01', repeat('א', 301)))$$, '22023', 'tables:answers_invalid', 'answers are length-bounded');
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000007','18:00','["q_allergy01"]')$$, '22023', 'tables:answers_invalid', 'answers must be an object');
select is(pg_temp.book('e9000000-0000-4000-8000-000000000010','18:00','{"q_allergy01":" שומשום ","q_seat0001":"בחוץ","q_bday0001":true}')->>'result', 'confirmed', 'a booking with valid answers is confirmed');
select is((pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010')).custom_answers,
  '[{"id":"q_allergy01","kind":"text","label":"אלרגיות?","value":"שומשום"},{"id":"q_seat0001","kind":"select","label":"איפה לשבת?","value":"בחוץ"},{"id":"q_bday0001","kind":"checkbox","label":"חוגגים יום הולדת","value":true}]'::jsonb,
  'answers are stored as a labelled, trimmed snapshot');
select is((pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010')).guest_email, null, 'a hidden email field is not stored even if a client sends it');
select is(pg_temp.book('e9000000-0000-4000-8000-000000000010','18:00','{"q_allergy01":"בוטנים"}')->>'result', 'confirmed', 'an idempotent replay still answers');
select is((pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010')).custom_answers->0->>'value', 'שומשום', 'a replay cannot overwrite stored answers');
select ok(public.tables_public_manage((public.tables_public_book('vc-venue', jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,
    'name','מנהלת','phone','050-7654321','termsAccepted',true,'customAnswers',jsonb_build_object('q_allergy01','אין')),
    'e9000000-0000-4000-8000-000000000011','e9000000-0000-4000-8000-000000000011'))->>'token', 'e9000000-0000-4000-8000-000000000011') is not null, 'guest manage link works');
select ok(not (public.tables_public_manage((select (public.tables_public_book('vc-venue', jsonb_build_object('serviceKey','dinner','date',(select v from ctx where k='day'),'time','19:00','party',2,
    'name','מנהלת','phone','050-7654321','termsAccepted',true,'customAnswers',jsonb_build_object('q_allergy01','אין')),
    'e9000000-0000-4000-8000-000000000011','e9000000-0000-4000-8000-000000000011'))->>'token'), 'e9000000-0000-4000-8000-000000000011')::text like '%אין%'), 'the guest manage projection never returns answers');

-- Waitlist join: required checkbox, hidden notes stripped, answers stored.
select throws_ok($$select public.tables_public_waitlist_join('vc-venue','{"name":"ממתינה","phone":"050-1231231","party":2,"consent":true}','e9000000-0000-4000-8000-000000000020','e9000000-0000-4000-8000-000000000020')$$,
  '22023', 'tables:answer_required', 'waitlist required question is enforced');
select ok(public.tables_public_waitlist_join('vc-venue','{"name":"ממתינה","phone":"050-1231231","party":2,"consent":true,"notes":"סוד","customAnswers":{"q_kids0001":true}}',
  'e9000000-0000-4000-8000-000000000021','e9000000-0000-4000-8000-000000000021') ? 'token', 'waitlist join with answers');

-- No publicPages (the standard page): answers are not accepted at all.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000004';
insert into ctx select 'venueB', (public.tables_create_venue('b9000000-0000-4000-8000-000000000002','מקום רגיל','vc-plain')->>'id');
select lives_ok($$select public.tables_save_draft((select v::uuid from ctx where k='venueB'), pg_temp.draft_b(null), 0)$$, 'standard venue draft');
select lives_ok($$select public.tables_publish_venue((select v::uuid from ctx where k='venueB'), 1)$$, 'standard venue published');
select throws_ok($$select public.tables_save_draft((select v::uuid from ctx where k='venueB'), pg_temp.draft_b(pg_temp.pages('{"heroAssetId":"ast_vcahero01"}')), 1)$$,
  '22023', 'tables:public_pages_invalid', 'tenant isolation: organization B cannot use organization A''s image');
set local role anon;
select throws_ok($$select pg_temp.book('e9000000-0000-4000-8000-000000000030','18:00','{"q_allergy01":"x"}','vc-plain')$$, '22023', 'tables:answers_invalid', 'a standard page accepts no answers');
select is(pg_temp.book('e9000000-0000-4000-8000-000000000031','18:00',null,'vc-plain')->>'result', 'confirmed', 'the standard page still books as before');
select is((pg_temp.res_by_key('e9000000-0000-4000-8000-000000000031')).guest_email, 'guest@example.invalid', 'the standard page keeps the email field');
select is(public.tables_public_venue('vc-plain')->'pages', 'null'::jsonb, 'no page design for a standard venue');
select throws_ok($$select private.tables_public_book_core('vc-venue','{}','e9000000-0000-4000-8000-000000000040','e9000000-0000-4000-8000-000000000040')$$, '42501', null, 'anon cannot call the wrapped core directly');

-- ---------- Team projections ----------
reset role;
insert into ctx select 'res', id::text from public.tables_reservations where idempotency_key = 'e9000000-0000-4000-8000-000000000010';
set local role authenticated;
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000002';
select is(jsonb_array_length(public.tables_reservation_detail((select v::uuid from ctx where k='res'))->'customAnswers'), 3, 'a host sees the answers');
select is(public.tables_waitlist((select v::uuid from ctx where k='venue'), (clock_timestamp() at time zone 'Asia/Jerusalem')::date)->0->'customAnswers'->0->>'value', 'true', 'a host sees waitlist answers');
select is(public.tables_waitlist((select v::uuid from ctx where k='venue'), (clock_timestamp() at time zone 'Asia/Jerusalem')::date)->0->>'notes', null, 'hidden waitlist notes were not stored');
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000003';
select is(public.tables_reservation_detail((select v::uuid from ctx where k='res'))->'customAnswers', 'null'::jsonb, 'a viewer does not see answers');
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000004';
select throws_ok($$select public.tables_reservation_detail((select v::uuid from ctx where k='res'))$$, '42501', null, 'another organization cannot read the reservation');

-- ---------- Publish re-checks images removed after the draft was saved ----------
set local request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
select lives_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"logoAssetId":"ast_vcalogo01","heroAssetId":"ast_vcahero01"}')))$$, 'draft uses the hero image');
select lives_ok($$select public.remove_organization_asset('b9000000-0000-4000-8000-000000000001','ast_vcahero01')$$, 'owner removes the hero from the library');
select lives_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"logoAssetId":"ast_vcalogo01","heroAssetId":"ast_vcahero01"}'), 'פתיחה חדשה'))$$,
  'unchanged publicPages do not block other draft edits');
select throws_ok($$select pg_temp.publish()$$, '22023', 'tables:public_pages_invalid', 'publishing a removed image is blocked');
select lives_ok($$select pg_temp.save(pg_temp.draft(pg_temp.pages('{"logoAssetId":"ast_vcalogo01"}'), 'פתיחה חדשה'))$$, 'owner drops the removed image');
select lives_ok($$select pg_temp.publish()$$, 'and publishes');

-- ---------- Privacy ----------
select is(jsonb_array_length(public.tables_export_guest('b9000000-0000-4000-8000-000000000001',
  (select r.guest_id from pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010') r))->'customAnswers'->'reservations'), 1, 'guest export includes answers');
reset role;
update public.tables_reservations set status = 'completed', ends_at = clock_timestamp() - interval '1 minute', starts_at = clock_timestamp() - interval '2 hours'
 where guest_id = (select r.guest_id from pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010') r);
delete from public.tables_allocations where reservation_id in (select id from public.tables_reservations where guest_id = (select r.guest_id from pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010') r));
set local role authenticated;
select lives_ok($$select public.tables_anonymize_guest('b9000000-0000-4000-8000-000000000001', (select r.guest_id from pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010') r))$$, 'anonymize the guest');
select is((pg_temp.res_by_key('e9000000-0000-4000-8000-000000000010')).custom_answers, null, 'anonymization erases answers');

-- ---------- Menu images ----------
insert into ctx select 'menu', public.tables_menu_create((select v::uuid from ctx where k='venue'), 'ערב')->>'id';
create function pg_temp.menu_save(p_doc jsonb) returns jsonb language plpgsql as $$
declare mid uuid := (select v::uuid from ctx where k='menu');
begin
  return public.tables_menu_save(mid, 'ערב', p_doc, (select (m->>'lockVersion')::bigint from jsonb_array_elements(public.tables_menu_list((select v::uuid from ctx where k='venue'))) m where (m->>'id')::uuid = mid));
end;
$$;
select is(pg_temp.menu_save('{"hero":{"imageAssetId":"ast_vcadish01","title":"ערב","subtitle":"עונתי","description":"מהשוק"},"gallery":["ast_vcadish01","ast_vcadish02"],
  "sections":[{"title":"ראשונות","imageAssetId":"ast_vcadish02","items":[{"name":"סלט","price":"₪40","imageAssetId":"ast_vcadish01"}]}]}')->'problems', '[]'::jsonb, 'own images in hero, gallery, section and dish are valid');
select ok(pg_temp.menu_save('{"gallery":["ast_vcbforeign"],"sections":[{"title":"א","items":[{"name":"ב"}]}]}')->'problems' @> '[{"code":"menu_image_missing","path":"gallery.0"}]', 'a foreign gallery image is a problem');
select ok(pg_temp.menu_save('{"hero":{"imageAssetId":"ast_vcbforeign"},"sections":[{"title":"א","items":[{"name":"ב"}]}]}')->'problems' @> '[{"code":"menu_image_missing","path":"hero"}]', 'a foreign hero image is a problem');
select ok(pg_temp.menu_save('{"sections":[{"title":"א","imageAssetId":"ast_vcahero01","items":[{"name":"ב"}]}]}')->'problems' @> '[{"code":"menu_image_missing","path":"sections.0"}]', 'a removed section image is a problem');
select ok(pg_temp.menu_save('{"gallery":["ast_vcadish01","ast_vcadish01"],"sections":[{"title":"א","items":[{"name":"ב"}]}]}')->'problems' @> '[{"code":"menu_gallery_invalid","path":"gallery"}]', 'gallery duplicates are invalid');
select ok(pg_temp.menu_save(jsonb_build_object('gallery', (select jsonb_agg('ast_vcadish01'::text) from generate_series(1,13)), 'sections', '[{"title":"א","items":[{"name":"ב"}]}]'::jsonb))->'problems' @> '[{"code":"menu_gallery_invalid","path":"gallery"}]', 'gallery is bounded');
select ok(pg_temp.menu_save(('{"hero":{"title":"' || repeat('x', 81) || '"},"sections":[{"title":"א","items":[{"name":"ב"}]}]}')::jsonb)->'problems' @> '[{"code":"menu_hero_invalid","path":"hero"}]', 'hero text is bounded');
select throws_ok($$select public.tables_menu_publish((select v::uuid from ctx where k='menu'), (select (m->>'lockVersion')::bigint from jsonb_array_elements(public.tables_menu_list((select v::uuid from ctx where k='venue'))) m))$$,
  '22023', 'tables:menu_problems', 'a menu with image problems cannot be published');
select is(pg_temp.menu_save('{"hero":{"imageAssetId":"ast_vcadish01","title":"ערב"},"gallery":["ast_vcadish02","ast_vcadish01"],"sections":[{"title":"א","items":[{"name":"ב","imageAssetId":"ast_vcadish02"}]}]}')->'problems', '[]'::jsonb, 'fixed menu');
select lives_ok($$select public.tables_menu_publish((select v::uuid from ctx where k='menu'), (select (m->>'lockVersion')::bigint from jsonb_array_elements(public.tables_menu_list((select v::uuid from ctx where k='venue'))) m))$$, 'menu with images publishes');
set local role anon;
select is(public.tables_public_menus('vc-venue')->'menus'->0->'doc'->'gallery', '["ast_vcadish02","ast_vcadish01"]'::jsonb, 'guests get the gallery in the chosen order');
select is(public.tables_public_menus('vc-venue')->'menus'->0->'doc'->'hero'->>'imageAssetId', 'ast_vcadish01', 'guests get the hero image');

-- ---------- Grants ----------
reset role;
select ok(has_function_privilege('anon', 'public.tables_public_book(text,jsonb,uuid,uuid)', 'execute'), 'anon may book through the wrapper');
select ok(has_function_privilege('anon', 'public.tables_public_waitlist_join(text,jsonb,uuid,uuid)', 'execute'), 'anon may join the waitlist through the wrapper');
select ok(not has_function_privilege('anon', 'public.tables_reservation_detail(uuid)', 'execute'), 'anon cannot read reservation details');
select ok(not has_function_privilege('authenticated', 'private.tables_reservation_detail_core(uuid)', 'execute'), 'the wrapped core is not callable by clients');
select ok(not has_function_privilege('anon', 'private.tables_public_venue_core(text)', 'execute'), 'the public venue core is not callable by clients');
select ok(not has_function_privilege('authenticated', 'private.tables_custom_answers(jsonb,jsonb)', 'execute'), 'validators are private');

select * from finish();
rollback;
