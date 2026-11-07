-- Customer portal: secure tracking links, internal notes, customer actions and interactive quotes.
--
-- Trust model
--  * Customers never hold an account. A tracking link carries a 256-bit random token in the URL
--    fragment; only its SHA-256 hash is stored. Tokens expire, can be revoked by the business and
--    resolve to exactly one request of one organization.
--  * Everything a customer reads goes through public_track_request(), which projects only
--    customer-facing data: no internal notes, staff identities, audit rows or other requests.
--  * Quote totals are recalculated here from the frozen quote and the customer's selections;
--    browser totals are previews. Decisions are transactional and idempotent.
--  * No message is sent by Formangle: the business shares links itself (copy, WhatsApp link).
--    No payment is taken or claimed.
begin;

-- ---------- Customer-visible timeline ----------
alter table public.submission_events
  add column visibility text not null default 'internal' check (visibility in ('internal', 'customer')),
  add column message text check (message is null or length(message) <= 500);

-- ---------- Tracking tokens ----------
create table private.submission_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  foreign key (organization_id, submission_id) references public.submissions(organization_id, id) on delete restrict
);
create index submission_access_tokens_request on private.submission_access_tokens(organization_id, submission_id, created_at);
alter table private.submission_access_tokens enable row level security;
revoke all on private.submission_access_tokens from public, anon, authenticated, service_role;

create function private.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256'), 'hex') $$;

create function private.issue_access_token(p_org uuid, p_submission uuid, p_actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  raw text := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
begin
  -- Keep at most ten live links per request; the oldest live ones are revoked first.
  update private.submission_access_tokens t set revoked_at = clock_timestamp()
   where t.id in (
     select x.id from private.submission_access_tokens x
     where x.submission_id = p_submission and x.revoked_at is null and x.expires_at > clock_timestamp()
     order by x.created_at desc offset 9);
  insert into private.submission_access_tokens(organization_id, submission_id, token_hash, created_by, expires_at)
  values (p_org, p_submission, private.hash_token(raw), p_actor, clock_timestamp() + interval '180 days');
  return raw;
end;
$$;

-- Resolves a raw token to its request, or nothing. Never says why a token failed.
create function private.resolve_access_token(p_token text)
returns table(organization_id uuid, submission_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  found_token private.submission_access_tokens%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then return; end if;
  select * into found_token from private.submission_access_tokens t
   where t.token_hash = private.hash_token(p_token) and t.revoked_at is null and t.expires_at > clock_timestamp();
  if not found then return; end if;
  if not exists (select 1 from public.organizations o where o.id = found_token.organization_id and o.status = 'active') then return; end if;
  if found_token.last_used_at is null or found_token.last_used_at < clock_timestamp() - interval '5 minutes' then
    update private.submission_access_tokens set last_used_at = clock_timestamp() where id = found_token.id;
  end if;
  organization_id := found_token.organization_id;
  submission_id := found_token.submission_id;
  return next;
end;
$$;
revoke all on function private.hash_token(text) from public, anon, authenticated, service_role;
revoke all on function private.issue_access_token(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.resolve_access_token(text) from public, anon, authenticated, service_role;

-- The customer who just submitted proves it with the two random values only their browser holds.
create function public.public_request_tracking_token(p_slug text, p_idempotency_key uuid, p_client_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.submissions%rowtype;
begin
  select s.* into target from public.submissions s
  join public.workflows w on w.id = s.workflow_id and w.public_slug = p_slug
  where s.idempotency_key = p_idempotency_key and s.public_client_token = p_client_token
    and s.created_at > clock_timestamp() - interval '24 hours';
  if not found then raise exception 'Request unavailable' using errcode = 'P0002'; end if;
  if (select count(*) from private.submission_access_tokens t where t.submission_id = target.id and t.created_by is null) >= 5 then
    raise exception 'Tracking link limit reached' using errcode = '54000';
  end if;
  return private.issue_access_token(target.organization_id, target.id, null);
end;
$$;

create function public.issue_tracking_link(p_organization_id uuid, p_submission_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.submissions s where s.organization_id = p_organization_id and s.id = p_submission_id) then
    raise exception 'Request unavailable' using errcode = 'P0002';
  end if;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id)
  values (p_organization_id, p_submission_id, 'tracking_link_issued', auth.uid());
  return private.issue_access_token(p_organization_id, p_submission_id, auth.uid());
end;
$$;

create function public.revoke_tracking_links(p_organization_id uuid, p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked integer;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  update private.submission_access_tokens t set revoked_at = clock_timestamp()
   where t.organization_id = p_organization_id and t.submission_id = p_submission_id and t.revoked_at is null;
  get diagnostics revoked = row_count;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id)
  values (p_organization_id, p_submission_id, 'tracking_links_revoked', auth.uid());
  return revoked;
end;
$$;

-- ---------- Internal notes (never shown to customers) ----------
create table public.submission_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id uuid not null,
  author_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, submission_id) references public.submissions(organization_id, id) on delete restrict
);
create index submission_notes_request on public.submission_notes(organization_id, submission_id, created_at);

create function public.add_submission_note(p_organization_id uuid, p_submission_id uuid, p_body text)
returns setof public.submission_notes
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'note_invalid' using errcode = '22023'; end if;
  if not exists (select 1 from public.submissions s where s.organization_id = p_organization_id and s.id = p_submission_id) then
    raise exception 'Request unavailable' using errcode = 'P0002';
  end if;
  return query insert into public.submission_notes(organization_id, submission_id, author_user_id, body)
    values (p_organization_id, p_submission_id, auth.uid(), btrim(p_body)) returning *;
end;
$$;

-- ---------- Customer actions (approve / choose / update) ----------
create table public.customer_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id uuid not null,
  kind text not null check (kind in ('approval', 'choice', 'update')),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  amount_minor bigint check (amount_minor between 0 and 100000000),
  note text check (note is null or length(note) <= 300),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  expires_at timestamptz,
  status text not null check (status in ('pending', 'responded', 'cancelled', 'posted')),
  response jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, submission_id) references public.submissions(organization_id, id) on delete restrict,
  unique (organization_id, id),
  check ((kind = 'update') = (jsonb_array_length(options) = 0)),
  check ((kind = 'update') = (status = 'posted') or status in ('cancelled')),
  check (status <> 'responded' or response is not null)
);
create index customer_actions_request on public.customer_actions(organization_id, submission_id, created_at);

create function public.create_customer_action(p_organization_id uuid, p_submission_id uuid, p_input jsonb)
returns setof public.customer_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := p_input ->> 'kind';
  labels jsonb := coalesce(p_input -> 'options', 'null'::jsonb);
  opts jsonb := '[]'::jsonb;
  amount numeric;
  expires timestamptz;
  current_status text;
  created public.customer_actions%rowtype;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select s.status into current_status from public.submissions s where s.organization_id = p_organization_id and s.id = p_submission_id for update;
  if not found then raise exception 'Request unavailable' using errcode = 'P0002'; end if;
  if current_status in ('cancelled', 'rejected') then raise exception 'request_closed' using errcode = '55000'; end if;
  if jsonb_typeof(p_input) <> 'object' or kind not in ('approval', 'choice', 'update') then raise exception 'action_invalid' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_input ->> 'title', ''))) not between 1 and 120 or length(coalesce(p_input ->> 'description', '')) > 1000
     or length(coalesce(p_input ->> 'note', '')) > 300 then raise exception 'action_invalid' using errcode = '22023'; end if;
  if p_input ? 'amount' and p_input -> 'amount' <> 'null'::jsonb then
    if jsonb_typeof(p_input -> 'amount') <> 'number' then raise exception 'action_invalid' using errcode = '22023'; end if;
    amount := (p_input ->> 'amount')::numeric;
    if amount < 0 or amount > 1000000 then raise exception 'action_invalid' using errcode = '22023'; end if;
  end if;
  if p_input ->> 'expiresAt' is not null then
    begin
      expires := (p_input ->> 'expiresAt')::timestamptz;
    exception when others then raise exception 'action_invalid' using errcode = '22023';
    end;
    if expires <= clock_timestamp() then raise exception 'action_invalid' using errcode = '22023'; end if;
  end if;
  if kind = 'update' then
    if labels <> 'null'::jsonb then raise exception 'action_invalid' using errcode = '22023'; end if;
  else
    if kind = 'approval' and labels = 'null'::jsonb then labels := '["מאשר","לא מאשר"]'::jsonb; end if;
    if jsonb_typeof(labels) <> 'array' or jsonb_array_length(labels) <> 2
       or exists (select 1 from jsonb_array_elements(labels) l where jsonb_typeof(l) <> 'string' or length(btrim(l #>> '{}')) not between 1 and 40)
       or btrim(labels ->> 0) = btrim(labels ->> 1) then raise exception 'action_invalid' using errcode = '22023'; end if;
    opts := jsonb_build_array(jsonb_build_object('id', 'a', 'label', btrim(labels ->> 0)), jsonb_build_object('id', 'b', 'label', btrim(labels ->> 1)));
  end if;
  insert into public.customer_actions(organization_id, submission_id, kind, title, description, amount_minor, note, options, expires_at, status, created_by)
  values (p_organization_id, p_submission_id, kind, btrim(p_input ->> 'title'), coalesce(p_input ->> 'description', ''),
          case when amount is null then null else round(amount * 100)::bigint end, nullif(btrim(coalesce(p_input ->> 'note', '')), ''),
          opts, expires, case when kind = 'update' then 'posted' else 'pending' end, auth.uid())
  returning * into created;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
  values (p_organization_id, p_submission_id, 'action:' || kind, auth.uid(), 'customer', created.title);
  return next created;
end;
$$;

create function public.cancel_customer_action(p_organization_id uuid, p_action_id uuid)
returns setof public.customer_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.customer_actions%rowtype;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  update public.customer_actions a set status = 'cancelled', cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
   where a.organization_id = p_organization_id and a.id = p_action_id and a.status in ('pending', 'posted')
  returning * into updated;
  if not found then raise exception 'action_closed' using errcode = '55000'; end if;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id)
  values (p_organization_id, updated.submission_id, 'action_cancelled', auth.uid());
  return next updated;
end;
$$;

-- ---------- Interactive quotes ----------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id uuid not null,
  revision integer not null check (revision > 0),
  status text not null check (status in ('draft', 'sent', 'approved', 'declined', 'changes_requested', 'superseded', 'withdrawn')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 65536),
  total_minor bigint not null check (total_minor between 0 and 1000000000),
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  decision jsonb,
  decision_key uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  lock_version bigint not null default 0 check (lock_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, submission_id) references public.submissions(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (submission_id, revision)
);
create unique index quotes_one_draft on public.quotes(submission_id) where status = 'draft';
create unique index quotes_one_open on public.quotes(submission_id) where status = 'sent';
create index quotes_request on public.quotes(organization_id, submission_id, revision);

create function private.bump_quote_lock()
returns trigger language plpgsql set search_path = '' as $$
begin new.lock_version := old.lock_version + 1; new.updated_at := clock_timestamp(); return new; end;
$$;
revoke all on function private.bump_quote_lock() from public, anon, authenticated, service_role;
create trigger quote_lock before update on public.quotes for each row execute function private.bump_quote_lock();

-- Validates a quote document. Mirrors QuoteContentSchema in src/engine/quote.ts.
create function private.assert_quote_content(p_content jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  adj jsonb;
begin
  if jsonb_typeof(p_content) <> 'object'
     or jsonb_typeof(p_content -> 'title') <> 'string' or length(btrim(p_content ->> 'title')) not between 1 and 120
     or length(coalesce(p_content ->> 'intro', '')) > 2000 or length(coalesce(p_content ->> 'terms', '')) > 2000
     or jsonb_typeof(p_content -> 'items') <> 'array' or jsonb_array_length(p_content -> 'items') not between 1 and 50
     or jsonb_typeof(coalesce(p_content -> 'adjustments', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_content -> 'adjustments', '[]'::jsonb)) > 10
     or jsonb_typeof(p_content -> 'vat') <> 'object' or p_content #>> '{vat,mode}' not in ('included', 'excluded', 'exempt')
     or jsonb_typeof(p_content #> '{vat,rate}') <> 'number' or (p_content #>> '{vat,rate}')::numeric not between 0 and 50
     or (p_content ->> 'validUntil' is not null and p_content ->> 'validUntil' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'quote_invalid' using errcode = '22023';
  end if;
  if (select count(distinct i ->> 'id') from jsonb_array_elements(p_content -> 'items') i) <> jsonb_array_length(p_content -> 'items') then
    raise exception 'quote_invalid' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_content -> 'items') loop
    if jsonb_typeof(item) <> 'object' or coalesce(item ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or length(btrim(coalesce(item ->> 'label', ''))) not between 1 and 120 or length(coalesce(item ->> 'description', '')) > 500
       or jsonb_typeof(item -> 'unitPrice') <> 'number' or (item ->> 'unitPrice')::numeric not between 0 and 1000000
       or (item ->> 'unitPrice')::numeric <> round((item ->> 'unitPrice')::numeric, 2)
       or jsonb_typeof(item -> 'quantity') <> 'number' or (item ->> 'quantity') !~ '^[0-9]+$' or (item ->> 'quantity')::integer not between 1 and 999
       or jsonb_typeof(item -> 'optional') <> 'boolean' or jsonb_typeof(item -> 'included') <> 'boolean' or jsonb_typeof(item -> 'adjustable') <> 'boolean'
       or (item ? 'maxQuantity' and ((item ->> 'maxQuantity') !~ '^[0-9]+$' or (item ->> 'maxQuantity')::integer not between 1 and 999
            or (item ->> 'maxQuantity')::integer < (item ->> 'quantity')::integer)) then
      raise exception 'quote_invalid' using errcode = '22023';
    end if;
  end loop;
  for adj in select value from jsonb_array_elements(coalesce(p_content -> 'adjustments', '[]'::jsonb)) loop
    if jsonb_typeof(adj) <> 'object' or length(btrim(coalesce(adj ->> 'label', ''))) not between 1 and 80
       or adj ->> 'kind' not in ('discount', 'fee') or adj ->> 'mode' not in ('amount', 'percent')
       or jsonb_typeof(adj -> 'value') <> 'number' or (adj ->> 'value')::numeric < 0
       or (adj ->> 'mode' = 'percent' and (adj ->> 'value')::numeric > 100)
       or (adj ->> 'mode' = 'amount' and (adj ->> 'value')::numeric > 1000000) then
      raise exception 'quote_invalid' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Server-authoritative quote totals. Mirrors quoteTotals() in src/engine/quote.ts.
-- p_selections: { itemId: quantity } for optional or adjustable items; missing = the default.
create function private.quote_totals(p_content jsonb, p_selections jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  item jsonb;
  adj jsonb;
  qty integer;
  max_qty integer;
  amount numeric;
  lines jsonb := '[]'::jsonb;
  adjustments jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  net numeric;
  vat numeric := 0;
  total numeric;
  rate numeric := (p_content #>> '{vat,rate}')::numeric;
  sel jsonb := coalesce(p_selections, '{}'::jsonb);
  key text;
begin
  if jsonb_typeof(sel) <> 'object' then raise exception 'selection_invalid' using errcode = '22023'; end if;
  for key in select jsonb_object_keys(sel) loop
    if not exists (select 1 from jsonb_array_elements(p_content -> 'items') i
                   where i ->> 'id' = key and ((i ->> 'optional')::boolean or (i ->> 'adjustable')::boolean)) then
      raise exception 'selection_invalid' using errcode = '22023';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_content -> 'items') loop
    qty := case
      when (item ->> 'optional')::boolean and not (item ->> 'included')::boolean then 0
      else (item ->> 'quantity')::integer end;
    if sel ? (item ->> 'id') then
      if jsonb_typeof(sel -> (item ->> 'id')) <> 'number' or (sel ->> (item ->> 'id')) !~ '^[0-9]+$' then
        raise exception 'selection_invalid' using errcode = '22023';
      end if;
      qty := (sel ->> (item ->> 'id'))::integer;
      max_qty := coalesce((item ->> 'maxQuantity')::integer, (item ->> 'quantity')::integer);
      if not (item ->> 'adjustable')::boolean then
        -- An optional, fixed-quantity item is either taken as offered or left out.
        if qty not in (0, (item ->> 'quantity')::integer) then raise exception 'selection_invalid' using errcode = '22023'; end if;
      elsif qty > max_qty or (qty = 0 and not (item ->> 'optional')::boolean) then
        raise exception 'selection_invalid' using errcode = '22023';
      end if;
    end if;
    if qty > 0 then
      amount := round((item ->> 'unitPrice')::numeric * qty, 2);
      subtotal := subtotal + amount;
      lines := lines || jsonb_build_array(jsonb_build_object('itemId', item ->> 'id', 'label', item ->> 'label', 'quantity', qty,
        'unitPrice', (item ->> 'unitPrice')::numeric, 'amount', amount));
    end if;
  end loop;
  subtotal := round(subtotal, 2);
  net := subtotal;
  for adj in select value from jsonb_array_elements(coalesce(p_content -> 'adjustments', '[]'::jsonb)) loop
    amount := case when adj ->> 'mode' = 'percent' then round(subtotal * (adj ->> 'value')::numeric / 100, 2) else round((adj ->> 'value')::numeric, 2) end;
    if adj ->> 'kind' = 'discount' then amount := -least(amount, net); end if;
    net := round(net + amount, 2);
    adjustments := adjustments || jsonb_build_array(jsonb_build_object('label', adj ->> 'label', 'amount', amount));
  end loop;
  case p_content #>> '{vat,mode}'
    when 'excluded' then vat := round(net * rate / 100, 2); total := net + vat;
    when 'included' then vat := round(net - net / (1 + rate / 100), 2); total := net;
    else vat := 0; total := net;
  end case;
  return jsonb_build_object('lines', lines, 'subtotal', subtotal, 'adjustments', adjustments, 'net', net, 'vat', vat, 'total', round(total, 2));
end;
$$;
revoke all on function private.assert_quote_content(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.quote_totals(jsonb, jsonb) from public, anon, authenticated, service_role;

create function public.save_quote_draft(p_organization_id uuid, p_submission_id uuid, p_quote_id uuid, p_content jsonb, p_expected_lock_version bigint)
returns setof public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  saved public.quotes%rowtype;
  totals jsonb;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  perform private.assert_quote_content(p_content);
  totals := private.quote_totals(p_content, '{}'::jsonb);
  select s.status into current_status from public.submissions s where s.organization_id = p_organization_id and s.id = p_submission_id for update;
  if not found then raise exception 'Request unavailable' using errcode = 'P0002'; end if;
  if current_status in ('cancelled', 'rejected') then raise exception 'request_closed' using errcode = '55000'; end if;
  if p_quote_id is null then
    insert into public.quotes(organization_id, submission_id, revision, status, content, total_minor, valid_until, created_by)
    values (p_organization_id, p_submission_id,
            coalesce((select max(q.revision) from public.quotes q where q.submission_id = p_submission_id), 0) + 1,
            'draft', p_content, round((totals ->> 'total')::numeric * 100)::bigint, (p_content ->> 'validUntil')::date, auth.uid())
    returning * into saved;
  else
    update public.quotes q set content = p_content, total_minor = round((totals ->> 'total')::numeric * 100)::bigint,
           valid_until = (p_content ->> 'validUntil')::date
     where q.organization_id = p_organization_id and q.submission_id = p_submission_id and q.id = p_quote_id
       and q.status = 'draft' and q.lock_version = p_expected_lock_version
    returning * into saved;
    if not found then raise exception 'Quote changed or unavailable' using errcode = '40001'; end if;
  end if;
  return next saved;
exception when unique_violation then
  raise exception 'quote_draft_exists' using errcode = '55000';
end;
$$;

create function public.send_quote(p_organization_id uuid, p_quote_id uuid, p_expected_lock_version bigint)
returns setof public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.quotes%rowtype;
  sent public.quotes%rowtype;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select * into draft from public.quotes q
   where q.organization_id = p_organization_id and q.id = p_quote_id and q.status = 'draft' and q.lock_version = p_expected_lock_version
  for update;
  if not found then raise exception 'Quote changed or unavailable' using errcode = '40001'; end if;
  perform 1 from public.submissions s where s.id = draft.submission_id and s.status not in ('cancelled', 'rejected') for update;
  if not found then raise exception 'request_closed' using errcode = '55000'; end if;
  if draft.valid_until is not null and draft.valid_until < private.local_today() then raise exception 'quote_expired' using errcode = '55000'; end if;
  perform private.assert_quote_content(draft.content);
  -- The previous open quote stays readable but can no longer be accepted.
  update public.quotes q set status = 'superseded' where q.submission_id = draft.submission_id and q.status in ('sent', 'changes_requested');
  update public.quotes q set status = 'sent', sent_at = clock_timestamp() where q.id = draft.id returning * into sent;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
  values (p_organization_id, draft.submission_id, 'quote_sent', auth.uid(), 'customer', draft.content ->> 'title');
  return next sent;
end;
$$;

create function public.withdraw_quote(p_organization_id uuid, p_quote_id uuid)
returns setof public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.quotes%rowtype;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  update public.quotes q set status = 'withdrawn'
   where q.organization_id = p_organization_id and q.id = p_quote_id and q.status in ('draft', 'sent', 'changes_requested')
  returning * into updated;
  if not found then raise exception 'quote_closed' using errcode = '55000'; end if;
  if updated.sent_at is not null then
    insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
    values (p_organization_id, updated.submission_id, 'quote_withdrawn', auth.uid(), 'customer', updated.content ->> 'title');
  end if;
  return next updated;
end;
$$;

-- ---------- Owner status changes become part of the customer timeline ----------
drop function public.transition_submission_status(uuid, uuid, bigint, text);
create function public.transition_submission_status(
  p_organization_id uuid,
  p_submission_id uuid,
  p_expected_lock_version bigint,
  p_to_status text,
  p_message text default null
)
returns setof public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare current_status text;
begin
  if not private.has_org_role(p_organization_id, array['owner', 'staff']) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_message is not null and length(p_message) > 500 then raise exception 'message_too_long' using errcode = '22023'; end if;
  select s.status into current_status from public.submissions s
   where s.organization_id = p_organization_id and s.id = p_submission_id and s.lock_version = p_expected_lock_version for update;
  if not found then raise exception 'Submission changed or unavailable' using errcode = '40001'; end if;
  if not (
    (current_status = 'received' and p_to_status = any(array['in_review', 'approved', 'rejected', 'changes_requested', 'cancelled']))
    or (current_status = 'in_review' and p_to_status = any(array['approved', 'rejected', 'changes_requested', 'cancelled']))
    or (current_status = 'changes_requested' and p_to_status = any(array['in_review', 'approved', 'rejected', 'cancelled']))
    or (current_status = 'approved' and p_to_status = any(array['completed', 'cancelled']))
    or (current_status = 'rejected' and p_to_status = 'in_review')
  ) then raise exception 'Invalid submission transition' using errcode = '22023'; end if;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
    values (p_organization_id, p_submission_id, 'status:' || p_to_status, auth.uid(), 'customer', nullif(btrim(coalesce(p_message, '')), ''));
  return query update public.submissions s set status = p_to_status
   where s.organization_id = p_organization_id and s.id = p_submission_id returning s.*;
end;
$$;

-- ---------- Customer side (token holders, no account) ----------
create function private.action_status(a public.customer_actions)
returns text
language sql
stable
set search_path = ''
as $$ select case when a.status = 'pending' and a.expires_at is not null and a.expires_at <= clock_timestamp() then 'expired' else a.status end $$;

create function private.quote_status(q public.quotes)
returns text
language sql
stable
set search_path = ''
as $$ select case when q.status = 'sent' and q.valid_until is not null and q.valid_until < private.local_today() then 'expired' else q.status end $$;
revoke all on function private.action_status(public.customer_actions) from public, anon, authenticated, service_role;
revoke all on function private.quote_status(public.quotes) from public, anon, authenticated, service_role;

create function public.public_track_request(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref record;
  s public.submissions%rowtype;
  result jsonb;
begin
  select * into ref from private.resolve_access_token(p_token);
  if not found then return null; end if;
  select * into s from public.submissions x where x.organization_id = ref.organization_id and x.id = ref.submission_id;
  -- Opening the link is how the business knows the customer saw a sent quote.
  update public.quotes q set viewed_at = clock_timestamp()
   where q.submission_id = s.id and q.status = 'sent' and q.viewed_at is null;
  select jsonb_build_object(
    'business', jsonb_build_object('name', o.name, 'slug', o.slug,
      'brand', jsonb_build_object(
        'displayName', b.config ->> 'displayName', 'description', b.config ->> 'description',
        'palette', b.config -> 'palette', 'links', coalesce(b.config -> 'links', '[]'::jsonb))),
    'workflow', jsonb_build_object('slug', w.public_slug, 'title', v.config ->> 'title', 'design', v.design,
      'branding', v.config -> 'branding', 'booking', v.config -> 'booking'),
    'request', jsonb_build_object('id', s.id, 'reference', upper(left(s.id::text, 8)), 'status', s.status,
      'createdAt', s.created_at, 'updatedAt', s.updated_at, 'answers', s.answers -> 'answers',
      'priceLines', s.answers -> 'priceLines', 'total', s.total_minor / 100.0,
      'cancellable', s.status in ('received', 'in_review', 'changes_requested')),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('type', e.event_type, 'message', e.message, 'at', e.created_at) order by e.created_at, e.id)
      from public.submission_events e
      where e.submission_id = s.id and (e.visibility = 'customer' or e.event_type = 'submitted')), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'description', a.description,
        'amount', a.amount_minor / 100.0, 'note', a.note, 'options', a.options, 'status', private.action_status(a),
        'response', a.response, 'expiresAt', a.expires_at, 'createdAt', a.created_at) order by a.created_at)
      from public.customer_actions a where a.submission_id = s.id and a.status <> 'cancelled'), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'revision', q.revision, 'status', private.quote_status(q),
        'content', q.content, 'totals', private.quote_totals(q.content, '{}'::jsonb), 'sentAt', q.sent_at,
        'validUntil', q.valid_until, 'decidedAt', q.decided_at, 'decision', q.decision) order by q.revision desc)
      from public.quotes q where q.submission_id = s.id and q.status not in ('draft', 'withdrawn')), '[]'::jsonb)
  ) into result
  from public.organizations o
  join public.workflows w on w.id = s.workflow_id
  join public.workflow_versions v on v.id = s.workflow_version_id
  left join public.brand_configurations b on b.organization_id = o.id
  where o.id = s.organization_id;
  return result;
end;
$$;

create function public.public_respond_action(p_token text, p_action_id uuid, p_option_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref record;
  a public.customer_actions%rowtype;
  label text;
begin
  select * into ref from private.resolve_access_token(p_token);
  if not found then raise exception 'Link unavailable' using errcode = 'P0002'; end if;
  select * into a from public.customer_actions x
   where x.id = p_action_id and x.submission_id = ref.submission_id and x.organization_id = ref.organization_id for update;
  if not found then raise exception 'Link unavailable' using errcode = 'P0002'; end if;
  select o ->> 'label' into label from jsonb_array_elements(a.options) o where o ->> 'id' = p_option_id;
  if label is null then raise exception 'action_invalid' using errcode = '22023'; end if;
  if a.status = 'responded' then
    -- The same answer again is a harmless retry; a different one is refused.
    if a.response ->> 'optionId' = p_option_id then return jsonb_build_object('id', a.id, 'status', a.status, 'response', a.response); end if;
    raise exception 'action_answered' using errcode = '55000';
  end if;
  if private.action_status(a) <> 'pending' then raise exception 'action_closed' using errcode = '55000'; end if;
  update public.customer_actions x set status = 'responded', updated_at = clock_timestamp(),
         response = jsonb_build_object('optionId', p_option_id, 'label', label, 'at', clock_timestamp())
   where x.id = a.id returning * into a;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
  values (a.organization_id, a.submission_id, 'action_responded', null, 'customer', a.title || ': ' || label);
  return jsonb_build_object('id', a.id, 'status', a.status, 'response', a.response);
end;
$$;

create function public.public_decide_quote(p_token text, p_quote_id uuid, p_decision text, p_selections jsonb, p_comment text, p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref record;
  q public.quotes%rowtype;
  totals jsonb;
  request_status text;
  next_status text;
begin
  select * into ref from private.resolve_access_token(p_token);
  if not found then raise exception 'Link unavailable' using errcode = 'P0002'; end if;
  if p_decision not in ('approved', 'declined', 'changes_requested') or p_key is null
     or (p_comment is not null and length(p_comment) > 1000) then raise exception 'decision_invalid' using errcode = '22023'; end if;
  if p_decision = 'changes_requested' and length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'comment_required' using errcode = '22023'; end if;
  select * into q from public.quotes x
   where x.id = p_quote_id and x.submission_id = ref.submission_id and x.organization_id = ref.organization_id for update;
  if not found or q.status in ('draft', 'withdrawn') then raise exception 'Link unavailable' using errcode = 'P0002'; end if;
  if q.decision_key = p_key then
    return jsonb_build_object('id', q.id, 'status', q.status, 'decision', q.decision, 'replayed', true);
  end if;
  if q.status <> 'sent' then raise exception 'quote_closed' using errcode = '55000'; end if;
  if private.quote_status(q) = 'expired' then raise exception 'quote_expired' using errcode = '55000'; end if;
  totals := private.quote_totals(q.content, case when p_decision = 'approved' then coalesce(p_selections, '{}'::jsonb) else '{}'::jsonb end);
  update public.quotes x set status = p_decision, decided_at = clock_timestamp(), decision_key = p_key,
         decision = jsonb_build_object('decision', p_decision, 'selections', coalesce(p_selections, '{}'::jsonb),
           'comment', nullif(btrim(coalesce(p_comment, '')), ''), 'totals', totals, 'at', clock_timestamp())
   where x.id = q.id returning * into q;
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
  values (q.organization_id, q.submission_id, 'quote_' || p_decision, null, 'customer', nullif(btrim(coalesce(p_comment, '')), ''));
  -- An accepted quote moves the request forward; the owner keeps every later step.
  if p_decision = 'approved' then
    select s.status into request_status from public.submissions s where s.id = q.submission_id for update;
    next_status := case when request_status in ('received', 'in_review', 'changes_requested') then 'approved' else null end;
    if next_status is not null then
      update public.submissions s set status = next_status where s.id = q.submission_id;
      insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility)
      values (q.organization_id, q.submission_id, 'status:approved', null, 'customer');
    end if;
  end if;
  return jsonb_build_object('id', q.id, 'status', q.status, 'decision', q.decision);
end;
$$;

create function public.public_cancel_request(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref record;
  current_status text;
begin
  select * into ref from private.resolve_access_token(p_token);
  if not found then raise exception 'Link unavailable' using errcode = 'P0002'; end if;
  select s.status into current_status from public.submissions s where s.id = ref.submission_id for update;
  if current_status = 'cancelled' then return jsonb_build_object('status', 'cancelled'); end if;
  if current_status not in ('received', 'in_review', 'changes_requested') then raise exception 'request_not_cancellable' using errcode = '55000'; end if;
  update public.submissions s set status = 'cancelled' where s.id = ref.submission_id;
  update public.quotes q set status = 'superseded' where q.submission_id = ref.submission_id and q.status = 'sent';
  insert into public.submission_events(organization_id, submission_id, event_type, actor_user_id, visibility, message)
  values (ref.organization_id, ref.submission_id, 'status:cancelled', null, 'customer', 'בוטל על ידי הלקוח');
  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------- Grants, RLS, audit ----------
do $$
declare table_name text;
begin
  foreach table_name in array array['submission_notes', 'customer_actions', 'quotes'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.has_org_role(organization_id, array[''owner'',''staff'']))', table_name);
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.record_change()', table_name);
  end loop;
end;
$$;
create trigger guard_tenant before update on public.customer_actions for each row execute function private.guard_tenant_update();
create trigger guard_tenant before update on public.quotes for each row execute function private.guard_tenant_update();
create trigger immutable_record before update or delete on public.submission_notes for each row execute function private.reject_mutation();

revoke all on function public.public_request_tracking_token(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.issue_tracking_link(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_tracking_links(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_submission_note(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_customer_action(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.cancel_customer_action(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_quote_draft(uuid, uuid, uuid, jsonb, bigint) from public, anon, authenticated, service_role;
revoke all on function public.send_quote(uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.withdraw_quote(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.transition_submission_status(uuid, uuid, bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.public_track_request(text) from public, anon, authenticated, service_role;
revoke all on function public.public_respond_action(text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.public_decide_quote(text, uuid, text, jsonb, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.public_cancel_request(text) from public, anon, authenticated, service_role;

grant execute on function public.issue_tracking_link(uuid, uuid) to authenticated;
grant execute on function public.revoke_tracking_links(uuid, uuid) to authenticated;
grant execute on function public.add_submission_note(uuid, uuid, text) to authenticated;
grant execute on function public.create_customer_action(uuid, uuid, jsonb) to authenticated;
grant execute on function public.cancel_customer_action(uuid, uuid) to authenticated;
grant execute on function public.save_quote_draft(uuid, uuid, uuid, jsonb, bigint) to authenticated;
grant execute on function public.send_quote(uuid, uuid, bigint) to authenticated;
grant execute on function public.withdraw_quote(uuid, uuid) to authenticated;
grant execute on function public.transition_submission_status(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.public_request_tracking_token(text, uuid, uuid) to anon, authenticated;
grant execute on function public.public_track_request(text) to anon, authenticated;
grant execute on function public.public_respond_action(text, uuid, text) to anon, authenticated;
grant execute on function public.public_decide_quote(text, uuid, text, jsonb, text, uuid) to anon, authenticated;
grant execute on function public.public_cancel_request(text) to anon, authenticated;

commit;
