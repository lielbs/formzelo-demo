# Production V1 Migration Plan

## Goal and guardrails

Move Formangle from the current single-browser local-storage demonstration to the production architecture without interrupting or rewriting the working product experience.

Guardrails:

- keep the current UI, domain schema, calculation/rule engines, and public renderer wherever they remain valid;
- keep `LocalStorageRepository` available as the demo/offline adapter until production acceptance is complete;
- introduce the production repository behind the existing asynchronous repository contract;
- never dual-write silently; each environment and tenant has one authoritative repository;
- perform database, auth, storage, and provider work first in an isolated Supabase project;
- do not mutate a live tenant, provider, or production project during this foundation phase;
- make every schema change forward-only, reviewed, and reproducible from migrations;
- require an export, validation report, rollback decision, and named approver before cutover.

## Target migration shape

```text
Existing browser UI and engines
             |
     FormangleRepository
        /           \
LocalStorage        Supabase/API
(demo mode)         (production mode)
```

Repository selection must come from deployment configuration, not an end-user query parameter. Development and the protected demo may use local storage. Staging and production must fail closed if the production backend configuration is absent or invalid.

## Phase 0 — decisions and baselines

Deliverables:

1. Resolve the blocking items in `09-OPEN-DECISIONS.md`: region, auth method, role set, first payment/messaging providers, retention, RPO/RTO, and launch scope.
2. Create isolated development, staging, and production Supabase projects with separate credentials and provider accounts.
3. Capture the current schema-v8 export format and at least three representative workspaces: empty, typical, and complex.
4. Freeze the `FormangleRepository` contract for the first vertical slice and document compatibility rules.
5. Add migration, generated-type drift, lint, typecheck, unit-test, and build checks to CI.

Exit criteria:

- environment owners, data classification, and promotion rules are approved;
- current exports can be produced and parsed deterministically;
- no production secret is present in a browser bundle or repository;
- rollback authority and go/no-go owners are named.

## Phase 1 — database, auth, and policy foundation

1. Implement the foundational tables and constraints from `03-DATABASE-SCHEMA.md` as ordered SQL migrations.
2. Add Auth identity mapping, organization membership, invitation, and role management.
3. Enable RLS on every tenant or user table before exposing it through the API.
4. Implement policy helper functions and the RLS test matrix from `04-AUTH-AND-RLS.md`.
5. Create private storage buckets and object policies; do not permit public listing.
6. Add append-only audit records for privileged mutations.
7. Generate typed database definitions and detect drift in CI.

Exit criteria:

- a new project can be built from zero using migrations only;
- cross-tenant and unauthenticated negative tests pass;
- service-role credentials exist only in trusted runtime secrets;
- backup and restore smoke tests have recorded evidence.

## Phase 2 — first production repository slice

Implement one end-to-end production path before broad feature migration:

1. login and select an organization;
2. create/edit a workflow draft;
3. publish an immutable version;
4. open the public flow from another device/session;
5. create and complete a submission through a server-owned command;
6. recompute validation, rules, and prices on the server;
7. show the completed submission to an authorized owner.

The browser may run the pure engines for instant feedback, but the trusted command must load the published version, normalize input, rerun validation and pricing, and commit the result transactionally.

Exit criteria are defined in the first milestone of `08-IMPLEMENTATION-ROADMAP.md`.

## Phase 3 — feature and operational migration

Migrate bounded capabilities in this order:

1. actions, event timeline, and owner dashboards;
2. file upload/download with signed URLs and scanning lifecycle;
3. booking capacity and atomic reservation;
4. payment intent and webhook reconciliation;
5. notification adapters;
6. automation queue, retries, dead-letter handling, and replay tooling;
7. CRM/calendar/webhook adapters;
8. exports, deletion, support access, and billing/entitlement controls.

Each slice requires authorization tests, idempotency behavior, observability, provider sandbox tests, and a rollback procedure before the next slice begins.

## Data export and transformation

The existing `exportWorkspace` output is the source artifact for any browser-held data a user chooses to migrate.

Export procedure:

1. Make a read-only export from schema version 8.
2. Record export timestamp, application version, organization label, counts, and SHA-256 digest.
3. Validate the export against its exact source schema before transformation.
4. Transform stable local identifiers to UUIDs using a persisted mapping table; never infer relationships by display name.
5. Normalize timestamps to UTC and preserve original values in migration metadata when conversion is ambiguous.
6. Convert embedded brand data URLs into private storage objects, verify content type and size, and store the object mapping.
7. Reject or quarantine unknown schema versions, invalid workflow graphs, orphan references, and oversized payloads.
8. Produce a deterministic dry-run report before any import.

The importer must be restartable and idempotent. A `migration_batches` row records source digest, status, counts, mapping version, errors, actor, and timestamps. Re-running the same digest must return the existing result rather than duplicate data.

## Import ordering and transactional boundaries

Recommended order:

1. organization and initial owner membership;
2. brand kit and storage objects;
3. workflows and immutable versions;
4. submissions/runs and answers;
5. events and actions;
6. capacity and provider references;
7. audit entry recording the migration.

Import each organization as an isolated batch. Use short transactions by aggregate, defer external provider calls, and mark the organization unavailable to end users until reconciliation succeeds. Do not hold one transaction while uploading files or contacting providers.

## Reconciliation

For every dry run and import compare:

- record counts by entity and status;
- distinct stable source IDs and mapped destination IDs;
- workflow version graph and published pointers;
- submission totals, currencies, and answer hashes;
- event ordering and action state;
- storage object count, size, and digest;
- invalid, skipped, repaired, and quarantined records;
- a sample of rendered workflows and server recomputation results.

No batch is accepted with an unexplained difference. The migration report and approver identity become audit evidence.

## Staging rehearsal

1. Restore a production-shaped database snapshot or synthetic equivalent into staging.
2. Import representative exports, including maximum supported workflow and file sizes.
3. Run unit, integration, RLS, browser, accessibility, load, provider-sandbox, and restore tests.
4. Exercise expired/revoked links, duplicate webhooks, retry exhaustion, and partial provider outages.
5. Rehearse rollback, credential rotation, and an organization-level deletion/export request.
6. Record duration, error budget, capacity headroom, and human steps; update the runbook.

## Pilot and cutover

Use a small, consenting pilot tenant before general availability.

Cutover checklist:

- release candidate and migrations are immutable and approved;
- backup/restore evidence is current;
- monitoring, alerts, queues, and provider dashboards are healthy;
- migration dry run has no unexplained differences;
- customer communication and support ownership are ready;
- writes to the source are paused for the chosen tenant;
- final export digest matches the imported batch;
- smoke tests cover login, publish, public submit, owner view, and provider callbacks;
- go/no-go is recorded by engineering and product owners.

Do not use broad dual-write as a safety mechanism. If a transition window is required, keep the local system read-only after its final export and direct new writes only to production.

## Rollback and recovery

Before user traffic, application releases may roll back while migrations remain backward compatible. Destructive schema cleanup happens only after the rollback window.

If cutover fails:

1. stop new production commands for the affected tenant;
2. preserve logs, batch metadata, and provider event IDs;
3. route the tenant back to the unchanged source only if no accepted writes occurred in production;
4. if production writes occurred, do not overwrite either side—reconcile through an approved recovery plan;
5. revoke or rotate exposed credentials and links if security is involved;
6. restore or forward-fix according to the rehearsed runbook;
7. communicate impact and next action to affected users.

Recovery is complete only after counts, hashes, workflow rendering, server calculations, and provider states reconcile.

## Primary migration risks

| Risk | Mitigation |
|---|---|
| Local exports contain malformed or older data | Versioned validator, quarantine, dry run, explicit repair report |
| UI behavior changes behind the new repository | Contract tests against both adapters and browser regression tests |
| Client/server engine drift | Shared versioned engine package and parity fixtures in CI |
| RLS blocks valid paths or leaks another tenant | Positive and negative policy tests with multiple real sessions |
| File data URLs exceed limits or contain unsafe content | Bounded decoder, verified type/size, private bucket, scanning state |
| Duplicate commands or webhooks create duplicate effects | Idempotency keys, uniqueness constraints, inbox/outbox records |
| Schema migration prevents rollback | Expand/migrate/contract sequence and delayed cleanup |
| Provider sandbox differs from production | Bounded pilot, webhook observability, manual reconciliation path |
| User source data changes during import | Read-only cutover window and final digest |

## Definition of done

- Every migrated tenant has an approved reconciliation report.
- Production is authoritative and the local source is preserved read-only for the approved rollback period.
- All tokens, credentials, and signed links used during rehearsal are revoked or expired.
- Monitoring and support can identify a tenant, submission, command, job, and provider event without exposing sensitive payloads.
- The old adapter is not removed until product explicitly ends demo/offline support and the rollback window closes.
