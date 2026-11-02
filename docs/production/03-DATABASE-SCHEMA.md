# Database Schema

## Modeling strategy

Use relational tables for ownership, lifecycle, uniqueness, lookup, concurrency, and audit. Use validated JSONB for the schema-driven workflow configuration/design snapshot because the existing renderer consumes that shape and published versions must remain byte-for-byte stable apart from canonical serialization metadata.

All IDs are UUIDs generated server-side unless noted. All timestamps are `timestamptz` in UTC. Tenant tables include `organization_id uuid not null`; indexes used by RLS and common queries begin with it. Soft deletion is explicit only where recovery is required; immutable audit/version/event rows are never silently updated.

This document is a logical schema. Actual migrations must be generated, reviewed, exercised locally/staging, and tested with the project's selected Supabase/PostgreSQL version.

## Core identity and tenancy

### `organizations`

- `id uuid primary key`
- `slug citext unique not null`
- `name text not null`
- `industry text`
- `status text check in ('onboarding','active','suspended','closed')`
- `settings jsonb not null default '{}'`
- `default_locale text not null default 'he-IL'`
- `timezone text not null default 'Asia/Jerusalem'`
- `created_at`, `updated_at`, `deleted_at`

### `organization_memberships`

- `organization_id` references organizations
- `user_id uuid` references `auth.users`
- `role text check in ('owner','admin','staff','viewer')`
- `status text check in ('active','suspended')`
- `created_by uuid`, `created_at`, `updated_at`
- primary key `(organization_id, user_id)`
- indexes `(user_id, status)` and `(organization_id, role)`

RockStack super-admin is not an organization role. Store it in a private operator table with mandatory MFA/support-session controls.

### `organization_invitations`

- `id`, `organization_id`, normalized `email`
- `role`, `token_hash`, `expires_at`, `accepted_at`, `revoked_at`
- `invited_by`, `accepted_by`, `created_at`
- unique active invitation per `(organization_id, lower(email))`

## Configuration and entitlements

### `organization_settings`

- one row per organization
- communication defaults, payment timing defaults, locale/timezone, retention settings, support-access preference, and safe business configuration
- no provider credentials

### `plans`, `organization_subscriptions`, `feature_entitlements`

- plan catalog and effective organization assignment
- entitlements as explicit keys with typed numeric/boolean limits
- `starts_at`, `ends_at`, source and override reason
- server checks entitlements on writes; UI display is not enforcement

### `usage_counters`

- organization, metric key, period start/end, integer quantity
- unique `(organization_id, metric_key, period_start)`
- updated transactionally or from idempotent usage events

## Workflow persistence

### `workflows`

- `id`, `organization_id`
- globally unique `public_slug citext`
- `status check in ('draft','published','archived')`
- `template_key`, `source_prompt` (optional, retention classified)
- `draft_config jsonb not null`
- `draft_design jsonb not null`
- `draft_schema_version integer not null`
- `published_version_id uuid null`
- `has_unpublished_changes boolean`
- `intake_config jsonb not null default '{}'`
- optimistic `lock_version bigint not null default 0`
- `created_by`, `updated_by`, timestamps
- unique `(organization_id, id)` to support tenant-safe composite foreign keys

### `workflow_versions`

- `id`, `organization_id`, `workflow_id`
- `version_number integer not null`
- `schema_version integer not null`
- `config jsonb not null`
- `design jsonb not null`
- `content_hash text not null`
- `published_by`, `published_at`, `created_at`
- unique `(workflow_id, version_number)`
- unique `(organization_id, id)`
- no update/delete grant to application roles

`workflows.published_version_id` must reference a version of the same workflow and organization. Enforce in the publish transaction, with a deferred constraint/trigger if a simple foreign key cannot express all columns.

### `workflow_schema_compatibility`

Optional registry recording supported schema versions and minimum client/server versions. It prevents publishing or serving snapshots that the deployed renderer cannot interpret.

## Submissions and lifecycle

### `submissions`

- `id`, `organization_id`, `workflow_id`, `workflow_version_id`
- `reference text not null`
- `status` matching the explicit run state machine
- `customer_name`, `customer_contact` (minimized/indexed only if needed)
- `answers jsonb not null`, `case_answers jsonb not null default '[]'`
- `price_lines jsonb not null default '[]'`
- `currency char(3) not null default 'ILS'`
- `total_minor bigint not null check >= 0`
- `completion_mode`, `consent_at`, `submitted_at`
- `idempotency_key text`, `created_at`, `updated_at`
- unique `(organization_id, reference)`
- unique `(workflow_id, idempotency_key)` where key is not null
- index `(organization_id, status, submitted_at desc)`
- index `(organization_id, workflow_id, submitted_at desc)`

Amounts use integer minor units (agorot), not floating point.

### `submission_events`

- append-only `id bigserial/uuid`, tenant and submission IDs
- `event_type`, `actor_type`, nullable `actor_user_id`
- `customer_token_id`, `support_session_id`, `source`
- `from_status`, `to_status`, redacted `message`, `metadata jsonb`
- `occurred_at`, correlation/idempotency key

Internal notes may be a separate `submission_notes` table with stricter roles/retention rather than mixed into customer-visible events.

### `customer_access_tokens`

- `id`, `organization_id`, `submission_id`
- `token_hash bytea/text unique not null`
- `capabilities text[]` (view, respond, resubmit, cancel, upload)
- `expires_at`, `last_used_at`, `revoked_at`, `created_at`
- optional intended contact hash for step-up verification

Raw token material is returned once and never stored/logged. Token lookup should use a keyed hash/HMAC if database theft resistance is required.

### `customer_actions`

- current immutable action fields: kind, title, description, amount_minor, note, options JSONB, expiry
- organization/submission/workflow/version references
- `status`, timestamps, `created_by`
- action terms are immutable after insert; cancellation/response write dedicated fields or child events only

### `customer_action_responses`

- `action_id` unique, `option_id`, frozen `option_label`, `responded_at`, `customer_token_id`
- unique action constraint guarantees one response under concurrency

## Booking and capacity

### `capacity_resources`

- organization/workflow/version scope
- resource key, date/time timezone semantics, capacity units, active range

### `capacity_reservations`

- resource, submission, units, state (`held`,`confirmed`,`released`,`expired`)
- `starts_at`, `expires_at`, timestamps
- unique submission/resource reservation

Submission RPC locks the relevant resource/date row, sums active reservations, rejects overflow, and inserts the reservation in the same transaction. For simple fixed slots, a counter row with `used_units <= capacity` check is cheaper. Do not rely on a preflight availability read.

### `reference_counters`

- `(organization_id, sequence_key, next_value)`
- atomically incremented with `UPDATE ... RETURNING` or a database sequence strategy

## Payments

### `payment_intents`

- tenant/submission/provider connection IDs
- kind, currency, `amount_minor`
- status state machine (`created`,`pending`,`requires_action`,`paid`,`failed`,`cancelled`,`refunded`)
- provider session/transaction identifiers, idempotency key
- `checkout_url` should be short-lived or regenerated; never store card data
- unique provider transaction ID and unique idempotency key per provider connection

### `payment_events`

- normalized append-only event plus safe provider metadata
- raw webhook body belongs in restricted short-retention storage only if operationally required
- unique `(provider_connection_id, provider_event_id)` prevents replay

Only verified server webhook/confirmation flows may enter a paid/refunded state.

## Files and brand assets

### `files`

- `id`, `organization_id`, optional submission/workflow references
- bucket, object path, purpose, original name, detected MIME, bytes, checksum
- upload/scan state, uploaded_by or customer token ID
- retention/deletion timestamps and metadata
- unique `(bucket, object_path)`

Storage object paths are derived server-side as `<organization_id>/<purpose>/<file_id>/<safe-name>` and checked against file rows. Brand references point to file IDs, not arbitrary URLs.

## Integrations

### `integration_connections`

- `id`, `organization_id`
- category/provider key
- display name, status, non-secret config JSONB
- credential version/reference, health status, last test/error timestamps
- created/updated actor and timestamps
- unique organization/provider/name as appropriate

### `integration_secrets` (private schema)

- connection ID, encrypted envelope, key version, rotated/revoked timestamps
- no Data API exposure; no `anon`/`authenticated` grants
- read only by narrowly scoped server/worker code

Edge Function environment secrets are appropriate for platform-wide master keys, not hundreds of per-organization provider credentials. Per-tenant secrets require envelope encryption or a reviewed managed secret store. If Supabase Vault is selected, expose access only through private, audited functions and never through a decrypted public view.

### `workflow_integration_overrides`

- workflow ID plus capability key (payment, owner notification, customer notification, CRM, calendar)
- selected connection ID and safe override config
- null means inherit organization default

### `webhook_endpoints` and `webhook_deliveries`

- inbound/outbound endpoint config, secret reference, active flag
- per-delivery event, attempt, status, response code, bounded response excerpt, next retry

## Automation

### `automation_rules`

- `id`, organization, name, enabled, version
- trigger type and schema version
- condition tree JSONB from a closed declarative grammar
- action list JSONB referencing allowed adapter/action types
- execution limits (max actions, timeout class), created/updated actors

### `domain_events` / `outbox_events`

- immutable event ID, tenant, aggregate type/id/version, event type, safe payload, occurred/available times
- unique deterministic key for idempotent append
- outbox insertion occurs in the same transaction as domain state

### `automation_jobs`

- event/rule/version IDs, state, attempt count, visibility/lease time, next attempt, idempotency key, last error category
- unique `(event_id, rule_id, rule_version)`

### `automation_attempts`

- job/action/attempt, start/end, outcome, provider request ID, safe diagnostics
- no credentials or unredacted customer payloads in logs

### `dead_letter_jobs`

May be a terminal job state plus indexed metadata rather than a separate table. It must support inspection, manual retry with approval, and immutable history.

Supabase Queues/PGMQ can back job claiming and visibility while domain job state remains queryable: [Supabase Queues](https://supabase.com/docs/guides/queues).

## Audit and support

### `audit_logs`

- append-only organization-scoped actor/action/resource/result record
- actor user, effective role, support session, request/correlation ID, source IP/user agent where lawful
- before/after field allowlist or hashes; never dump secrets or unnecessary PII
- privileged access and export/delete events are mandatory

### `rockstack_operators`, `support_sessions`

- private schema
- operator user, approved organization, reason/ticket, granted scopes, start/expiry/revocation, approver
- all support reads/writes reference an active support session and emit audit logs

## Constraints and tenant integrity

- Use composite FKs `(organization_id, parent_id)` on tenant child tables.
- Check immutable rows with revoked UPDATE/DELETE grants plus triggers only where necessary.
- Validate JSONB shape in the application/server package; add lightweight DB checks for required schema version/object type and size.
- Limit config/answer payload sizes to prevent oversized rows and automation amplification.
- Index every `organization_id` and RLS predicate; wrap stable `auth.uid()` calls as `(select auth.uid())` where appropriate.
- Views exposed to clients use `security_invoker = true`; otherwise place them in an unexposed schema.
- All exposed tables have RLS enabled even if no client policy exists.

## Transaction contracts

Required atomic functions/endpoints:

1. `publish_workflow(workflow_id, expected_lock_version)`
2. `submit_public_workflow(slug, version_etag, values, consent, idempotency_key)`
3. `create_case(workflow_id, case_values)`
4. `transition_submission(submission_id, expected_status, new_status, note)`
5. `respond_to_action(raw_token, action_id, option_id, idempotency_key)`
6. `apply_verified_payment(provider_event_id, normalized_result)`
7. `accept_invitation(raw_token)`

Each validates caller authority, locks required rows, enforces current state, writes domain state plus events/outbox, and returns a typed result. Functions using elevated privileges live in a private schema, set a safe `search_path`, revoke `PUBLIC` execute, and perform explicit identity/tenant checks.

## Versioning and compatibility

- Keep existing workflow schema version 8 as the import baseline.
- Published snapshots are never rewritten in place.
- Renderer supports a bounded compatibility window; old versions are transformed in memory or through deterministic server adapters.
- Draft upgrades create a new draft representation and record migration metadata.
- Database migrations and workflow-schema migrations are separate version streams.
- Reject publication when the server cannot validate the draft schema version or the deployed client cannot render it.

## Database acceptance criteria

- Schema reset from migrations succeeds on an empty local environment.
- Every tenant relationship has an enforced organization-consistency constraint.
- Publication and submission concurrency tests prove no duplicate version/reference and no capacity overflow.
- RLS tests prove cross-tenant denial for every exposed table and storage path.
- Amounts use minor integer units and paid state is reachable only from verified server paths.
- Backup/restore rehearsal recreates database plus storage references in staging.
