# Formangle RC v1.0 — progress

Living handoff document. Updated after every milestone. If a session ends abruptly,
this file plus `git log rc-v1` is enough to continue.

## Objective

Turn the existing Formangle demo into a polished, sales-ready Release Candidate v1.0
without new operating costs, without a backend, and without presenting simulated
capabilities as live. Full brief: see the RC v1.0 assignment (pasted in session).

## Branch / commits

- Working branch: `rc-v1` (from `main` @ `f69e11c`).
- `main` is deployed to GitHub Pages by `.github/workflows` on push.
- Rollback tags already on origin: `v4-formangle-engagement` … `v8-signature-flows`.

## Phase 0 — audit (done)

Baseline at `f69e11c`: `tsc --noEmit` clean, **186/186** Vitest tests, Pages build OK.

### A. Exists and works
- Workflow builder (studio), 26 design presets, 49 templates, 5 fill experiences,
  add-ons, business images, Brand Kit with tabs, Business Engagement Kit (links, review CTA).
- Publishing with immutable `WorkflowVersion` snapshots (config + resolved design).
- Public flow `/f/:slug`; personal run link `/f/:slug?r=<runId>` renders the
  branded status page (`renderer/Confirmation.tsx`) for submitted runs.
- Case mode (owner opens a case, customer fills via personal link).
- Requests inbox, request detail with status transitions, internal notes, timeline,
  simulated notifications, simulated payments (`*_simulated`), booking + capacity.
- Completion modes incl. `external_link` (https-only, `safeExternalUrl`).
- Repository abstraction (`data/repository.ts`) + LocalStorage implementation with
  forward-only migrations (schema v6), quarantine of corrupt data, demo reset.
- Sales site: landing, demo, pricing (399 / 499 + VAT, Enterprise custom, variable
  setup), themes gallery, guided tour; contact via `salesMailto` → contact@rockstackds.com.
- Centralised URLs: `lib/links.ts` (`BASE_PATH`, `appHref`, `publicFlowUrl`).

### B. Partial
- Publish success modal: link + copy + open only (no QR, WhatsApp, embed, version detail).
- External payment link: config + customer button exist; no customer-side preview in
  the inspector, no explanation of fixed vs dynamic links.
- Customer status page: no history of customer-visible updates.

### C. Missing
- **Formangle Actions** (structured owner → customer decisions/updates).
- QR code generation, WhatsApp share, website embed snippets.
- Dashboard visibility of "waiting for customer decision".
- Docs: release notes, future-backend architecture, privacy/legal placeholders.

### D. Simulated (must stay labelled)
Payments (`paid_simulated`), notifications (`NotificationPreview.simulated: true`),
memberships/auth, booking capacity (per browser), cross-device links.

### E. Needs a backend (deferred, documented only)
Auth + tenant isolation, shared published-workflow storage, customer submissions
across devices, secure personal request links (signed tokens), server-side validation,
payment webhooks, real notifications, audit log storage.

### F. Safe, zero-cost improvements (this RC)
Everything in C, plus copy/honesty polish, domain-ready URLs, docs.

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| 0 | Audit + progress doc | done |
| 1 | Publish success + share (QR PNG/SVG, WhatsApp, embed, demo-vs-local link honesty) | done |
| 2 | External payment link experience (preview, fixed vs dynamic, status) | done |
| 3 | Formangle Actions — domain, repository, tests | done |
| 4 | Formangle Actions — owner UI (request detail, timeline) | pending |
| 5 | Customer status page with actions + updates, "צפייה כלקוח" | pending |
| 6 | Dashboard / inbox: awaiting-decision visibility | pending |
| 7 | Domain readiness, metadata, privacy/legal placeholders | pending |
| 8 | Docs: README, release notes, backend architecture | pending |
| 9 | QA (browser scenarios A–I), fixes | pending |
| 10 | Merge to main + deploy + live verification (only if authorised) | pending |

## Files modified
- M1: `src/lib/share.ts`, `src/components/SharePanel.tsx`, `src/pages/app/WorkflowEditor.tsx`, `src/test/share.test.ts`, deps `qrcode-generator@2.0.4` (MIT), dev `jsqr@1.4.0` (Apache-2.0, tests only).
- M2: `domain/schema.ts` (`completion.externalTiming`, optional), `engine/completion.ts`, `components/StatusBadge.tsx`, `renderer/Confirmation.tsx`, `pages/app/RequestDetail.tsx`, `pages/app/editor/Inspector.tsx`, `test/v3.test.ts`.
- M3: `domain/schema.ts` (v7, `CustomerActionSchema`, `actions[]`, `RunEvent.actionId`, 3 event types), `engine/actions.ts`, `data/repository.ts` (+5 methods), `data/localRepository.ts`, `data/migrations.ts` (v6→v7), `data/seed.ts` (`appendDemoActions`), `components/Activity.tsx`, `test/actions.test.ts`.

## Validation results
- Baseline: tsc OK, 186/186 tests.
- M1: tsc OK, 192/192 tests; QR round-trip decoded with jsQR; publish modal checked in browser.
- M2: tsc OK, 193/193 tests; inspector preview checked in browser.
- M3: tsc OK, 202/202 tests (9 new: two-option rule, single answer, expiry, cancel, duplicates, persistence, timeline, migration).

## Known defects
- none recorded yet

## Deployment status
- Live: https://lielbs.github.io/formzelo-demo/ = `f69e11c` (pre-RC). RC not deployed.

## Exact next action
Milestone 4: owner UI — "פעולה חדשה ללקוח" composer on RequestDetail, actions list with status/cancel, "צפייה כלקוח".

## How to resume
1. Read this file. 2. `git status && git log --oneline main..rc-v1`.
3. Continue from the first milestone not marked done. Do not redo done milestones.
4. Validate with `npm run typecheck && npm test && npm run build` before each commit.
