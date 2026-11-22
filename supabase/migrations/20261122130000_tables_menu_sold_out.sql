-- "Sold out today" for a menu item (UX audit 2026-11, A9.6): the salmon runs out at 21:00, a manager
-- taps "sold out", guests see it on the menu at once, without republishing the menu (and without
-- publishing other draft edits). The mark belongs to the venue's local day, so it clears itself
-- the next day; it never changes the published menu document.
--
-- Items are identified by the stable `id` the editor now stores on each item (a short lowercase
-- token). Only owners and managers of the venue can set it; guests only read it through
-- tables_public_menus, which now adds `soldOut` (the item ids sold out today) to each menu.
-- Rollback: supabase/rollback/tables-menu-sold-out-down.sql

create table public.tables_menu_item_state (
  menu_id uuid not null references public.tables_menus(id) on delete cascade,
  item_id text not null check (item_id ~ '^[a-z0-9]{6,24}$'),
  sold_out_on date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (menu_id, item_id)
);
alter table public.tables_menu_item_state enable row level security;
revoke all on public.tables_menu_item_state from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.tables_menu_item_state to service_role;

create function private.tables_venue_today(p_venue_id uuid)
returns date language sql stable set search_path = '' as $$
  select (now() at time zone v.timezone)::date from public.tables_venues v where v.id = p_venue_id
$$;
revoke all on function private.tables_venue_today(uuid) from public, anon, authenticated;

-- Marks (or clears) an item as sold out for today; returns the ids sold out today in that menu.
create function public.tables_menu_set_sold_out(p_menu_id uuid, p_item_id text, p_sold_out boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.tables_menus%rowtype;
  today date;
begin
  select * into m from public.tables_menus where id = p_menu_id;
  if not found or not private.tables_can(m.venue_id, 'manager') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  if coalesce(p_item_id, '') !~ '^[a-z0-9]{6,24}$' then raise exception 'tables:invalid' using errcode = '22023'; end if;
  today := private.tables_venue_today(m.venue_id);
  if p_sold_out then
    insert into public.tables_menu_item_state(menu_id, item_id, sold_out_on, updated_by)
    values (p_menu_id, p_item_id, today, auth.uid())
    on conflict (menu_id, item_id) do update set sold_out_on = excluded.sold_out_on, updated_at = now(), updated_by = excluded.updated_by;
  else
    delete from public.tables_menu_item_state where menu_id = p_menu_id and item_id = p_item_id;
  end if;
  return coalesce((select jsonb_agg(s.item_id order by s.item_id) from public.tables_menu_item_state s
    where s.menu_id = p_menu_id and s.sold_out_on = today), '[]');
end;
$$;

-- Items sold out today in every menu of a venue ({menuId: [itemId]}), for the staff screens.
create function public.tables_menu_sold_out(p_venue_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date;
begin
  if not private.tables_can(p_venue_id, 'host') then raise exception 'Tables access denied' using errcode = '42501'; end if;
  today := private.tables_venue_today(p_venue_id);
  return coalesce((select jsonb_object_agg(x.menu_id, x.ids) from (
      select s.menu_id, jsonb_agg(s.item_id order by s.item_id) ids
      from public.tables_menu_item_state s join public.tables_menus m on m.id = s.menu_id
      where m.venue_id = p_venue_id and s.sold_out_on = today group by s.menu_id) x), '{}');
end;
$$;

-- Guests: the published menus as before, plus the ids sold out today.
alter function public.tables_public_menus(text) rename to tables_public_menus_core;
alter function public.tables_public_menus_core(text) set schema private;
revoke all on function private.tables_public_menus_core(text) from public, anon, authenticated, service_role;

create function public.tables_public_menus(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  base jsonb := private.tables_public_menus_core(p_slug);
  target record;
  today date;
begin
  if base is null then return null; end if;
  select * into target from private.tables_public_target(p_slug);
  today := private.tables_venue_today(target.venue_id);
  return jsonb_set(base, '{menus}', coalesce((
    select jsonb_agg(x.value || jsonb_build_object('soldOut', coalesce((select jsonb_agg(s.item_id order by s.item_id)
        from public.tables_menu_item_state s where s.menu_id = (x.value->>'id')::uuid and s.sold_out_on = today), '[]')) order by x.n)
    from jsonb_array_elements(base->'menus') with ordinality as x(value, n)), '[]'));
end;
$$;

revoke all on function public.tables_menu_set_sold_out(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.tables_menu_sold_out(uuid) from public, anon, authenticated, service_role;
revoke all on function public.tables_public_menus(text) from public, anon, authenticated, service_role;
grant execute on function public.tables_menu_set_sold_out(uuid, text, boolean) to authenticated;
grant execute on function public.tables_menu_sold_out(uuid) to authenticated;
grant execute on function public.tables_public_menus(text) to anon, authenticated;
