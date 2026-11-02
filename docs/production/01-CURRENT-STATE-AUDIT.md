# Current-State Audit

Status: completed against the `production-v1` working tree on 2026-11-02.
Baseline commit: `b2e6670528eebbdae706146fc2acc44702005399`.
Audience: RockStack product owner and the engineers implementing Production V1.

## Executive summary

Formangle is a unusually complete local product demo, not a production application. Its strongest asset is the domain layer: one schema-driven renderer supports public and case-based workflows, immutable published versions, validation, conditions, pricing, booking requests, lifecycle transitions, customer actions, brand inheritance, and analytics. The UI is not the migration problem and should be preserved.

The production boundary is absent by design. There is no authentication, server, shared database, enforceable tenant authorization, durable cross-device storage, transactional capacity control, provider credential store, real integration execution, or operational audit trail. `LocalStorageRepository` is separated behind an asynchronous interface, which creates a valuable migration seam, but the contract currently mixes owner, public, and administrative authority and cannot simply be mapped one-for-one to public database calls.

Production V1 should therefore be an incremental backend migration, not a rewrite: keep the React application and pure engines, add Supabase Auth/PostgreSQL/Storage, move authoritative mutations behind database functions or narrow server endpoints, enforce tenant isolation with RLS, and introduce a durable event/outbox worker for integrations.

Severity below describes risk if the current behavior were used for real customer data. Several high-severity items are intentionally labelled limitations in the demo and are not claims that the static demo leaks one visitor's data to another.

## Verified system map

| Area | Verified behavior | Evidence |
|---|---|---|
| Runtime | React 18, TypeScript 5.6, Vite 6, Tailwind 3; browser-only SPA | `package.json`; `src/main.tsx:15-26` |
| Routes | Marketing pages, `/f/:slug`, and unguarded `/app/**` owner routes | `src/App.tsx:41-66` |
| State | One `LocalStorageRepository` instance supplies all pages; organization switching is local state | `src/data/store.tsx:19-20,56-69` |
| Storage | Per-organization JSON keys plus a global metadata/slug index and asset keys | `src/data/localRepository.ts:4-15,65-72` |
| Validation | Zod validates persisted entities; field and consent checks run again in the repository | `src/domain/schema.ts:1-8`; `src/data/localRepository.ts:481-516` |
| Workflow lifecycle | Mutable draft; each publish creates a cloned, immutable config/design snapshot | `src/domain/schema.ts:318-350`; `src/data/localRepository.ts:346-386` |
| Public flow | Slug resolves the published version; `?r=<runId>` resolves a personal run and its frozen version | `src/pages/PublicFlow.tsx:56-75`; `src/data/localRepository.ts:460-478` |
| Pricing | Pure declarative calculation; hidden fields do not charge; repository recomputes totals | `src/engine/pricing.ts:49-62`; `src/data/localRepository.ts:515-516` |
| Booking/capacity | Correct local calculations, explicitly not cross-device or transactional | `src/engine/booking.ts:1-9,43-50`; `src/engine/capacity.ts` |
| Actions | Immutable terms, single response, cancellation/expiry rules, event history | `src/domain/schema.ts:496-543`; `src/engine/actions.ts:61-114` |
| Brand/media | Workspace brand kit, frozen resolved theme, local downscaled images and size limits | `src/domain/theme.ts:246-296`; `src/data/localRepository.ts:724-807` |
| Integrations | Provider catalog and adapter contract only; adapter is always simulated | `src/integrations/payments.ts:1-9,75-99` |
| Deployment | Tests and build on `main`, then GitHub Pages deployment to the custom-domain root | `.github/workflows/pages.yml:3-50` |

## Findings by severity

### Critical production blockers

#### C1. No production identity or authorization boundary

Verified: every owner route is reachable without an auth guard, memberships are explicitly simulated, and changing the active organization requires only a local repository call (`src/App.tsx:54-64`; `src/domain/schema.ts:282-292`; `src/data/store.tsx:56-69`).

Impact in production: any browser could invoke owner operations, switch tenants, publish workflows, read submissions, or change statuses. Per-organization method parameters are organization selectors, not authorization.

Recommendation: require Supabase Auth, store memberships server-side, enforce every tenant row with RLS, and keep public/customer operations on separate capability-scoped endpoints. Do not treat hidden UI controls as authorization.

#### C2. No shared durable system of record

Verified: all workflows, submissions, customer contact details, internal notes, actions, and assets live in browser `localStorage` (`src/data/localRepository.ts:4-15`; `src/domain/schema.ts:545-558`). The UI itself warns that data does not synchronize across devices (`src/components/AppLayout.tsx:134-137`).

Impact: the first required commercial journey—customer submits on another device and the owner sees it—is impossible. Browser clearing, quota pressure, corruption recovery, or device loss can destroy or reset data. There is no authoritative backup.

Recommendation: PostgreSQL becomes authoritative; the browser caches only session/UI state. Preserve local repositories only for demo fixtures and offline tests.

#### C3. Authoritative rules execute in an untrusted client

Verified: validation and price recomputation are correctly centralized in `LocalStorageRepository`, but that repository runs in the customer's browser (`src/data/store.tsx:19-20`; `src/data/localRepository.ts:481-516`).

Impact: in a real service, a modified client could bypass validation, alter prices, forge lifecycle states, or avoid usage limits. Copying the current repository to Supabase client queries would preserve this defect.

Recommendation: share schemas and pure calculations where practical, but execute authoritative submission validation, pricing, publication, lifecycle transitions, and payment state changes in trusted server/database transactions.

### High

#### H1. Personal request links use a raw run identifier as the customer capability

Verified: `?r=` is read directly from the URL and `getPublicRun(slug, runId)` returns the matching run/version; customer actions, resubmission, and cancellation use the same pair (`src/pages/PublicFlow.tsx:57-70,120-159,206-219`; `src/data/localRepository.ts:471-478,704-719,859-884`). There is no expiry, revocation, token hashing, or intended-recipient check.

Current-demo qualifier: the referenced run normally exists only in the same browser, so this is primarily a production design blocker today.

Recommendation: issue at least 128 bits of random token material, store only a hash, scope it to one run and allowed capabilities, set expiry and revocation, rotate on suspected disclosure, and keep the internal run UUID out of the capability itself.

#### H2. Booking, option capacity, intake limits, and reference generation are race-prone

Verified: availability is calculated from a browser-local snapshot and `mutate` is a synchronous read-modify-write without locking (`src/engine/booking.ts:43-50,69-110`; `src/data/localRepository.ts:197-205,481-516`). Human references are computed as max-plus-one (`src/engine/runs.ts:111-119`).

Impact: concurrent devices can overbook, exceed quotas, accept duplicates, or generate conflicting human references.

Recommendation: enforce capacity and intake in a single PostgreSQL transaction with row/advisory locking or constraint-backed reservations; use a database sequence/counter for references; make submit operations idempotent.

#### H3. Sensitive business and customer data has no production privacy controls

Verified: names, phone/email, answers, notes, actions, and exports are plain JSON in origin storage; workspace export includes the full organization payload (`src/domain/schema.ts:406-476`; `src/data/repository.ts:117-120`; `src/pages/app/Settings.tsx:50-51`).

Impact: no enforceable retention, legal hold, subject deletion, access audit, encryption policy, data residency choice, or tenant backup/restore exists.

Recommendation: classify fields, minimize collection, encrypt in transit/at rest through managed services, define retention per organization/workflow, log privileged access, and build tested export/deletion workflows before real data is accepted.

#### H4. Integration execution and secret custody are not implemented

Verified: payment providers are catalog entries only; notifications are local previews; no real webhook or credential path exists (`src/integrations/payments.ts:35-49,84-99`; `src/engine/runs.ts:54-79`).

Impact: production cannot confirm payments or deliver messages, and an improvised client-side integration would expose credentials and permit forged state.

Recommendation: use server-only adapters, encrypted per-organization connection records, signed webhook verification, idempotency keys, rate limits, retry/backoff, delivery logs, and operator-visible connection tests.

### Medium

#### M1. Repository contract combines incompatible authorities

`FormangleRepository` exposes owner reads/writes, public submission, customer capability actions, full export, and global reset in one interface (`src/data/repository.ts:44-121`). A production implementation that maps each method directly to client-accessible RPCs would create an oversized attack surface.

Recommendation: retain a convenient client facade but split backend contracts into owner, public, customer-token, support-admin, and worker services with separate authorization and rate limits.

#### M2. Customer file fields are placeholders, not uploads

The `file` field persists only a filename and rounded size string, with no MIME/size enforcement or file bytes (`src/renderer/FieldInput.tsx:505-535`). Brand images have stronger local decoding and limits (`src/lib/images.ts:17-53`) but are not a production upload pipeline.

Recommendation: use private object storage, server-created paths, MIME/magic-byte validation, size limits, quarantine/scanning based on risk, signed download URLs, and deletion/retention jobs. Keep filename as display metadata only.

#### M3. Observability is limited to browser console and UI error states

Boot/query/render errors use `console.error`; there is no request correlation, structured server log, metric, alert, or audit sink (`src/data/store.tsx:38-49,117-123`; `src/components/ErrorBoundary.tsx:4-14`).

Recommendation: structured logs with request/event/organization IDs, error tracking with PII scrubbing, automation/provider metrics, database health alerts, and explicit operational runbooks.

#### M4. CI lacks several production gates

CI runs tests and build, but has no explicit lint, database/RLS tests, end-to-end browser tests, automated accessibility scan, migration dry-run, dependency audit, secret scan, or post-deploy smoke/rollback gate (`.github/workflows/pages.yml:17-50`). Third-party actions use version tags rather than immutable SHAs.

Recommendation: add gates incrementally. Minimum Phase 1 gates are typecheck, unit tests, build, migration reset, pgTAP/RLS isolation tests, critical public/owner E2E, dependency/secret scanning, and a staging smoke test.

#### M5. Accessibility foundations are good but unverified end to end

Verified positives: Hebrew RTL document, skip link, visible focus styles, labelled fields, alert/status regions, and reduced-motion tests (`index.html:2`; `src/components/AppLayout.tsx:158-161`; `src/renderer/FieldInput.tsx:40-70`; `src/test/atelier.test.ts`).

Gaps: no automated axe/Playwright suite, no documented keyboard/screen-reader matrix, and custom dialogs/navigation require focus-trap and focus-return verification.

Recommendation: WCAG 2.2 AA acceptance tests on public flow and owner critical paths, including RTL, zoom/reflow, keyboard-only, VoiceOver/NVDA, validation errors, dialogs, and color contrast.

#### M6. Migration recovery is one-way and demo-specific

Browser migrations are forward-only and corrupt data is quarantined then demo-seeded (`src/data/migrations.ts:1-6,167-184`; `src/data/localRepository.ts:175-194`). This is reasonable for a demo but not for commercial data.

Recommendation: versioned SQL migrations with staging rehearsal, backups, forward-compatible expand/migrate/contract changes, explicit rollback or restore criteria, and a migration ledger for imported local workspaces.

### Low / technical debt

- Production build succeeds, but the analytics chunk is about 109 kB gzip and the main chunk about 91 kB gzip; retain route splitting and add performance budgets before adding SDKs.
- A meta CSP is present and strict for a static demo, but response headers such as `frame-ancestors`, HSTS, and stronger referrer/permissions controls require a hosting layer (`vite.config.ts:13-28`; `docs/DEPLOYMENT.md:15-18`). Embedding is currently intentional.
- `useRepoQuery` invalidates all queries on every repository write (`src/data/store.tsx:96-129`); production should use scoped cache keys/invalidation rather than global refetch.
- JSON stringification is used for editor dirty checking (`src/pages/app/WorkflowEditor.tsx:147-196`); acceptable at current scale, but large schemas may need structural change tracking.

## Tests and tooling

Executed on 2026-11-02:

| Command | Result |
|---|---|
| `npm test` | pass: 23 files, 230 tests |
| `npm run typecheck` | pass |
| `npm run build` | pass; two non-fatal Rollup annotation warnings from Zod dependencies |
| `npm audit --omit=dev --json` | pass: 0 production dependency vulnerabilities across 66 production dependencies |

Not executed: live-site probing, browser E2E, screen-reader testing, load testing, database/RLS tests (no database exists), provider/webhook testing, restore drill, or production deployment.

## Assumptions and unresolved evidence

- Assumption: the GitHub Pages deployment currently matches this worktree's architecture. No live-site verification was authorized or necessary for the source audit.
- Assumption: early commercial volume is modest; concrete traffic, submission size, file volume, and SLO targets remain open.
- Verified: no live provider credentials or private keys were found in the offline repository search. This does not prove secrets never existed outside the current tree.
- Verified: pre-existing uncommitted product changes were present before this audit and were not modified or committed by the documentation work.

## Recommended immediate action

Build only the Phase 1 vertical slice in `08-IMPLEMENTATION-ROADMAP.md`: authenticated organization access, RLS, workflow draft/publish persistence, public workflow resolution, transactional server-side submission validation/pricing, owner inbox visibility, and cross-tenant denial tests. Defer real payments, messaging, general automation authoring, customer file uploads, billing, and the super-admin console until that slice is secure and observable.
