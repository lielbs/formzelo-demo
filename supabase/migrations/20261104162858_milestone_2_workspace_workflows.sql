begin;

alter table public.workflows
  add column template_key text not null default 'blank'
    check (template_key ~ '^[a-z0-9_-]{1,80}$'),
  add column source_prompt text
    check (source_prompt is null or length(source_prompt) <= 1000),
  add column intake jsonb not null default '{"paused":false,"onePerContact":false}'::jsonb
    check (jsonb_typeof(intake) = 'object' and octet_length(intake::text) <= 16384),
  add column published_lock_version bigint
    check (published_lock_version is null or published_lock_version >= 0);

create function private.assert_workflow_document(
  p_schema_version integer,
  p_config jsonb,
  p_design jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  step jsonb;
  field jsonb;
  palette_key text;
  step_ids text[] := array[]::text[];
  field_keys text[] := array[]::text[];
begin
  if p_schema_version <> 8 then
    raise exception 'Unsupported workflow schema version' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_design) <> 'object'
     or jsonb_typeof(p_config->'title') <> 'string'
     or length(btrim(p_config->>'title')) not between 1 and 200
     or jsonb_typeof(p_config->'description') <> 'string'
     or length(p_config->>'description') > 4000
     or coalesce(p_config->>'mode', 'public') not in ('public', 'case')
     or jsonb_typeof(p_config->'steps') <> 'array'
     or jsonb_array_length(p_config->'steps') not between 1 and 100
     or jsonb_typeof(p_config->'pricing') <> 'object'
     or jsonb_typeof(p_config->'branding') <> 'object'
     or jsonb_typeof(p_config->'consent') <> 'object'
     or jsonb_typeof(p_design->'themeVersion') <> 'number'
     or (p_design->>'themeVersion')::integer <> 1
     or p_design->>'presetId' not in ('floral_boutique','automotive_precision','hospitality_premium','corporate_modern','creative_studio','modern_minimal','spa_serenity','beauty_glam','bakery_sweet','cafe_bistro','celebration_party','wedding_elegance','legal_trust','finance_clarity','tech_startup','medical_care','fitness_energy','kids_play','academy_learn','home_services','eco_nature','luxury_noir','nightlife_neon','travel_coastal','pets_friendly','community_warm')
     or p_design->>'source' not in ('auto','manual')
     or jsonb_typeof(p_design->'palette') <> 'object'
     or jsonb_typeof(p_design->'components') <> 'object' then
    raise exception 'Invalid workflow document' using errcode = '22023';
  end if;

  foreach palette_key in array array['primary','secondary','accent','background','surface','surfaceAlt','text','muted'] loop
    if coalesce(p_design#>>array['palette',palette_key],'') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Invalid workflow palette' using errcode = '22023';
    end if;
  end loop;
  if p_design->>'typography' not in ('editorial','technical','warm','corporate','display','neutral','classic','friendly','handwritten','impact','clean')
     or jsonb_typeof(p_design->'hero') <> 'object'
     or p_design#>>'{hero,layout}' not in ('split','banner','immersive','compact','poster','centered','none')
     or p_design->>'composition' not in ('centered','editorial_split','product_grid','decision','booking','document')
     or p_design->>'decoration' not in ('organic','technical','atmospheric','structured','expressive','minimal','geometric','waves','arches','celebration','botanical','constellation','none')
     or p_design#>>'{components,card}' not in ('soft','outlined','elevated','bold','flat')
     or p_design#>>'{components,input}' not in ('outlined','filled','underline')
     or p_design#>>'{components,option}' not in ('tile','row','chip','bold')
     or p_design#>>'{components,button}' not in ('pill','solid','sharp','brutal')
     or p_design->>'radius' not in ('none','sm','md','lg','xl')
     or p_design->>'shadow' not in ('none','soft','medium','hard')
     or p_design->>'density' not in ('compact','comfortable','airy')
     or p_design->>'progress' not in ('bar','steps','dots','numbered')
     or p_design->>'motion' not in ('none','subtle','expressive')
     or jsonb_typeof(p_design->'optionArt') <> 'boolean'
     or jsonb_typeof(p_design->'mobile') <> 'object'
     or jsonb_typeof(p_design#>'{mobile,compactHero}') <> 'boolean'
     or jsonb_typeof(p_design#>'{mobile,stickySummary}') <> 'boolean'
     or jsonb_typeof(p_design->'logo') <> 'object'
     or jsonb_typeof(p_design#>'{logo,showName}') <> 'boolean' then
    raise exception 'Invalid workflow design contract' using errcode = '22023';
  end if;

  if coalesce(p_config#>>'{pricing,currency}', '') <> 'ILS'
     or coalesce(p_config#>>'{pricing,enabled}', '') not in ('true', 'false')
     or coalesce(p_config#>>'{consent,required}', '') not in ('true', 'false') then
    raise exception 'Invalid workflow pricing or consent contract' using errcode = '22023';
  end if;

  for step in select value from jsonb_array_elements(p_config->'steps') loop
    if jsonb_typeof(step) <> 'object'
       or coalesce(step->>'id', '') !~ '^[A-Za-z0-9_-]{1,120}$'
       or length(btrim(coalesce(step->>'title', ''))) not between 1 and 300
       or jsonb_typeof(step->'fields') <> 'array'
       or jsonb_array_length(step->'fields') > 200
       or step->>'id' = any(step_ids) then
      raise exception 'Invalid workflow step' using errcode = '22023';
    end if;
    step_ids := array_append(step_ids, step->>'id');
    for field in select value from jsonb_array_elements(step->'fields') loop
      if jsonb_typeof(field) <> 'object'
         or coalesce(field->>'id', '') !~ '^[A-Za-z0-9_-]{1,120}$'
         or coalesce(field->>'key', '') !~ '^[a-z][a-z0-9_]{0,119}$'
         or length(btrim(coalesce(field->>'label', ''))) not between 1 and 500
         or coalesce(field->>'type', '') not in (
           'text','textarea','email','phone','number','date','select','radio','multiselect',
           'checkbox','decision','file','time','info','heading','image','gallery','divider',
           'highlights','price_breakdown','terms'
         )
         or field->>'key' = any(field_keys) then
        raise exception 'Invalid or duplicate workflow field' using errcode = '22023';
      end if;
      field_keys := array_append(field_keys, field->>'key');
    end loop;
  end loop;
end;
$$;
revoke all on function private.assert_workflow_document(integer,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.create_workflow(
  organization_id uuid,
  config jsonb,
  design jsonb,
  template_key text default 'blank',
  source_prompt text default null,
  schema_version integer default 8
)
returns setof public.workflows
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_slug text;
  workflow_limit integer;
  candidate_slug text;
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  perform private.assert_workflow_document(schema_version, config, design);
  if template_key !~ '^[a-z0-9_-]{1,80}$' or length(coalesce(source_prompt, '')) > 1000 then
    raise exception 'Invalid workflow metadata' using errcode = '22023';
  end if;

  select o.slug,
         case when s.config->>'workflowLimit' ~ '^[0-9]+$'
              then (s.config->>'workflowLimit')::integer end
    into org_slug, workflow_limit
  from public.organizations o
  left join public.organization_settings s on s.organization_id = o.id
  where o.id = create_workflow.organization_id and o.status = 'active';
  if org_slug is null then
    raise exception 'Workspace is unavailable' using errcode = '42501';
  end if;
  if workflow_limit is not null and (
    select count(*) from public.workflows w
    where w.organization_id = create_workflow.organization_id and w.status <> 'archived'
  ) >= workflow_limit then
    raise exception 'Workflow plan limit reached' using errcode = 'P0001';
  end if;

  loop
    candidate_slug := left(org_slug, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    exit when not exists (select 1 from public.workflows w where w.public_slug = candidate_slug);
  end loop;

  return query
  insert into public.workflows(
    organization_id, public_slug, draft_config, draft_design, schema_version,
    template_key, source_prompt
  ) values (
    create_workflow.organization_id, candidate_slug, config, design, schema_version,
    create_workflow.template_key, nullif(btrim(source_prompt), '')
  ) returning *;
end;
$$;
revoke all on function public.create_workflow(uuid,jsonb,jsonb,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.create_workflow(uuid,jsonb,jsonb,text,text,integer) to authenticated;

create function public.save_workflow_draft(
  organization_id uuid,
  workflow_id uuid,
  expected_lock_version bigint,
  config jsonb,
  design jsonb,
  schema_version integer default 8
)
returns setof public.workflows
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  perform private.assert_workflow_document(schema_version, config, design);
  return query
  update public.workflows w
     set draft_config = config, draft_design = design, schema_version = save_workflow_draft.schema_version
   where w.organization_id = save_workflow_draft.organization_id
     and w.id = workflow_id
     and w.status <> 'archived'
     and w.lock_version = expected_lock_version
  returning w.*;
  if not found then
    raise exception 'Workflow changed or is unavailable' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.save_workflow_draft(uuid,uuid,bigint,jsonb,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.save_workflow_draft(uuid,uuid,bigint,jsonb,jsonb,integer) to authenticated;

create function public.publish_workflow(
  organization_id uuid,
  workflow_id uuid,
  expected_lock_version bigint,
  published_design jsonb,
  engine_version text default 'formangle-v1'
)
returns setof public.workflow_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.workflows%rowtype;
  created_version public.workflow_versions%rowtype;
  next_version integer;
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select * into target from public.workflows w
   where w.organization_id = publish_workflow.organization_id and w.id = workflow_id
   for update;
  if not found or target.status = 'archived' then
    raise exception 'Workflow is unavailable' using errcode = 'P0002';
  end if;
  if target.lock_version <> expected_lock_version then
    raise exception 'Workflow changed' using errcode = '40001';
  end if;
  if engine_version !~ '^[A-Za-z0-9._-]{1,80}$' then
    raise exception 'Invalid engine version' using errcode = '22023';
  end if;
  perform private.assert_workflow_document(target.schema_version, target.draft_config, published_design);
  select coalesce(max(v.version_number), 0) + 1 into next_version
    from public.workflow_versions v where v.workflow_id = target.id;
  insert into public.workflow_versions(
    organization_id, workflow_id, version_number, schema_version, engine_version,
    config, design, published_by
  ) values (
    target.organization_id, target.id, next_version, target.schema_version, engine_version,
    target.draft_config, published_design, auth.uid()
  ) returning * into created_version;
  update public.workflows w
     set status = 'published', published_version_id = created_version.id,
         published_lock_version = target.lock_version + 1
   where w.organization_id = target.organization_id and w.id = target.id;
  return next created_version;
end;
$$;
revoke all on function public.publish_workflow(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.publish_workflow(uuid,uuid,bigint,jsonb,text) to authenticated;

create function public.set_workflow_archived(
  organization_id uuid,
  workflow_id uuid,
  expected_lock_version bigint,
  archived boolean
)
returns setof public.workflows
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  return query
  update public.workflows w
     set status = case when archived then 'archived'
                       when w.published_version_id is null then 'draft' else 'published' end
   where w.organization_id = set_workflow_archived.organization_id
     and w.id = workflow_id and w.lock_version = expected_lock_version
  returning w.*;
  if not found then
    raise exception 'Workflow changed or is unavailable' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.set_workflow_archived(uuid,uuid,bigint,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_workflow_archived(uuid,uuid,bigint,boolean) to authenticated;

create function public.duplicate_workflow(
  organization_id uuid,
  workflow_id uuid
)
returns setof public.workflows
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.workflows%rowtype;
  copied_config jsonb;
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select * into source from public.workflows w
    where w.organization_id = duplicate_workflow.organization_id and w.id = workflow_id;
  if not found then raise exception 'Workflow is unavailable' using errcode = 'P0002'; end if;
  copied_config := jsonb_set(source.draft_config, '{title}', to_jsonb(left(source.draft_config->>'title', 188) || ' (עותק)'));
  return query select * from public.create_workflow(
    source.organization_id, copied_config, source.draft_design,
    source.template_key, null, source.schema_version
  );
end;
$$;
revoke all on function public.duplicate_workflow(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.duplicate_workflow(uuid,uuid) to authenticated;

create function public.update_workflow_intake(
  organization_id uuid,
  workflow_id uuid,
  expected_lock_version bigint,
  intake jsonb
)
returns setof public.workflows
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if jsonb_typeof(intake) <> 'object'
     or coalesce(intake->>'paused', '') not in ('true','false')
     or coalesce(intake->>'onePerContact', '') not in ('true','false') then
    raise exception 'Invalid intake settings' using errcode = '22023';
  end if;
  return query
  update public.workflows w set intake = update_workflow_intake.intake
   where w.organization_id = update_workflow_intake.organization_id
     and w.id = workflow_id and w.lock_version = expected_lock_version
  returning w.*;
  if not found then raise exception 'Workflow changed or is unavailable' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.update_workflow_intake(uuid,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.update_workflow_intake(uuid,uuid,bigint,jsonb) to authenticated;

create function public.restore_workflow_version(
  organization_id uuid,
  workflow_id uuid,
  version_id uuid,
  expected_lock_version bigint
)
returns setof public.workflows
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(organization_id, array['owner','staff']) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  return query
  update public.workflows w
     set draft_config = v.config, draft_design = v.design, schema_version = v.schema_version
    from public.workflow_versions v
   where w.organization_id = restore_workflow_version.organization_id
     and w.id = restore_workflow_version.workflow_id and w.lock_version = restore_workflow_version.expected_lock_version
     and v.organization_id = w.organization_id and v.workflow_id = w.id and v.id = restore_workflow_version.version_id
  returning w.*;
  if not found then raise exception 'Workflow version changed or is unavailable' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.restore_workflow_version(uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.restore_workflow_version(uuid,uuid,uuid,bigint) to authenticated;

create function public.update_organization_profile(
  p_organization_id uuid,
  p_name text,
  p_tagline text,
  p_contact_email text,
  p_primary_color text
)
returns setof public.organizations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner']) then
    raise exception 'Workspace owner access required' using errcode = '42501';
  end if;
  if length(btrim(p_name)) not between 1 and 200
     or length(p_tagline) > 80
     or length(p_contact_email) > 320
     or (p_contact_email <> '' and p_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid organization profile' using errcode = '22023';
  end if;
  update public.organization_settings s
     set config = s.config || jsonb_build_object(
       'tagline', btrim(p_tagline),
       'contactEmail', lower(btrim(p_contact_email)),
       'primaryColor', upper(p_primary_color)
     )
   where s.organization_id = p_organization_id;
  update public.brand_configurations b
     set config = jsonb_set(
       jsonb_set(b.config, '{displayName}', to_jsonb(btrim(p_name)), true),
       '{palette,primary}', to_jsonb(upper(p_primary_color)), true
     )
   where b.organization_id = p_organization_id;
  return query
  update public.organizations o set name = btrim(p_name), updated_at = clock_timestamp()
   where o.id = p_organization_id returning o.*;
end;
$$;
revoke all on function public.update_organization_profile(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.update_organization_profile(uuid,text,text,text,text) to authenticated;

-- Provisioning remains behind the existing verified-operator/service-role boundary.
create function private.provision_organization_authorized(
  p_slug text,
  p_name text,
  p_owner_email text,
  p_actor_user_id uuid
)
returns table(organization_id uuid, invitation_token text, invitation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_org uuid;
  invitation record;
begin
  perform private.assert_verified_platform_operator(p_actor_user_id);
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or length(p_slug) > 80
     or length(btrim(p_name)) not between 1 and 200
     or p_owner_email <> lower(btrim(p_owner_email))
     or p_owner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(p_owner_email) > 320 then
    raise exception 'Invalid organization provisioning request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_user_id::text, 1));
  if (
    select count(*) from public.audit_events e
    where e.actor_user_id = p_actor_user_id
      and e.resource_type = 'organization_provisioning'
      and e.created_at >= clock_timestamp() - interval '15 minutes'
  ) >= 5 then
    raise exception 'Provisioning rate limit exceeded' using errcode = '54000';
  end if;

  insert into public.organizations(slug,name,status)
    values (p_slug,btrim(p_name),'active') returning id into created_org;
  insert into public.organization_settings(organization_id,config)
    values (created_org,'{"workflowLimit":3}'::jsonb);
  insert into public.brand_configurations(organization_id,config)
    values (created_org, jsonb_build_object(
      'displayName', btrim(p_name), 'description', '',
      'palette', jsonb_build_object('primary','#EA580C','secondary','#0F172A','accent','#14B8A6','background','#F8FAFC'),
      'typography','neutral','button','solid','density','comfortable','logoPlacement','start',
      'decorations',false,'personality','modern_minimal','links','[]'::jsonb,
      'updatedAt',clock_timestamp()::text
    ));
  insert into public.audit_events(organization_id,actor_user_id,resource_type,resource_id,operation)
    values (created_org,p_actor_user_id,'organization_provisioning',created_org::text,'INSERT');
  select * into invitation from private.create_owner_invitation(
    created_org,p_owner_email,p_actor_user_id,interval '48 hours'
  );
  return query select created_org, invitation.invitation_token, invitation.invitation_expires_at;
end;
$$;
revoke all on function private.provision_organization_authorized(text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.provision_organization_authorized(text,text,text,uuid) to service_role;

create function public.server_provision_organization_authorized(
  slug text,
  name text,
  owner_email text,
  actor_user_id uuid
)
returns table(organization_id uuid, invitation_token text, invitation_expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from private.provision_organization_authorized(slug,name,owner_email,actor_user_id);
$$;
revoke all on function public.server_provision_organization_authorized(text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.server_provision_organization_authorized(text,text,text,uuid) to service_role;

commit;
