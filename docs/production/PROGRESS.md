# Formangle Production V1 Progress

Last updated: 2026-11-07 (Asia/Jerusalem)

## Current milestone

Production V1 delivery (Claude Code session, continuing Codex's Milestone 2). All work is local on `production-v1`; nothing new is applied to Supabase Cloud, deployed, or pushed. Cloud still has only the four Milestone 0-1 migrations and `operator-invitations` v1.

## 2026-11-07 Production V1 delivery checkpoint

- `bdc95a9` merged `main` (landing/advisor work) into `production-v1`.
- `5bf0c56` fixed a real Milestone 2 defect: the server condition evaluator only knew `eq/neq`-style operators, while the editor writes `equals/isTrue/notEmpty/...`, so every conditional step or field was treated as hidden server-side (required conditional answers skipped, conditional prices dropped). Migration `20261107120000_server_rule_parity` mirrors the browser engine exactly and adds server-side booking rules, per-option places, per-day/week intake limits, closed dates and normalized one-open-request-per-contact under the workflow row lock, plus public availability/intake/option-usage RPCs. Parity test: 55 templates x 60 generated submissions through the real RPC match the browser (4 seeds, 13,200 cases); eight concurrent customers racing for one slot produce exactly one booking.
- `c482242` customer portal data layer (`20261107140000_customer_portal_quotes`): hash-only 256-bit tracking tokens (fragment, 180 days, revocable), customer-safe `public_track_request`, immutable internal notes, customer actions, versioned interactive quotes with server totals (optional/adjustable items, discounts/fees, VAT modes), idempotent transactional decisions, customer cancellation. 2,000 generated quotes match the browser to the agora.
- `b50410c` UI: quote composer with live branded preview, request-page link (copy, wa.me, revoke), `/track` customer page (status, interactive quote, actions, timeline, details, contact, cancel). Same repository contract in demo and production; production screens no longer show simulated messages/payments.
- `341d43b` onboarding (`20261107160000_team_onboarding`): invitation roles, owner-managed staff invitations/removal, `account-onboarding` Edge Function (invitation token creates the invited address's account; sign-up stays disabled; no email), `/invite` create-password flow, `/operator` console (metadata only), production team card, dev-server-only local-stack runtime for E2E.
- Validation at this checkpoint: clean replay of 9 migrations; 206 pgTAP assertions; db lint clean; 278 Vitest + 57 local-DB parity/concurrency tests; typecheck and build pass.

- E2E checkpoint: fixed a production-breaking defect (the production repository Proxy answered `then`, so awaiting it crashed every production page); added returning-user sign-in (previously an owner who signed out could never return); production forms no longer show simulated payments, demo wording stored in templates was neutralised, and file fields ask for a link instead of pretending to upload. Playwright (`e2e/journey.spec.ts`, Edge channel, local stack): operator onboarding of two businesses, invitation account creation, workflow create/publish, cross-device draft, phone customer submission to the private page, owner status/note/quote/link, customer approval, and tenant B isolation — 6/6 passed.
- Known open items: invite page spinner stays visible after success; page titles for /operator and /track; dashboard text "נשמר מקומית" and a "דמו" label in production layout; operator-assisted password reset; production media (logos) and catalog templates; responsive visual QA; ops/backup drill; approval package.

### Remaining before launch (in order)

1. Browser E2E (Playwright, local stack) of the full journey incl. tenant isolation and mobile.
2. Production media (logos/images) without new Storage settings, branded order catalog templates.
3. Responsive visual QA (320-1440), accessibility, performance.
4. Operations: backup/restore drill, monitoring, incident/support runbooks, privacy text.
5. Approval package -> founder approval -> apply migrations, deploy `account-onboarding` + `operator-organizations`, production frontend release, post-deploy smoke.

## 2026-11-04 Milestone 2 local completion

- Added trusted RockStack business provisioning behind the existing verified-operator architecture. The new service-role-only RPC transaction creates the organization, settings, complete default Brand Kit and one owner invitation; the browser cannot call it directly. The local `operator-organizations` Edge Function verifies the bearer identity, exact origin and normalized request, ignores actor impersonation fields, and returns the invitation token only in the one successful response.
- Connected the protected workspace to real Supabase organization metadata, active memberships, organization switching and owner-only profile/brand settings. Production empty/error states no longer redirect to or describe local demo storage.
- Connected the existing Design Studio and template library to production RPCs for create, template initialization, full draft persistence, multi-workflow listing, duplicate, archive/restore, version restore and immutable publication. Writes use server-side tenant authorization, schema-version 8 validation, a validated theme contract, plan limits and optimistic `lock_version` checks.
- Persisted Brand Kit JSON per organization and froze the resolved brand into every published version. Production can edit colors, typography, layout and button styles. Storage-backed image upload remains intentionally unavailable because enabling/changing Supabase Storage is a separate approval gate.
- Added a narrow anonymous public resolver that exposes only the current immutable published snapshot and basic business identity. Draft and archived workflows resolve to no public record.
- Added transactional public submissions bound to the exact published version. PostgreSQL validates required fields, types, allowed options, ranges, conditions and consent; rejects unknown/forged fields; recalculates ILS totals and fees; derives the tenant/workflow/version from the slug; enforces idempotency, per-workflow and per-client rate limits, intake closure/capacity and one-open-request rules; appends audit/outbox and submission timeline records atomically.
- Connected the production inbox to RLS-protected submissions, workflow/status filters, request detail loading, timeline loading and optimistic status transitions. Payment state is never marked paid by this implementation.
- Kept the default demo adapter isolated and unchanged. Production capabilities never fall back to `localStorage`.
- Local database validation used an unlinked disposable copy on the existing WSL2 + Podman runtime. A clean reset applied all six migrations; 114/114 pgTAP assertions passed; database lint reported no schema errors.
- Application regression passed: 30 Vitest files and 265 tests; TypeScript typecheck passed; production build passed with only the pre-existing non-failing Zod/Rollup annotation warnings.
- No cloud migration, Edge Function deployment, Auth/Storage setting, secret, real identity, organization, customer row, provider, DNS, public site, RAVO resource, push or paid resource was changed.

### Milestone 2 limitations before cloud activation

- The two new migrations `20261104162858_milestone_2_workspace_workflows` and `20261104165034_public_delivery_submissions` exist only locally.
- `operator-organizations` exists only as a local Edge Function package. It has unit coverage but has not been deployed or exercised against Cloud.
- Production object uploads, case/personal customer links, customer resubmission tokens, internal notes, Formangle Actions, notifications and payments are not enabled in the production adapter. Their existing demo implementations remain local-only; no production fallback occurs.
- Anonymous submissions use database-enforced bounded rate limits. A managed CAPTCHA/WAF was not added because that would require separate service/configuration and cost review.
- Backup/restore, staging recovery, monitoring, incident response and real-data operating procedures remain Production Readiness gates. Formangle is not yet approved for paying customers.

### Exact next step

Review and explicitly approve applying the two new migrations to exact project `FORMANGLE` (`ppgdbqhwbzlgzwsjmkor`) and deploying only `operator-organizations` with the already-used `FORMANGLE_APP_ORIGIN`. Expected incremental cost: zero on the existing project. After cloud validation, separately approve creating the first real operator/organization and application deployment.

## 2026-11-04 runtime recovery and Milestone 1 completion

- Installed WSL 3.0.3 and created one supported rootless WSL2 Podman machine, `formangle-wsl-dev` (4 CPUs, 6 GiB RAM, 30 GiB disk). Podman client 5.8.3 communicates with server 5.8.9 through the Docker-compatible named pipe. The failed Hyper-V machine `formangle-dev` and its VHDX were preserved unchanged.
- Used an isolated unlinked copy of `supabase/` so local validation could not address either hosted project. A clean reset applied all four migrations to disposable PostgreSQL 17.
- Fixed a real PL/pgSQL ambiguity in `private.create_owner_invitation_authorized` by prefixing its parameters while preserving the public RPC signature and Edge Function contract.
- Passed 67 pgTAP/RLS assertions, database lint with no errors, generated-type drift with zero differences, and the two-connection invitation concurrency test.
- Served the Edge Function locally and exercised real HTTP requests with genuine local Supabase Auth JWTs. Missing/invalid credentials, wrong method/origin/body, unauthorized operator, nonexistent organization, tenant isolation, one-time invitation acceptance, idempotent replay, actor/role impersonation resistance, RLS isolation, and the 10-per-15-minute rate limit all behaved as required.
- Passed the full application regression: 29 Vitest files and 262 tests, TypeScript typecheck, and production build. The build emitted only the existing non-failing Zod/Rollup annotation warnings.
- Re-verified exact hosted target `FORMANGLE` (`ppgdbqhwbzlgzwsjmkor`, `eu-west-1`, PostgreSQL 17.11, healthy) and the existing Pro organization. RAVO has a different project reference and was not changed.
- Applied `20261103170000_authorized_invitation_api`; reconciled the tool-generated ledger timestamp to the committed version under an exact version/name guard. Both functions grant execution only to `postgres` and `service_role`; the public wrapper is security invoker and the private function is security definer with an empty search path.
- Set only `FORMANGLE_APP_ORIGIN=https://formangle.rockstackds.com` and deployed `operator-invitations` version 1 with `verify_jwt=true`. A hosted request without Authorization returned `401 UNAUTHORIZED_NO_AUTH_HEADER` before handler execution. No hosted Auth user, operator, organization, invitation, membership, email, or other application row was created.
- No project, branch, add-on, paid service, provider, DNS record, Spend Cap setting, RAVO resource, push, merge, or application deployment was created or changed.

## 2026-11-04 local API/repository checkpoint

- Added one shared browser Supabase client so Auth and repository access share safe session refresh without exposing privileged credentials.
- Added a production repository selected only in production mode. It loads organizations, workflows, and submissions through authenticated Data API queries protected by RLS; forged organization IDs are rejected locally before a query, unsupported production capabilities fail explicitly, and no production failure falls back to `localStorage`.
- Enabled authenticated active members to enter the protected dashboard with production data while preserving the default demo adapter and data isolation.
- Added `/invite` with Hebrew RTL login, loading, invalid/expired/revoked/wrong-identity-safe errors, fragment-only raw invitation token handling, URL scrubbing, authenticated RPC acceptance, idempotent database semantics, confirmation, and protected-dashboard navigation.
- Added a local Edge Function package for operator invitation creation. It validates method, exact browser origin, bearer authentication, normalized email, and organization UUID; ignores browser-supplied actor/role values; returns non-sensitive errors; and exposes the raw token only in the one-time successful creation response.
- Prepared migration `20261103170000_authorized_invitation_api.sql`. Its service-role-only wrapper re-verifies the authenticated actor against `private.platform_operators`, reuses the existing transactional invitation function, and uses a transaction advisory lock to enforce a concurrency-safe limit of 10 created invitations per operator per 15 minutes.
- Added focused unit/HTTP-boundary tests and pgTAP cases for direct-browser denial, trusted wrapper success, and rate limiting.
- No migration, Edge Function, Auth setting, secret, user, organization, email delivery, DNS, Cloudflare, RAVO resource, or other cloud resource was changed.

## 2026-11-04 container runtime diagnostic checkpoint

- Performed one read-only Hyper-V/Podman diagnostic pass and one bounded recovery path. No VM, VHDX, network switch, Windows network configuration, cloud resource, or non-disposable database was deleted or overwritten.
- Confirmed `formangle-dev` uses the Hyper-V provider in Podman 5.8.3. Its adapter is connected to the healthy Hyper-V `Default Switch`, whose host interface is up at `172.29.128.1/20`; Hyper-V logged successful guest boots and virtual-network attachment.
- Established that the initial `unknown state: "enabled but offline"` failure is Podman 5.8.3 state handling, not DHCP. A Hyper-V `Saved` VM is reported as `Enabled but offline`, while the Podman 5.8.3 Hyper-V provider converts only `Enabled`, `Disabled`, and `Starting` states. Podman therefore aborted before starting `gvproxy` or the SSH forwarder.
- Used one evidence-driven recovery path without `Save-VM`, forced power-off, saved-state deletion, or disk changes: resume the saved VM, request a clean integration-service shutdown, and invoke `podman machine start` once from `Off` so Podman could own its ready-vsock and forwarding setup.
- The VM booted and Podman received the guest `ready ack`. `gvproxy` 0.8.9 opened the named pipes and Hyper-V vsock, proving that Hyper-V boot and the ready-vsock path work. Podman reassigned the stale/conflicting host SSH port from `63324` to `62633` in its local machine configuration.
- The recovery then failed at the guest user-mode network/SSH layer. The `gvproxy` log repeatedly sent ARP from `192.168.127.1` for the expected guest endpoint `192.168.127.2`, received zero bytes from the VM, waited for `sshd`, and finally the SSH handshake was reset by the remote side. Podman then stopped `gvproxy` and returned exit 125.
- The remaining fault is inside the existing guest's Podman vsock network path (the guest `vsock-network`/NetworkManager endpoint, with `sshd` consequently unreachable), not the Hyper-V Default Switch, host DHCP, browser SSH key configuration, or Supabase. Direct Hyper-V boots cannot repair this because Podman must establish the vsock listener and forwarding itself.
- Stopped after the single justified recovery path. WSL is not installed. The recommended next runtime is a supported WSL2-based Podman machine, preserving the existing Hyper-V VM and VHDX; WSL2 installation and creation of that alternative environment require separate founder approval because they modify Windows system features.
- Migration `20261103170000_authorized_invitation_api.sql`, the complete pgTAP/RLS suite, database lint, and genuine local Auth JWT/Edge Function HTTP tests remain unexecuted. No claim of migration or Edge Function cloud readiness was made.

## Completed work

- Read and classified the full Production V1 assignment and business model.
- Created branch `production-v1` from `b2e6670528eebbdae706146fc2acc44702005399` while preserving the pre-existing working tree.
- Audited routes, schemas, repository/local persistence, workflow lifecycle, renderer, engines, actions, media, Design Studio, dashboards, integration readiness, security/privacy, tests, CI/deployment, accessibility, mobile, and RTL.
- Verified a capable local/static demo with reusable UI and engines, but no production identity, server trust boundary, shared persistence, RLS, transactional capacity, live provider execution, or operational control plane.
- Completed standard security scan `bf1b3f42-45b7-4169-a798-6a78dc3316e4` with complete recorded coverage and no reportable vulnerability in the current local-demo trust boundary. Production gaps are launch blockers.
- Reviewed current official Supabase guidance for RLS, Storage access, Auth invitations, Queues, Cron, backups, and pricing assumptions.
- Authored all nine requested documents with architecture, database, Auth/RLS, integration/automation, operations, migration, milestone, acceptance, and decision guidance.
- Created focused documentation commits without staging product-source or marketing changes.
- Added strict, credential-free organization/workflow configuration schemas, explicit provider resolution, server-side adapter/event contracts, and a repository selection seam that fails closed when no production adapter is configured.
- Validated the TypeScript checkpoint with 13 focused Vitest assertions and the full repository typecheck.
- Added and validated the local Supabase configuration, tenant schema, synthetic seed, RLS/authorization tests, generated database types, and guarded local database lifecycle script.
- Proved clean migration reproducibility with an isolated reset; verified two synthetic organizations, 12 RLS-enabled public tables, and the recorded migration version.
- Added a least-privilege, zero-cost GitHub Actions validation workflow using a standard public-repository runner, SHA-pinned actions, synthetic-only local Supabase, no credentials, no cache/artifacts, and guaranteed cleanup attempt.
- Fixed the local generated-type drift check to compare normalized content across Windows and Linux line endings; regenerated the canonical types and passed a live comparison against the isolated local schema.
- Added RockStack-managed owner invitations with 256-bit random single-use tokens, SHA-256-only durable token storage, normalized email and organization binding, expiry/revocation state, verified-identity checks, and transactional/idempotent owner membership creation.
- Kept invitation creation, revocation, and batch expiration service-role-only through narrow server RPCs; authenticated clients can call only the acceptance RPC, and the browser receives no service-role credential.
- Added append-only audit/outbox events for invitation creation, acceptance, expiration, and revocation without storing invitation email or raw token values in audit records.
- Added focused pgTAP negative-path coverage and a real two-connection concurrency integration test; no real email delivery, public signup, customer data, provider integration, or cloud mutation was enabled.

## Files changed by this milestone

- `docs/production/PROGRESS.md`
- `docs/production/01-CURRENT-STATE-AUDIT.md`
- `docs/production/02-PRODUCTION-ARCHITECTURE.md`
- `docs/production/03-DATABASE-SCHEMA.md`
- `docs/production/04-AUTH-AND-RLS.md`
- `docs/production/05-INTEGRATIONS-AND-AUTOMATIONS.md`
- `docs/production/06-SECURITY-AND-OPERATIONS.md`
- `docs/production/07-MIGRATION-PLAN.md`
- `docs/production/08-IMPLEMENTATION-ROADMAP.md`
- `docs/production/09-OPEN-DECISIONS.md`
- `src/production/configuration.ts`
- `src/production/configuration.test.ts`
- `src/production/contracts.ts`
- `src/production/database.generated.ts`
- `scripts/local-db.ps1`
- `supabase/config.toml`
- `supabase/migrations/20261102161823_tenant_foundation.sql`
- `supabase/tests/database/tenant_foundation.test.sql`
- `supabase/seed.sql`
- `supabase/.env.example`
- `supabase/.gitignore`
- `supabase/README.md`
- `.github/workflows/production-foundation.yml`
- `supabase/migrations/20261103083922_revoke_default_rls_helper_execution.sql`
- `supabase/migrations/20261103132648_secure_owner_invitations.sql`
- `supabase/tests/database/owner_invitations.test.sql`
- `supabase/integration-tests/owner_invitation_concurrency.sql`
- `.env.example`
- `package.json`
- `package-lock.json`
- `src/vite-env.d.ts`
- `src/production/runtime.ts`
- `src/production/runtime.test.ts`
- `src/auth/session.ts`
- `src/auth/session.test.ts`
- `src/auth/AuthProvider.tsx`
- `src/auth/ProductionRouteBoundary.tsx`
- `src/main.tsx`
- `src/App.tsx`

The approved invitation migration was applied only to the dedicated Formangle project. No live application bootstrap, DNS, public deployment, provider account, production credential, customer data, RAVO resource, Spend Cap, or paid service was changed.

## Tests performed

- `npm test` — passed: 23 test files, 230 tests.
- `npm run typecheck` — passed.
- `npm run build` — passed; Rollup emitted non-failing Zod annotation warnings.
- `npm audit --omit=dev --json` — passed: 0 known vulnerabilities reported; 66 production dependencies, 271 total dependencies.
- Secret/private-key and dangerous-sink searches — no live credential/private key or validated product-source injection sink identified.
- Codex Security scan — completed with 8/8 coverage surfaces and 0 reportable findings; results are tied to the original recorded revision/snapshot.
- `git diff --check -- docs/production` and required-content checks — passed.
- `npm test -- --run src/production/configuration.test.ts` — passed: 1 test file, 13 tests.
- `npm run typecheck` — passed after adding the production TypeScript boundary.
- Local runtime discovery — Windows 11 Pro and hardware hypervisor detected; WSL, Docker, and Podman were initially absent; Supabase CLI 3.0.0 was available through the local `npx` cache.
- Podman 5.8.3 installation — WinGet package hash verified and Authenticode signature valid for Red Hat, LLC; installation completed and is registered by WinGet.
- `podman machine init ... formangle-dev` — did not run successfully before Hyper-V activation (`HyperV namespace not found`); no Podman machine was created.
- `Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart` — completed successfully and reported `RestartNeeded: True`; the machine was not rebooted per user instruction.
- Post-reboot Hyper-V verification — `Microsoft-Hyper-V-All` enabled; `vmcompute` and `vmms` running; no additional reboot required.
- Local Supabase start — passed; no linked project; local PostgreSQL at `127.0.0.1:54322`; configured disabled services remained stopped by design.
- `supabase test db` — passed twice: 1 pgTAP file, 34 assertions, before and after a clean synthetic reset.
- Clean reset verification — migration `20261102161823`, 2 synthetic organizations, and 12 RLS-enabled public tables verified from PostgreSQL.
- `supabase db lint --schema public,private --level warning --fail-on error` — passed with no schema errors.
- `./scripts/local-db.ps1 -Action types` and `types-check` — passed against the validated local schema; generated types committed.
- Post-normalization live `./scripts/local-db.ps1 -Action types-check` — passed after normalizing both generated inputs across Windows/Linux line endings and regenerating the canonical file; no schema/type drift remained.
- `npm run typecheck` — passed after the live generated-type comparison.
- `npm test -- --run src/production/configuration.test.ts` — passed: 13 tests.
- `npm run typecheck` — passed, including generated database types.
- `npm test` — passed: 24 test files, 243 tests.
- `npm run build` — passed with exit code 0; only existing non-failing Rollup warnings from Zod annotations.
- Supabase `stop` — completed with `project_id_filter=formangle-development` and backup enabled; `formangle-dev` then stopped successfully.
- CI workflow YAML/static policy — passed locally with installed PyYAML: safe triggers, `contents: read`, standard `ubuntu-24.04`, 30-minute timeout, commit-SHA-pinned actions, no secret references, no remote Supabase flags, and cleanup present.
- CI synthetic/credential guards — passed locally: no project link or `supabase/.env`, synthetic seed marker present, no committed credential/private-key pattern, generated types already normalized, and workflow whitespace clean.
- Official action tag refs verified read-only: `actions/checkout@v7.0.0` → `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`; `actions/setup-node@v7.1.0` → `949feb2413d6458794dcd2491c4babbbce0c15c1`.
- Verified the dedicated Supabase Cloud project by exact reference `ppgdbqhwbzlgzwsjmkor`: display name `FORMANGLE`, organization `lial0610@gmail.com's Org` (Pro), region `eu-west-1`, PostgreSQL 17, and healthy status. The separate RAVO project was not linked, queried, or modified.
- Linked the repository to `ppgdbqhwbzlgzwsjmkor`. Supabase CLI passwordless database connections repeatedly stalled while initializing the temporary login role; no partial migration or table creation occurred during those attempts.
- Applied the reviewed tenant foundation through Supabase `apply_migration`, then reconciled the generated migration ledger version from `20261103083258` to the committed version `20261102161823` using an exact-name/version guard. Remote history now matches the committed migration.
- Cloud schema validation passed: 12 `public` tables, 2 `private` tables, 14 RLS policies, 20 non-internal triggers, 4 private helper functions, zero RLS-disabled application tables, and zero persisted application rows.
- Focused cloud RLS validation passed inside a rolled-back transaction: an owner saw and updated only its own organization, cross-tenant reads and settings updates returned zero rows, `anon` lacked submission read and workflow update privileges, and the transaction left zero test users and organizations.
- Applied `20261103083922_revoke_default_rls_helper_execution` after separate founder approval. `anon`, `authenticated`, and `service_role` no longer have EXECUTE on the hosted `public.rls_auto_enable()` SECURITY DEFINER helper; `postgres` retains execution and the event trigger remains enabled. The related advisor warnings are cleared.
- Supabase security advisors now report only two expected INFO findings for the policy-free private tables; RLS is enabled and all API-role table grants are revoked, so they intentionally fail closed.
- Generated cloud TypeScript types were compared with `src/production/database.generated.ts`. The schema surface matches, but textual output differs because the cloud generator emits the PostgREST 14.18 format (`__InternalSupabase`, `Json`) while the committed local generator emits `ComputedFields` and `NonNullable<Json>`. No source-of-truth file was replaced for generator-only drift.
- Added pinned `@supabase/supabase-js` 2.118.0 browser integration with lazy loading, verified claims via `auth.getClaims()`, active membership lookup through RLS, auth-state subscription, local-session logout, and invite-only/unauthorized states. No signup or outbound email action exists.
- Pinned production runtime configuration to exact project reference `ppgdbqhwbzlgzwsjmkor`, its exact HTTPS hostname, and `sb_publishable_` keys only. RAVO URLs and secret/service-role/legacy JWT browser keys fail validation.
- Protected `/app` with a fail-closed production boundary. Authenticated members still cannot enter the local demo UI in production mode until a real production repository is configured; default demo behavior remains unchanged.
- Lazy-loaded the Supabase SDK so the demo entry chunk remains 228.20 kB instead of including the 306.38 kB auth/database SDK chunk at startup.
- Focused Milestone 1 tests passed: 2 files and 9 assertions covering demo fallback, exact project isolation, browser-key rejection, verified-claims failure modes, suspended membership denial, and active membership authorization.
- Full regression passed after the auth boundary: 26 test files, 252 tests; TypeScript typecheck passed; production build passed with only the existing non-failing Zod annotation warnings; `npm audit --omit=dev` reported 0 vulnerabilities across 75 production dependencies.
- Clean local reset applied all three committed migrations, including `20261103132648_secure_owner_invitations`; the earlier hosted-helper revoke migration was made idempotent when the cloud-only helper is absent locally.
- `supabase test db supabase/tests/database` — passed: 2 pgTAP files, 64 assertions, covering valid acceptance, expiry, replay, revocation, wrong email, unverified identity, forged organization, direct cross-tenant access denial, audit/outbox behavior, and rollback after a synthetic audit failure.
- `supabase/integration-tests/owner_invitation_concurrency.sql` — passed against a freshly reset local stack using two simultaneous PostgreSQL connections: one membership creation, one idempotent replay, one membership row, and one acceptance audit event.
- `supabase db lint --schema private,public --level warning --fail-on error` — passed with no schema errors.
- `./scripts/local-db.ps1 -Action types` and `types-check` — passed; generated public RPC types match the local schema.
- Milestone 1 post-invitation regression — `npm test`: 26 files and 252 tests passed; `npm run build`: passed with only the existing Zod annotation warnings; `npm audit --omit=dev --json`: 0 known vulnerabilities across 75 production dependencies.
- Cloud preflight re-verified exact project `ppgdbqhwbzlgzwsjmkor` as `FORMANGLE`, `eu-west-1`, healthy PostgreSQL 17.11, with only the two expected predecessor migrations and zero application rows before applying the approved migration.
- Applied `20261103132648_secure_owner_invitations` through Supabase migration tooling. The tool-generated ledger version was reconciled to the committed version under an exact name/version guard; final remote history matches the repository.
- Cloud invitation validation passed inside an explicit rolled-back transaction: valid acceptance, idempotent replay, revoked and expired invitations, wrong email, unverified identity, forged organization ID, audit/outbox counts, and full membership/invitation rollback after a synthetic audit failure.
- Post-validation cloud state passed: zero organizations, memberships, invitations, audit events, and outbox events; `anon` and `authenticated` cannot read the private invitation table; only `authenticated` can accept; only `service_role` can create/revoke/expire.
- Post-DDL security advisors report no warning/error findings. The three expected INFO findings are policy-free private tables with RLS enabled and all direct API-role table access revoked. Performance advisors additionally report four invitation actor foreign keys without covering indexes; these are recorded for a separately reviewed optimization migration rather than changed silently.

- Local API/repository focused tests — passed: 5 relevant test files, including authenticated operator request handling, actor/role impersonation resistance, exact-origin rejection, safe errors, RLS organization selection, forged tenant rejection, no demo fallback, session authorization, runtime project isolation, and fragment parsing.
- `npm test` after the local API/repository checkpoint — passed: 29 test files, 262 tests.
- `npm run typecheck` — passed.
- `npm run build` — passed; only the existing non-failing Zod annotation warnings were emitted.
- `npm audit --omit=dev --json` — passed: 0 known vulnerabilities across 75 production dependencies and 280 total dependencies.

Not run: an authorized hosted invitation flow with a real production Auth identity. This was intentionally omitted because the complete genuine-JWT flow passed against the isolated local Supabase stack and creating production test identities/operators/tenants would persist unnecessary data. Also not run: a new hosted GitHub Actions workflow (no push), hosted/staging backup restore, browser E2E against the hosted function, provider callbacks, load tests, real invitation email delivery, or application deployment. RAVO was not accessed or changed.

## Decisions made

- Preserve React/Vite, the renderer, pure engines, UI, and asynchronous repository seam; migrate incrementally rather than rewrite.
- Use isolated Supabase/PostgreSQL projects per environment, a shared multi-tenant model, mandatory RLS, private Storage, and narrow trusted server commands.
- Use a modular monolith plus durable queues/outbox; avoid per-customer codebases, microservices, Kubernetes, and broad anonymous database writes.
- Treat server validation, pricing, lifecycle, capacity, payments, and side effects as authoritative; client computation remains preview UX only.
- Keep `LocalStorageRepository` as a protected demo/offline adapter through migration and do not dual-write silently.
- Defer real providers, general automation authoring, customer files, billing, and super-admin UI until the first vertical slice is secure and observable.
- Do not reuse RAVO or create paid resources without explicit approval.
- Founder decision: defer backup/restore testing and staging recovery evidence to Production Readiness, before any real customer data or production launch. This remains a mandatory production requirement but does not block Milestone 0 closure or Milestone 1 development, and it does not authorize cloud infrastructure or cost.

## Commits

- `35cd560` — `docs: start production v1 audit tracking`
- `12fb330` — `docs: define production architecture and controls`
- `d34d503` — `docs: add production migration roadmap and handoff`
- `2f75733` — `feat: define production configuration boundaries`
- `aa68d54` — `docs: record milestone zero checkpoint`
- `2a0b8e9` — `docs: record local runtime restart blocker`
- `a8cde74` — `feat: validate local tenant database foundation`
- `6d49487` — `chore: normalize generated database types`
- `c6f6fdf` — `docs: complete local database validation checkpoint`
- `1648a9b` — `ci: validate production database foundation`
- `4ce944e` — `docs: record milestone zero ci evidence`
- `d155487` — `fix: make database type drift check cross-platform`
- `9d05215` — `fix: restrict hosted RLS helper execution`
- `a9b66d9` — `feat: add secure workforce auth boundary`
- `846c96f` — `feat: add secure owner invitation foundation`
- `ab626eb` — `docs: record container runtime diagnosis`
- `c321b66` — `fix: disambiguate invitation authorization actor`
- `f172c5f` — `feat: complete milestone two production workflows`

## Outstanding follow-up evidence and risks

- Local database validation is complete. The isolated stack uses the supported WSL2 machine `formangle-wsl-dev`; its disposable validation copy is removed after final cleanup. The original Hyper-V machine and VHDX remain preserved for forensic/recovery purposes and are not the active runtime.
- The Podman 5.8 OCI artifact pull stalled on Windows. Initialization used the official Hyper-V image through the supported `--image` option only after manifest size and SHA-256 verification; the failed VM disk remains in a recoverable temporary quarantine and contains no Formangle database.
- The CI workflow is committed and locally validated but has no hosted run result because pushing or manually dispatching remote Actions was not authorized. Local YAML/policy checks do not prove GitHub runner behavior; obtain the first hosted result after explicit push approval.
- Backup/restore testing and staging recovery evidence are intentionally deferred to Production Readiness. They remain mandatory before real customer data or production launch and must not be silently dropped from the launch gate.
- Production decisions D-01 through D-06, D-11 through D-13, D-16, and D-17 remain unresolved and still block remote environment setup and production commitments.
- The cloud database foundation, permission hardening, and secure owner-invitation migration are applied and the application tables remain empty.
- Supabase CLI remote database commands are currently blocked by the hosted temporary-login-role path stalling at `Initialising login role...`; Supabase MCP/API operations remain authenticated and functional. Do not retry migrations blindly; inspect remote history first.
- Cloud and committed TypeScript types are schema-equivalent but not byte-identical because different generator formats are in use. Standardize the generator/version before replacing the committed type source.
- Milestone 1 invitation provisioning, transactional acceptance, production repository boundary, and authenticated operator Edge Function are implemented locally; the database migration and Edge Function are active in Cloud. It still does not provide real email delivery or session revocation orchestration, and the application has not been deployed with the production runtime enabled.
- Performance advisors identify four unindexed actor foreign keys on `private.owner_invitations`. This is INFO-level and does not affect authorization correctness; address it through a separately reviewed migration before invitation volume or user-deletion operations become material.
- Substantial pre-existing modified/untracked product and marketing work remains untouched and unstaged by this task.
- The default demo must not be represented as secure cross-device/multi-tenant production software: it intentionally retains localStorage persistence and simulated capacity. Production mode now blocks `/app` behind verified identity and membership and still refuses to expose the demo UI after authentication.
- The hosted smoke test covers unauthenticated rejection only. Authorized/unauthorized operators, tenant isolation, invitation acceptance/replay, rate limiting, and invalid credentials were validated with genuine Auth JWTs in the isolated local stack rather than by persisting synthetic production identities.
- Supabase plan/region/features and provider commercial/legal suitability require approval-time verification. No paid infrastructure was provisioned.

## Exact next steps

1. Obtain separate approval before enabling the production runtime in a deployed application or creating the first real platform operator and tenant.
2. Prepare a separate low-risk optimization migration for the invitation actor foreign-key indexes, then obtain explicit approval before applying it to Cloud.
3. Add callback, email delivery, and expiration/recovery UX only after provider, legal, operational, and cost decisions are approved; continue to prohibit public self-registration.
4. Request separate explicit approval before any push. After authorization, push the focused commits and obtain the first hosted run of `.github/workflows/production-foundation.yml`.
5. At Production Readiness—and before any real customer data or launch—record successful backup/restore plus staging recovery evidence.

## Continuation prompt

> Continue Formangle Production V1 on branch `production-v1`. The dedicated cloud project is `FORMANGLE` (`ppgdbqhwbzlgzwsjmkor`, `eu-west-1`); all four migrations through `20261103170000_authorized_invitation_api` are applied with no persisted application data, and `operator-invitations` version 1 is active with gateway JWT verification enabled and exact production-origin configuration. The complete genuine-JWT security flow passed locally; hosted smoke proved unauthenticated rejection without creating production identities. Use `formangle-wsl-dev` for isolated local validation and preserve the original failed Hyper-V VM/VHDX. Treat invitation indexes, real operators/tenants, email/provider work, application deployment, push, and any cost as separate approval gates. Preserve unrelated advisor/marketing work and never touch RAVO.
