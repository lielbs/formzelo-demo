-- Web Push reminders: a guest who asks for it gets a notification about three hours before the
-- booking. Free: Web Push goes through the browser's own push service.
--
-- Privacy by design: the push carries no data at all. The guest's device stores its own manage
-- link and, when the push arrives, asks the server for the booking itself (the same call as the
-- manage page). The push service never sees a name, a time or a venue. What is kept here is only
-- the push address (endpoint) of the guest's browser, removed a day after the booking.
--
-- The signing key (VAPID, RFC 8292) is created once by the sender function inside Supabase and
-- never leaves the database and that function; only its public half is published.
-- Rollback: supabase/rollback/tables-push-reminders-down.sql

create table private.tables_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.tables_reservations(id) on delete cascade,
  venue_id uuid not null,
  endpoint text not null,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  failures integer not null default 0,
  unique (reservation_id, endpoint)
);
create index tables_push_due_idx on private.tables_push_subscriptions(reservation_id) where sent_at is null;
alter table private.tables_push_subscriptions enable row level security;

create table private.tables_push_key (
  id boolean primary key default true check (id),
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{80,100}$'),
  private_jwk jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table private.tables_push_key enable row level security;
revoke all on private.tables_push_subscriptions, private.tables_push_key from public, anon, authenticated;

-- Push services browsers use (Chrome/Android, Firefox, Safari/iOS, Edge). The sender only ever
-- calls these, so a guest cannot make the server call an address of their choosing.
create function private.tables_push_endpoint_ok(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_endpoint is not null and length(p_endpoint) <= 1000
    and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[A-Za-z0-9_:/.~%=+-]+$'
$$;

-- The public half of the signing key (null until the sender has run once): the browser needs it to subscribe.
-- (p_client is unused; it keeps the API shape of the other public calls.)
create function public.tables_push_public_key(p_client uuid default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select public_key from private.tables_push_key $$;

-- Guest: turn reminders on for their booking, with their manage link.
create function public.tables_public_push_subscribe(p_token text, p_client uuid, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.tables_access_tokens%rowtype;
  res public.tables_reservations%rowtype;
begin
  perform private.tables_rate('push', p_client, 20, 100, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'read');
  if t.id is null or t.reservation_id is null then raise exception 'tables:link_unavailable' using errcode = 'P0002'; end if;
  if not private.tables_push_endpoint_ok(p_endpoint) then raise exception 'tables:invalid' using errcode = '22023'; end if;
  select * into res from public.tables_reservations where id = t.reservation_id;
  if res.status not in ('confirmed', 'pending_approval') or res.starts_at <= clock_timestamp() then
    raise exception 'tables:invalid' using errcode = '22023';
  end if;
  if (select count(*) from private.tables_push_subscriptions s where s.reservation_id = res.id and s.endpoint <> p_endpoint) >= 3 then
    raise exception 'tables:rate_limited' using errcode = '54000';
  end if;
  insert into private.tables_push_subscriptions(reservation_id, venue_id, endpoint)
  values (res.id, res.venue_id, p_endpoint)
  on conflict (reservation_id, endpoint) do update set failures = 0;
  return jsonb_build_object('enabled', true);
end;
$$;

-- Guest: turn them off again.
create function public.tables_public_push_unsubscribe(p_token text, p_client uuid, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.tables_access_tokens%rowtype;
begin
  perform private.tables_rate('push', p_client, 20, 100, interval '5 minutes');
  t := private.tables_resolve_token(p_token, 'read');
  if t.id is null or t.reservation_id is null then raise exception 'tables:link_unavailable' using errcode = 'P0002'; end if;
  delete from private.tables_push_subscriptions where reservation_id = t.reservation_id and endpoint = p_endpoint;
  return jsonb_build_object('enabled', false);
end;
$$;

-- Sender (service role only): the signing key, created once. Returns the stored key, whoever won.
create function public.tables_push_key_init(p_public_key text, p_private_jwk jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_public_key is not null and p_private_jwk ? 'd' then
    insert into private.tables_push_key(public_key, private_jwk) values (p_public_key, p_private_jwk) on conflict (id) do nothing;
  end if;
  return (select jsonb_build_object('publicKey', public_key, 'privateJwk', private_jwk) from private.tables_push_key);
end;
$$;

-- Sender: claim the pushes that are due (confirmed bookings starting in 20 minutes to 3 hours).
-- Claimed rows are marked sent first, so two runs never push twice; a failed push is released.
create function public.tables_push_claim(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  -- Housekeeping: addresses are kept until a day after the booking, then removed.
  delete from private.tables_push_subscriptions s
   using public.tables_reservations r
   where r.id = s.reservation_id and (r.starts_at < clock_timestamp() - interval '1 day' or s.failures >= 3);
  with claimed as (
  update private.tables_push_subscriptions s set sent_at = clock_timestamp()
   where s.id in (
     select s2.id from private.tables_push_subscriptions s2
     join public.tables_reservations r on r.id = s2.reservation_id
     where s2.sent_at is null and s2.failures < 3 and r.status = 'confirmed'
       and r.starts_at > clock_timestamp() + interval '20 minutes'
       and r.starts_at <= clock_timestamp() + interval '3 hours'
       and private.tables_push_endpoint_ok(s2.endpoint)
     order by r.starts_at
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
     for update of s2 skip locked)
  returning s.id, s.endpoint)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'endpoint', c.endpoint)), '[]'::jsonb) into v_out from claimed c;
  return v_out;
end;
$$;

-- Sender: the outcome of one push. Gone (404/410) removes the address; a failure releases it for the next run.
create function public.tables_push_result(p_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome = 'gone' then
    delete from private.tables_push_subscriptions where id = p_id;
  elsif p_outcome = 'failed' then
    update private.tables_push_subscriptions set sent_at = null, failures = failures + 1 where id = p_id;
  elsif p_outcome = 'sent' then
    insert into public.tables_reminders(reservation_id, organization_id, venue_id, channel)
    select r.id, r.organization_id, r.venue_id, 'push'
    from private.tables_push_subscriptions s join public.tables_reservations r on r.id = s.reservation_id
    where s.id = p_id
    on conflict (reservation_id) do nothing;
  end if;
end;
$$;

revoke all on function private.tables_push_endpoint_ok(text) from public, anon, authenticated;
revoke all on function public.tables_push_public_key(uuid) from public;
revoke all on function public.tables_public_push_subscribe(text, uuid, text) from public;
revoke all on function public.tables_public_push_unsubscribe(text, uuid, text) from public;
revoke all on function public.tables_push_key_init(text, jsonb) from public, anon, authenticated;
revoke all on function public.tables_push_claim(integer) from public, anon, authenticated;
revoke all on function public.tables_push_result(uuid, text) from public, anon, authenticated;
grant execute on function public.tables_push_public_key(uuid) to anon, authenticated;
grant execute on function public.tables_public_push_subscribe(text, uuid, text) to anon, authenticated;
grant execute on function public.tables_public_push_unsubscribe(text, uuid, text) to anon, authenticated;
grant execute on function public.tables_push_key_init(text, jsonb) to service_role;
grant execute on function public.tables_push_claim(integer) to service_role;
grant execute on function public.tables_push_result(uuid, text) to service_role;
