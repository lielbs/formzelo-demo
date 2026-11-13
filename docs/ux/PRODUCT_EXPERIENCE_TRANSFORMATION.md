# Formangle — Product Experience Transformation

Living record of the product-wide UX audit and the redesign that follows it. Started 2026-11-13 on
branch `production-v1` (local commits; nothing pushed or deployed without an approval package).

## 0. Working state at the start

- Branch `production-v1` at `43f0e78`, equal to `origin/main` (the deletions / access / seating
  release was approved and deployed earlier the same day).
- Concurrent work: worktree `FORMZELO-tables-visual-customization` (branch
  `codex/tables-visual-customization`) holds **uncommitted** changes to guest-page layouts
  (`PublicShell.tsx`, `BookingPage.tsx`, `PublicPagesStudio.tsx`, `tables.css`, a new
  `20261111120000_tables_page_layouts.sql`). That worktree is not touched; files it edits
  (`PublicShell.tsx`, `BookingPage.tsx`, `PublicPagesStudio.tsx`) are left alone here to avoid
  merge conflicts, so guest-page restyling waits for it to land.
- The founder's November 13 screen recording is **not available** in this environment (searched
  the project, Desktop, Downloads, Videos). The audit below was made from the running application
  (local stack, realistic seeded shift: 8 bookings, 15 tables, 3 zones, a waitlist) and from the
  founder's phone screenshot of a reservation sheet sent in chat.

## 1. Audit — what was found

Severity: **S1** blocks or misleads during real work · **S2** slows work or causes doubt ·
**S3** polish / consistency.

### 1.1 Live shift (host) — phone 375–430 px

| # | Problem | Sev | Impact |
|---|---------|-----|--------|
| H1 | ~50 % of the first screen is chrome before the first booking: header (2 rows), "pulse" card (big number, bar, chips), service tabs, search row. At 390×844 only ~2½ bookings are visible. | S1 | Host scrolls to see who is arriving next. |
| H2 | Counts mix units: the big number is **diners** ("28 סועדים במשמרת · 8 הזמנות"), the side line is diners ("6 יושבים"), the chips are **bookings** ("יושבים 2"). Same word, different number, on one card. | S1 | "Who is seated?" has two answers on one screen. |
| H3 | The colour bar repeats the chips without labels; meaning only via legend-less colours. | S2 | Decorative, adds interpretation. |
| H4 | Each booking is a large card (≈130 px tall) with a time rail, dots, hour squares, a pill status chip, a two-part seat badge, an action button and a "⋯" button that does the same as tapping the card. | S2 | Low density, repeated controls, visual noise. |
| H5 | Reservation details on phone are a bottom panel **without a scrim**: the list stays interactive behind it, and on the founder's screenshot it covers the summary while the dock is hidden. | S2 | Unclear modality; accidental taps behind. |
| H6 | Detail action hierarchy: "arrived" and "move table" have the same weight as the primary action; destructive "cancel" sits in the main stack; for bookings >3 h away the seat action was missing entirely (fixed earlier today, `0d7ca6a`). | S1 | Hesitation on the most frequent action; risk of mis-tap on cancel. |
| H7 | Map view stacks three control rows (service, zone, zoom) above the map; tables render ~32 px at 375 px wide (below the 44 px target); zoom only crops the centre (no pan). ~45 % of the screen below the map is empty. | S1 | Host cannot reliably tap a table on a phone. |
| H8 | Connection badge, theme toggle and the "live shift" subtitle compete in the header. | S3 | Noise. |
| H9 | Privacy footnote is rendered under the floating dock on phones (overlaps the dock). | S3 | Visual bug. |
| H10 | Waitlist rows: wait time is small grey text; five equal-weight buttons per row; explanatory paragraph above the list. | S2 | Priority and next action are not obvious. |

### 1.2 Live shift — tablet / desktop

| # | Problem | Sev |
|---|---------|-----|
| T1 | Booking cards stretch to ~600 px wide with the action far from the name; no column alignment, so the eye cannot scan times/tables vertically. | S2 |
| T2 | Header has view switcher + service tabs + search + filter as four separate bordered groups. | S2 |
| T3 | Side detail panel shows the same weak hierarchy as H6. | S2 |

### 1.3 Business app (Formangle)

| # | Problem | Sev |
|---|---------|-----|
| A1 | Two navigation surfaces open the same menu on phones/tablets: header ☰ and dock "עוד". | S2 |
| A2 | Workspace name appears twice on phone dashboard (header + eyebrow). | S3 |
| A3 | Sidebar footer card "secure workspace" is permanent decoration. | S3 |
| A4 | Every section is a 20 px-radius white card with a soft drop shadow; cards inside cards (dashboard onboarding, venue page). | S2 |
| A5 | Badges and chips in many tints (orange, teal, sky, amber, red) without a fixed semantic mapping. | S2 |
| A6 | Venue page: the venue's sub-areas (hours/rules, menus, page design, data, layout) are pill buttons inside the "booking link" card — not a navigation model. | S2 |
| A7 | Dashboard on phone: onboarding checklist, five stat cards, an explanatory card and an empty filtered table before any real activity. | S2 |

## 2. Principles adopted

1. **One answer per question.** A number on screen has one unit, stated in words.
2. **The next action is the biggest thing.** One primary action per context; secondary actions
   are quieter; destructive actions are separated and confirmed.
3. **Rows, not cards, for operational lists.** Cards only group distinct sections.
4. **Quiet surfaces.** Hairline borders instead of drop shadows; 14–16 px radii; colour only for
   meaning (status) and the orange accent only for the primary action and selection.
5. **One way to each place.** Remove duplicate entry points unless they serve a different device.
6. **Measure, don't claim.** Steps are counted in tests, not estimated.

## 3. Information architecture

| Area | Before | After |
|------|--------|-------|
| Full menu on phone/tablet | Header ☰ **and** dock "עוד" | Dock "עוד" only (header shows the workspace name) |
| Shift views | Segmented row + dock (phone) | Dock (phone); view switch in the date row (tablet+) |
| Shift filters | Pulse chips + service tabs + search row + filter button (4 rows) | One tabs row: state tabs + search + filter; service is a picker beside the date |
| Venue sub-areas | Pills inside the booking-link card | "Manage the venue" list right under the venue header |
| State filters (requests, dashboard, shift) | Three different pill/segment styles | One underline-tabs pattern with counts (`Tabs` / `.hs-tabs`) |

Not changed on purpose: the route structure and URLs (public links and bookmarks keep working),
the per-person access model, and the guest pages (pending the concurrent page-layout work, §0).

## 3a. Visual direction — exploration and decision

Three complete directions were built on the same components (switchable tokens) and rendered on
the same seeded business at identical viewports: dashboard 1280/390, live shift 390, shift with
details 1280, details sheet 390, map 390. Screenshots: `docs/ux/directions/<look>-<screen>.png`.

| | **Paper** (evolution of today) | **Graphite** (chosen) | **Nightfall** |
|---|---|---|---|
| Surfaces | warm paper `#F5F3EF`, white cards | cool neutral `#F7F7F8`, white, hairlines | cool light content in deep-navy chrome |
| Type | Rubik | IBM Plex Sans Hebrew | Heebo |
| Corners | 10/12/16 | 6/8/10 | 10/14/20 |
| Chrome | dark midnight sidebar | light sidebar, frosted white bars | dark sidebar **and** dark top bars |
| Operational legibility (bright room, glance) | good | **best** — highest contrast, quiet chrome | header competes with content |
| Seriousness / maturity | friendly, still "soft" | **precise, calm** | dramatic, heavier |
| Identity | warm, recognisable | mark + orange carry it; clean canvas | strong but generic "dark dashboard" |
| Cost/risk to keep consistent | low | low (tokens only) | high (dark-chrome overrides everywhere) |

**Decision: Graphite.** It answers the brief's main complaint (too playful, too rounded, too many
colours) directly: an interface typeface built for UI with exact tabular figures for times, diners
and tables; neutral chrome so the only colours are status and one orange accent; tight geometry;
and the midnight-and-orange Formangle mark as the identity anchor. Paper was too close to the look
the founder found lacking; Nightfall's dark bars fight the content during service and need a
parallel set of overrides.

## 4. Design system

Tokens live in `src/theme/tokens.css` (colours as RGB triplets, `--fz-font`, `--fz-r-*`, chrome
`--fz-side-*`/`--fz-bar-*`); `tailwind.config.js` maps `cloud`, `ink`, `midnight`, `orange`,
`rounded-lg/xl/2xl`, `font-sans` and `shadow-card` onto them, and the shift's `--hs-*` light values
derive from them (dark values stay explicit). Rules adopted:

- **Surfaces:** white on a cool neutral page (`cloud`), separated by a 1 px hairline (`shadow-card`
  is a hairline, not a drop shadow). Radius 10 px surfaces, 8 px controls, 6 px small controls.
- **Controls:** filters and sections = underline tabs (`Tabs`, `.fz-tabs`, `.hs-tabs`); one value
  out of few = light segmented control (`.fz-seg`, Tables `Segmented`); disabled = neutral fill
  with soft text (`.fz-btn-off`), never a faded colour block.
  Drop shadows only for things that float (sheets, menus, dock).
- **Colour = meaning.** Shift states: attention `--hs-attention` (red), upcoming (slate), arrived
  (orange), seated (green), done (grey). Orange is otherwise reserved for the primary action and
  selection. Status is always a small shape **plus words**.
- **Typography:** figures 22–24 px semibold tabular; row titles 15–16 px semibold; meta 13 px muted;
  section headers 13 px muted with the key value (hour) in 15 px ink.
- **Components:** `StatStrip` (figures in one surface), `Tabs` (underline tabs with counts),
  `StatusChip` (dot + words), `.hs-list`/`.hs-row` (grouped rows), `.hs-kpis` (figures with units),
  `QuietAction` (secondary/destructive rows), sheet with scrim (phones/tablets) ↔ side pane (≥1024 px).
- **Targets:** every control ≥ 44 px on touch (existing `fz-tap` rule); map tables ≥ 46 px.
- **Motion:** 0.18–0.24 s fades/slides for views and sheets; a single state-change flash on a row;
  everything off under `prefers-reduced-motion`. Removed: breathing "now" dot, popping counters,
  staggered card entrances.

## 5. Changes by area

### 5.1 Live shift (Tables)
- **Summary** (`ShiftSummaryBar`, `shiftSummary()`): "יושבים עכשיו N סועדים · עוד צפויים N סועדים ·
  שולחנות פנויים N מתוך M · (מאחרים N הזמנות)". Tabs count **bookings** and say so to screen readers.
  Unit-tested in `shiftList.test.ts`.
- **List** (`ReservationRow`): one row per booking — time and length, guest, status, party, table,
  flags (request, notes, returning, past no-shows) and the single next action. From 768 px party
  and table become aligned columns. Hour sections with covers; a thin "now" line.
- **Details** (`DetailPanel`): sheet with scrim < 1024 px, side pane ≥ 1024 px. Order: name and
  "where it stands in time" (in 2 h / 12 min late / seated at 19:40) → facts strip (time, diners,
  table, source) → **one primary action** for the state → secondary actions → request/answers/
  history → contact → notes → separated quiet/destructive actions (reject, no-show, cancel, undo).
  Primary action by state: pending → approve; open without table → assign; open within the seating
  window → seat at table N (one tap — marking "arrived" stays available as secondary); open before
  the window → seat shown disabled with the time it opens; seated → finish visit; final states → a
  plain "final state" line.
- **Map** (`FloorView`): one control row (zone picker, zoom ±, fit); the map fills the screen height;
  tables never render under 46 px — when the room would need it, the map is wider and pans with a
  finger; zoom enlarges (pans) instead of cropping the centre.
- **Waitlist** (`WaitlistView`): wait minutes as the row's figure; primary "seat at table N",
  secondary "hold table"; call / left / no answer as quiet actions.

### 5.2 Business app
- App shell: single menu entry on phones/tablets; sidebar without the permanent info card.
- Dashboard: workspace name once; onboarding as a checklist; five figures in one `StatStrip`;
  customer-decisions card only when there are decisions; shared `Tabs`.
- Requests: shared `Tabs`; the empty state is not nested inside a card; tabs hidden while empty.
- Venue page: "manage the venue" navigation list.

## 6. Measured results

Measured in a real browser (Playwright, Edge, local stack, seeded shift of 8 bookings / 15 tables)
by `e2e/tables/ux-metrics.spec.ts`; "before" values are measured on the before screenshots in
`docs/ux/before/` (same seed and viewport).

| Measure (390×844 phone unless noted) | Before | After |
|---|---|---|
| Top of the first booking | ≈ 428 px | 290 px |
| Bookings fully visible above the dock | 2 | 5 |
| Height of one booking | ≈ 130 px | 58 px |
| Smallest table on the map (375–390 px wide) | ≈ 32 px | 46 px |
| "How many diners are seated?" | two different numbers on one card | one figure with its unit, 0 taps |
| Control rows above the map | 3 (service, zone, zoom) | 1 |
| Rows of controls above the list | 4 | 2 (date row, tabs row) |
| Seat a booking from the list | 1 tap | 1 tap (unchanged) |
| Seat from the details | 2 taps (open, seat) | 2 taps; seat is now the single primary button |
| Tablet 1024×768: bookings fully visible | — | 5 (with details pane beside the list) |
| Changing the shift date | full-screen loader, whole screen re-mounts | list dims under a 2 px progress line; header, figures and controls stay (`date-switch.spec.ts`) |

## 7. Remaining limitations (honest list)

- **Guest pages and the Design Studio** (`PublicShell`, `BookingPage`, `PublicPagesStudio`) were not
  restyled: the concurrent `codex/tables-visual-customization` worktree has uncommitted edits to
  exactly those files. Do them after that branch lands.
- **Operator administration, quote composer, customer portal, workflow editor** received the shared
  foundation (surfaces, badges, empty states) but no structural redesign in this pass.
- **No usability sessions with real hosts.** Numbers above are measured layout and tap counts, not
  observed task times with people. Recommended next: 3 hosts × 5 scripted tasks on a phone.
- **Not verified on a physical iPhone/iPad** (Safari safe areas, momentum scroll inside the map).
  Verified in Edge/Chromium with touch emulation at 320–1440 px.
- **English (LTR)** is verified only on guest pages (the staff app is Hebrew-only by design today).
- **Dark theme** exists for Formangle Tables (shift, venue screens) and follows the system or the
  in-app toggle; the business app (dashboard, processes, requests) is light-only in this release —
  the tokens make a dark set possible, but it needs its own visual QA pass.
- Map pan uses native scrolling; there is no pinch-zoom gesture (zoom is via ± buttons).

## 8. Integration and deployment (approval package)

**What ships:** front-end only. No database migration, no Edge Function, no new dependency, no
paid service. Business rules (seating window, capacity, conflicts, RLS, access levels) are
untouched; the redesign reads the same data and calls the same RPCs.

**Commits** (branch `production-v1`, on top of `43f0e78` = production today): `a31e2ec`,
`09f8096`, `04bd2f6`, `51fd590`, `1aabb9b`, `470da98` and the final QA commit.

**Before deploying**
1. Typecheck, lint, unit tests, production build, full e2e suite — results in §9.
2. Optional: a 10-minute check on a real iPhone at the venue (list, details sheet, map pan).

**Deploy:** `git push origin production-v1:main` → GitHub Pages workflow
("Deploy site …") and "Validate production foundation" must both pass.

**Verify in production** (phone, tablet, desktop): `/live/app` dashboard, `/live/app/requests`,
a venue page, and a live shift (list, details sheet, map, waitlist).

**Rollback:** `git revert` the listed commits (they are independent of data) and push, or
re-run the Pages deploy of `43f0e78`. No data migration to undo.

## 9. Verification (2026-11-13)

**Locally** (Edge/Chromium via Playwright against the local Supabase stack, production build path):
- Typecheck, lint, production build: pass. Unit tests: 355 passed (72 skipped by design).
- Full e2e suite (67 tests): 56 passed in the full run; the 3 failures were 2 outdated test
  selectors (fixed) and 1 Windows worker crash; every failed or not-run spec was re-run and passed
  (operator/owner journey 8/8, busy shift, Tables journeys 6/6, live shift 12/12).
- Includes axe accessibility checks (light and dark), horizontal-overflow and target-size checks at
  320, 375, 390, 768, 1024, 1280 and 1440 px, the measurements in §6, and `date-switch.spec.ts`.
- No database tests were needed: this release has no database change.

**In production** (`https://formangle.rockstackds.com/live`, commit `3be22e0`): both GitHub
workflows passed; the served page uses the Graphite tokens (page `rgb(247 247 248)`, radius 10 px),
IBM Plex Sans Hebrew is loaded, the live-shift bundle contains the new summary and date-switch
code, and the sign-in screen renders with no console errors. Signed-in production screens were not
exercised from here (that needs the owner's own sign-in) — check on a phone: dashboard, a venue,
and a live shift (list, details, map, waitlist, changing the date).
