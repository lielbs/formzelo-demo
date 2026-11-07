-- Synthetic organizations only. Auth users/memberships are created inside rolled-back tests.
-- No shared password, provider connection, customer information or support grant is seeded.
insert into public.organizations(id,slug,name,status) values
  ('10000000-0000-4000-8000-000000000001','local-flower-shop','Local Flower Shop','active'),
  ('10000000-0000-4000-8000-000000000002','local-garage','Local Garage','active')
on conflict (id) do nothing;
insert into public.organization_settings(organization_id)
select id from public.organizations where slug in ('local-flower-shop','local-garage')
on conflict do nothing;
insert into public.brand_configurations(organization_id)
select id from public.organizations where slug in ('local-flower-shop','local-garage')
on conflict do nothing;
