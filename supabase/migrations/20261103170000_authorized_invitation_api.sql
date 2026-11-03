begin;

create function private.create_owner_invitation_authorized(
  target_organization_id uuid,
  intended_email text,
  actor_user_id uuid,
  valid_for interval default interval '48 hours'
)
returns table(invitation_id uuid, invitation_token text, invitation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_platform_operator(actor_user_id);
  -- Serialize the per-operator count and insert so parallel requests cannot
  -- race past the abuse limit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_user_id::text, 0));
  if (
    select count(*)
    from public.audit_events event
    where event.actor_user_id = actor_user_id
      and event.resource_type = 'owner_invitation'
      and event.operation = 'INSERT'
      and event.created_at >= clock_timestamp() - interval '15 minutes'
  ) >= 10 then
    raise exception 'Invitation rate limit exceeded' using errcode = '54000';
  end if;

  return query select * from private.create_owner_invitation(
    target_organization_id,
    intended_email,
    actor_user_id,
    valid_for
  );
end;
$$;
revoke all on function private.create_owner_invitation_authorized(uuid,text,uuid,interval) from public,anon,authenticated,service_role;
grant execute on function private.create_owner_invitation_authorized(uuid,text,uuid,interval) to service_role;

create function public.server_create_owner_invitation_authorized(
  target_organization_id uuid,
  intended_email text,
  actor_user_id uuid,
  valid_for interval default interval '48 hours'
)
returns table(invitation_id uuid, invitation_token text, invitation_expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_owner_invitation_authorized(target_organization_id, intended_email, actor_user_id, valid_for);
$$;
revoke all on function public.server_create_owner_invitation_authorized(uuid,text,uuid,interval) from public,anon,authenticated,service_role;
grant execute on function public.server_create_owner_invitation_authorized(uuid,text,uuid,interval) to service_role;

commit;
