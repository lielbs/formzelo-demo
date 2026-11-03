# Formangle Production V1 Progress

Last updated: 2026-11-03 (Asia/Jerusalem)

## Current milestone

Milestone 0 — Secure Production Foundation is deployed to and validated against the dedicated Formangle Supabase Cloud project. Migrations `20261102161823_tenant_foundation` and `20261103083922_revoke_default_rls_helper_execution` are recorded remotely, all 14 application tables have RLS enabled, the focused cloud cross-tenant test passed with a full rollback, and no application or test data remains. The hosted `public.rls_auto_enable()` event trigger remains enabled while API-role EXECUTE privileges are revoked and the related security-advisor warnings are cleared. Milestone 1 has begun with a fail-closed browser session and organization-membership boundary; invitation provisioning and the production repository remain unimplemented.

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

The dedicated Formangle Supabase database was changed only by the reviewed tenant-foundation migration. No live application bootstrap, DNS, public deployment, provider account, production credential, customer data, RAVO resource, Spend Cap, or paid service was changed.

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

Not run: the new hosted GitHub Actions workflow (no push), hosted/staging backup restore, end-to-end Auth/PostgREST integration, browser E2E, provider callbacks, load tests, or public deployment. Local workflow validation is not represented as a hosted GitHub Actions result. Remote validation was limited to the verified Formangle project and the checks recorded above.

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

## Outstanding follow-up evidence and risks

- Local database validation is complete. The isolated Supabase stack and `formangle-dev` machine were stopped after the successful live type-drift check.
- The Podman 5.8 OCI artifact pull stalled on Windows. Initialization used the official Hyper-V image through the supported `--image` option only after manifest size and SHA-256 verification; the failed VM disk remains in a recoverable temporary quarantine and contains no Formangle database.
- The CI workflow is committed and locally validated but has no hosted run result because pushing or manually dispatching remote Actions was not authorized. Local YAML/policy checks do not prove GitHub runner behavior; obtain the first hosted result after explicit push approval.
- Backup/restore testing and staging recovery evidence are intentionally deferred to Production Readiness. They remain mandatory before real customer data or production launch and must not be silently dropped from the launch gate.
- Production decisions D-01 through D-06, D-11 through D-13, D-16, and D-17 remain unresolved and still block remote environment setup and production commitments.
- The cloud database foundation and permission hardening are applied and the application tables remain empty.
- Supabase CLI remote database commands are currently blocked by the hosted temporary-login-role path stalling at `Initialising login role...`; Supabase MCP/API operations remain authenticated and functional. Do not retry migrations blindly; inspect remote history first.
- Cloud and committed TypeScript types are schema-equivalent but not byte-identical because different generator formats are in use. Standardize the generator/version before replacing the committed type source.
- Milestone 1 currently establishes browser identity/session and membership gating only. It does not yet provision invitations, accept owner invitations transactionally, revoke server sessions, or provide a production repository/API.
- Substantial pre-existing modified/untracked product and marketing work remains untouched and unstaged by this task.
- The default demo must not be represented as secure cross-device/multi-tenant production software: it intentionally retains localStorage persistence and simulated capacity. Production mode now blocks `/app` behind verified identity and membership and still refuses to expose the demo UI after authentication.
- The security review was sequential because delegated audit workers were unavailable; no live environment/runtime validation was authorized.
- Supabase plan/region/features and provider commercial/legal suitability require approval-time verification. No paid infrastructure was provisioned.

## Exact next steps

1. Implement the server-only owner invitation contract and versioned database migration: hashed single-use invitation token, normalized email, expiry/revocation/acceptance state, transactional membership creation, audit/outbox records, and negative reuse/wrong-email/cross-tenant tests. Do not enable real email delivery.
2. Implement the production repository/API boundary so an authenticated active member can enter `/app` without exposing localStorage demo data or privileged browser credentials.
3. Add callback and expiration/recovery UX only after the server invitation contract is validated; continue to prohibit public self-registration.
4. Request explicit approval before any push. After authorization, push the focused commits and obtain the first hosted run of `.github/workflows/production-foundation.yml`.
5. At Production Readiness—and before any real customer data or launch—record successful backup/restore plus staging recovery evidence.

## Continuation prompt

> Continue Formangle Production V1 on branch `production-v1`. The dedicated cloud project is `FORMANGLE` (`ppgdbqhwbzlgzwsjmkor`, `eu-west-1`); migrations `20261102161823_tenant_foundation` and `20261103083922_revoke_default_rls_helper_execution` are applied and verified with no persisted application data. Milestone 1 now has a pinned, lazy-loaded Supabase browser client, exact-project/publishable-key validation, verified claims, active-membership gating, local-session logout, and a fail-closed `/app` boundary that never exposes demo localStorage in production mode. Next implement the server-only single-use owner invitation contract and its negative tests without enabling real email. Preserve unrelated advisor/marketing work. Do not push, deploy, enable providers, change Spend Cap, touch RAVO, or incur cost without explicit approval.
