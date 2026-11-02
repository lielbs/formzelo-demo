# Authentication, Authorization, and RLS

## Security model

Authentication proves the workforce user. Organization membership authorizes tenant operations. Customer capability tokens authorize only a single submission and a small set of actions. RockStack support authority is separate, temporary, scoped, and audited.

RLS is a mandatory backstop, not the only check. Server endpoints also validate business rules, but a missed endpoint check must still fail at PostgreSQL. Conversely, `TO authenticated` alone is not authorization; every policy needs organization membership or resource ownership.

## Actors and roles

| Actor | Identity | Allowed scope |
|---|---|---|
| Public visitor | Supabase `anon` / no user | Published public projection only; no direct core-table writes |
| Customer with capability | Hashed, expiring token | One submission and explicit capabilities only |
| Viewer | Auth user + membership | Read organization configuration/submissions allowed by policy |
| Staff | Auth user + membership | Operational request work; no membership/billing/provider-secret administration |
| Organization admin | Auth user + membership | Workflows, staff invitations, integrations/config within organization |
| Organization owner | Auth user + membership | Full tenant administration, including owner transfer safeguards |
| RockStack operator | Auth user + private operator record + MFA | Platform administration; tenant data only through an active support session |
| Automation worker | Server secret/service identity | Queue jobs and narrowly defined internal functions |

## Sign-in and session requirements

- Start with email magic link/OTP or another low-support verified-email method. Decide password support in `09-OPEN-DECISIONS.md`.
- Exact production and staging redirect allowlists; no wildcard domains.
- Short access-token lifetime appropriate to the UX, refresh token rotation/reuse detection, secure browser storage through the supported Supabase client pattern.
- MFA required for RockStack operators and strongly recommended for organization owners; sensitive actions can require recent/AAL2 authentication.
- Suspend membership in the database for immediate authorization loss. JWT app metadata is not the authoritative membership store because claims may remain stale until refresh.
- Never use `raw_user_meta_data`/`user_metadata` for roles. It is user-editable. If app metadata is used for coarse hints, database membership remains authoritative.
- User deletion must be preceded by session revocation and ownership/data-handling decisions; deleting a user alone does not immediately invalidate existing access tokens.

## Invitation and onboarding flow

1. RockStack creates the organization and its first owner through a privileged admin endpoint.
2. Endpoint inserts a pending invitation with normalized email, role, random token hash, expiry, inviter, and audit record.
3. Supabase Auth invitation email directs to the exact application callback. Raw invitation token is not stored.
4. User authenticates; acceptance transaction checks token hash, expiry/revocation, email match, and existing membership.
5. Transaction inserts membership, marks invitation accepted, creates audit/outbox events, and prevents reuse.
6. Additional staff invitations require organization admin/owner authority and plan limit checks.
7. Last-owner removal/transfer is a dedicated transaction requiring a replacement owner and recent authentication.

Use server-side Auth Admin APIs only. They require a secret/service key and must never execute in the browser: [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

## RLS helper design

Prefer small private-schema helpers called with `select` in policies:

```sql
-- Illustrative design, not an executed migration.
create function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
```

If `security definer` is required to avoid recursive membership RLS, the function must live outside exposed schemas, set a safe search path, accept no caller-controlled SQL identifiers, and expose only a boolean. Do not create general bypass helpers. Run database security advisors after migrations.

Role helper:

```sql
private.has_org_role(target_org uuid, allowed_roles text[])
```

It reads the membership table and returns true only for an active membership. Put indexes on `(user_id, organization_id, status)` and `(organization_id, user_id, status)`.

## Policy matrix

| Resource | Public/anon | Tenant viewer/staff | Tenant admin/owner | RockStack support | Worker |
|---|---|---|---|---|---|
| Organizations | no direct access; public projection endpoint only | select own | update allowed safe fields | active support session | scoped |
| Memberships | none | select own membership or tenant list if required | manage below protected owner rules | active support session | none |
| Workflows/drafts | published projection only through endpoint | select own | insert/update/publish own | support scope | read for jobs if required |
| Versions | published projection only | select own | insert only through publish RPC; no update/delete | read with support scope | read |
| Submissions | none directly | select/update own according to role | select/update own | support scope | job-specific |
| Actions/events | customer endpoint only | select/create own as permitted | own | support scope | append delivery events |
| Integration config | none | limited safe status | manage non-secret config | support scope without secret value | read selected connection |
| Secrets | none | none | write/rotate through endpoint; never read plaintext | tightly controlled break-glass | decrypt only for assigned job |
| Audit logs | none | optional self-visible subset | select tenant audit subset | platform audit access | append only |

## Representative tenant policies

```sql
alter table public.workflows enable row level security;

create policy workflows_select_member
on public.workflows for select
to authenticated
using ((select private.is_org_member(organization_id)));

create policy workflows_insert_admin
on public.workflows for insert
to authenticated
with check ((select private.has_org_role(organization_id, array['owner','admin'])));

create policy workflows_update_admin
on public.workflows for update
to authenticated
using ((select private.has_org_role(organization_id, array['owner','admin'])))
with check ((select private.has_org_role(organization_id, array['owner','admin'])));
```

An UPDATE also needs a SELECT policy. Do not use `auth.role()`; use `TO authenticated` plus the authorization predicate. Official reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Public and customer access

### Public workflow

Do not grant `anon` select on `workflows` or `workflow_versions`, which contain draft/internal configuration. Use a `security_invoker` safe projection only if it can express the boundary without exposing internal columns; otherwise use an Edge Function/RPC that returns explicit fields from the published version.

Public response excludes source prompts, draft notes, internal provider configuration, unpublished design, organization private settings, and asset storage paths.

### Customer token

- Generate cryptographically random raw token; store hash only.
- Token row identifies submission, expiry, revocation, and allowed capabilities.
- Compare hashes in constant-time server code/database primitive where applicable.
- Do not place raw token in server logs, analytics, error reports, provider payloads, or referrer-bearing links.
- Prefer URL fragment followed by token exchange, or a short-lived HttpOnly session if architecture supports it, to reduce query-string leakage. If query strings are retained, set strict referrer policy and scrub access logs.
- Step-up verification (OTP to the known contact) is recommended for high-value approvals/payments.

Customer token operations run through a narrow endpoint. Do not mint a broad Supabase JWT that can query arbitrary rows unless its claims and RLS model are rigorously constrained and revocation tested.

## RockStack support access

Never give operators an invisible permanent tenant membership by default.

1. Operator authenticates with MFA.
2. Creates a support session for one organization with reason/ticket, scopes, and short expiry.
3. Depending on policy, organization owner pre-approval is required or emergency break-glass is logged and alerted.
4. Admin API verifies the operator record and active support session on each request.
5. Every read/export/write records operator, organization, resource, result, reason, and correlation ID.
6. Session auto-expires and can be revoked immediately.

RLS can include a narrowly written private helper for active support sessions, but privileged reads should flow through the admin API so audit context is mandatory. Service-role use must not turn ordinary operator UI into an unrestricted database console.

## Storage policies

- Buckets private by default.
- Workforce read/write policy joins `storage.objects` path metadata to active organization membership.
- Do not rely on splitting `name` alone without validating the file row and organization.
- Customer uploads receive a short-lived signed upload or server-mediated upload bound to token, submission, purpose, type, and maximum size.
- Upsert requires SELECT, INSERT, and UPDATE policies; prefer immutable object names and no upsert.
- Signed downloads expire quickly and are issued only after authorization.

Official reference: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Test matrix

Automate with pgTAP/SQL integration tests plus API tests:

- user A in org A can read allowed A rows;
- user A cannot read/write org B even with valid B UUIDs;
- staff cannot manage membership/provider connections if role forbids it;
- admin cannot assign a row to another organization through UPDATE (`WITH CHECK` test);
- removed/suspended member loses access without waiting for JWT refresh;
- anonymous direct table reads/writes fail;
- public endpoint returns only published projection;
- customer token cannot access another submission, cannot exceed its capability, expires, revokes, and is single-response safe;
- support operator without active session fails; wrong-org or expired session fails;
- service key is absent from frontend bundle/environment;
- every exposed table reports RLS enabled and no unintended grants/views exist.

## Acceptance criteria

- Cross-tenant tests cover every exposed tenant table and Storage path.
- No policy authorizes solely on `TO authenticated` or user metadata.
- All elevated functions are private, have explicit grants, safe search paths, and identity checks.
- Invitation, suspension, owner transfer, support access, and token revocation produce audit events.
- MFA is enforced for RockStack operators before production access.
