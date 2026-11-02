# Formangle Production V1 Progress

Last updated: 2026-11-02 (Asia/Jerusalem)

## Current milestone

Milestone 0 — Secure Production Foundation is closed under the founder-approved completion criteria. The local database checkpoint and post-normalization live `types-check` passed, and a zero-cost, read-only GitHub Actions gate is prepared to reproduce migrations, pgTAP/RLS, database lint, generated-type drift, TypeScript, tests, and build on a fresh standard runner. Local workflow syntax and security-policy validation passed. The workflow has not run on GitHub because no push was authorized; this is recorded as hosted follow-up evidence rather than a Milestone 0 blocker. Milestone 1 has not started.

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

No live application bootstrap, DNS, deployment, remote Supabase project, provider account, production credential, customer data, RAVO resource, or paid service was changed.

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

Not run: the new hosted GitHub Actions workflow (no push), hosted/staging backup restore, Auth/PostgREST integration, browser E2E, provider callbacks, load tests, deployment, or production checks. Local workflow validation is not represented as a hosted GitHub Actions result. No remote project was used.

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

## Outstanding follow-up evidence and risks

- Local database validation is complete. The isolated Supabase stack and `formangle-dev` machine were stopped after the successful live type-drift check.
- The Podman 5.8 OCI artifact pull stalled on Windows. Initialization used the official Hyper-V image through the supported `--image` option only after manifest size and SHA-256 verification; the failed VM disk remains in a recoverable temporary quarantine and contains no Formangle database.
- The CI workflow is committed and locally validated but has no hosted run result because pushing or manually dispatching remote Actions was not authorized. Local YAML/policy checks do not prove GitHub runner behavior; obtain the first hosted result after explicit push approval.
- Backup/restore testing and staging recovery evidence are intentionally deferred to Production Readiness. They remain mandatory before real customer data or production launch and must not be silently dropped from the launch gate.
- Production decisions D-01 through D-06, D-11 through D-13, D-16, and D-17 remain unresolved and still block remote environment setup and production commitments.
- Substantial pre-existing modified/untracked product and marketing work remains untouched and unstaged by this task.
- The demo must not be represented as secure cross-device/multi-tenant production software: `/app` lacks a real identity boundary, request IDs act as bearer capabilities, persistence is local, and capacity is non-transactional.
- The security review was sequential because delegated audit workers were unavailable; no live environment/runtime validation was authorized.
- Supabase plan/region/features and provider commercial/legal suitability require approval-time verification. No paid infrastructure was provisioned.

## Exact next steps

1. Request explicit approval before any push. After authorization, push the focused Milestone 0 commits and obtain the first hosted run of `.github/workflows/production-foundation.yml`; no Supabase secret or cloud project is required.
2. Do not begin Milestone 1 until explicitly approved. Its recommended first implementation task is the invited-owner authentication and organization-membership boundary, including anonymous, forged-organization, and cross-tenant negative authorization tests.
3. At Production Readiness—and before any real customer data or launch—provision only approved infrastructure and record successful backup/restore plus staging recovery evidence.

## Continuation prompt

> Continue Formangle Production V1 on branch `production-v1`. Milestone 0 is closed under the founder-approved criteria: local migrations/RLS, live generated-type drift, TypeScript/tests/build, and local CI policy validation passed. Preserve unrelated advisor/marketing work. Before any push, request explicit approval; after authorization, obtain the first hosted workflow result. Backup/restore and staging recovery evidence remain mandatory at Production Readiness before real customer data or launch, but do not block Milestone 1 development. Do not create a Supabase cloud project, deploy, activate providers, touch RAVO, incur costs, or begin Milestone 1 without explicit approval.
