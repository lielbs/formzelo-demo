-- Formangle Tables T6: venue menus. A menu is a structured, versioned document (sections and
-- items with price text, dietary labels and allergens). Browsing a menu never creates an order,
-- charge or POS transaction. Images reference the organization's existing brand assets.
begin;

create table public.tables_menus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 80),
  draft jsonb not null default '{"sections":[]}' check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 131072),
  lock_version bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_version_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.tables_venues(organization_id, id) on delete restrict,
  unique (organization_id, venue_id, id)
);
create table public.tables_menu_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  venue_id uuid not null,
  menu_id uuid not null,
  version_number integer not null,
  snapshot jsonb not null,
  published_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id, menu_id) references public.tables_menus(organization_id, venue_id, id) on delete restrict,
  unique (menu_id, version_number)
);
alter table public.tables_menus add constraint tables_menu_published_version foreign key (published_version_id) references public.tables_menu_versions(id) on delete restrict;

do $$
declare t text;
begin
  foreach t in array array['tables_menus','tables_menu_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.record_change()', t);
  end loop;
end;
$$;
create trigger tables_touch before update on public.tables_menus for each row execute function private.tables_touch();
create trigger immutable_record before update or delete on public.tables_menu_versions for each row execute function private.reject_mutation();

create function private.tables_menu_problems(p_org uuid, p_doc jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  problems jsonb := '[]';
  s jsonb; it jsonb;
  i integer := 0; j integer;
  items integer := 0;
  tag text;
begin
  if jsonb_typeof(p_doc->'sections') <> 'array' or jsonb_array_length(p_doc->'sections') = 0 then return '[{"code":"menu_section_required","path":"sections"}]'; end if;
  if jsonb_array_length(p_doc->'sections') > 30 then problems := problems || '[{"code":"menu_too_large","path":"sections"}]'; end if;
  for s in select value from jsonb_array_elements(p_doc->'sections') loop
    if length(btrim(coalesce(s->>'title', ''))) not between 1 and 80 then problems := problems || jsonb_build_array(jsonb_build_object('code','menu_section_title','path','sections.'||i)); end if;
    if jsonb_typeof(s->'items') <> 'array' then problems := problems || jsonb_build_array(jsonb_build_object('code','menu_items_invalid','path','sections.'||i));
    else
      j := 0;
      for it in select value from jsonb_array_elements(s->'items') loop
        items := items + 1;
        if length(btrim(coalesce(it->>'name', ''))) not between 1 and 100 or length(coalesce(it->>'description', '')) > 400
           or length(coalesce(it->>'price', '')) > 24 then
          problems := problems || jsonb_build_array(jsonb_build_object('code','menu_item_invalid','path','sections.'||i||'.items.'||j));
        end if;
        for tag in select jsonb_array_elements_text(coalesce(it->'dietary', '[]')) loop
          if tag not in ('vegan','vegetarian','gluten_free','spicy','kosher','dairy_free','contains_alcohol') then
            problems := problems || jsonb_build_array(jsonb_build_object('code','menu_tag_invalid','path','sections.'||i||'.items.'||j)); exit;
          end if;
        end loop;
        for tag in select jsonb_array_elements_text(coalesce(it->'allergens', '[]')) loop
          if tag not in ('gluten','dairy','egg','peanut','tree_nut','soy','fish','shellfish','sesame','mustard','celery','sulphites') then
            problems := problems || jsonb_build_array(jsonb_build_object('code','menu_tag_invalid','path','sections.'||i||'.items.'||j)); exit;
          end if;
        end loop;
        if coalesce(it->>'imageAssetId', '') <> '' and not exists (select 1 from public.organization_assets a
            where a.id = it->>'imageAssetId' and a.organization_id = p_org and a.removed_at is null) then
          problems := problems || jsonb_build_array(jsonb_build_object('code','menu_image_missing','path','sections.'||i||'.items.'||j));
        end if;
        j := j + 1;
      end loop;
    end if;
    i := i + 1;
  end loop;
  if items > 300 then problems := problems || '[{"code":"menu_too_large","path":"sections"}]'; end if;
  return problems;
exception when others then
  return '[{"code":"invalid","path":""}]';
end;
$$;
revoke all on function private.tables_menu_problems(uuid, jsonb) from public, anon, authenticated;

create function public.tables_menu_list(p_venue_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.tables_venues%rowtype;
begin
  v := private.tables_require(p_venue_id, 'viewer');
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'status', m.status, 'lockVersion', m.lock_version,
      'draft', m.draft, 'sortOrder', m.sort_order, 'updatedAt', m.updated_at,
      'publishedVersion', (select mv.version_number from public.tables_menu_versions mv where mv.id = m.published_version_id),
      'hasUnpublishedChanges', m.published_version_id is null or m.draft is distinct from (select mv.snapshot->'doc' from public.tables_menu_versions mv where mv.id = m.published_version_id),
      'problems', private.tables_menu_problems(m.organization_id, m.draft)) order by m.sort_order, m.created_at)
    from public.tables_menus m where m.venue_id = p_venue_id and m.status <> 'archived'), '[]');
end;
$$;

create function public.tables_menu_create(p_venue_id uuid, p_title text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.tables_venues%rowtype; m public.tables_menus%rowtype;
begin
  v := private.tables_require(p_venue_id, 'manager');
  if (select count(*) from public.tables_menus where venue_id = p_venue_id and status <> 'archived') >= 10 then raise exception 'tables:menu_limit' using errcode = '54000'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then raise exception 'tables:invalid' using errcode = '22023'; end if;
  insert into public.tables_menus(organization_id, venue_id, title, draft)
  values (v.organization_id, v.id, btrim(p_title), '{"sections":[{"title":"מנות","items":[]}]}') returning * into m;
  return jsonb_build_object('id', m.id, 'lockVersion', m.lock_version);
end;
$$;

create function public.tables_menu_save(p_menu_id uuid, p_title text, p_doc jsonb, p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.tables_menus%rowtype;
begin
  select * into m from public.tables_menus where id = p_menu_id;
  if not found or not private.tables_can(m.venue_id, 'manager') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_doc) <> 'object' or octet_length(p_doc::text) > 131072 or length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  select * into m from public.tables_menus where id = p_menu_id for update;
  if m.lock_version <> p_expected_lock_version then raise exception 'tables:stale' using errcode = '40001'; end if;
  update public.tables_menus set draft = p_doc, title = btrim(p_title), lock_version = lock_version + 1 where id = m.id returning * into m;
  return jsonb_build_object('lockVersion', m.lock_version, 'problems', private.tables_menu_problems(m.organization_id, m.draft));
end;
$$;

create function public.tables_menu_publish(p_menu_id uuid, p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.tables_menus%rowtype;
  problems jsonb;
  n integer;
  vid uuid;
begin
  select * into m from public.tables_menus where id = p_menu_id;
  if not found or not private.tables_can(m.venue_id, 'manager') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  select * into m from public.tables_menus where id = p_menu_id for update;
  if m.lock_version <> p_expected_lock_version then raise exception 'tables:stale' using errcode = '40001'; end if;
  problems := private.tables_menu_problems(m.organization_id, m.draft);
  if jsonb_array_length(problems) > 0 then raise exception 'tables:menu_problems' using errcode = '22023', detail = problems::text; end if;
  select coalesce(max(version_number), 0) + 1 into n from public.tables_menu_versions where menu_id = m.id;
  insert into public.tables_menu_versions(organization_id, venue_id, menu_id, version_number, snapshot, published_by)
  values (m.organization_id, m.venue_id, m.id, n, jsonb_build_object('title', m.title, 'doc', m.draft), auth.uid()) returning id into vid;
  update public.tables_menus set status = 'published', published_version_id = vid where id = m.id returning * into m;
  return jsonb_build_object('versionNumber', n, 'lockVersion', m.lock_version);
end;
$$;

create function public.tables_menu_archive(p_menu_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.tables_menus%rowtype;
begin
  select * into m from public.tables_menus where id = p_menu_id;
  if not found or not private.tables_can(m.venue_id, 'manager') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  update public.tables_menus set status = 'archived' where id = m.id;
end;
$$;

-- Public, safe projection: published menus of a published venue.
create function public.tables_public_menus(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target record; brand jsonb;
begin
  select * into target from private.tables_public_target(p_slug);
  if not found then return null; end if;
  select b.config into brand from public.brand_configurations b where b.organization_id = target.organization_id;
  return jsonb_build_object('venue', jsonb_build_object('name', target.name, 'slug', p_slug, 'assetOwner', target.organization_id),
    'brand', jsonb_build_object('displayName', brand->>'displayName', 'palette', brand->'palette'),
    'menus', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', mv.snapshot->>'title', 'doc', mv.snapshot->'doc',
      'version', mv.version_number, 'publishedAt', mv.created_at) order by m.sort_order, m.created_at)
      from public.tables_menus m join public.tables_menu_versions mv on mv.id = m.published_version_id
      where m.venue_id = target.venue_id and m.status = 'published'), '[]'));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.tables_menu_list(uuid)','public.tables_menu_create(uuid,text)','public.tables_menu_save(uuid,text,jsonb,bigint)',
    'public.tables_menu_publish(uuid,bigint)','public.tables_menu_archive(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'revoke all on function public.tables_public_menus(text) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.tables_public_menus(text) to anon, authenticated';
end;
$$;

commit;
