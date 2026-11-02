-- Local Milestone 0 foundation. No public submission or publication API yet.
-- Role policy is the minimal owner/staff development baseline, not final business policy.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 200),
  status text not null default 'onboarding' check (status in ('onboarding','active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(display_name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner','staff')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user on public.organization_memberships(user_id, organization_id) where status = 'active';

-- Separate platform identity: intentionally confers NO tenant/support access yet.
create table private.platform_operators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 65536),
  updated_at timestamptz not null default now()
);
create table public.brand_configurations (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 65536),
  updated_at timestamptz not null default now()
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  draft_config jsonb not null check (jsonb_typeof(draft_config) = 'object' and octet_length(draft_config::text) <= 262144),
  draft_design jsonb not null default '{}' check (jsonb_typeof(draft_design) = 'object' and octet_length(draft_design::text) <= 65536),
  schema_version integer not null check (schema_version > 0),
  lock_version bigint not null default 0 check (lock_version >= 0),
  published_version_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (status <> 'published' or published_version_id is not null)
);

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  version_number integer not null check (version_number > 0),
  schema_version integer not null check (schema_version > 0),
  engine_version text not null check (length(engine_version) between 1 and 80),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 262144),
  design jsonb not null check (jsonb_typeof(design) = 'object' and octet_length(design::text) <= 65536),
  published_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, workflow_id) references public.workflows(organization_id,id) on delete restrict,
  unique (organization_id, workflow_id, id),
  unique (workflow_id, version_number)
);
alter table public.workflows add constraint published_version_same_workflow
  foreign key (organization_id, id, published_version_id)
  references public.workflow_versions(organization_id,workflow_id,id) on delete restrict;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  workflow_version_id uuid not null,
  status text not null default 'received' check (status in ('received','approved','rejected','cancelled','completed')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 262144),
  total_minor bigint not null check (total_minor between 0 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,workflow_id,workflow_version_id)
    references public.workflow_versions(organization_id,workflow_id,id) on delete restrict,
  unique (organization_id,id),
  unique (organization_id,workflow_id,idempotency_key)
);
create index submissions_inbox on public.submissions(organization_id,created_at desc,id);
create index submissions_version on public.submissions(organization_id,workflow_id,workflow_version_id);

create table public.submission_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id uuid not null,
  event_type text not null check (length(event_type) between 1 and 100),
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id,submission_id) references public.submissions(organization_id,id) on delete restrict
);
create index submission_events_timeline on public.submission_events(organization_id,submission_id,created_at,id);

-- Safe metadata only: credentials, arbitrary provider payloads and URLs are absent.
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category text not null check (category in ('payments','email','sms','whatsapp','crm','calendar','webhook')),
  provider_key text not null check (provider_key ~ '^[a-z0-9_-]{1,80}$'),
  display_name text not null check (length(display_name) between 1 and 200),
  status text not null default 'not_configured'
    check (status in ('not_configured','configured','test_pending','connected','degraded','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);
create table public.workflow_integration_overrides (
  organization_id uuid not null,
  workflow_id uuid not null,
  capability text not null check (capability in ('payments','email','sms','whatsapp','crm','calendar','webhook')),
  connection_id uuid not null,
  primary key (organization_id,workflow_id,capability),
  foreign key (organization_id,workflow_id) references public.workflows(organization_id,id) on delete restrict,
  foreign key (organization_id,connection_id) references public.integration_connections(organization_id,id) on delete restrict
);
create index overrides_connection on public.workflow_integration_overrides(organization_id,connection_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  resource_type text not null,
  resource_id text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  created_at timestamptz not null default now()
);
create index audit_events_tenant on public.audit_events(organization_id,created_at,id);

-- Outbox is persistence only: no worker or external effects are enabled in Milestone 0.
create table private.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  audit_event_id uuid not null unique references public.audit_events(id) on delete restrict,
  event_type text not null,
  resource_id text not null,
  created_at timestamptz not null default now()
);
create index outbox_tenant on private.outbox_events(organization_id,created_at,id);

-- This narrow lookup avoids recursive membership RLS. Caller identity is never a parameter.
create function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org and m.user_id = auth.uid()
      and m.status = 'active' and o.status = 'active' and m.role = any(allowed_roles)
  );
$$;
revoke all on function private.has_org_role(uuid,text[]) from public, anon;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;

create function private.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Immutable record' using errcode = '55000';
end;
$$;
revoke all on function private.reject_mutation() from public, anon, authenticated;

create function private.guard_tenant_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Organization is immutable' using errcode = '23514';
  end if;
  new.updated_at := now();
  if tg_table_name = 'workflows' then
    if new.id <> old.id or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'Workflow ownership is immutable' using errcode = '23514';
    end if;
    new.lock_version := old.lock_version + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_tenant_update() from public, anon, authenticated;

-- Trigger-only elevated function. It cannot be called as a normal RPC; records IDs only.
create function private.record_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb;
  tenant_id uuid;
  event_id uuid;
  target_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  tenant_id := coalesce((row_data->>'organization_id')::uuid, (row_data->>'id')::uuid);
  target_id := coalesce(row_data->>'id',row_data->>'user_id',row_data->>'workflow_id',tenant_id::text);
  insert into public.audit_events(organization_id,actor_user_id,resource_type,resource_id,operation)
    values (tenant_id,auth.uid(),tg_table_name,target_id,tg_op) returning id into event_id;
  insert into private.outbox_events(organization_id,audit_event_id,event_type,resource_id)
    values (tenant_id,event_id,tg_table_name || '.' || lower(tg_op),target_id);
  return null;
end;
$$;
revoke all on function private.record_change() from public, anon, authenticated;

-- Explicit grants override Supabase defaults. New public tables are never automatically exposed.
do $$
declare table_name text;
begin
  foreach table_name in array array['organizations','profiles','organization_memberships','organization_settings',
    'brand_configurations','workflows','workflow_versions','submissions','submission_events',
    'integration_connections','workflow_integration_overrides','audit_events'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role',table_name);
  end loop;
  foreach table_name in array array['organization_settings','brand_configurations','workflows','submissions','organization_memberships','integration_connections'] loop
    execute format('create trigger guard_tenant before update on public.%I for each row execute function private.guard_tenant_update()',table_name);
  end loop;
  foreach table_name in array array['organizations','organization_memberships','organization_settings','brand_configurations',
    'workflows','workflow_versions','submissions','submission_events','integration_connections','workflow_integration_overrides'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.record_change()',table_name);
  end loop;
  foreach table_name in array array['workflow_versions','submission_events','audit_events'] loop
    execute format('create trigger immutable_record before update or delete on public.%I for each row execute function private.reject_mutation()',table_name);
  end loop;
end;
$$;
alter table private.platform_operators enable row level security;
alter table private.outbox_events enable row level security;
revoke all on private.platform_operators,private.outbox_events from public,anon,authenticated,service_role;
create trigger immutable_outbox before update or delete on private.outbox_events
  for each row execute function private.reject_mutation();

create policy profiles_self on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy organizations_member on public.organizations for select to authenticated
  using (private.has_org_role(id,array['owner','staff']));
create policy memberships_member on public.organization_memberships for select to authenticated
  using (private.has_org_role(organization_id,array['owner','staff']));

do $$
declare table_name text;
begin
  foreach table_name in array array['organization_settings','brand_configurations','workflows','workflow_versions','submissions','submission_events'] loop
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.has_org_role(organization_id,array[''owner'',''staff'']))',table_name);
  end loop;
  foreach table_name in array array['integration_connections','workflow_integration_overrides','audit_events'] loop
    execute format('create policy owner_read on public.%I for select to authenticated using (private.has_org_role(organization_id,array[''owner'']))',table_name);
  end loop;
end;
$$;

-- Only these safe local-development edits are exposed. Critical writes await trusted commands.
grant update(config) on public.organization_settings,public.brand_configurations to authenticated;
create policy settings_owner_update on public.organization_settings for update to authenticated
  using (private.has_org_role(organization_id,array['owner']))
  with check (private.has_org_role(organization_id,array['owner']));
create policy brand_owner_update on public.brand_configurations for update to authenticated
  using (private.has_org_role(organization_id,array['owner']))
  with check (private.has_org_role(organization_id,array['owner']));

-- No tenant INSERT/UPDATE grant on submissions or versions: prices and publication cannot be forged.
-- Membership provisioning/owner transfer and platform support remain server-only and unimplemented.
commit;
