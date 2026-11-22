-- Image library quota per business: 400 images (was 80), still 50 MB in total (UX audit 2026-11, D6).
-- A photo menu of one bar (70+ dishes, a gallery, logo and covers) already passed 80 and the upload
-- failed in the middle of setup. Images are downscaled in the browser before upload (most are under
-- 160 KB), so 400 images fit comfortably in the unchanged 50 MB. Only the count changes; the
-- function keeps its signature, so its grants stay as they are.
-- Rollback: supabase/rollback/asset-quota-400-down.sql (restores 80).

create or replace function public.register_organization_asset(
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
  if (select count(*) from public.organization_assets a where a.organization_id = p_organization_id and a.removed_at is null) >= 400
     or (select coalesce(sum(a.bytes), 0) from public.organization_assets a where a.organization_id = p_organization_id) + object_bytes > 50 * 1048576 then
    raise exception 'asset_quota' using errcode = '54000';
  end if;
  return query insert into public.organization_assets(id, organization_id, kind, name, mime, bytes, width, height, created_by)
    values (p_id, p_organization_id, p_kind, left(btrim(p_name), 120), p_mime, greatest(object_bytes, 1), p_width, p_height, auth.uid())
    returning *;
end;
$$;
