-- Brand media (logos, covers, content images) on Supabase Storage.
--
-- * One public-read bucket: published forms are anonymous, and object names are random ids under
--   the organization's folder. Only small raster images (no SVG), 1 MB at most; the browser
--   already downsizes and converts before upload. No image-transformation add-on is used.
-- * Writes are tenant-scoped by RLS on storage.objects: members may add objects only inside
--   their own organization's folder. Objects are never overwritten or deleted by clients, so a
--   published version keeps its images; removing an image hides it from the library only.
-- * Metadata and per-organization quotas live in public.organization_assets.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.storage_folder_org(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
revoke all on function private.storage_folder_org(text) from public, anon, service_role;
grant execute on function private.storage_folder_org(text) to authenticated;

create policy brand_assets_member_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and name ~ '^[0-9a-f-]{36}/ast_[a-z0-9]{8,40}$'
    and private.has_org_role(private.storage_folder_org(name), array['owner', 'staff'])
  );

create table public.organization_assets (
  id text primary key check (id ~ '^ast_[a-z0-9]{8,40}$'),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('logo', 'cover', 'image')),
  name text not null check (length(name) between 1 and 120),
  mime text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  bytes integer not null check (bytes between 1 and 1048576),
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index organization_assets_library on public.organization_assets(organization_id, created_at desc) where removed_at is null;
alter table public.organization_assets enable row level security;
revoke all on public.organization_assets from public, anon, authenticated, service_role;
grant select on public.organization_assets to authenticated;
grant select, insert, update, delete on public.organization_assets to service_role;
create policy tenant_read on public.organization_assets for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'staff']));
create trigger audit_change after insert or update or delete on public.organization_assets for each row execute function private.record_change();

-- Records an uploaded object after checking it really exists in the organization's folder.
create function public.register_organization_asset(
  p_organization_id uuid, p_id text, p_kind text, p_name text, p_mime text, p_width integer, p_height integer
)
returns setof public.organization_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_bytes integer;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select coalesce((o.metadata ->> 'size')::integer, 0) into object_bytes from storage.objects o
   where o.bucket_id = 'brand-assets' and o.name = p_organization_id::text || '/' || p_id;
  if not found then raise exception 'asset_missing' using errcode = 'P0002'; end if;
  if (select count(*) from public.organization_assets a where a.organization_id = p_organization_id and a.removed_at is null) >= 80
     or (select coalesce(sum(a.bytes), 0) from public.organization_assets a where a.organization_id = p_organization_id) + object_bytes > 50 * 1048576 then
    raise exception 'asset_quota' using errcode = '54000';
  end if;
  return query insert into public.organization_assets(id, organization_id, kind, name, mime, bytes, width, height, created_by)
    values (p_id, p_organization_id, p_kind, left(btrim(p_name), 120), p_mime, greatest(object_bytes, 1), p_width, p_height, auth.uid())
    returning *;
end;
$$;

create function public.remove_organization_asset(p_organization_id uuid, p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  update public.organization_assets a set removed_at = clock_timestamp()
   where a.organization_id = p_organization_id and a.id = p_id and a.removed_at is null;
end;
$$;

revoke all on function public.register_organization_asset(uuid, text, text, text, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.remove_organization_asset(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.register_organization_asset(uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.remove_organization_asset(uuid, text) to authenticated;

commit;
