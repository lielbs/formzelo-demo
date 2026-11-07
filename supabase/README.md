# Formangle local database foundation

Status: Milestone 1 local database and Edge Function boundary **validated on 2026-11-04**. All four migrations through `20261103170000_authorized_invitation_api` applied to a fresh disposable database; 67 pgTAP/RLS assertions, database lint, generated-type drift, the two-connection concurrency test, genuine-Auth-JWT HTTP scenarios, 262 application tests, typecheck, and build passed. The migration and `operator-invitations` version 1 are also active on the dedicated FORMANGLE project after explicit approval.

## Prerequisites

- Node/npm (already available).
- Supabase CLI **3.0.0**, invoked using `npx --yes supabase@3.0.0` (cached user-local tooling, not a global installation).
- WSL 3.0.3 with WSL2 enabled, plus Podman 5.8.3 client/server 5.8.9 running rootless in the isolated machine `formangle-wsl-dev` (4 CPUs, 6 GiB RAM, 30 GiB disk). The earlier Hyper-V machine `formangle-dev` is preserved but is not the active runtime because its guest vsock network endpoint failed.
- Disposable synthetic local data only. No remote project link, access token, RAVO connection, customer data or billing account is needed.

The commands below were discovered from CLI 3.0.0 help. In this release local is the default; older examples using `--local` may not apply.

```powershell
# From the repository root, after the runtime is ready:
./scripts/local-db.ps1 -Action start
./scripts/local-db.ps1 -Action status
./scripts/local-db.ps1 -Action test
./scripts/local-db.ps1 -Action types
./scripts/local-db.ps1 -Action types-check
./scripts/local-db.ps1 -Action stop

# Destructive ONLY to the disposable local stack. Back up anything valuable first.
./scripts/local-db.ps1 -Action reset -ConfirmSyntheticReset
./scripts/local-db.ps1 -Action test
```

The helper fixes the CLI version, accepts only enumerated local actions and refuses a linked checkout. It does not change PowerShell execution policy. If script execution is disabled, use the equivalent pinned CLI commands after reviewing the script; do not change machine-wide policy.

```text
npx --yes supabase@3.0.0 start
npx --yes supabase@3.0.0 status
npx --yes supabase@3.0.0 test db
npx --yes supabase@3.0.0 gen types --schema public
npx --yes supabase@3.0.0 stop
npx --yes supabase@3.0.0 migration new descriptive_name
```

## CI validation

`.github/workflows/production-foundation.yml` runs on pull requests and pushes targeting `main` or `production-v1`, plus manual dispatch. It uses a fresh standard `ubuntu-24.04` runner, read-only repository permission, commit-SHA-pinned checkout/setup actions, the exact Supabase CLI 3.0.0 package, and the committed npm lockfile.

The workflow requires no Supabase account, access token, production credential, environment secret, or remote project. It refuses a linked checkout or `supabase/.env`, confirms the synthetic seed marker, scans committed content for credential/private-key patterns, suppresses successful `supabase start` output so local keys do not enter public logs, and always attempts to remove the ephemeral local stack. It validates migrations, pgTAP/RLS, database lint, normalized generated-type drift, TypeScript, application tests, and the production build.

The repository is public, so standard GitHub-hosted runners have no additional Actions charge. Larger runners, artifacts, caches, and paid services are not used. Local static policy/YAML checks passed, but no hosted workflow run was triggered while push remained prohibited; the first pushed pull request or branch update must supply that evidence.

## Layout and implemented boundaries

- `config.toml`: generated with CLI 3.0.0; PostgreSQL 17, public schema only, explicit grants, disabled self-signup/anonymous identities, local redirect allowlist, local mail capture, no storage/realtime/analytics/edge workers or Studio AI.
- `migrations/20261102161823_tenant_foundation.sql`: created with the CLI, then authored as one atomic migration. It has never been applied to a shared environment.
- `seed.sql`: two fictional organizations with empty configuration; no login credentials or real customer information.
- `tests/database/tenant_foundation.test.sql`: rolled-back test fixtures and policy/integrity assertions.
- `.env.example`: empty credential placeholders; not consumed by the existing browser app.
- `src/production/`: independently typechecked configuration, adapter/event contracts and a repository factory seam; not imported by the live demo bootstrap.

The data model includes organizations, self-visible profiles, memberships with role assignments, brand/settings, workflows, immutable versions, submissions, append-only events/audit, integration metadata and tenant-safe overrides. Private operator records and an append-only outbox have no client grants. Features/entitlements, usage ledgers, invitation acceptance, customer tokens, capacity, files, payment state and automation execution are deferred.

The current local policy baseline uses the owner/staff concepts explicitly requested in the implementation mandate. Staff may read their active organization's operational data; owners may additionally read integration/audit metadata and update safe settings/brand columns. Membership administration, draft writes, publication, submission/price writes and all provider state changes have no client write grants. They await trusted server commands in the next milestone. A suspended organization or removed/suspended membership immediately loses RLS access even with a previously issued JWT. Platform operator records currently grant no tenant access at all.

Privileged database/service credentials remain a trust boundary: they bypass RLS and must not be exposed to clients. Immutable triggers prevent ordinary privileged UPDATE/DELETE, but database owners can change DDL; this is not tamper-proof storage against a database administrator.

## Transactions and concurrency

Every domain insert/update/delete appends an audit record and outbox row in the same database transaction. The trigger records actor, tenant, resource ID and operation, not answers, config bodies or credentials. Outbox rows are persistence only: no delivery worker runs.

Composite foreign keys bind submissions, versions, workflow pointers and integration references to the same organization. Version numbers and submission idempotency keys have uniqueness constraints. Draft revisions increment on update. A future command must compare the expected revision and lock the workflow row; the counter alone is not conflict detection. A repeated idempotency key must compare request hashes before returning the original response. No submit/publish API exists yet.

Publication, submission and action schemas in the original domain contain more states than these initial relational foundations. The future adapter must map them explicitly; do not cast database rows to frontend types. Shared Zod/engine validation and server recomputation are still required. Empty JSON fixtures test relational policy behavior, not real workflow validity.

## Generated types and database acceptance

`src/production/contracts.ts` contains hand-authored command/projection contracts. `src/production/database.generated.ts` is generated from the validated local `public` schema and must not be edited manually. Run `./scripts/local-db.ps1 -Action types` after an intentional schema change and `-Action types-check` to fail closed on schema/type drift.

Acceptance evidence:

1. Fresh local start and a destructive reset of the confirmed disposable `formangle-development` database both applied migration `20261102161823` and loaded two synthetic organizations.
2. `supabase test db` passed all 34 pgTAP assertions before and after the reset.
3. Generated database types, deterministic `types-check`, focused tests, and repository typecheck passed.
4. `supabase db lint --schema public,private --level warning --fail-on error` reported no schema errors.
5. The full Vitest suite passed 243 tests and the production build exited 0; Rollup emitted only the existing non-failing Zod annotation warnings.
6. Concurrent publish/submit tests remain deferred until those trusted commands are implemented.

Tests cover the requested positive and negative RLS scenarios, including owner/staff/anonymous access, suspended and removed memberships, forged and cross-tenant references, invalid role assignment, authoritative price protection, append-only records, idempotency uniqueness, audit/outbox coupling, and transactional rollback. Full Auth/PostgREST integration, API rate limiting, provider callbacks, browser E2E, hosted backup restore, and worker concurrency remain deferred.

## Recovery and rollout

The four committed migrations are applied to the dedicated FORMANGLE project `ppgdbqhwbzlgzwsjmkor`; never edit an applied migration—add a reviewed forward migration. Local experiments may be reset only after confirming they contain disposable synthetic data. Keep schema changes compatible with the current app, and back up and rehearse restore before destructive production changes. No production rollback, retention or recovery target is selected here.

The first Podman machine download hit a known Windows OCI artifact-write failure. Recovery used Podman's supported `--image` option with the official Hyper-V/x86_64 artifact from `quay.io/podman/machine-os:5.8`; its manifest-declared size (`1001679756`) and SHA-256 (`b869b9e8e780126ab61d4bfdb60fcaac9dff279a98c297c301c0649f3312f365`) were verified before initialization. The incomplete VM was confirmed as new, off, and unregistered, then its VHDX was moved to a recoverable temporary quarantine with founder approval. Do not reuse an unverified machine image.

The default demo still uses local persistence, while production mode selects the authenticated RLS repository and fails closed if its Supabase configuration is absent or invalid. Enabling the production runtime in a deployed application, creating real operators/tenants, publishing email delivery, or changing hosting/CSP belongs to separately authorized work.

## Approval gates and cost ledger

| Dependency | Purpose / local usage | Cost and limits | Reliability / security / upgrade trigger | Alternative |
|---|---|---|---|---|
| Supabase CLI 3.0.0 | Generate config/migrations and run local tests | No hosted resource or recurring subscription created; disk/network downloads only | Pinned command version; local migration/test/type checks verified | Existing approved container/CI workstation |
| Podman 5.8.3 + WSL2 | Run local Supabase/PostgreSQL/Auth | Apache-2.0 runtime and Windows WSL feature; 0 NIS recurring cost | Local synthetic data only; no hosted backup/SLA; keep the validation stack disposable | Another approved OCI runtime |
| Hosted Supabase FORMANGLE | Existing dedicated production project on the organization's Pro plan | No project, branch, add-on, or paid service was created by this milestone; normal included usage/quota still applies | Exact project ref is mandatory; migration/function deploy require approval; backup/restore remains a launch gate | Isolated local validation until production activation |
| Providers / broker / monitoring | Future messaging/payment/jobs/telemetry | None activated; recurring spend is zero | Database outbox prepared; no external effects or paid broker | Local fixtures and existing tests |

Production login method, customer-token policy, support access, retention, RPO/RTO, hosting and region remain Proposed/Deferred in the decision log. Local Auth configuration is development scaffolding only, not approval of a production login strategy.

References checked during implementation: [Supabase changelog](https://supabase.com/changelog), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database testing](https://supabase.com/docs/guides/database/testing), [local testing](https://supabase.com/docs/guides/local-development/testing/overview). Verify [pricing](https://supabase.com/pricing) and [backups](https://supabase.com/docs/guides/platform/backups) before considering hosted resources.
