# Formangle Production V1 Progress

Last updated: 2026-11-02 (Asia/Jerusalem)

## Current milestone

Milestone 0 — Secure Production Foundation implementation is locally complete, but formal closure is pending hosted evidence. The local database checkpoint passed, and a zero-cost, read-only GitHub Actions gate now reproduces migrations, pgTAP/RLS, database lint, generated-type drift, TypeScript, tests, and build on a fresh standard runner. Local static workflow/policy checks passed. The workflow has not run on GitHub because push is prohibited, and the post-normalization live `types-check` remains pending because Windows elevation did not restart the stopped `formangle-dev` machine. Milestone 1 has not started.

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
- `./scripts/local-db.ps1 -Action types` and `types-check` — passed against the validated local schema; generated types committed. The later whitespace-normalization change was parser/typecheck validated but was not rerun against the stopped VM.
- `npm test -- --run src/production/configuration.test.ts` — passed: 13 tests.
- `npm run typecheck` — passed, including generated database types.
- `npm test` — passed: 24 test files, 243 tests.
- `npm run build` — passed with exit code 0; only existing non-failing Rollup warnings from Zod annotations.
- Supabase `stop` — completed with `project_id_filter=formangle-development` and backup enabled; `formangle-dev` then stopped successfully.
- CI workflow YAML/static policy — passed locally with installed PyYAML: safe triggers, `contents: read`, standard `ubuntu-24.04`, 30-minute timeout, commit-SHA-pinned actions, no secret references, no remote Supabase flags, and cleanup present.
- CI synthetic/credential guards — passed locally: no project link or `supabase/.env`, synthetic seed marker present, no committed credential/private-key pattern, generated types already normalized, and workflow whitespace clean.
- Official action tag refs verified read-only: `actions/checkout@v7.0.0` → `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`; `actions/setup-node@v7.1.0` → `949feb2413d6458794dcd2491c4babbbce0c15c1`.

Not run: the new hosted GitHub Actions workflow (no push), post-normalization live `types-check` (Podman machine remained stopped after elevation attempts), hosted/staging backup restore, Auth/PostgREST integration, browser E2E, provider callbacks, load tests, deployment, or production checks. No remote project was used.

## Decisions made

- Preserve React/Vite, the renderer, pure engines, UI, and asynchronous repository seam; migrate incrementally rather than rewrite.
- Use isolated Supabase/PostgreSQL projects per environment, a shared multi-tenant model, mandatory RLS, private Storage, and narrow trusted server commands.
- Use a modular monolith plus durable queues/outbox; avoid per-customer codebases, microservices, Kubernetes, and broad anonymous database writes.
- Treat server validation, pricing, lifecycle, capacity, payments, and side effects as authoritative; client computation remains preview UX only.
- Keep `LocalStorageRepository` as a protected demo/offline adapter through migration and do not dual-write silently.
- Defer real providers, general automation authoring, customer files, billing, and super-admin UI until the first vertical slice is secure and observable.
- Do not reuse RAVO or create paid resources without explicit approval.

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

## Outstanding blockers and risks

- Local database validation is no longer blocked. Starting/stopping the Hyper-V Podman machine requires an interactive elevated Windows action on this workstation; elevation did not complete during the latest attempts, so the machine remains stopped and the normalized live `types-check` is not yet recorded.
- The Podman 5.8 OCI artifact pull stalled on Windows. Initialization used the official Hyper-V image through the supported `--image` option only after manifest size and SHA-256 verification; the failed VM disk remains in a recoverable temporary quarantine and contains no Formangle database.
- The post-normalization `types-check` was not rerun because the machine could not be restarted through the elevation flow; PowerShell parsing, normalization checks, and TypeScript typecheck passed. Run `types-check` at the start of the next successful local database session.
- The CI workflow is committed but has no hosted run result because pushing or manually dispatching remote Actions was not authorized. Local YAML/policy checks do not prove GitHub runner behavior.
- Production decisions D-01 through D-06, D-11 through D-13, D-16, and D-17 remain unresolved and still block remote environment setup and production commitments.
- Substantial pre-existing modified/untracked product and marketing work remains untouched and unstaged by this task.
- The demo must not be represented as secure cross-device/multi-tenant production software: `/app` lacks a real identity boundary, request IDs act as bearer capabilities, persistence is local, and capacity is non-transactional.
- The security review was sequential because delegated audit workers were unavailable; no live environment/runtime validation was authorized.
- Supabase plan/region/features and provider commercial/legal suitability require approval-time verification. No paid infrastructure was provisioned.

## Exact next steps

1. With the user present for UAC, start `formangle-dev`, start the local stack, rerun `./scripts/local-db.ps1 -Action types-check`, and stop both afterward.
2. After explicit push authorization, obtain one green hosted run of `.github/workflows/production-foundation.yml`; no Supabase secret or cloud project is required.
3. Complete named ownership and approved staging backup/restore evidence before declaring the full Milestone 0 production-readiness milestone closed.
4. After Milestone 0 closure and explicit approval, begin Milestone 1 with the invited-owner authentication/membership boundary and cross-tenant authorization tests.

## Continuation prompt

> Continue Formangle Production V1 Milestone 0 closure on branch `production-v1`. Read only this tracker and inspect `git status`; preserve unrelated advisor/marketing work. Local database validation passed and zero-cost CI is committed in `1648a9b`. The remaining evidence is a live post-normalization `types-check`, one authorized green hosted workflow run, named ownership, and approved staging backup/restore evidence. The `formangle-dev` machine is stopped and requires interactive UAC to start. Do not create a Supabase cloud project, push, deploy, activate providers, touch RAVO, incur costs, or begin Milestone 1 without explicit approval.
