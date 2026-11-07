begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('28000000-0000-4000-8000-000000000001','media-owner@example.invalid',clock_timestamp()),
 ('28000000-0000-4000-8000-000000000002','media-other@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values
 ('38000000-0000-4000-8000-000000000001','media-tenant','Media','active'),
 ('38000000-0000-4000-8000-000000000002','media-other','Other','active');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('38000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000001','owner'),
 ('38000000-0000-4000-8000-000000000002','28000000-0000-4000-8000-000000000002','owner');

select is((select public from storage.buckets where id='brand-assets'),true,'brand bucket is public-read for anonymous forms');
select is((select file_size_limit from storage.buckets where id='brand-assets'),1048576::bigint,'brand bucket caps files at 1 MB');
select ok(not (select 'image/svg+xml' = any(allowed_mime_types) from storage.buckets where id='brand-assets'),'SVG is not accepted');

set local role authenticated;
set local request.jwt.claim.sub='28000000-0000-4000-8000-000000000001';
select lives_ok($$insert into storage.objects(bucket_id,name,owner,metadata) values ('brand-assets','38000000-0000-4000-8000-000000000001/ast_logo12345','28000000-0000-4000-8000-000000000001','{"size":2048}')$$,'a member uploads into their own folder');
select throws_ok($$insert into storage.objects(bucket_id,name,owner,metadata) values ('brand-assets','38000000-0000-4000-8000-000000000002/ast_evil12345','28000000-0000-4000-8000-000000000001','{"size":10}')$$,'42501',null,'nobody uploads into another organization folder');
select throws_ok($$insert into storage.objects(bucket_id,name,owner,metadata) values ('brand-assets','38000000-0000-4000-8000-000000000001/../x.png','28000000-0000-4000-8000-000000000001','{"size":10}')$$,'42501',null,'object names are restricted to the expected shape');
select is((select kind from public.register_organization_asset('38000000-0000-4000-8000-000000000001','ast_logo12345','logo','לוגו.webp','image/webp',300,120)),'logo','an uploaded object is registered');
select throws_ok($$select * from public.register_organization_asset('38000000-0000-4000-8000-000000000001','ast_ghost1234','logo','x','image/webp',1,1)$$,'P0002','asset_missing','metadata without an uploaded object is refused');
select is((select bytes from public.organization_assets where id='ast_logo12345'),2048,'the stored size comes from storage, not the client');
select lives_ok($$select public.remove_organization_asset('38000000-0000-4000-8000-000000000001','ast_logo12345')$$,'removing hides the asset from the library');
update storage.objects set name='38000000-0000-4000-8000-000000000001/ast_other123' where bucket_id='brand-assets';
select is((select count(*) from storage.objects where bucket_id='brand-assets'),0::bigint,'clients cannot list objects through SQL');
reset role;

select is((select name from storage.objects where bucket_id='brand-assets'),'38000000-0000-4000-8000-000000000001/ast_logo12345','clients cannot rename objects (deletion goes only through the Storage API, which has no delete policy)');

set local role authenticated;
set local request.jwt.claim.sub='28000000-0000-4000-8000-000000000002';
select throws_ok($$select * from public.register_organization_asset('38000000-0000-4000-8000-000000000001','ast_logo12345','logo','x','image/webp',1,1)$$,'42501',null,'another tenant cannot register assets');
select is((select count(*) from public.organization_assets),0::bigint,'another tenant sees no assets');
reset role;

set local role anon;
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values ('brand-assets','38000000-0000-4000-8000-000000000001/ast_anon12345','{"size":1}')$$,'42501',null,'anonymous visitors cannot upload');
reset role;

select * from finish();
rollback;
