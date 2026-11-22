-- Image library quota (UX audit 2026-11, D6): a business can hold 400 images; the 401st is refused
-- with asset_quota. The 50 MB total is unchanged.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email,email_confirmed_at) values ('29000000-0000-4000-8000-000000000001','quota-owner@example.invalid',clock_timestamp());
insert into public.organizations(id,slug,name,status) values ('39000000-0000-4000-8000-000000000001','quota-tenant','Quota','active');
insert into public.organization_memberships(organization_id,user_id,role) values ('39000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000001','owner');

-- 399 images already in the library (1 KB each).
insert into public.organization_assets(id, organization_id, kind, name, mime, bytes, width, height)
select format('ast_quota%s', lpad(n::text, 5, '0')), '39000000-0000-4000-8000-000000000001', 'image', 'מנה', 'image/webp', 1024, 900, 600
  from generate_series(1, 399) n;

set local role authenticated;
set local request.jwt.claim.sub='29000000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name,owner,metadata) values
 ('brand-assets','39000000-0000-4000-8000-000000000001/ast_quota0400a','29000000-0000-4000-8000-000000000001','{"size":2048}'),
 ('brand-assets','39000000-0000-4000-8000-000000000001/ast_quota0401a','29000000-0000-4000-8000-000000000001','{"size":2048}');
select is((select kind from public.register_organization_asset('39000000-0000-4000-8000-000000000001','ast_quota0400a','image','מנה 400','image/webp',900,600)),'image','the 400th image is accepted');
select throws_ok($$select * from public.register_organization_asset('39000000-0000-4000-8000-000000000001','ast_quota0401a','image','מנה 401','image/webp',900,600)$$,'54000','asset_quota','the 401st image is refused');
select lives_ok($$select public.remove_organization_asset('39000000-0000-4000-8000-000000000001','ast_quota00001')$$,'removing an image frees a place');
select is((select kind from public.register_organization_asset('39000000-0000-4000-8000-000000000001','ast_quota0401a','image','מנה 401','image/webp',900,600)),'image','after a removal the next image fits');
reset role;

select * from finish();
rollback;
