begin;

alter table public.submissions drop constraint submissions_status_check;
alter table public.submissions
  add constraint submissions_status_check check (status in (
    'received','in_review','changes_requested','approved','rejected','cancelled','completed'
  )),
  add column lock_version bigint not null default 0 check (lock_version >= 0),
  add column public_client_token uuid not null default gen_random_uuid();
create index submissions_public_rate on public.submissions(workflow_id,public_client_token,created_at desc);

create function private.condition_applies(p_condition jsonb, p_answers jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  actual jsonb;
  expected jsonb;
  operator text;
begin
  if p_condition is null or p_condition = 'null'::jsonb then return true; end if;
  actual := p_answers -> (p_condition->>'fieldKey');
  expected := p_condition->'value';
  operator := p_condition->>'operator';
  return case operator
    when 'eq' then actual = expected
    when 'neq' then actual is distinct from expected
    when 'includes' then case
      when jsonb_typeof(actual) = 'array' then actual @> jsonb_build_array(expected)
      when jsonb_typeof(actual) = 'string' then position(trim(both '"' from expected::text) in trim(both '"' from actual::text)) > 0
      else false end
    when 'not_includes' then not private.condition_applies(jsonb_set(p_condition,'{operator}','"includes"'),p_answers)
    when 'gt' then jsonb_typeof(actual) = 'number' and (actual::text)::numeric > (expected::text)::numeric
    when 'gte' then jsonb_typeof(actual) = 'number' and (actual::text)::numeric >= (expected::text)::numeric
    when 'lt' then jsonb_typeof(actual) = 'number' and (actual::text)::numeric < (expected::text)::numeric
    when 'lte' then jsonb_typeof(actual) = 'number' and (actual::text)::numeric <= (expected::text)::numeric
    else false end;
exception when others then
  return false;
end;
$$;
revoke all on function private.condition_applies(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.resolve_public_workflow(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object(
      'id',o.id,'slug',o.slug,'name',o.name,'createdAt',o.created_at,'updatedAt',o.updated_at
    ),
    'workflow', jsonb_build_object(
      'id',w.id,'orgId',w.organization_id,'slug',w.public_slug,'status',w.status,
      'templateKey',w.template_key,'draft',v.config,'design',v.design,
      'publishedVersionId',v.id,'hasUnpublishedChanges',false,'intake',w.intake,
      'isDemo',false,'createdAt',w.created_at,'updatedAt',w.updated_at
    ),
    'version', jsonb_build_object(
      'id',v.id,'orgId',v.organization_id,'workflowId',v.workflow_id,'version',v.version_number,
      'config',v.config,'design',v.design,'publishedAt',v.created_at,'createdAt',v.created_at,'updatedAt',v.created_at
    )
  )
  from public.workflows w
  join public.organizations o on o.id=w.organization_id and o.status='active'
  join public.workflow_versions v on v.id=w.published_version_id and v.workflow_id=w.id and v.organization_id=w.organization_id
  where w.public_slug=p_slug and w.status='published';
$$;
revoke all on function public.resolve_public_workflow(text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_public_workflow(text) to anon,authenticated;

create function public.submit_public_workflow(
  p_slug text,
  p_answers jsonb,
  p_consent boolean,
  p_idempotency_key uuid,
  p_client_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  existing public.submissions%rowtype;
  step jsonb;
  field jsonb;
  fee jsonb;
  answer_key text;
  field_key text;
  field_type text;
  field_value jsonb;
  display_value text;
  answer_items jsonb := '[]'::jsonb;
  price_items jsonb := '[]'::jsonb;
  total numeric := 0;
  amount numeric;
  multiplier numeric;
  request_hash text;
  customer_name text := '';
  customer_contact text := '';
  intake jsonb;
  created public.submissions%rowtype;
begin
  if jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 262144 then
    raise exception 'Invalid submission payload' using errcode='22023';
  end if;
  select w.id workflow_id,w.organization_id,w.intake,v.id version_id,v.version_number,v.config
    into target
  from public.workflows w
  join public.organizations o on o.id=w.organization_id and o.status='active'
  join public.workflow_versions v on v.id=w.published_version_id and v.workflow_id=w.id and v.organization_id=w.organization_id
  where w.public_slug=p_slug and w.status='published'
  for update of w;
  if not found then raise exception 'Published workflow unavailable' using errcode='P0002'; end if;
  if coalesce(target.config->>'mode','public') <> 'public' then
    raise exception 'Personal link required' using errcode='42501';
  end if;
  request_hash := encode(extensions.digest(pg_catalog.convert_to(
    p_slug || '|' || target.version_id::text || '|' || p_answers::text || '|' || p_consent::text,
    'UTF8'
  ),'sha256'),'hex');
  select * into existing from public.submissions s
   where s.organization_id=target.organization_id and s.workflow_id=target.workflow_id and s.idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash <> request_hash then raise exception 'Idempotency key conflict' using errcode='22023'; end if;
    return jsonb_build_object('id',existing.id,'organizationId',existing.organization_id,'workflowId',existing.workflow_id,
      'versionId',existing.workflow_version_id,'versionNumber',target.version_number,'status',existing.status,
      'answers',existing.answers,'totalMinor',existing.total_minor,'currency',existing.currency,
      'createdAt',existing.created_at,'updatedAt',existing.updated_at);
  end if;
  if (select count(*) from public.submissions s where s.workflow_id=target.workflow_id and s.created_at >= clock_timestamp()-interval '15 minutes') >= 100
     or (select count(*) from public.submissions s where s.workflow_id=target.workflow_id and s.public_client_token=p_client_token and s.created_at >= clock_timestamp()-interval '15 minutes') >= 5 then
    raise exception 'Public submission rate limit exceeded' using errcode='54000';
  end if;

  intake := target.intake;
  if coalesce((intake->>'paused')::boolean,false)
     or (intake->>'opensOn' is not null and current_date < (intake->>'opensOn')::date)
     or (intake->>'closesOn' is not null and current_date > (intake->>'closesOn')::date) then
    raise exception 'Workflow intake is closed' using errcode='55000';
  end if;
  if intake->>'maxTotal' ~ '^[0-9]+$' and (
    select count(*) from public.submissions s where s.workflow_id=target.workflow_id and s.status not in ('cancelled','rejected')
  ) >= (intake->>'maxTotal')::integer then raise exception 'Workflow capacity reached' using errcode='55000'; end if;

  for answer_key in select jsonb_object_keys(p_answers) loop
    if not exists (
      select 1 from jsonb_array_elements(target.config->'steps') s
      cross join lateral jsonb_array_elements(s->'fields') f where f->>'key'=answer_key
    ) then raise exception 'Unknown answer field' using errcode='22023'; end if;
  end loop;

  for step in select value from jsonb_array_elements(target.config->'steps') loop
    if not private.condition_applies(step->'condition',p_answers) then continue; end if;
    for field in select value from jsonb_array_elements(step->'fields') loop
      if not private.condition_applies(field->'condition',p_answers) then continue; end if;
      field_key := field->>'key'; field_type := field->>'type'; field_value := p_answers->field_key;
      if field_type in ('info','heading','image','gallery','divider','highlights','price_breakdown','terms') then continue; end if;
      if coalesce((field->>'required')::boolean,false) and (
        field_value is null or field_value='null'::jsonb or field_value='""'::jsonb
        or (jsonb_typeof(field_value)='array' and jsonb_array_length(field_value)=0)
        or (field_type='checkbox' and field_value <> 'true'::jsonb)
      ) then raise exception 'Required answer missing: %',field_key using errcode='22023'; end if;
      if field_value is null or field_value='null'::jsonb or field_value='""'::jsonb then continue; end if;

      if field_type in ('text','textarea','email','phone','file','date','time','select','radio','decision') and jsonb_typeof(field_value)<>'string' then
        raise exception 'Invalid string answer: %',field_key using errcode='22023';
      elsif field_type='number' and jsonb_typeof(field_value)<>'number' then
        raise exception 'Invalid number answer: %',field_key using errcode='22023';
      elsif field_type='checkbox' and jsonb_typeof(field_value)<>'boolean' then
        raise exception 'Invalid checkbox answer: %',field_key using errcode='22023';
      elsif field_type='multiselect' and jsonb_typeof(field_value)<>'array' then
        raise exception 'Invalid multiselect answer: %',field_key using errcode='22023';
      end if;
      if field_type='email' and trim(both '"' from field_value::text) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023'; end if;
      if field_type='phone' and trim(both '"' from field_value::text) !~ '^0[0-9]{1,2}[-[:space:]]?[0-9]{3}[-[:space:]]?[0-9]{4}$' then raise exception 'Invalid phone' using errcode='22023'; end if;
      if field_type='date' and trim(both '"' from field_value::text) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023'; end if;
      if field_type='decision' and trim(both '"' from field_value::text) not in ('approved','declined') then raise exception 'Invalid decision' using errcode='22023'; end if;
      if field_type in ('select','radio','time') and not exists (
        select 1 from jsonb_array_elements(coalesce(field->'options','[]'::jsonb)) o where o->>'value'=trim(both '"' from field_value::text)
      ) then raise exception 'Answer is not an allowed option' using errcode='22023'; end if;
      if field_type='multiselect' and exists (
        select 1 from jsonb_array_elements_text(field_value) selected
        where not exists (select 1 from jsonb_array_elements(coalesce(field->'options','[]'::jsonb)) o where o->>'value'=selected)
      ) then raise exception 'Answer contains an invalid option' using errcode='22023'; end if;
      if field_type='number' and ((field->>'min' is not null and (field_value::text)::numeric < (field->>'min')::numeric)
        or (field->>'max' is not null and (field_value::text)::numeric > (field->>'max')::numeric)) then raise exception 'Number outside allowed range' using errcode='22023'; end if;
      if field_type in ('text','textarea','file') and field->>'max' is not null and length(trim(both '"' from field_value::text)) > (field->>'max')::integer then raise exception 'Text answer too long' using errcode='22023'; end if;

      display_value := trim(both '"' from field_value::text);
      if field_type in ('select','radio','time') then select o->>'label' into display_value from jsonb_array_elements(field->'options') o where o->>'value'=display_value limit 1; end if;
      answer_items := answer_items || jsonb_build_array(jsonb_build_object('fieldId',field->>'id','fieldKey',field_key,'label',field->>'label','value',field_value,'displayValue',coalesce(display_value,'')));
      if field->>'role'='customer_name' then customer_name := left(trim(both '"' from field_value::text),200); end if;
      if field->>'role' in ('customer_phone','customer_email') then customer_contact := left(trim(both '"' from field_value::text),320); end if;

      if coalesce((target.config#>>'{pricing,enabled}')::boolean,false) then
        multiplier := 1;
        if field->>'multiplyByKey' is not null and jsonb_typeof(p_answers->(field->>'multiplyByKey'))='number' then multiplier := greatest(0,(p_answers->>(field->>'multiplyByKey'))::numeric); end if;
        amount := 0;
        if field_type in ('select','radio') then
          select coalesce((o->>'price')::numeric,0) into amount from jsonb_array_elements(coalesce(field->'options','[]'::jsonb)) o where o->>'value'=trim(both '"' from field_value::text) limit 1;
          amount := coalesce(amount,0)*multiplier;
        elsif field_type='multiselect' then
          select coalesce(sum((o->>'price')::numeric),0)*multiplier into amount from jsonb_array_elements(coalesce(field->'options','[]'::jsonb)) o where field_value ? (o->>'value');
        elsif field_type='checkbox' and field_value='true'::jsonb then amount := coalesce((field->>'price')::numeric,0)*multiplier;
        elsif field_type='decision' and trim(both '"' from field_value::text)='approved' then amount := coalesce((field->>'price')::numeric,0);
        elsif field_type='number' then amount := coalesce((field->>'price')::numeric,0)*(field_value::text)::numeric;
        end if;
        if amount < 0 or amount > 1000000 then raise exception 'Invalid authoritative price' using errcode='22023'; end if;
        if amount > 0 then total := total+amount; price_items := price_items || jsonb_build_array(jsonb_build_object('label',field->>'label','amount',round(amount,2))); end if;
      end if;
    end loop;
  end loop;
  if coalesce((target.config#>>'{consent,required}')::boolean,false) and not p_consent then raise exception 'Consent required' using errcode='22023'; end if;
  for fee in select value from jsonb_array_elements(coalesce(target.config#>'{pricing,fees}','[]'::jsonb)) loop
    if private.condition_applies(fee->'condition',p_answers) then
      amount := coalesce((fee->>'amount')::numeric,0);
      if amount < 0 or amount > 1000000 then raise exception 'Invalid authoritative fee' using errcode='22023'; end if;
      total := total+amount; if amount>0 then price_items := price_items || jsonb_build_array(jsonb_build_object('label',fee->>'label','amount',round(amount,2))); end if;
    end if;
  end loop;
  if total*100 > 9007199254740991 then raise exception 'Submission total exceeds limit' using errcode='22003'; end if;
  if coalesce((intake->>'onePerContact')::boolean,false) and customer_contact<>'' and exists (
    select 1 from public.submissions s where s.workflow_id=target.workflow_id and s.status not in ('cancelled','rejected','completed') and s.answers->>'customerContact'=customer_contact
  ) then raise exception 'Open request already exists' using errcode='23505'; end if;

  insert into public.submissions(organization_id,workflow_id,workflow_version_id,status,answers,total_minor,currency,idempotency_key,request_hash,public_client_token)
  values (target.organization_id,target.workflow_id,target.version_id,'received',jsonb_build_object(
    'answers',answer_items,'values',p_answers,'priceLines',price_items,'customerName',customer_name,'customerContact',customer_contact,
    'consentAt',case when p_consent then clock_timestamp() else null end
  ),round(total*100)::bigint,'ILS',p_idempotency_key,request_hash,p_client_token)
  returning * into created;
  insert into public.submission_events(organization_id,submission_id,event_type,actor_user_id)
  values (created.organization_id,created.id,'submitted',null);
  return jsonb_build_object('id',created.id,'organizationId',created.organization_id,'workflowId',created.workflow_id,
    'versionId',created.workflow_version_id,'versionNumber',target.version_number,'status',created.status,
    'answers',created.answers,'totalMinor',created.total_minor,'currency',created.currency,
    'createdAt',created.created_at,'updatedAt',created.updated_at);
end;
$$;
revoke all on function public.submit_public_workflow(text,jsonb,boolean,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_public_workflow(text,jsonb,boolean,uuid,uuid) to anon,authenticated;

create function private.bump_submission_lock()
returns trigger language plpgsql set search_path='' as $$
begin new.lock_version := old.lock_version+1; return new; end;
$$;
revoke all on function private.bump_submission_lock() from public,anon,authenticated,service_role;
create trigger submission_lock before update on public.submissions for each row execute function private.bump_submission_lock();

create function public.transition_submission_status(
  p_organization_id uuid,
  p_submission_id uuid,
  p_expected_lock_version bigint,
  p_to_status text
)
returns setof public.submissions
language plpgsql
security definer
set search_path=''
as $$
declare current_status text;
begin
  if not private.has_org_role(p_organization_id,array['owner','staff']) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select s.status into current_status from public.submissions s
   where s.organization_id=p_organization_id and s.id=p_submission_id and s.lock_version=p_expected_lock_version for update;
  if not found then raise exception 'Submission changed or unavailable' using errcode='40001'; end if;
  if not (
    (current_status='received' and p_to_status=any(array['in_review','approved','rejected','changes_requested','cancelled']))
    or (current_status='in_review' and p_to_status=any(array['approved','rejected','changes_requested','cancelled']))
    or (current_status='approved' and p_to_status=any(array['completed','cancelled']))
    or (current_status='rejected' and p_to_status='in_review')
  ) then raise exception 'Invalid submission transition' using errcode='22023'; end if;
  insert into public.submission_events(organization_id,submission_id,event_type,actor_user_id)
    values (p_organization_id,p_submission_id,'status:'||p_to_status,auth.uid());
  return query update public.submissions s set status=p_to_status
   where s.organization_id=p_organization_id and s.id=p_submission_id returning s.*;
end;
$$;
revoke all on function public.transition_submission_status(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_submission_status(uuid,uuid,bigint,text) to authenticated;

commit;
