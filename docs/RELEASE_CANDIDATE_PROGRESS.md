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
| 4 | Formangle Actions — owner UI (request detail, timeline) | done |
| 5 | Customer status page with actions + updates, "צפייה כלקוח" | done |
| 6 | Dashboard / inbox: awaiting-decision visibility | done |
| 7 | Domain readiness, metadata, privacy/legal placeholders | done |
| 8 | Docs: README, release notes, backend architecture | done |
| 9 | QA (browser scenarios A–I), fixes | done (see notes) |
| 10 | Merge to main + deploy + live verification (only if authorised) | done (approved by owner) |

## Files modified
- M1: `src/lib/share.ts`, `src/components/SharePanel.tsx`, `src/pages/app/WorkflowEditor.tsx`, `src/test/share.test.ts`, deps `qrcode-generator@2.0.4` (MIT), dev `jsqr@1.4.0` (Apache-2.0, tests only).
- M2: `domain/schema.ts` (`completion.externalTiming`, optional), `engine/completion.ts`, `components/StatusBadge.tsx`, `renderer/Confirmation.tsx`, `pages/app/RequestDetail.tsx`, `pages/app/editor/Inspector.tsx`, `test/v3.test.ts`.
- M3: `domain/schema.ts` (v7, `CustomerActionSchema`, `actions[]`, `RunEvent.actionId`, 3 event types), `engine/actions.ts`, `data/repository.ts` (+5 methods), `data/localRepository.ts`, `data/migrations.ts` (v6→v7), `data/seed.ts` (`appendDemoActions`), `components/Activity.tsx`, `test/actions.test.ts`.
- M4–5: `renderer/actions.tsx` (ActionCard, RequestActions), `pages/app/ActionComposer.tsx`, `pages/app/RequestDetail.tsx`, `pages/PublicFlow.tsx` (actions + owner strip `?from=inbox`), `renderer/Confirmation.tsx`, `theme/theme.css` (`.fz-action*`, `.fz-owner-strip`), copy fixes in `Settings.tsx`, `Demo.tsx`.
- M6: `engine/actions.ts` (`actionsByRun`), `components/RunsTable.tsx`, `pages/app/Requests.tsx`, `pages/app/Dashboard.tsx`.
- M7: `vite.config.ts` (STATIC_ROUTES, CSP, `__SITE_URL__`), `index.html`, `.github/workflows/pages.yml` (`VITE_SITE_URL`), `lib/meta.ts` (robots/canonical), `App.tsx`, `pages/Privacy.tsx`, `components/SiteChrome.tsx`, `test/deploy.test.ts`.
- M9: QA fixes in `renderer/actions.tsx`, `Dashboard.tsx`, `RunsTable.tsx`; `pages/Landing.tsx` (Formangle Actions section).
- M8: `README.md`, `docs/RELEASE_NOTES_RC1.md`, `docs/ARCHITECTURE_BACKEND.md`, `docs/DEPLOYMENT.md`, `docs/LEGAL_PLACEHOLDERS.md`.

## Validation results
- Baseline: tsc OK, 186/186 tests.
- M1: tsc OK, 192/192 tests; QR round-trip decoded with jsQR; publish modal checked in browser.
- M2: tsc OK, 193/193 tests; inspector preview checked in browser.
- M3: tsc OK, 202/202 tests (9 new: two-option rule, single answer, expiry, cancel, duplicates, persistence, timeline, migration).
- M4–6: tsc OK, 202/202 tests. Browser walkthrough (Scenario B) done in dev: owner composed a choice, opened "צפייה כלקוח", customer approved ₪180 (with confirm step) and chose pickup, owner timeline + list + dashboard + inbox filter updated. Demo reset (Scenario I) verified.
- M7: tsc OK, 205/205 tests; Pages build OK; production preview (port 4174, base /formzelo-demo/): 0 CSP violations and 0 console errors across 10 routes + studio + image upload + publish QR + same-origin iframe.

- M9 (production preview, fresh headless Edge profile, console clean):
  - Scenario B: owner → customer view → approve ₪180 with confirm → reload keeps the answer (H) → back to request, timeline shows decision → composer at 375/1280 → dashboard card + inbox filter updated.
  - Scenario C: Urban Table approved booking, customer status page shows "הזמנה מאושרת" + "השולחן שמור" update.
  - Scenario D/E (part): publish success + share at 375 (QR, WhatsApp, snippets, honest reach note); external link preview checked in dev.
  - Scenario I: demo reset restores seeded state incl. sample actions.
  - No horizontal overflow on 14 routes at 375 / 390 / 768. `npm audit`: 0 vulnerabilities.
  - Not re-run in a browser this session (covered by unit tests / earlier sessions): A (flower order fill), D (Hebrew prompt → workflow), F (Brand Kit links), G (published version unchanged after draft edits).
  - Not tested: real phones, Safari, Firefox, a third-party site embedding the iframe (only same-origin + header check).

## Known defects
- Browser pane screenshots were cropped (DPR 3) in this session; visual QA via headless Edge captures instead.
- Dev-only: hot-reloading a half-applied schema change quarantined v6 data once (not reachable in a built deploy; migration covered by tests).

## Deployment status
- Live: https://lielbs.github.io/formzelo-demo/ = RC 1.0 (`main` fast-forwarded to `6c82713`, run 41313748336: build + deploy succeeded).
- Live checks: HTTP 200 for `/`, `/privacy`, `/pricing`, `/demo`, `/f/autocare-repairs`, `/f/bloom-flowers`, `/f/...?r=`; `/app/requests` 404 status with working SPA fallback (expected); CSP meta and og:url present.
- Live browser walkthrough (fresh headless Edge): Scenario B end to end, reload keeps answer, composer, dashboard card, inbox filter, Urban booking status, publish + share, no overflow at 375/390/768 on 14 routes, 0 console errors.
- Not exercised live: the v6 → v7 upgrade of a returning visitor's data (unit-tested only).
- Rollback: `git revert` the RC commits or redeploy tag `v8-signature-flows` (`f69e11c`).

## Exact next action
All milestones done. Optional follow-ups: browser re-run of Scenarios A/D/F/G, Phase 5 studio audit
pass, Phase 7 Engagement Kit browser re-test, company details on /privacy (docs/LEGAL_PLACEHOLDERS.md).

## How to resume
1. Read this file. 2. `git status && git log --oneline main..rc-v1`.
3. Continue from the first milestone not marked done. Do not redo done milestones.
4. Validate with `npm run typecheck && npm test && npm run build` before each commit.
