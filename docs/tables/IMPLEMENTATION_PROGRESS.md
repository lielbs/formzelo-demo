# Formangle Tables — Implementation Progress

Branch `production-v1` (base `8ed2d2b`). Local only: nothing pushed, deployed or applied to Cloud.
Local database: disposable Supabase stack (CLI 3.0.0, Podman `formangle-wsl-dev`) started from an
**unlinked copy** of `supabase/` (the repository checkout contains `supabase/.temp/project-ref`, so
the repo's own `scripts/local-db.ps1` correctly refuses to run there).

## Status by checkpoint

| Checkpoint | Status | Evidence |
|---|---|---|
| T0 Architecture & ADRs | done | Decisions below |
| T1 Venue onboarding, versioned floor | done (local) | `20261110090000_tables_foundation.sql`; pgTAP `tables_foundation.test.sql`; owner E2E `e2e/tables/owner.spec.ts` |
| T2 Availability & booking engine | done (local) | `20261110100000_tables_inventory.sql`; pgTAP; `src/tables/data/concurrency.test.ts` (10 real-connection races) |
| T3 Approval, modify, cancel | done (local) | `20261110110000_tables_policies.sql`; pgTAP `tables_operations.test.sql` |
| T4 Live shift | done (local) | `20261110120000_tables_live_shift.sql`; host UI `src/tables/host/*`; Realtime revision row |
| T5 Waitlist & walk-ins | done (local) | `20261110130000_tables_waitlist.sql`; host + public waitlist UI |
| T6 Menus | done (local) | `20261110140000_tables_menus.sql`; owner editor + public menu |
| T7 UX polish & analytics | done (local) | `20261110150000_tables_analytics.sql`; light/dark display; visual sweep (756 shots); owner walkthrough |
| T8 Security & readiness | done (local) | `20261110160000_tables_hardening.sql` (privacy export/anonymize); rollback verified; scale test; RUNBOOK; production proposal |

### Founder request during implementation (2026-11-10)
"Light and dark display, without anything breaking visually." Implemented for every Tables screen
(owner, host, guest): `src/tables/theme.tsx` + `src/tables/tables.css`. Choice per device (follow
device / light / dark, default follows the device), applied only while a Tables screen is open so
the rest of Formangle is unchanged. Floor colours are CSS variables; the venue's brand accent is
contrast-repaired separately for light and dark backgrounds. Verified by the screenshot sweep in
both themes (see "Visual evidence").

## T0 — decisions (ADRs)

Verified HEAD matches the audit (`8ed2d2b`, 11 migrations, roles `owner`/`staff`, no `AGENTS.md`).

1. **Module boundary.** `src/tables/{domain,data,owner,host,public}` inside the existing SPA; lazy
   route chunks. SQL commands are authoritative; React renders projections.
2. **Feature flag / kill switch.** `tables_organization_features.enabled`, set only by a platform
   operator (`operator_set_tables_enabled`). Off ⇒ no member access, public pages resolve to nothing.
   Demo mode does not show Tables at all (no simulated functionality).
3. **Roles.** Organization owners have implicit full access. Other *active members* get venue
   roles in `tables_venue_staff` (`manager`, `host`, `viewer`). Every check reads `auth.uid()` and
   live membership/assignment rows, so suspension/revocation applies on the next call.
4. **Draft → publish.** One draft JSON per venue (`lock_version` optimistic saves), validated by
   `private.tables_draft_problems` (browser mirrors it). Publish materializes stable zones/tables/
   combinations (client-generated UUIDs, upsert guarded to the same venue), archives removed tables,
   and writes an immutable `tables_venue_versions` snapshot plus relational
   `tables_layout_table_snapshots`. Discrepancy vs. spec: no separate `tables_setup_progress`
   table — progress lives in the draft (`draft.progress`), it carries no security truth.
   Services and policy are read from the published snapshot (bounded JSON), not relational rows.
5. **Inventory.** `tables_allocations` one row per physical table, GiST exclusion
   (`btree_gist`) on org/venue/table/`[start,end+buffer)` for states held/confirmed/seated. Every
   writer first takes `pg_advisory_xact_lock(hash('tables:'||venue||':'||service_date))`, expires stale
   holds/offers/pending requests, then decides. Combination members are one INSERT (all-or-none).
6. **Time model.** IANA timezone validated against `pg_timezone_names`. A service stores local
   `start`/`lastSeating`; a time earlier than `start` belongs to the next calendar day but keeps the
   starting service date. Non-existent local times (spring-forward gap) are rejected; an ambiguous
   fall-back time resolves to PostgreSQL's choice, the **later (standard-time) instant**, and is
   tested. Cutoffs use `clock_timestamp()`.
7. **Pending approval.** Venue policy chooses `pendingMode`: `unallocated` (default; the request is
   recorded without blocking inventory and approval allocates only if a table is still free) or
   `hold` (exact tables held for `pendingHoldMinutes`, 5–240). A pending request always expires at
   the latest at its start time. No public "checkout hold": the final confirm is one transaction.
8. **Public boundary = SQL RPCs, no Edge Function.** Matches the existing public-submission pattern
   and avoids Edge invocations (cost). Rate limits in `private.tables_rate_events` keyed by hashed
   browser client token and, when the gateway sets it, hashed IP; bounded cleanup. Responses expose
   no table IDs, counts or reasons that reveal occupancy.
9. **Tokens.** 256-bit url-safe tokens, SHA-256 hash only, scoped capabilities
   (`read/modify/cancel/leave_waitlist`), expiry, revocation, max 5 live per reservation. A lost
   response is recovered by idempotent replay from the same browser (key + client token) which
   issues a fresh link.
10. **Realtime.** One row per venue/service date in `tables_shift_revisions`, bumped in the same
    transaction as every operational change and published to `supabase_realtime`. Host devices
    subscribe to that row only and refetch the shift projection when the revision grows; gaps or
    reconnects refetch; 30 s polling fallback. Local `config.toml` now enables Realtime.
11. **Guests / PII.** Organization-scoped `tables_guests` matched only by normalized E.164 phone; an
    existing guest's name is never overwritten by a public booking. Host projection: name, phone,
    party, requests, host notes, visit/no-show counts. Manager/owner: email, manager notes, history.
    Operational tables have no direct client grants (RPC only); config tables have RLS read for
    venue members.
12. **Menus.** Dedicated versioned structured menu documents (not workflows): workflows carry
    submission semantics that could imply ordering. Brand Kit palette is reused; no order/price
    transaction exists.
13. **Errors.** Commands raise `tables:<code>` messages with standard SQLSTATEs (22023 invalid,
    40001 stale, 42501 denied, 54000 rate limit, P0001 inventory, P0002 unavailable); the client maps
    codes to Hebrew/English copy.

### Founder decisions taken as documented defaults (reversible, no cost)
- Pilot: one test venue per enabled organization; Tables enabled per organization by an operator.
- Retention: reservations/guests kept until the owner deletes/anonymizes; no automatic purge job.
- Hold/pending: `unallocated`, pending expires at start time; waitlist offer 10 minutes.
- Cancellation/modify default cutoff 240 minutes (4 h), configurable.
- SLO targets from the UX spec (p95 command < 750 ms local); RPO 24 h (existing daily backups).

## Visual evidence and defects fixed (founder requirement 2)

Method: `e2e/tables/visual.spec.ts` captures every Tables screen (owner home, venue overview, the six
setup steps + list editor, menus, analytics; host list, floor, waitlist, detail panel, quick-add;
guest booking, details, manage, menu, waitlist join/status, invalid link — guest pages in Hebrew
RTL and English LTR) at 320, 360, 375, 390, 430, 768×1024 (tablet portrait), 1024×768 (tablet
landscape), 1024×1366, 1280, 1366, 1440 and 1920 (large desktop), in **light and dark**. Each shot
is checked automatically for page overflow and targets under 24 px, axe (WCAG 2.0/2.1/2.2 A+AA) runs
at 390 and 1280 per screen and theme, and per-screen contact sheets are built for review.
Screenshots: `test-evidence/tables/visual/` (local, git-ignored), sheets in `…/visual/sheets/`.
I looked at the screenshots myself; the automated checks only add to that review.

Defects found by looking at screenshots or by the checks, all fixed and re-shot:

| # | Where | Defect | Fix |
|---|---|---|---|
| D1 | Setup wizard, phones | Step bar widened the page to 875 px at 390 | single-column grids use `minmax(0,1fr)` |
| D2 | Floor editor | Map squeezed beside the inspector → tiny unreadable tables | inspector under the map until 2xl; map sized by aspect ratio |
| D3 | Floor editor | Zoom buttons covered table 1 | zoom moved into the toolbar |
| D4 | Floor (owner + host) | Captions reordered by RTL ("2–1", "2 • 19:30") | SVG forced LTR + isolated captions; numbers only on the map |
| D5 | Host floor | Guest names on the map (PII on a shared tablet, mixed direction) | map shows numbers; names only in list/detail and spoken labels |
| D6 | Host header, phones | Venue name squeezed to "…ביסטרו" | title gets its own line on phones |
| D7 | Host rows, phones | A lone "…" button wasted a line per row | row opens details; actions line only when there is an action |
| D8 | Host detail | "Seat" offered hours before the booking (server would refuse) | shown only within 3 h of start, same rule as the server |
| D9 | Rules step @1024 | Four number fields overlapped; unit text spilled out of the card | 2 columns until 2xl; units wrap |
| D10 | Wizard @1024 | Side step rail left the form too narrow | rail only from xl; "שלב X מתוך 6" on smaller screens |
| D11 | Hours/rules | Weekday chips wrapped "ש׳" alone / squeezed to 16 px | seven equal columns, ≥ 36 px |
| D12 | Ranges in Hebrew text | "7–12", "0–20 דק׳" shown reversed | Unicode isolation (`bdi` / LRI…PDI) everywhere |
| D13 | Guest booking | Date buttons' accessible name did not contain the visible text (WCAG 2.5.3) | visible text first, full date as hidden text |
| D14 | Guest booking, phones/tablet | Hidden date text positioned against the page → 985 px wide document, "tomorrow" off-screen | controls with hidden text are positioning contexts; fieldsets `min-width:0` |
| D15 | Host floor, phones | Zone switcher overflowed the page | segmented controls scroll inside themselves |
| D16 | Dark mode | Formangle wordmark invisible on the dark header | wordmark recoloured in dark |
| D17 | Contrast | Grey hint/footer text 2.8:1; orange links 4.4:1 on grey | muted grey 5.9:1; darker orange |
| D18 | Touch targets | 20 px checkboxes, 16 px menu checkboxes, 20 px "change address" link | 24 px boxes; 44 px link target |
| D19 | Host counters | Scrollable summary not reachable by keyboard | focusable region |
| D20 | Overview | Waitlist link printed mid-sentence, broke across lines | own field with copy + QR download |
| D21 | Analytics | Chart had no legend | legend added (table alternative already present) |
| D22 | Guest header | Landline shown as "035551234" | 03-5551234 |
| D23 | Guest phone hint | Trailing "+" jumped sides in Hebrew | isolated example number |
| D24 | Manage link | Opening a second link in the same tab kept showing the first booking | token follows `hashchange`; separate keys per link type |
| D25 | Waitlist | Seating revoked the guest's status link, so they saw "link unavailable" | status link stays readable until it expires |
| D26 | CSP | Production CSP allowed `https://` but not `wss://` for Realtime | `wss://ppgdbqhwbzlgzwsjmkor.supabase.co` added (+ test) |
| D27 | Owner screens @320 | Shared mobile header (logo + business name + menu button) 12 px wider than the screen | name truncates (`min-w-0`), button never shrinks — also fixes the same overflow on every other Formangle page at 320 |
| D28 | Rules / guest-page steps, phones | 24 px checkboxes and radios squeezed to 13–23 px by long labels | checkboxes keep their size (`shrink-0`) |
| D29 | Rules step | "Advanced settings" toggle only 20 px tall | 44 px target |
| D30 | Floor map (owner + host) | axe: the table button's name did not literally contain its two drawn numbers (WCAG 2.5.3) | the button is a transparent focus layer over the drawing; its name already says the number, seats, state and the caption's content in words |
| D31 | Availability at scale | Public availability grew 126 → 442 ms from 1 to 100 venues (unindexed per-table probe) | per-table GiST index + indexable probe: 33 → 37 ms (see "Query cost" below) |

Pre-existing (not Tables, left as is and reported): the Formangle logotype "angle" orange is 3.1:1
on white (logotypes are exempt from WCAG contrast) and its link's accessible name differs from the
wordmark text (axe `label-content-name-mismatch`, existing `Logo` component); the sidebar workspace
switcher's name ("סביבת עבודה: … החלפה") likewise differs from its visible text (existing `AppLayout`).
These are the only findings left in the final sweep (33 axe nodes, all on these two shared components;
0 overflow, 0 targets under 24 px across 756 screenshots).

## Busy-shift simulation (founder requirement 3)

Two layers, both on the local stack with synthetic data.

**Database rush** — `src/tables/data/busyShift.test.ts` (results `test-evidence/tables/busy-shift.json`).
Service window spans "now"; 30 tables / 120 seats, two combinations, conditional approval (9+).
12 earlier phone bookings (some become late), **72 online booking attempts from 24 parallel guest
connections**, 6 walk-ins, 8 waitlist parties, then **4 hosts on 4 separate connections** for 6
rounds acting on the same rows (arrive, seat, complete, move, no-show, cancel, approve, waitlist
offer/seat) with offers forced to expire mid-shift.

| Measured (2026-11-10) | Result |
|---|---|
| Online attempts | 45 confirmed, 27 refused with alternatives (no errors) |
| Host actions | seat 26 ok / 19 conflicts, complete 26 / 9, move 0 / 21 conflicts (+1 table conflict), no-show 4 / 4, cancel 2 / 2, waitlist offer 11 ok / 6 table conflicts, waitlist seat 3 / 9 |
| Overlapping active allocations | **0** |
| Reservation with > 1 active allocation group | **0** |
| Partial combination (allocated seats < party) | **0** |
| Seated without a seated table / closed but still holding a table | **0 / 0** |
| Lost updates (lock_version ≠ events − 1 for any reservation) | **0** |
| Waitlist holds after close / seated entry without exactly one reservation / expired holds still active | **0 / 0 / 0** |
| Host list projection vs allocation table | **0 mismatches** |
| Latency p50/p95 (ms) | host seat 20/33, complete 22/34, move 15/30, arrive 30/62, waitlist offer 23/59, shift projection 38/67; public booking 537/705 under 24-way contention on one service day |

**Browser shift** — `e2e/tables/busy-shift.spec.ts` (results `test-evidence/tables/busy-shift-browser.json`):
three hosts in separate browser contexts (1024×768 touch, 768×1024 touch, 1280 desktop) on the same
live shift while 16 guests book in the background; 8 rounds of simultaneous one-tap actions on
overlapping rows (24 taps). After Realtime settles: all three lists show exactly the database
status of all 31 reservations (0 mismatches), all three floors show 16 occupied tables = database,
0 overlapping allocations.

**Multi-context journeys** — `e2e/tables/journeys.spec.ts` 6/6: a guest booking on a phone reached
both host screens via Realtime in 261 ms / 312 ms; a stale host's action is refused and the event
log shows exactly one completion; approval, guest modify/cancel (English), tampered link,
walk-in, public waitlist → offer → "table ready" → seated, offline banner disables actions,
revoked host and other-tenant owner are denied.

## Non-technical owner walkthrough (founder requirement 4)

Persona: owner of a 12-table café-bistro, no technical background, never saw the module. Rule: start
on the normal Formangle dashboard, type no URL, follow only what the screen says. Task: find table
reservations, describe the place, add a Friday brunch, adapt the starter floor to the real room
(new terrace area with two tables, move a table on the map), make "big groups need my approval",
publish, then open the guest page on a phone and the QR. Scripted as
`e2e/tables/walkthrough.spec.ts` (screens in `test-evidence/tables/walkthrough/`), and I read every
screen as that owner would.

What confused or blocked the owner, and what changed:

| # | Where | Confusion / dead end | Change |
|---|---|---|---|
| W1 | Every Tables screen | A sun/moon button with "בהירה"/"כהה" — unclear what it changes | label reads "תצוגה: בהירה / כהה / לפי המכשיר" |
| W2 | Creating the place | The web address is fixed forever, but nothing said so before it was created | one line under the address: it is set now and never changes, so shared links keep working |
| W3 | Floor map | Two numbers on every table; nothing said which is the table and which the seats | legend under the map: big number = table, small = seats (min–max); how to move by drag or arrows |
| W4 | Floor map | No visible way to delete a table | hint: select a table to change or delete it |
| W5 | Areas | "Delete area" was disabled with no reason | reason shown: move or delete its tables first |
| W6 | Guest page terms | The starter terms promised "up to 4 hours before" even when the owner set a different cut-off — a promise the system would not keep | starter terms no longer state hours; the guest always sees the exact deadline (date and time) computed from the rule |
| W7 | Rules step | Owner did not know whether guests see the cancellation cut-off | hint: guests see the exact date and time before confirming; the terms hint says not to write hours by hand |
| W8 | Venue page | A guest asked "delete my details" — the owner had nowhere to go | owner-only "בקשות פרטיות של אורחים": find by phone, download (JSON), delete personal details (confirmation, refuses while a booking is active, logged) |

Earlier rounds of the same walkthrough produced D9–D11, D18 and D20 above.

## Query cost at 1 / 20 / 100 venues

`src/tables/data/scale.test.ts` (opt-in: `TABLES_SCALE=1`; results `test-evidence/tables/scale.json`,
plans `scale-plan-*.txt`). Each synthetic venue: 30 tables, 3 turns per table per night for 30 days
(2,700 reservations + allocations); 100 venues spread over 5 businesses (20-venue limit per business).
Medians of 7 calls, local stack (Podman WSL2, 4 vCPU) — not a Cloud Micro measurement.

| Venues | Reservations | Public availability | Public booking attempt | Host shift | Staff availability | Candidate search |
|---|---|---|---|---|---|---|
| 1 | 2,700 | 33 ms | 34 ms | 10 ms | 34 ms | 1.4 ms |
| 20 | 54,000 | 35 ms | 35 ms | 6 ms | 37 ms | 1.4 ms |
| 100 | 270,000 | 37 ms | 39 ms | 6 ms | 38 ms | 2.1 ms |

Defect found by this test and fixed (D31): the first run grew **126 → 442 ms** for availability from 1
to 100 venues. `pg_stat_statements` showed the per-table "is it free" probe reading ~395 index pages
per call: its seated-overrun `CASE` expression could not use an index, and the only index on
allocations leads with business and venue. Fix (in `20261110100000_tables_inventory.sql`, not yet
applied anywhere): a GiST index on `(physical_table_id, occupied_during)` for active allocations, and
the probe split into the planned-range check (indexed) plus a seated-overrun check (same meaning).
Five pgTAP assertions now pin the overrun behaviour. The test also confirmed two guards working as
designed: 300 online bookings per venue per 15 minutes, and 20 venues per business.

## Rollback verified locally
After a clean reset, `supabase/rollback/tables-down.sql` removed every Tables relation, function and
publication entry (0 left), restored `operator_list_organizations()` without `tablesEnabled`, and left
the migration ledger at the 11 Production V1 versions; all 9 pre-Tables pgTAP files then passed
(233 assertions). With one business enabled it refused to run ("Tables data exists …") and changed
nothing.

## Final checks (2026-11-10, after a clean `db reset`)
| Check | Result |
|---|---|
| pgTAP, all 12 files (incl. RLS / tenant isolation / grants) | **427 passed** |
| `db lint --schema public,private --fail-on error` | 0 errors (warnings only: text→jsonb literal casts, unused variables) |
| Generated types = `src/production/database.generated.ts` | identical |
| `npm run typecheck` / `npm run lint` | pass / pass |
| `vitest` with the local database (unit, parity, 10 concurrency races, DB busy shift) | **375 passed**, 1 skipped (opt-in scale test, run separately above) |
| `npm run build` | pass |
| `npm audit` (all / production) | 0 vulnerabilities |
| Playwright (Edge): existing Formangle E2E + Tables owner, journeys, busy shift, walkthrough | **32 passed**: existing Formangle 22 (operator/owner/customer journeys, responsive widths; with local Edge Functions and the demo server) + Tables 10 (owner ×2, 6 multi-context journeys, browser busy shift, walkthrough) |
| Visual sweep (12 sizes × light/dark × he/en), axe at 390/1280 | 7/7 specs; 0 overflow, 0 small targets; axe: only the 2 pre-existing shared components |

## Not performed (honest list)
- No manual screen-reader pass (NVDA / VoiceOver) and no physical touch device: accessibility is
  covered by axe, keyboard paths in E2E, focus order and spoken labels reviewed in code only.
- No measurement on Cloud hardware (Micro); all timings are local.
- No real SMS/WhatsApp/email delivery (not part of the zero-cost scope; guests get links on screen).
- No Cloud migration, deploy, Auth/Storage/DNS/billing change, real organization or real account.

## Residual risks and founder decisions
1. **Realtime must be enabled on the project** (dashboard). If it is off, host screens still update
   every 30 s (polling fallback) and on every action, but not instantly.
2. **Public abuse**: bookings are rate-limited per browser token and per IP when the IP header is
   present (read from `request.headers`; that Supabase Cloud forwards the client IP is to be confirmed
   in the smoke test — locally only the per-browser limit was exercised). A determined attacker
   with many browsers could still fill a venue's day up to the 300-online-bookings / 15 min guard —
   owners can pause bookings instantly. No CAPTCHA (paid/external) by design.
3. **Seated overrun** blocks a table until the host completes the party — intended, but a host who
   forgets to complete will make availability look full; the host list shows overstays.
4. **Retention**: no automatic purge; guest data stays until the owner anonymizes it. A retention
   period is a founder decision (legal), documented as open.
5. **Time zones**: venues use one IANA zone; DST gaps/overlaps are handled in SQL and tested, but
   only `Asia/Jerusalem` was exercised end to end.
6. **Load**: the scale test shows flat per-venue cost to 100 venues locally; Cloud Micro has fewer
   CPUs — the 48-hour watch in the rollout plan is the real check.
