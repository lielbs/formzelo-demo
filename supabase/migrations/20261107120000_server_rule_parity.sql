-- Server rule parity: the public submission path now applies exactly the rules the browser
-- engine shows the customer (src/engine/conditions.ts, validation.ts, pricing.ts, booking.ts,
-- intake.ts, capacity.ts). The browser remains a preview; this transaction is authoritative.
--
-- Fixes in the Milestone 2 implementation:
--  * condition operators: the editor writes equals/notEquals/isTrue/isFalse/notEmpty/isEmpty/
--    includes/gt/lt; the previous evaluator only knew eq/neq/... so every conditional step or
--    field was treated as hidden (required answers skipped, conditional prices dropped).
--  * booking rules, per-option places, per-day/per-week intake limits, closed dates and the
--    normalized one-open-request-per-contact rule are enforced under the workflow row lock.
--  * hidden answers are not stored; price lines match the browser rounding and labels.
-- Errors carry a stable machine message and the field key in HINT so the client can show the
-- right sentence next to the right field.
begin;

-- Business calendar. Formangle launches for Israeli businesses; one zone keeps "today",
-- "this week" and booking notice identical for customer, owner and server.
create function private.local_now()
returns timestamp
language sql
stable
set search_path = ''
as $$ select (pg_catalog.clock_timestamp() at time zone 'Asia/Jerusalem') $$;

create function private.local_today()
returns date
language sql
stable
set search_path = ''
as $$ select (private.local_now())::date $$;

-- JavaScript String(value) for a stored answer.
create function private.js_string(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) = 'null' then ''
    when jsonb_typeof(p_value) = 'string' then p_value #>> '{}'
    when jsonb_typeof(p_value) = 'array' then coalesce((
      select string_agg(private.js_string(e), ',' order by ord)
      from jsonb_array_elements(p_value) with ordinality as t(e, ord)
    ), '')
    else p_value::text
  end
$$;

-- JavaScript Number(value); null stands for NaN.
create function private.js_number(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text;
begin
  if p_value is null then return null; end if;
  case jsonb_typeof(p_value)
    when 'number' then return (p_value #>> '{}')::numeric;
    when 'boolean' then return case when p_value = 'true'::jsonb then 1 else 0 end;
    when 'null' then return 0;
    when 'string' then
      t := btrim(p_value #>> '{}');
      if t = '' then return 0; end if;
      if t ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then return t::numeric; end if;
      return null;
    else return null;
  end case;
end;
$$;

create function private.answer_is_empty(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
    or jsonb_typeof(p_value) = 'null'
    or p_value = '""'::jsonb
    or p_value = 'false'::jsonb
    or (jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) = 0)
$$;

-- Same contact written differently: "054-555 0100" = "+972545550100"; emails ignore case.
create function private.contact_key(p_contact text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c text := lower(btrim(coalesce(p_contact, '')));
  digits text;
begin
  if c = '' then return null; end if;
  if position('@' in c) > 0 then return c; end if;
  digits := regexp_replace(regexp_replace(c, '[^0-9]', '', 'g'), '^972', '0');
  return case when length(digits) >= 7 then digits else null end;
end;
$$;

-- Mirrors evaluateCondition() in src/engine/conditions.ts.
create or replace function private.condition_applies(p_condition jsonb, p_answers jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  actual jsonb;
  expected text;
  a numeric;
  b numeric;
begin
  if p_condition is null or jsonb_typeof(p_condition) <> 'object' then return true; end if;
  actual := p_answers -> (p_condition ->> 'fieldKey');
  expected := coalesce(p_condition ->> 'value', '');
  case p_condition ->> 'operator'
    when 'equals' then return private.js_string(actual) = expected;
    when 'notEquals' then return private.js_string(actual) <> expected;
    when 'includes' then
      if jsonb_typeof(actual) = 'array' then
        return exists (select 1 from jsonb_array_elements(actual) e where jsonb_typeof(e) = 'string' and e #>> '{}' = expected);
      end if;
      return position(expected in private.js_string(actual)) > 0;
    when 'isTrue' then return coalesce(actual = 'true'::jsonb or actual = '"approved"'::jsonb, false);
    when 'isFalse' then return not (coalesce(actual = 'true'::jsonb or actual = '"approved"'::jsonb, false));
    when 'notEmpty' then return not private.answer_is_empty(actual);
    when 'isEmpty' then return private.answer_is_empty(actual);
    when 'gt', 'lt' then
      a := private.js_number(actual);
      b := case when p_condition ? 'value' then private.js_number(p_condition -> 'value') else null end;
      if a is null or b is null then return false; end if;
      return case when p_condition ->> 'operator' = 'gt' then a > b else a < b end;
    else return false;
  end case;
end;
$$;
revoke all on function private.local_now() from public, anon, authenticated, service_role;
revoke all on function private.local_today() from public, anon, authenticated, service_role;
revoke all on function private.js_string(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.js_number(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.answer_is_empty(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.contact_key(text) from public, anon, authenticated, service_role;
revoke all on function private.condition_applies(jsonb, jsonb) from public, anon, authenticated, service_role;

-- A submission keeps its place unless it was rejected or cancelled (HOLDS_CAPACITY).
create function private.holds_capacity(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_status not in ('rejected', 'cancelled') $$;
revoke all on function private.holds_capacity(text) from public, anon, authenticated, service_role;

create index submissions_workflow_holding on public.submissions(workflow_id, created_at)
  where status not in ('rejected', 'cancelled');

-- Whether a link takes new requests now; mirrors intakeState() in src/engine/intake.ts.
create function private.intake_state(p_workflow_id uuid, p_intake jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := private.local_today();
  week_start date := today - extract(dow from today)::integer;
  total integer;
  today_count integer;
  week_count integer;
  counts jsonb;
  next_open date;
  i jsonb := coalesce(p_intake, '{}'::jsonb);
begin
  select count(*),
         count(*) filter (where (s.created_at at time zone 'Asia/Jerusalem')::date = today),
         count(*) filter (where (s.created_at at time zone 'Asia/Jerusalem')::date >= week_start)
    into total, today_count, week_count
  from public.submissions s
  where s.workflow_id = p_workflow_id and private.holds_capacity(s.status);
  counts := jsonb_build_object('total', total, 'today', today_count, 'week', week_count);
  if coalesce((i ->> 'paused')::boolean, false) then
    return jsonb_build_object('open', false, 'reason', 'paused', 'counts', counts);
  end if;
  if i ->> 'opensOn' is not null and today < (i ->> 'opensOn')::date then
    return jsonb_build_object('open', false, 'reason', 'not_yet', 'opensOn', i ->> 'opensOn', 'counts', counts);
  end if;
  if i ->> 'closesOn' is not null and today > (i ->> 'closesOn')::date then
    return jsonb_build_object('open', false, 'reason', 'ended', 'counts', counts);
  end if;
  if coalesce(i -> 'closedDates', '[]'::jsonb) ? today::text then
    next_open := today + 1;
    while (i -> 'closedDates') ? next_open::text loop next_open := next_open + 1; end loop;
    return jsonb_build_object('open', false, 'reason', 'holiday', 'nextOpen', next_open::text, 'counts', counts);
  end if;
  if i ->> 'maxTotal' ~ '^[0-9]+$' and total >= (i ->> 'maxTotal')::integer then
    return jsonb_build_object('open', false, 'reason', 'total', 'counts', counts);
  end if;
  if i ->> 'maxPerDay' ~ '^[0-9]+$' and today_count >= (i ->> 'maxPerDay')::integer then
    return jsonb_build_object('open', false, 'reason', 'day', 'counts', counts);
  end if;
  if i ->> 'maxPerWeek' ~ '^[0-9]+$' and week_count >= (i ->> 'maxPerWeek')::integer then
    return jsonb_build_object('open', false, 'reason', 'week', 'counts', counts);
  end if;
  return jsonb_build_object('open', true, 'counts', counts);
end;
$$;
revoke all on function private.intake_state(uuid, jsonb) from public, anon, authenticated, service_role;

-- Places taken per slot on one date; mirrors slotAvailability() in src/engine/booking.ts.
create function private.booking_units(p_booking jsonb, p_values jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  -- Math.max(1, Number(guests) || 1)
  select case when p_booking ->> 'capacityUnit' = 'guests'
    then greatest(1, coalesce(nullif(private.js_number(p_values -> (p_booking ->> 'guestsKey')), 0), 1))
    else 1 end
$$;
revoke all on function private.booking_units(jsonb, jsonb) from public, anon, authenticated, service_role;

create function private.booking_used(p_workflow_id uuid, p_booking jsonb, p_date text, p_time text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(private.booking_units(p_booking, s.answers -> 'values')), 0)
  from public.submissions s
  where s.workflow_id = p_workflow_id
    and private.holds_capacity(s.status)
    and s.answers -> 'values' ->> (p_booking ->> 'dateKey') = p_date
    and (p_time is null or s.answers -> 'values' ->> (p_booking ->> 'timeKey') = p_time)
$$;
revoke all on function private.booking_used(uuid, jsonb, text, text) from public, anon, authenticated, service_role;

create function private.rule_error(p_code text, p_field text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_code using errcode = 'P0001', hint = coalesce(p_field, '');
end;
$$;
revoke all on function private.rule_error(text, text) from public, anon, authenticated, service_role;

create or replace function public.submit_public_workflow(
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
  created public.submissions%rowtype;
  step jsonb;
  field jsonb;
  opt jsonb;
  fee jsonb;
  answer_key text;
  field_key text;
  field_type text;
  v jsonb;
  s text;
  n numeric;
  m numeric;
  suffix text;
  display_value text;
  clean_values jsonb := '{}'::jsonb;
  answer_items jsonb := '[]'::jsonb;
  price_items jsonb := '[]'::jsonb;
  total numeric := 0;
  request_hash text;
  customer_name text := '';
  customer_phone text := '';
  customer_email text := '';
  customer_contact text;
  intake jsonb;
  state jsonb;
  booking jsonb;
  b_date text;
  b_time text;
  b_units numeric;
  pricing_on boolean;
  today date := private.local_today();
  fmt_m text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 262144 then
    raise exception 'Invalid submission payload' using errcode = '22023';
  end if;
  select w.id workflow_id, w.organization_id, w.intake, v2.id version_id, v2.version_number, v2.config
    into target
  from public.workflows w
  join public.organizations o on o.id = w.organization_id and o.status = 'active'
  join public.workflow_versions v2 on v2.id = w.published_version_id and v2.workflow_id = w.id and v2.organization_id = w.organization_id
  where w.public_slug = p_slug and w.status = 'published'
  for update of w;
  if not found then raise exception 'Published workflow unavailable' using errcode = 'P0002'; end if;
  if coalesce(target.config ->> 'mode', 'public') <> 'public' then
    raise exception 'Personal link required' using errcode = '42501';
  end if;

  request_hash := encode(extensions.digest(pg_catalog.convert_to(
    p_slug || '|' || target.version_id::text || '|' || p_answers::text || '|' || p_consent::text, 'UTF8'), 'sha256'), 'hex');
  select * into existing from public.submissions x
   where x.organization_id = target.organization_id and x.workflow_id = target.workflow_id and x.idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> request_hash then raise exception 'Idempotency key conflict' using errcode = '22023'; end if;
    return jsonb_build_object('id', existing.id, 'organizationId', existing.organization_id, 'workflowId', existing.workflow_id,
      'versionId', existing.workflow_version_id, 'versionNumber', target.version_number, 'status', existing.status,
      'answers', existing.answers, 'totalMinor', existing.total_minor, 'currency', existing.currency,
      'createdAt', existing.created_at, 'updatedAt', existing.updated_at, 'replayed', true);
  end if;
  if (select count(*) from public.submissions x where x.workflow_id = target.workflow_id and x.created_at >= clock_timestamp() - interval '15 minutes') >= 100
     or (select count(*) from public.submissions x where x.workflow_id = target.workflow_id and x.public_client_token = p_client_token and x.created_at >= clock_timestamp() - interval '15 minutes') >= 5 then
    raise exception 'Public submission rate limit exceeded' using errcode = '54000';
  end if;

  intake := coalesce(target.intake, '{}'::jsonb);
  state := private.intake_state(target.workflow_id, intake);
  if not (state ->> 'open')::boolean then perform private.rule_error('intake_' || (state ->> 'reason')); end if;

  for answer_key in select jsonb_object_keys(p_answers) loop
    if not exists (
      select 1 from jsonb_array_elements(target.config -> 'steps') st
      cross join lateral jsonb_array_elements(st -> 'fields') f where f ->> 'key' = answer_key
    ) then raise exception 'Unknown answer field' using errcode = '22023'; end if;
  end loop;

  pricing_on := coalesce((target.config #>> '{pricing,enabled}')::boolean, false);
  for step in select value from jsonb_array_elements(target.config -> 'steps') loop
    if not private.condition_applies(step -> 'condition', p_answers) then continue; end if;
    for field in select value from jsonb_array_elements(step -> 'fields') loop
      field_type := field ->> 'type';
      if field_type in ('info','heading','image','gallery','divider','highlights','price_breakdown','terms') then continue; end if;
      if not private.condition_applies(field -> 'condition', p_answers) then continue; end if;
      field_key := field ->> 'key';
      v := p_answers -> field_key;
      if v is not null and jsonb_typeof(v) = 'null' then v := null; end if;
      -- Numbers typed into a text box arrive as strings in some browsers.
      if field_type = 'number' and v is not null and jsonb_typeof(v) = 'string' then
        if btrim(v #>> '{}') = '' then v := null;
        elsif private.js_number(v) is null then perform private.rule_error('invalid_number', field_key);
        else v := to_jsonb(private.js_number(v)); end if;
      end if;

      if coalesce((field ->> 'required')::boolean, false) then
        if v is null or v = '""'::jsonb
          or (field_type in ('text','textarea','file','email','phone') and jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
          or (field_type = 'checkbox' and v <> 'true'::jsonb)
          or (field_type = 'multiselect' and jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
          perform private.rule_error('required', field_key);
        end if;
      end if;
      if v is null or v = '""'::jsonb then continue; end if;

      if field_type in ('text','textarea','email','phone','file','date','time','select','radio','decision') and jsonb_typeof(v) <> 'string' then
        perform private.rule_error('invalid_value', field_key);
      elsif field_type = 'number' and jsonb_typeof(v) <> 'number' then
        perform private.rule_error('invalid_number', field_key);
      elsif field_type = 'checkbox' and jsonb_typeof(v) <> 'boolean' then
        perform private.rule_error('invalid_value', field_key);
      elsif field_type = 'multiselect' and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string')) then
        perform private.rule_error('invalid_value', field_key);
      end if;
      s := case when jsonb_typeof(v) = 'string' then v #>> '{}' else null end;

      if field_type = 'email' and btrim(s) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then perform private.rule_error('invalid_email', field_key); end if;
      if field_type = 'phone' and btrim(s) !~ '^0[0-9]{1,2}[-[:space:]]?[0-9]{3}[-[:space:]]?[0-9]{4}$' then perform private.rule_error('invalid_phone', field_key); end if;
      if field_type = 'time' then
        if s !~ '^[0-9]{2}:[0-9]{2}$' then perform private.rule_error('invalid_time', field_key); end if;
        if jsonb_array_length(coalesce(field -> 'options', '[]'::jsonb)) > 0
           and not exists (select 1 from jsonb_array_elements(field -> 'options') o where o ->> 'value' = s) then
          perform private.rule_error('invalid_time', field_key);
        end if;
      end if;
      if field_type = 'date' then
        if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform private.rule_error('invalid_date', field_key); end if;
        begin
          perform s::date;
        exception when others then
          perform private.rule_error('invalid_date', field_key);
        end;
        if field ->> 'min' is not null and s < (today + floor((field ->> 'min')::numeric)::integer)::text then perform private.rule_error('date_too_early', field_key); end if;
        if field ->> 'max' is not null and s > (today + floor((field ->> 'max')::numeric)::integer)::text then perform private.rule_error('date_too_late', field_key); end if;
      end if;
      if field_type = 'decision' and s not in ('approved', 'declined') then perform private.rule_error('invalid_value', field_key); end if;
      if field_type in ('select', 'radio') and not exists (
        select 1 from jsonb_array_elements(coalesce(field -> 'options', '[]'::jsonb)) o where o ->> 'value' = s
      ) then perform private.rule_error('invalid_option', field_key); end if;
      if field_type = 'multiselect' then
        if exists (
          select 1 from jsonb_array_elements_text(v) chosen
          where not exists (select 1 from jsonb_array_elements(coalesce(field -> 'options', '[]'::jsonb)) o where o ->> 'value' = chosen)
        ) then perform private.rule_error('invalid_option', field_key); end if;
        if field ->> 'max' is not null and jsonb_array_length(v) > (field ->> 'max')::numeric then perform private.rule_error('too_many_options', field_key); end if;
      end if;
      if field_type = 'number' then
        n := (v #>> '{}')::numeric;
        if (field ->> 'min' is not null and n < (field ->> 'min')::numeric) or (field ->> 'max' is not null and n > (field ->> 'max')::numeric) then
          perform private.rule_error('number_out_of_range', field_key);
        end if;
      end if;
      if field_type in ('text','textarea','file') and field ->> 'max' is not null and length(btrim(s)) > (field ->> 'max')::numeric then
        perform private.rule_error('text_too_long', field_key);
      end if;
      if field_type in ('text','textarea') and length(s) > 10000 then perform private.rule_error('text_too_long', field_key); end if;

      -- Places per option (radio / select), counted in this transaction under the workflow lock.
      if field_type in ('select', 'radio') then
        select o into opt from jsonb_array_elements(field -> 'options') o where o ->> 'value' = s limit 1;
        if opt ->> 'capacity' ~ '^[0-9]+$' and (
          select count(*) from public.submissions x
          where x.workflow_id = target.workflow_id and private.holds_capacity(x.status) and x.answers -> 'values' ->> field_key = s
        ) >= (opt ->> 'capacity')::integer then
          perform private.rule_error('option_full', field_key);
        end if;
      end if;

      clean_values := clean_values || jsonb_build_object(field_key, v);
      display_value := case
        when field_type in ('select','radio','time') then coalesce((select o ->> 'label' from jsonb_array_elements(coalesce(field -> 'options', '[]'::jsonb)) o where o ->> 'value' = s limit 1), s)
        when field_type = 'multiselect' then case when jsonb_array_length(v) = 0 then '—' else (
          select string_agg(coalesce((select o ->> 'label' from jsonb_array_elements(coalesce(field -> 'options', '[]'::jsonb)) o where o ->> 'value' = c), c), ', ' order by ord)
          from jsonb_array_elements_text(v) with ordinality as t(c, ord)) end
        when field_type = 'checkbox' then case when v = 'true'::jsonb then 'כן' else 'לא' end
        when field_type = 'decision' then case when s = 'approved' then 'אושר' else 'נדחה' end
        else private.js_string(v)
      end;
      answer_items := answer_items || jsonb_build_array(jsonb_build_object(
        'fieldId', field ->> 'id', 'fieldKey', field_key, 'label', field ->> 'label', 'value', v, 'displayValue', coalesce(display_value, '')));
      if field ->> 'role' = 'customer_name' and customer_name = '' then customer_name := left(private.js_string(v), 200); end if;
      if field ->> 'role' = 'customer_phone' and customer_phone = '' then customer_phone := left(private.js_string(v), 320); end if;
      if field ->> 'role' = 'customer_email' and customer_email = '' then customer_email := left(private.js_string(v), 320); end if;

      -- Mirrors fieldLines() in src/engine/pricing.ts.
      if pricing_on then
        m := 1;
        if field ->> 'multiplyByKey' is not null then
          m := private.js_number(p_answers -> (field ->> 'multiplyByKey'));
          m := case when m is not null and m > 0 then m else 0 end;
        end if;
        fmt_m := trim_scale(m)::text;
        suffix := case when field ->> 'multiplyByKey' is not null and m > 0 then ' × ' || fmt_m else '' end;
        if field_type in ('select', 'radio') then
          if coalesce((opt ->> 'price')::numeric, 0) > 0 then
            price_items := price_items || jsonb_build_array(jsonb_build_object('label', (field ->> 'label') || ': ' || (opt ->> 'label') || suffix, 'amount', round((opt ->> 'price')::numeric * m, 2)));
          end if;
        elsif field_type = 'multiselect' then
          price_items := price_items || coalesce((
            select jsonb_agg(jsonb_build_object('label', (o ->> 'label') || suffix, 'amount', round((o ->> 'price')::numeric * m, 2)) order by ord)
            from jsonb_array_elements(coalesce(field -> 'options', '[]'::jsonb)) with ordinality as t(o, ord)
            where v ? (o ->> 'value') and coalesce((o ->> 'price')::numeric, 0) > 0), '[]'::jsonb);
        elsif field_type = 'checkbox' and v = 'true'::jsonb and coalesce((field ->> 'price')::numeric, 0) > 0 then
          price_items := price_items || jsonb_build_array(jsonb_build_object('label', (field ->> 'label') || suffix, 'amount', round((field ->> 'price')::numeric * m, 2)));
        elsif field_type = 'decision' and s = 'approved' and coalesce((field ->> 'price')::numeric, 0) > 0 then
          price_items := price_items || jsonb_build_array(jsonb_build_object('label', field ->> 'label', 'amount', round((field ->> 'price')::numeric * m, 2)));
        elsif field_type = 'number' and coalesce((field ->> 'price')::numeric, 0) > 0 and (v #>> '{}')::numeric > 0 then
          price_items := price_items || jsonb_build_array(jsonb_build_object('label', (field ->> 'label') || ' × ' || trim_scale((v #>> '{}')::numeric)::text, 'amount', round((field ->> 'price')::numeric * (v #>> '{}')::numeric, 2)));
        end if;
      end if;
      opt := null;
    end loop;
  end loop;

  if coalesce((target.config #>> '{consent,required}')::boolean, false) and not coalesce(p_consent, false) then
    perform private.rule_error('consent_required', '__consent');
  end if;
  if pricing_on then
    for fee in select value from jsonb_array_elements(coalesce(target.config #> '{pricing,fees}', '[]'::jsonb)) loop
      if private.condition_applies(fee -> 'condition', p_answers) then
        price_items := price_items || jsonb_build_array(jsonb_build_object('label', fee ->> 'label', 'amount', round(coalesce((fee ->> 'amount')::numeric, 0), 2)));
      end if;
    end loop;
  end if;
  select coalesce(sum((p ->> 'amount')::numeric), 0) into total from jsonb_array_elements(price_items) p;
  total := round(total, 2);
  if total < 0 or total > 10000000 then raise exception 'Submission total exceeds limit' using errcode = '22003'; end if;

  -- Booking rules; mirrors validateBooking() in src/engine/booking.ts with server-held counts.
  booking := target.config -> 'booking';
  if coalesce((booking ->> 'enabled')::boolean, false) then
    b_date := clean_values ->> (booking ->> 'dateKey');
    b_time := case when booking ->> 'timeKey' is not null then nullif(clean_values ->> (booking ->> 'timeKey'), '') else null end;
    if b_date is not null and b_date <> '' then
      if b_date < today::text then perform private.rule_error('booking_past', booking ->> 'dateKey'); end if;
      if coalesce(booking -> 'closedDates', '[]'::jsonb) ? b_date then perform private.rule_error('booking_closed_date', booking ->> 'dateKey'); end if;
      if booking ->> 'maxDaysAhead' is not null and b_date > (today + (booking ->> 'maxDaysAhead')::integer)::text then
        perform private.rule_error('booking_too_far', booking ->> 'dateKey');
      end if;
      if booking ->> 'minNoticeHours' is not null
         and (b_date::date + coalesce(b_time, '23:59')::time) - private.local_now() < make_interval(hours => (booking ->> 'minNoticeHours')::integer) then
        perform private.rule_error('booking_notice', coalesce(case when b_time is not null then booking ->> 'timeKey' end, booking ->> 'dateKey'));
      end if;
      b_units := private.booking_units(booking, clean_values);
      if booking ->> 'maxPerDay' is not null
         and private.booking_used(target.workflow_id, booking, b_date, null) + b_units > (booking ->> 'maxPerDay')::integer then
        perform private.rule_error('booking_day_full', booking ->> 'dateKey');
      end if;
      if not coalesce(booking -> 'openWeekdays', '[]'::jsonb) @> to_jsonb(extract(dow from b_date::date)::integer) then
        perform private.rule_error('booking_closed_weekday', booking ->> 'dateKey');
      end if;
      if b_time is not null then
        if jsonb_array_length(coalesce(booking -> 'slots', '[]'::jsonb)) > 0 then
          if not (booking -> 'slots') ? b_time then perform private.rule_error('booking_slot_unavailable', booking ->> 'timeKey'); end if;
          if private.booking_used(target.workflow_id, booking, b_date, b_time) + b_units > (booking ->> 'capacityPerSlot')::integer then
            perform private.rule_error('booking_slot_full', booking ->> 'timeKey');
          end if;
        end if;
      end if;
    end if;
  end if;

  customer_contact := coalesce(nullif(customer_phone, ''), customer_email);
  if coalesce((intake ->> 'onePerContact')::boolean, false) and private.contact_key(customer_contact) is not null and exists (
    select 1 from public.submissions x
    where x.workflow_id = target.workflow_id and private.holds_capacity(x.status)
      and private.contact_key(x.answers ->> 'customerContact') = private.contact_key(customer_contact)
  ) then perform private.rule_error('open_request_exists'); end if;

  insert into public.submissions(organization_id, workflow_id, workflow_version_id, status, answers, total_minor, currency, idempotency_key, request_hash, public_client_token)
  values (target.organization_id, target.workflow_id, target.version_id, 'received', jsonb_build_object(
    'answers', answer_items, 'values', clean_values, 'priceLines', price_items, 'customerName', customer_name,
    'customerContact', customer_contact, 'consentAt', case when p_consent then clock_timestamp() else null end
  ), round(total * 100)::bigint, 'ILS', p_idempotency_key, request_hash, p_client_token)
  returning * into created;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id)
  values (created.organization_id, created.id, 'submitted', null);
  return jsonb_build_object('id', created.id, 'organizationId', created.organization_id, 'workflowId', created.workflow_id,
    'versionId', created.workflow_version_id, 'versionNumber', target.version_number, 'status', created.status,
    'answers', created.answers, 'totalMinor', created.total_minor, 'currency', created.currency,
    'createdAt', created.created_at, 'updatedAt', created.updated_at);
end;
$$;
revoke all on function public.submit_public_workflow(text, jsonb, boolean, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_public_workflow(text, jsonb, boolean, uuid, uuid) to anon, authenticated;

-- Read-only public helpers for the customer form. They expose counts only, never answers.
create function private.public_target(p_slug text)
returns table(workflow_id uuid, intake jsonb, config jsonb)
language sql
stable
set search_path = ''
as $$
  select w.id, w.intake, v.config
  from public.workflows w
  join public.organizations o on o.id = w.organization_id and o.status = 'active'
  join public.workflow_versions v on v.id = w.published_version_id and v.workflow_id = w.id
  where w.public_slug = p_slug and w.status = 'published'
$$;
revoke all on function private.public_target(text) from public, anon, authenticated, service_role;

create function public.public_intake_state(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.intake_state(t.workflow_id, t.intake) from private.public_target(p_slug) t
$$;

create function public.public_booking_availability(p_slug text, p_date text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  b jsonb;
  cap integer;
  day_full boolean;
begin
  if p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return '[]'::jsonb; end if;
  select * into t from private.public_target(p_slug);
  if not found then return '[]'::jsonb; end if;
  b := t.config -> 'booking';
  if not coalesce((b ->> 'enabled')::boolean, false) then return '[]'::jsonb; end if;
  cap := (b ->> 'capacityPerSlot')::integer;
  -- A day that reached its cap shows every slot as taken.
  day_full := b ->> 'maxPerDay' is not null and private.booking_used(t.workflow_id, b, p_date, null) >= (b ->> 'maxPerDay')::numeric;
  return coalesce((
    select jsonb_agg(jsonb_build_object('time', slot, 'used', used, 'capacity', cap,
      'state', case when day_full or cap - used <= 0 then 'full' when cap - used <= ceil(cap * 0.25) then 'limited' else 'available' end) order by ord)
    from (
      select slot, ord, case when b ->> 'timeKey' is null then private.booking_used(t.workflow_id, b, p_date, null)
                             else private.booking_used(t.workflow_id, b, p_date, slot) end used
      from jsonb_array_elements_text(coalesce(b -> 'slots', '[]'::jsonb)) with ordinality as x(slot, ord)
    ) z), '[]'::jsonb);
end;
$$;

create function public.public_option_usage(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(f.key, coalesce(u.counts, '{}'::jsonb)), '{}'::jsonb)
  from private.public_target(p_slug) t
  cross join lateral (
    select distinct fl ->> 'key' as key
    from jsonb_array_elements(t.config -> 'steps') st
    cross join lateral jsonb_array_elements(st -> 'fields') fl
    where fl ->> 'type' in ('radio', 'select')
      and exists (select 1 from jsonb_array_elements(coalesce(fl -> 'options', '[]'::jsonb)) o where o ? 'capacity')
  ) f
  left join lateral (
    select jsonb_object_agg(val, cnt) counts from (
      select s.answers -> 'values' ->> f.key val, count(*) cnt
      from public.submissions s
      where s.workflow_id = t.workflow_id and private.holds_capacity(s.status) and s.answers -> 'values' ? f.key
      group by 1
    ) g
  ) u on true
$$;

revoke all on function public.public_intake_state(text) from public, anon, authenticated, service_role;
revoke all on function public.public_booking_availability(text, text) from public, anon, authenticated, service_role;
revoke all on function public.public_option_usage(text) from public, anon, authenticated, service_role;
grant execute on function public.public_intake_state(text) to anon, authenticated;
grant execute on function public.public_booking_availability(text, text) to anon, authenticated;
grant execute on function public.public_option_usage(text) to anon, authenticated;

commit;
