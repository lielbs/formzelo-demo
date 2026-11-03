begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

create temporary table invitation_test_state (
  key text primary key,
  value text not null
);
grant all on invitation_test_state to service_role, authenticated;

insert into auth.users(id,email,email_confirmed_at) values
 ('21000000-0000-4000-8000-000000000001','operator@example.invalid',clock_timestamp()),
 ('21000000-0000-4000-8000-000000000002','invited@example.invalid',clock_timestamp()),
 ('21000000-0000-4000-8000-000000000003','wrong@example.invalid',clock_timestamp()),
 ('21000000-0000-4000-8000-000000000004','unverified@example.invalid',null),
 ('21000000-0000-4000-8000-000000000005','expired@example.invalid',clock_timestamp()),
 ('21000000-0000-4000-8000-000000000006','revoked@example.invalid',clock_timestamp()),
 ('21000000-0000-4000-8000-000000000007','rollback@example.invalid',clock_timestamp());
insert into private.platform_operators(user_id)
values ('21000000-0000-4000-8000-000000000001');
insert into public.organizations(id,slug,name,status) values
 ('31000000-0000-4000-8000-000000000001','invitation-test-a','Invitation Test A','active'),
 ('31000000-0000-4000-8000-000000000002','invitation-test-b','Invitation Test B','active');

set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','forbidden@example.invalid',
    '21000000-0000-4000-8000-000000000001',interval '48 hours')$$,
  '42501', null, 'browser-authenticated caller cannot create invitations'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.accept_owner_invitation(repeat('a',64),'31000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous caller cannot accept invitations'
);
reset role;

set local role service_role;
with created as (
  select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','  Invited@Example.Invalid  ',
    '21000000-0000-4000-8000-000000000001',interval '48 hours')
)
insert into invitation_test_state(key,value)
select state.key,state.value
from created
cross join lateral (values
  ('valid_id',created.invitation_id::text),
  ('valid_token',created.invitation_token)
) state(key,value);
reset role;

select is(length((select value from invitation_test_state where key='valid_token')),64,'token carries 256 bits as hex');
select matches((select value from invitation_test_state where key='valid_token'),'^[0-9a-f]{64}$','token uses canonical lowercase hex');
select isnt(
  encode((select token_hash from private.owner_invitations where id=(select value::uuid from invitation_test_state where key='valid_id')),'hex'),
  (select value from invitation_test_state where key='valid_token'),
  'database stores a digest rather than the raw token'
);
select is(
  (select email from private.owner_invitations where id=(select value::uuid from invitation_test_state where key='valid_id')),
  'invited@example.invalid',
  'invitation email is normalized and bound'
);

set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000002';
select results_eq(
  format(
    $$select organization_id,membership_created from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,
    (select value from invitation_test_state where key='valid_token')
  ),
  $$values ('31000000-0000-4000-8000-000000000001'::uuid,true)$$,
  'valid invitation creates the intended owner membership'
);
select results_eq(
  format(
    $$select organization_id,membership_created from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,
    (select value from invitation_test_state where key='valid_token')
  ),
  $$values ('31000000-0000-4000-8000-000000000001'::uuid,false)$$,
  'same-user replay is idempotent and creates no duplicate membership'
);
reset role;
select is((select count(*) from public.organization_memberships where organization_id='31000000-0000-4000-8000-000000000001' and user_id='21000000-0000-4000-8000-000000000002'),1::bigint,'single-use acceptance leaves one membership');
select is((select count(*) from public.audit_events where resource_type='owner_invitation' and resource_id=(select value from invitation_test_state where key='valid_id') and operation='UPDATE'),1::bigint,'acceptance is audited exactly once');
select is((select count(*) from private.outbox_events where event_type='owner_invitation.accepted' and resource_id=(select value from invitation_test_state where key='valid_id')),1::bigint,'acceptance appends a matching outbox event');

set local role service_role;
with created as (
  select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','expired@example.invalid',
    '21000000-0000-4000-8000-000000000001',interval '5 minutes')
)
insert into invitation_test_state(key,value)
select state.key,state.value from created
cross join lateral (values ('expired_id',created.invitation_id::text),('expired_token',created.invitation_token)) state(key,value);
reset role;
update private.owner_invitations
set created_at=clock_timestamp()-interval '10 minutes', expires_at=clock_timestamp()-interval '1 minute'
where id=(select value::uuid from invitation_test_state where key='expired_id');
set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000005';
select is_empty(
  format($$select * from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,(select value from invitation_test_state where key='expired_token')),
  'expired invitation cannot be accepted'
);
reset role;
select ok((select expired_at is not null from private.owner_invitations where id=(select value::uuid from invitation_test_state where key='expired_id')),'expired invitation is durably marked');
select is((select count(*) from private.outbox_events where event_type='owner_invitation.expired' and resource_id=(select value from invitation_test_state where key='expired_id')),1::bigint,'expiration is audited');

set local role service_role;
with created as (
  select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','revoked@example.invalid',
    '21000000-0000-4000-8000-000000000001',interval '48 hours')
)
insert into invitation_test_state(key,value)
select state.key,state.value from created
cross join lateral (values ('revoked_id',created.invitation_id::text),('revoked_token',created.invitation_token)) state(key,value);
select ok(public.server_revoke_owner_invitation(
  (select value::uuid from invitation_test_state where key='revoked_id'),
  '31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','synthetic test revocation'
),'authorized server can revoke a pending invitation');
select isnt(public.server_revoke_owner_invitation(
  (select value::uuid from invitation_test_state where key='revoked_id'),
  '31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','synthetic test revocation'
),true,'repeated revocation is idempotent');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000006';
select is_empty(
  format($$select * from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,(select value from invitation_test_state where key='revoked_token')),
  'revoked invitation cannot be accepted'
);
reset role;
select is((select count(*) from private.outbox_events where event_type='owner_invitation.revoked' and resource_id=(select value from invitation_test_state where key='revoked_id')),1::bigint,'revocation is audited once');

set local role service_role;
with created as (
  select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','wrong-target@example.invalid',
    '21000000-0000-4000-8000-000000000001',interval '48 hours')
)
insert into invitation_test_state(key,value)
select state.key,state.value from created
cross join lateral (values ('wrong_id',created.invitation_id::text),('wrong_token',created.invitation_token)) state(key,value);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000003';
select is_empty(
  format($$select * from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,(select value from invitation_test_state where key='wrong_token')),
  'authenticated user with the wrong email cannot accept'
);
reset role;
select ok((select accepted_at is null from private.owner_invitations where id=(select value::uuid from invitation_test_state where key='wrong_id')),'wrong-email attempt leaves invitation pending');

set local role service_role;
with created as (
  select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','unverified@example.invalid',
    '21000000-0000-4000-8000-000000000001',interval '48 hours')
)
insert into invitation_test_state(key,value)
select state.key,state.value from created
cross join lateral (values ('unverified_id',created.invitation_id::text),('unverified_token',created.invitation_token)) state(key,value);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000004';
select is_empty(
  format($$select * from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,(select value from invitation_test_state where key='unverified_token')),
  'unverified identity cannot accept an invitation'
);
reset role;
select ok((select accepted_at is null from private.owner_invitations where id=(select value::uuid from invitation_test_state where key='unverified_id')),'unverified attempt leaves invitation pending');

set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000003';
select is_empty(
  format($$select * from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000002')$$,(select value from invitation_test_state where key='wrong_token')),
  'forged organization ID cannot redirect an invitation'
);
select throws_ok($$select * from private.owner_invitations$$,'42501',null,'tenant caller cannot read invitation records directly');
reset role;

set local role service_role;
with created as (
  select * from public.server_create_owner_invitation(
    '31000000-0000-4000-8000-000000000001','rollback@example.invalid',
    '21000000-0000-4000-8000-000000000001',interval '48 hours')
)
insert into invitation_test_state(key,value)
select state.key,state.value from created
cross join lateral (values ('rollback_id',created.invitation_id::text),('rollback_token',created.invitation_token)) state(key,value);
reset role;

create function pg_temp.reject_invitation_acceptance_audit() returns trigger
language plpgsql as $$
begin
  if new.resource_type='owner_invitation' and new.operation='UPDATE' then
    raise exception 'synthetic audit failure';
  end if;
  return new;
end;
$$;
create trigger reject_invitation_acceptance_audit
before insert on public.audit_events
for each row execute function pg_temp.reject_invitation_acceptance_audit();
set local role authenticated;
set local request.jwt.claim.sub = '21000000-0000-4000-8000-000000000007';
select throws_ok(
  format($$select * from public.accept_owner_invitation(%L,'31000000-0000-4000-8000-000000000001')$$,(select value from invitation_test_state where key='rollback_token')),
  'P0001','synthetic audit failure','audit failure aborts invitation acceptance'
);
reset role;
drop trigger reject_invitation_acceptance_audit on public.audit_events;
select is((select count(*) from public.organization_memberships where organization_id='31000000-0000-4000-8000-000000000001' and user_id='21000000-0000-4000-8000-000000000007'),0::bigint,'failed acceptance rolls membership creation back');
select ok((select accepted_at is null from private.owner_invitations where id=(select value::uuid from invitation_test_state where key='rollback_id')),'failed acceptance rolls invitation mutation back');

select is((select count(*) from information_schema.columns where table_schema='public' and table_name='audit_events' and column_name in ('email','token','token_hash')),0::bigint,'audit schema has no invitation secret or email field');
select is((select count(*) from public.audit_events where resource_type='owner_invitation' and resource_id in (select value from invitation_test_state where key like '%token')),0::bigint,'raw tokens never appear as audit resource IDs');
select is((select count(*) from private.owner_invitations where accepted_at is not null and (revoked_at is not null or expired_at is not null)),0::bigint,'invitation terminal states are mutually exclusive');

select * from finish();
rollback;
