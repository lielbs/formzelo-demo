-- Rollback of 20261122110000_asset_quota_400.sql: back to 80 images per business.
begin;
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
  if (select count(*) from public.organization_assets a where a.organization_id = p_organization_id and a.removed_at is null) >= 80
     or (select coalesce(sum(a.bytes), 0) from public.organization_assets a where a.organization_id = p_organization_id) + object_bytes > 50 * 1048576 then
    raise exception 'asset_quota' using errcode = '54000';
  end if;
  return query insert into public.organization_assets(id, organization_id, kind, name, mime, bytes, width, height, created_by)
    values (p_id, p_organization_id, p_kind, left(btrim(p_name), 120), p_mime, greatest(object_bytes, 1), p_width, p_height, auth.uid())
    returning *;
end;
$$;
delete from supabase_migrations.schema_migrations where version = '20261122110000';
commit;
