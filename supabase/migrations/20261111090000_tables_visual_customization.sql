-- Formangle Tables T9: visual customization — menu images and customizable public booking and
-- waitlist pages with optional additional guest questions.
--
-- Additive only. Nothing here changes availability, capacity, conflicts, approvals, waitlist
-- eligibility or rate limits: those stay inside the existing commands, which are wrapped (renamed
-- into the private schema and called unchanged) rather than rewritten.
--
--  * Images are organization brand assets (public.organization_assets / bucket brand-assets).
--    Every reference — menu hero, gallery, section and dish images; page logo and hero — must be
--    a live asset of the owning organization. Menus report problems (publish is blocked); venue
--    drafts and versions are guarded by triggers.
--  * VenueDraft.publicPages is bounded, validated configuration. It reaches guests only through
--    the existing explicit publish (tables_venue_versions.snapshot); drafts never leak.
--  * Additional questions are defined by the PUBLISHED version. Answers are validated here
--    (known ids, kinds, options, lengths, required) and stored as a labelled snapshot in
--    custom_answers. They are returned only to the venue team (host and above), included in the
--    owner's guest export and erased by guest anonymization. Public projections never return them.
begin;

-- ---------- Storage of answers ----------
alter table public.tables_reservations add column custom_answers jsonb
  constraint tables_reservations_custom_answers check (custom_answers is null or (jsonb_typeof(custom_answers) = 'array'
    and jsonb_array_length(custom_answers) between 1 and 6 and octet_length(custom_answers::text) <= 8192));
alter table public.tables_waitlist_entries add column custom_answers jsonb
  constraint tables_waitlist_custom_answers check (custom_answers is null or (jsonb_typeof(custom_answers) = 'array'
    and jsonb_array_length(custom_answers) between 1 and 6 and octet_length(custom_answers::text) <= 8192));

-- ---------- Assets ----------
create function private.tables_org_asset_ok(p_org uuid, p_id text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_id ~ '^ast_[a-z0-9]{8,40}$', false) and exists (
    select 1 from public.organization_assets a where a.id = p_id and a.organization_id = p_org and a.removed_at is null)
$$;
revoke all on function private.tables_org_asset_ok(uuid, text) from public, anon, authenticated;

-- ---------- Menu media (hero, gallery, section images; dish images stay in the core check) ----------
alter function private.tables_menu_problems(uuid, jsonb) rename to tables_menu_core_problems;

create function private.tables_menu_media_problems(p_org uuid, p_doc jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  problems jsonb := '[]';
  hero jsonb := p_doc->'hero';
  g jsonb := p_doc->'gallery';
  s jsonb;
  id text;
  i integer := 0;
begin
  if hero is not null and jsonb_typeof(hero) <> 'null' then
    if jsonb_typeof(hero) <> 'object'
       or exists (select 1 from jsonb_object_keys(hero) k where k not in ('imageAssetId','title','subtitle','description'))
       or exists (select 1 from jsonb_each(hero) e where jsonb_typeof(e.value) <> 'string')
       or length(coalesce(hero->>'title', '')) > 80 or length(coalesce(hero->>'subtitle', '')) > 120
       or length(coalesce(hero->>'description', '')) > 600 then
      problems := problems || '[{"code":"menu_hero_invalid","path":"hero"}]';
    elsif coalesce(hero->>'imageAssetId', '') <> '' and not private.tables_org_asset_ok(p_org, hero->>'imageAssetId') then
      problems := problems || '[{"code":"menu_image_missing","path":"hero"}]';
    end if;
  end if;
  if g is not null and jsonb_typeof(g) <> 'null' then
    if jsonb_typeof(g) <> 'array' or jsonb_array_length(g) > 12
       or exists (select 1 from jsonb_array_elements(g) x where jsonb_typeof(x) <> 'string')
       or (select count(distinct x) from jsonb_array_elements_text(g) x) <> jsonb_array_length(g) then
      problems := problems || '[{"code":"menu_gallery_invalid","path":"gallery"}]';
    else
      for id in select x from jsonb_array_elements_text(g) x loop
        if not private.tables_org_asset_ok(p_org, id) then
          problems := problems || jsonb_build_array(jsonb_build_object('code', 'menu_image_missing', 'path', 'gallery.' || i));
        end if;
        i := i + 1;
      end loop;
    end if;
  end if;
  i := 0;
  if jsonb_typeof(p_doc->'sections') = 'array' then
    for s in select value from jsonb_array_elements(p_doc->'sections') loop
      if jsonb_typeof(s) = 'object' and coalesce(s->>'imageAssetId', '') <> '' and not private.tables_org_asset_ok(p_org, s->>'imageAssetId') then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'menu_image_missing', 'path', 'sections.' || i));
      end if;
      i := i + 1;
    end loop;
  end if;
  return problems;
exception when others then
  return '[{"code":"invalid","path":""}]';
end;
$$;
revoke all on function private.tables_menu_media_problems(uuid, jsonb) from public, anon, authenticated;

-- Same name and signature as before: tables_menu_list/save/publish now also check media.
create function private.tables_menu_problems(p_org uuid, p_doc jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select private.tables_menu_core_problems(p_org, p_doc) || private.tables_menu_media_problems(p_org, p_doc)
$$;
revoke all on function private.tables_menu_problems(uuid, jsonb) from public, anon, authenticated;

-- ---------- Public page configuration ----------
create function private.tables_page_theme_problems(p_org uuid, t jsonb, p_path text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  problems jsonb := '[]';
  k text;
  asset_re constant text := '^ast_[a-z0-9]{8,40}$';
begin
  if jsonb_typeof(t) is distinct from 'object' then return jsonb_build_array(jsonb_build_object('code', 'pages_theme_invalid', 'path', p_path)); end if;
  if exists (select 1 from jsonb_object_keys(t) x where x not in ('preset','inheritBrand','palette','typography','button','card','radius',
      'background','pattern','showLogo','logoAssetId','heroAssetId','heroStyle'))
     or coalesce(t->>'preset', '') not in ('fine_dining','cafe','casual','cocktail_bar','minimal')
     or jsonb_typeof(t->'inheritBrand') is distinct from 'boolean' or jsonb_typeof(t->'showLogo') is distinct from 'boolean'
     or coalesce(t->>'typography', '') not in ('editorial','technical','warm','corporate','display','neutral','classic','friendly','handwritten','impact','clean')
     or coalesce(t->>'button', '') not in ('pill','solid','sharp')
     or coalesce(t->>'card', '') not in ('soft','outlined','elevated','flat')
     or coalesce(t->>'radius', '') not in ('none','sm','md','lg','xl')
     or coalesce(t->>'background', '') not in ('plain','tint','gradient','pattern')
     or coalesce(t->>'pattern', '') not in ('dots','grid','waves','stripes','diamonds')
     or coalesce(t->>'heroStyle', '') not in ('banner','inline') then
    problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_theme_invalid', 'path', p_path));
  end if;
  if jsonb_typeof(t->'palette') is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(t->'palette') x where x not in ('accent','background','surface','text')) then
    problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_color_invalid', 'path', p_path || '.palette'));
  else
    foreach k in array array['accent','background','surface','text'] loop
      if jsonb_typeof(t->'palette'->k) is distinct from 'string' or (t->'palette'->>k) !~ '^#[0-9a-fA-F]{6}$' then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_color_invalid', 'path', p_path || '.palette.' || k));
      end if;
    end loop;
  end if;
  foreach k in array array['logoAssetId','heroAssetId'] loop
    if t ? k then
      if jsonb_typeof(t->k) is distinct from 'string' or (t->>k) !~ asset_re then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_image_invalid', 'path', p_path || '.' || k));
      elsif not private.tables_org_asset_ok(p_org, t->>k) then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_image_missing', 'path', p_path || '.' || k));
      end if;
    end if;
  end loop;
  return problems;
end;
$$;
revoke all on function private.tables_page_theme_problems(uuid, jsonb, text) from public, anon, authenticated;

-- Returns {code, path} problems of VenueDraft.publicPages; empty = valid (absent is valid).
create function private.tables_public_pages_problems(p_org uuid, p jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  problems jsonb := '[]';
  kind text;
  pg jsonb;
  c jsonb;
  f jsonb;
  path text;
  fp text;
  builtins text[];
  keys text[];
  key text;
  questions integer;
  i integer;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '[]'; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 32768 or coalesce(p->>'version', '') <> '1'
     or exists (select 1 from jsonb_object_keys(p) x where x not in ('version','theme','booking','waitlist')) then
    return '[{"code":"pages_invalid","path":"publicPages"}]';
  end if;
  problems := problems || private.tables_page_theme_problems(p_org, p->'theme', 'publicPages.theme');
  foreach kind in array array['booking','waitlist'] loop
    pg := p->kind;
    path := 'publicPages.' || kind;
    if jsonb_typeof(pg) is distinct from 'object' or jsonb_typeof(pg->'ownTheme') is distinct from 'boolean'
       or exists (select 1 from jsonb_object_keys(pg) x where x not in ('ownTheme','theme','copy','fields')) then
      problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_invalid', 'path', path));
      continue;
    end if;
    if (pg->>'ownTheme')::boolean or (pg ? 'theme' and jsonb_typeof(pg->'theme') <> 'null') then
      problems := problems || private.tables_page_theme_problems(p_org, pg->'theme', path || '.theme');
    end if;

    c := coalesce(pg->'copy', '{}');
    if jsonb_typeof(c) <> 'object'
       or exists (select 1 from jsonb_object_keys(c) x where x not in ('title','description','submitLabel','successNote','groupTitles'))
       or exists (select 1 from jsonb_each(c) e where e.key <> 'groupTitles' and jsonb_typeof(e.value) <> 'string')
       or length(coalesce(c->>'title', '')) > 80 or length(coalesce(c->>'description', '')) > 600
       or length(coalesce(c->>'submitLabel', '')) > 40 or length(coalesce(c->>'successNote', '')) > 300
       or (c ? 'groupTitles' and (jsonb_typeof(c->'groupTitles') <> 'object'
         or exists (select 1 from jsonb_each(c->'groupTitles') e where e.key not in ('contact','extra') or jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 60))) then
      problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_text_too_long', 'path', path || '.copy'));
    end if;

    if jsonb_typeof(pg->'fields') is distinct from 'array' or jsonb_array_length(pg->'fields') > 14 then
      problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_fields_invalid', 'path', path || '.fields'));
      continue;
    end if;
    builtins := case when kind = 'booking' then array['name','phone','email','requests'] else array['name','phone','notes'] end;
    keys := '{}';
    questions := 0;
    i := 0;
    for f in select value from jsonb_array_elements(pg->'fields') loop
      fp := path || '.fields.' || i;
      i := i + 1;
      if jsonb_typeof(f) <> 'object'
         or exists (select 1 from jsonb_object_keys(f) x where x not in ('key','kind','label','hint','hidden','required','options','group')) then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_fields_invalid', 'path', fp));
        continue;
      end if;
      key := coalesce(f->>'key', '');
      if key = any(keys) then problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_field_duplicate', 'path', fp)); end if;
      keys := keys || key;
      if coalesce(f->>'group', '') not in ('contact','extra')
         or (f ? 'hidden' and jsonb_typeof(f->'hidden') <> 'boolean') or (f ? 'required' and jsonb_typeof(f->'required') <> 'boolean') then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_fields_invalid', 'path', fp));
      end if;
      if (f ? 'label' and (jsonb_typeof(f->'label') <> 'string' or length(f->>'label') > 80))
         or (f ? 'hint' and (jsonb_typeof(f->'hint') <> 'string' or length(f->>'hint') > 200)) then
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_text_too_long', 'path', fp));
      end if;
      if key = any(builtins) then
        if coalesce(f->>'kind', '') <> 'builtin' or f ? 'options' or f ? 'required' then
          problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_fields_invalid', 'path', fp));
        end if;
        if key in ('name','phone') and coalesce((f->>'hidden')::boolean, false) then
          problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_mandatory_field', 'path', fp));
        end if;
      elsif key ~ '^q_[a-z0-9]{6,24}$' then
        questions := questions + 1;
        if coalesce(f->>'kind', '') not in ('text','textarea','select','checkbox') then
          problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_question_invalid', 'path', fp));
        end if;
        if length(btrim(coalesce(f->>'label', ''))) = 0 then
          problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_question_label', 'path', fp));
        end if;
        if f->>'kind' = 'select' then
          if jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 8
             or exists (select 1 from jsonb_array_elements(f->'options') o where jsonb_typeof(o) <> 'string'
               or length(btrim(o #>> '{}')) = 0 or length(o #>> '{}') > 60)
             or (select count(distinct o) from jsonb_array_elements_text(f->'options') o) <> jsonb_array_length(f->'options') then
            problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_question_options', 'path', fp));
          end if;
        elsif f ? 'options' then
          problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_question_options', 'path', fp));
        end if;
      else
        problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_fields_invalid', 'path', fp));
      end if;
    end loop;
    if questions > 6 then problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_too_many_questions', 'path', path || '.fields')); end if;
    if not ('name' = any(keys)) or not ('phone' = any(keys)) then
      problems := problems || jsonb_build_array(jsonb_build_object('code', 'pages_mandatory_field', 'path', path || '.fields'));
    end if;
  end loop;
  return problems;
exception when others then
  return '[{"code":"pages_invalid","path":"publicPages"}]';
end;
$$;
revoke all on function private.tables_public_pages_problems(uuid, jsonb) from public, anon, authenticated;

-- Draft writes: an invalid or foreign-asset publicPages is rejected outright (the editor never
-- sends one). Unchanged publicPages are not re-checked, so other draft edits are never blocked.
create function private.tables_guard_draft_pages()
returns trigger language plpgsql set search_path = '' as $$
declare problems jsonb;
begin
  if tg_op = 'UPDATE' and (new.draft->'publicPages') is not distinct from (old.draft->'publicPages') then return new; end if;
  problems := private.tables_public_pages_problems(new.organization_id, new.draft->'publicPages');
  if jsonb_array_length(problems) > 0 then
    raise exception 'tables:public_pages_invalid' using errcode = '22023', detail = problems::text;
  end if;
  return new;
end;
$$;
revoke all on function private.tables_guard_draft_pages() from public, anon, authenticated;
create trigger tables_guard_public_pages before insert or update of draft on public.tables_venues
  for each row execute function private.tables_guard_draft_pages();

-- Publishing re-checks (an image may have been removed from the library since the draft was saved).
create function private.tables_guard_version_pages()
returns trigger language plpgsql set search_path = '' as $$
declare problems jsonb;
begin
  problems := private.tables_public_pages_problems(new.organization_id, new.snapshot->'publicPages');
  if jsonb_array_length(problems) > 0 then
    raise exception 'tables:public_pages_invalid' using errcode = '22023', detail = problems::text;
  end if;
  return new;
end;
$$;
revoke all on function private.tables_guard_version_pages() from public, anon, authenticated;
create trigger tables_guard_public_pages before insert on public.tables_venue_versions
  for each row execute function private.tables_guard_version_pages();

-- Guest answers to the published page's additional questions → labelled snapshot (or null).
create function private.tables_custom_answers(p_fields jsonb, p_answers jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  q jsonb;
  v jsonb;
  k text;
  kind text;
  txt text;
  required boolean;
  known text[] := '{}';
  answers jsonb := '[]';
begin
  if p_answers is null or jsonb_typeof(p_answers) = 'null' then p_answers := '{}'; end if;
  if jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 6144 then
    raise exception 'tables:answers_invalid' using errcode = '22023';
  end if;
  for q in select value from jsonb_array_elements(case when jsonb_typeof(p_fields) = 'array' then p_fields else '[]' end) loop
    kind := q->>'kind';
    if kind is null or kind not in ('text','textarea','select','checkbox') or coalesce((q->>'hidden')::boolean, false) then continue; end if;
    k := q->>'key';
    known := known || k;
    required := coalesce((q->>'required')::boolean, false);
    v := p_answers->k;
    if v is null or jsonb_typeof(v) = 'null' then
      if required then raise exception 'tables:answer_required' using errcode = '22023'; end if;
      continue;
    end if;
    if kind = 'checkbox' then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'tables:answers_invalid' using errcode = '22023'; end if;
      if not (v::text)::boolean then
        if required then raise exception 'tables:answer_required' using errcode = '22023'; end if;
        continue;
      end if;
      answers := answers || jsonb_build_array(jsonb_build_object('id', k, 'label', q->>'label', 'kind', kind, 'value', true));
    else
      if jsonb_typeof(v) <> 'string' then raise exception 'tables:answers_invalid' using errcode = '22023'; end if;
      txt := btrim(v #>> '{}');
      if txt = '' then
        if required then raise exception 'tables:answer_required' using errcode = '22023'; end if;
        continue;
      end if;
      if length(txt) > (case when kind = 'textarea' then 1000 else 300 end)
         or (kind = 'select' and not coalesce(q->'options' ? txt, false)) then
        raise exception 'tables:answers_invalid' using errcode = '22023';
      end if;
      answers := answers || jsonb_build_array(jsonb_build_object('id', k, 'label', q->>'label', 'kind', kind, 'value', txt));
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(p_answers) x where not (x = any(known))) then
    raise exception 'tables:answers_invalid' using errcode = '22023';
  end if;
  return case when jsonb_array_length(answers) = 0 then null else answers end;
end;
$$;
revoke all on function private.tables_custom_answers(jsonb, jsonb) from public, anon, authenticated;

-- Is an optional built-in field shown on the published page? (No publicPages = the standard page.)
create function private.tables_page_shows(p_pages jsonb, p_kind text, p_key text)
returns boolean language sql immutable set search_path = '' as $$
  select case when p_pages is null or jsonb_typeof(p_pages) <> 'object' then null
    else exists (select 1 from jsonb_array_elements(coalesce(p_pages->p_kind->'fields', '[]')) f
      where f->>'key' = p_key and not coalesce((f->>'hidden')::boolean, false)) end
$$;
revoke all on function private.tables_page_shows(jsonb, text, text) from public, anon, authenticated;

-- ---------- Wrapped public commands (the original bodies run unchanged) ----------
alter function public.tables_public_book(text, jsonb, uuid, uuid) rename to tables_public_book_core;
alter function public.tables_public_book_core(text, jsonb, uuid, uuid) set schema private;
revoke all on function private.tables_public_book_core(text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;

create function public.tables_public_book(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  answers jsonb;
  input jsonb := p_input;
  result jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 12288 then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  select * into target from private.tables_public_target(p_slug);
  if found and target.status = 'published' then
    answers := private.tables_custom_answers(target.snapshot->'publicPages'->'booking'->'fields', p_input->'customAnswers');
    if private.tables_page_shows(target.snapshot->'publicPages', 'booking', 'email') is false then input := input - 'email'; end if;
    if private.tables_page_shows(target.snapshot->'publicPages', 'booking', 'requests') is false then input := input - 'requests'; end if;
  end if;
  result := private.tables_public_book_core(p_slug, input - 'customAnswers', p_idempotency_key, p_client);
  if answers is not null and result->>'result' in ('confirmed','pending') then
    update public.tables_reservations r set custom_answers = answers
     where r.venue_id = target.venue_id and r.idempotency_key = p_idempotency_key and r.custom_answers is null;
  end if;
  return result;
end;
$$;

alter function public.tables_public_waitlist_join(text, jsonb, uuid, uuid) rename to tables_public_waitlist_join_core;
alter function public.tables_public_waitlist_join_core(text, jsonb, uuid, uuid) set schema private;
revoke all on function private.tables_public_waitlist_join_core(text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;

create function public.tables_public_waitlist_join(p_slug text, p_input jsonb, p_idempotency_key uuid, p_client uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target record;
  answers jsonb;
  input jsonb := p_input;
  result jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 8192 then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  select * into target from private.tables_public_target(p_slug);
  -- Guest notes only when the published page asks for them (the standard page never did).
  input := input - 'notes';
  if found and target.status = 'published' then
    answers := private.tables_custom_answers(target.snapshot->'publicPages'->'waitlist'->'fields', p_input->'customAnswers');
    if private.tables_page_shows(target.snapshot->'publicPages', 'waitlist', 'notes') is true and p_input ? 'notes' then
      input := input || jsonb_build_object('notes', left(btrim(coalesce(p_input->>'notes', '')), 300));
    end if;
  end if;
  result := private.tables_public_waitlist_join_core(p_slug, input - 'customAnswers', p_idempotency_key, p_client);
  if answers is not null then
    update public.tables_waitlist_entries e set custom_answers = answers
     where e.venue_id = target.venue_id and e.idempotency_key = p_idempotency_key and e.custom_answers is null;
  end if;
  return result;
end;
$$;

-- Public venue projection + published page design + public brand basics (never draft data).
alter function public.tables_public_venue(text) rename to tables_public_venue_core;
alter function public.tables_public_venue_core(text) set schema private;
revoke all on function private.tables_public_venue_core(text) from public, anon, authenticated, service_role;

create function public.tables_public_venue(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  base jsonb := private.tables_public_venue_core(p_slug);
  target record;
  brand jsonb;
begin
  if base is null then return null; end if;
  select * into target from private.tables_public_target(p_slug);
  select b.config into brand from public.brand_configurations b where b.organization_id = target.organization_id;
  return base || jsonb_build_object(
    'assetOwner', target.organization_id,
    'pages', case when jsonb_typeof(target.snapshot->'publicPages') = 'object' then target.snapshot->'publicPages' end,
    'brandKit', jsonb_build_object(
      'logoAssetId', case when coalesce(brand->>'logoAssetId', '') ~ '^ast_[a-z0-9]{8,40}$' then brand->>'logoAssetId' end,
      'coverAssetId', case when coalesce(brand->>'coverAssetId', '') ~ '^ast_[a-z0-9]{8,40}$' then brand->>'coverAssetId' end,
      'typography', brand->>'typography', 'button', brand->>'button',
      'palette', case when jsonb_typeof(brand->'palette') = 'object' then jsonb_build_object(
        'primary', brand->'palette'->>'primary', 'secondary', brand->'palette'->>'secondary',
        'accent', brand->'palette'->>'accent', 'background', brand->'palette'->>'background') end));
end;
$$;

-- ---------- Team projections include answers (host and above; never viewers or guests) ----------
alter function public.tables_reservation_detail(uuid) rename to tables_reservation_detail_core;
alter function public.tables_reservation_detail_core(uuid) set schema private;
revoke all on function private.tables_reservation_detail_core(uuid) from public, anon, authenticated, service_role;

create function public.tables_reservation_detail(p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  base jsonb := private.tables_reservation_detail_core(p_reservation_id);
  res public.tables_reservations%rowtype;
begin
  select * into res from public.tables_reservations where id = p_reservation_id;
  return base || jsonb_build_object('customAnswers',
    case when private.tables_role_rank(private.tables_role(res.venue_id)) >= 2 then res.custom_answers end);
end;
$$;

alter function public.tables_waitlist(uuid, date) rename to tables_waitlist_core;
alter function public.tables_waitlist_core(uuid, date) set schema private;
revoke all on function private.tables_waitlist_core(uuid, date) from public, anon, authenticated, service_role;

create function public.tables_waitlist(p_venue_id uuid, p_service_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare base jsonb := private.tables_waitlist_core(p_venue_id, p_service_date);
begin
  if private.tables_role_rank(private.tables_role(p_venue_id)) < 2 then return base; end if;
  return coalesce((select jsonb_agg(x.value || jsonb_build_object('customAnswers',
      (select e.custom_answers from public.tables_waitlist_entries e where e.id = (x.value->>'id')::uuid and e.venue_id = p_venue_id)) order by x.n)
    from jsonb_array_elements(base) with ordinality as x(value, n)), '[]');
end;
$$;

-- ---------- Privacy: export includes answers, anonymization erases them ----------
alter function public.tables_export_guest(uuid, uuid) rename to tables_export_guest_core;
alter function public.tables_export_guest_core(uuid, uuid) set schema private;
revoke all on function private.tables_export_guest_core(uuid, uuid) from public, anon, authenticated, service_role;

create function public.tables_export_guest(p_organization_id uuid, p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare base jsonb := private.tables_export_guest_core(p_organization_id, p_guest_id);
begin
  return base || jsonb_build_object('customAnswers', jsonb_build_object(
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('date', r.service_date, 'time', r.local_time, 'answers', r.custom_answers) order by r.starts_at)
      from public.tables_reservations r where r.organization_id = p_organization_id and r.guest_id = p_guest_id and r.custom_answers is not null), '[]'),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('date', e.service_date, 'answers', e.custom_answers) order by e.joined_at)
      from public.tables_waitlist_entries e where e.organization_id = p_organization_id and e.guest_id = p_guest_id and e.custom_answers is not null), '[]')));
end;
$$;

alter function public.tables_anonymize_guest(uuid, uuid) rename to tables_anonymize_guest_core;
alter function public.tables_anonymize_guest_core(uuid, uuid) set schema private;
revoke all on function private.tables_anonymize_guest_core(uuid, uuid) from public, anon, authenticated, service_role;

create function public.tables_anonymize_guest(p_organization_id uuid, p_guest_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare base jsonb := private.tables_anonymize_guest_core(p_organization_id, p_guest_id);
begin
  update public.tables_reservations set custom_answers = null where organization_id = p_organization_id and guest_id = p_guest_id and custom_answers is not null;
  update public.tables_waitlist_entries set custom_answers = null where organization_id = p_organization_id and guest_id = p_guest_id and custom_answers is not null;
  return base;
end;
$$;

-- ---------- Grants (identical to the functions they wrap) ----------
do $$
declare f text;
begin
  foreach f in array array['public.tables_public_book(text,jsonb,uuid,uuid)','public.tables_public_waitlist_join(text,jsonb,uuid,uuid)',
    'public.tables_public_venue(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['public.tables_reservation_detail(uuid)','public.tables_waitlist(uuid,date)',
    'public.tables_export_guest(uuid,uuid)','public.tables_anonymize_guest(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
