# Formangle Tables — Visual customization handoff

Branch `codex/tables-visual-customization` (worktree `FORMZELO-tables-visual-customization`), based on
`105e0ec`. Continues Codex's partial menu-image work (types in `client.ts`, a started gallery helper in
`MenusPage.tsx`); nothing was restarted from scratch. **Not pushed, merged or deployed. Supabase Cloud
was not touched.** Everything below ran against the disposable local stack only.

## 1. What was built

### Feature 1 — Menu images
- **Owner** (`src/tables/owner/MenusPage.tsx`, new `MenuImages.tsx`):
  - Menu opening: an optional hero image (library or upload, via the existing `ImagePicker`), plus a
    heading, subtitle and description.
  - Gallery of up to 12 images: add from the library or upload, replace, remove, and move earlier or
    later (accessible buttons, not drag-only).
  - An optional image per section and per dish: simple upload, replace and remove (`ImageSlot`).
  - Problems are named in plain Hebrew (e.g. "an image was removed from the library").
  - There is an unsaved-changes guard on browser close.
- **Storage:** reuses `src/lib/images.ts` (local downscale, EXIF strip), `organization_assets` and the
  `brand-assets` bucket. Nothing new on the storage side, and no crop, focal-point or extra image
  settings (by design).
- **Guest** (`src/tables/public/MenuPage.tsx`):
  - Hero is 4:3 on phones and 16:9 from `sm`, with a scrim and the title over it.
  - Gallery is a horizontal scroll-snap strip of 4:3 images.
  - Section banners are 21:9; dish thumbnails are 88×88.
  - Every image uses `object-cover`, explicit width/height, `loading="lazy"` (hero is
    `fetchPriority="high"`) and a skeleton background, so the layout is stable while images load.
  - Without images you get a typographic default: an accent-tinted opening card and an accent rule
    on section titles.
  - The menu also wears the venue's published booking-page design.

### Feature 2 — Customizable booking and waitlist pages
- **Data:** `VenueDraft.publicPages` (`src/tables/domain/publicPages.ts`), with version 1, a shared
  `theme`, and `booking` / `waitlist` pages. Each page can use its own theme override and has its own
  copy and fields.
  - `normalizePublicPages` repairs old, partial or hostile input. `publicPagesProblems` mirrors the
    server rules.
  - `normalizeDraft` keeps `publicPages`, so VenueSetup saves never drop it.
- **Design vocabulary:** the Design Studio's own typography presets (`TYPOGRAPHY`), button, card and
  radius variants, texture patterns (`patternImage`) and colour helpers (`ensureContrast`,
  `readableOn`, `mix`). There is no separate design engine.
- **Brand Kit inheritance** (`inheritBrand`): accent ← primary, typography, button shape, logo and
  cover. The background comes from the kit when the kit has one.
  - It is resolved at display time, the same way the Tables accent always followed the Brand Kit
    live.
- **Options:**
  - Five presets: fine dining, café, casual, cocktail bar, minimal.
  - Colours: accent, background, cards, text, with automatic contrast repair and a warning.
  - Typography, buttons (pill/solid/sharp), cards (soft/outlined/elevated/flat), corner radius, and
    backgrounds (plain/tint/gradient/texture).
  - Logo override plus show/hide; optional hero image as a wide band or an in-content card.
  - Title, description, submit label (a request booking always says "send request"), a note after
    booking / on the waitlist status page, and group titles.
- **Fields:**
  - Built-ins can be ordered, regrouped (contact / extras), relabelled and given hints.
  - Optional built-ins (email, requests; waitlist notes) can be hidden. **Name and phone cannot be
    hidden or removed.**
  - Up to 6 additional questions: short text, long text, choice list (1–8 options) or checkbox,
    optionally required.
- **Owner studio:** `/app/tables/:venueId/design` (`PublicPagesStudio.tsx`), linked from the venue
  overview as "עיצוב דפי ההזמנה".
  - Live preview in an iframe (`/t-preview`, `PagePreview.tsx`) at phone 390, tablet 768 and desktop
    1280, in Hebrew/English and light/dark. On phones it opens as a full-screen sheet.
  - The preview renders only data posted from the same origin, makes no requests, carries a visible
    "draft preview — nothing is sent" banner, shows labelled sample times and has an inert submit.
  - Save draft and an explicit publish (the existing venue publish). There is an unsaved-changes
    warning (beforeunload plus the back link) and a status badge (not saved / saved draft, not
    published / live).
  - It warns when the draft also contains other unpublished venue edits that a publish would release.
- **Guest pages:** `PublicShell` takes an optional `design` (CSS variables for light and dark display,
  logo, hero).
  - `BookingPage` and `WaitlistPages` render the published copy and fields through the shared
    `GuestFields`.
  - The standard pages are unchanged when `publicPages` is absent.
- **Team:** answers appear in the reservation detail panel and on waitlist rows (`CustomAnswers.tsx`)
  for host and above.

### App-like polish
- Content entrance animation is transform-only and respects reduced motion.
- The design studio uses collapsible panels, a sticky save/publish bar with a safe-area inset and
  ≥44 px targets.
- The menu was rebuilt as card rows with fixed-ratio media.

## 2. Database — `supabase/migrations/20261111090000_tables_visual_customization.sql`

The migration is additive. Existing commands are **wrapped, not rewritten**: each original body is
renamed into `private.*_core`, client grants are revoked, and a same-name, same-signature public
wrapper calls it unchanged. Availability, capacity, conflicts, approvals, waitlist eligibility and
rate limits are untouched.

| Object | Change |
|---|---|
| `tables_reservations.custom_answers`, `tables_waitlist_entries.custom_answers` | New JSONB column; null or a 1–6 item array, ≤ 8 KB |
| `private.tables_org_asset_ok` | Checks that an asset is a live asset of the owning organization |
| `private.tables_menu_problems` | Now `core ∪ media`. The old body was renamed `tables_menu_core_problems`; media covers hero, gallery (≤ 12, distinct) and section images |
| `private.tables_public_pages_problems`, `tables_page_theme_problems` | Bounded config: whitelisted keys/values, hex colours, lengths, ≤ 14 fields, ≤ 6 questions, mandatory name/phone, select options, org-owned images |
| Triggers `tables_guard_public_pages` on `tables_venues` (draft) and `tables_venue_versions` (insert) | Reject an invalid or foreign-image `publicPages` (draft check only when `publicPages` changed); re-check at publish |
| `private.tables_custom_answers` | Validates answers against the **published** questions: known ids, kinds, options, lengths, required. Stores a labelled snapshot |
| `public.tables_public_book` / `tables_public_waitlist_join` | Validate answers, strip hidden optional fields (email/requests; waitlist notes unless shown), then call the core. An answer is never overwritten by a replay |
| `public.tables_public_venue` | Adds `pages` (published only), `brandKit` (public basics) and `assetOwner` |
| `public.tables_reservation_detail` / `tables_waitlist` | Adds `customAnswers` for host and above (viewers get null; guests never) |
| `public.tables_export_guest` / `tables_anonymize_guest` | Export includes answers; anonymization erases them |

Generated types (`src/production/database.generated.ts`) were regenerated and only the two columns
changed; `types-check` passes.

## 3. Test results (all ran; local disposable stack)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` (`eslint .`) | ✅ 0 problems |
| Unit tests (`npx vitest run`) | ✅ 320 passed, 72 skipped (DB-gated) |
| Unit + local-DB suites (`FORMANGLE_PARITY_DB=…`: real-concurrency inventory, busy shift) | ✅ 391 passed, 1 skipped (opt-in scale) |
| Scale test (`TABLES_SCALE=1`) | ✅ 1 passed |
| `supabase db reset` (fresh, all 20 migrations + seed) | ✅ |
| pgTAP (`supabase test db`, 13 files) | ✅ 504 assertions: 427 existing + 77 new in `tables_visual_customization.test.sql` |
| `supabase db lint --schema public,private --fail-on error` | ✅ no errors (warnings only, the same literal-cast class as existing functions) |
| `local-db.ps1 -Action types-check` | ✅ types match |
| Playwright `e2e/tables/visual-customization.spec.ts` | ✅ 3/3 (rerun with `journeys.spec.ts`: 9/9) |
| Playwright full suite (42 tests) | ✅ all 42 passed — see §3.1 |
| `npm run build` | ✅ |

The 77 new pgTAP assertions cover:
- Own vs foreign vs removed images, and URL instead of asset id.
- Unknown keys, bad colours, hidden or removed mandatory fields, too many questions, select options.
- Draft/published separation; public projection contents; no draft leakage.
- Every answer rule (required, unknown id, option, type, hidden, length, shape) and the labelled
  snapshot.
- Hidden email not stored; replay cannot overwrite; manage link never returns answers.
- Waitlist required question and hidden notes; standard pages accept no answers and still book.
- Tenant isolation (org B cannot use org A's image or read A's reservation).
- Host sees answers, viewer doesn't; publish re-check after an image is removed.
- Export includes and anonymization erases answers.
- Menu hero, gallery, section and dish images, gallery order, bounds, publish blocking.
- Grants: cores and validators not client-callable.

The Playwright spec covers three areas:
- **Design and publish:**
  - Studio: preset, wording, extra question, the preview at 3 devices, and the unsaved-leave prompt.
  - Save, reload, persisted; guests still see the published page until publish; publish.
  - Preview accent equals live accent (Brand Kit inheritance parity).
  - Guest blocked on the required question, then books; the answer is stored with its label.
- **Menu images:** upload hero, two gallery photos (reordered), section and dish; DB order verified;
  remove section image; publish; guest images load in order with `object-cover` at 320 and 1440, no
  overflow.
- **Sweep:**
  - Booking, waitlist and menu × 320/375/390/430/768/1024/1280/1440 × light/dark × he/en: zero
    overflow, zero targets under 24 px, zero serious/critical axe violations (390 and 1280).
  - The studio at every size in light and dark, including the phone preview sheet.
  - Screenshots are in `test-evidence/tables/visual-customization/` (git-ignored).

### 3.1 Full Playwright suite
`npx playwright test` (all 8 files, 42 tests, Edge channel, local stack):
- First full run: **all 20 Tables tests passed** (owner, walkthrough, journeys, busy shift, the full visual/axe sweep and the new spec) plus 4 others.
- The 11 failures in that run (`journey.spec.ts` operator onboarding, and its 7 dependents not run; 10 `responsive.spec.ts` cases) were environment gaps, not regressions:
  - the operator test needs `supabase functions serve` (the `operator-invitations` Edge Function);
  - `responsive.spec.ts` needs a demo-mode dev server on :5173, which the Playwright config does not start.
- After starting both locally, `journey.spec.ts` + `responsive.spec.ts` passed **22/22**. Together, all 42 tests passed on this branch.

### 3.2 Rollback dry-run
Ran `supabase/rollback/tables-visual-customization-down.sql` on the local DB inside a transaction that was rolled back afterwards:
- With answers present, the guard refused.
- After clearing them, the script removed both columns and all 7 `private.*_core` functions, restored anon booking and the original grants (anon still cannot read details), and restored the menu checker.
- The public venue function kept working.

## 4. Known limitations
- **Owner wording is single-language.** It is shown as written on both `?lang=he` and `?lang=en`;
  standard wording stays localized.
- **Brand Kit inheritance is live** (like the existing Tables accent): a Brand Kit change shows on
  published pages without republishing. The page config itself is frozen at publish.
- **A publish from the studio is the venue publish.** It also releases other unpublished venue-draft
  edits; the studio says so before publishing.
- **The manage page uses the published look but not custom wording.** The reservation manage page
  (`/t/r`) shows the published look; questions are not editable there.
- **Editing answers:** staff cannot edit answers (read-only in the detail panel and waitlist rows).
- **Image removal:** removing an image from the library never deletes the stored object (existing
  brand-media rule). Publishing a page or menu that still references it is blocked with a clear
  message.
- **`private.tables_draft_problems` was not changed.** An invalid `publicPages` is rejected on save by
  the trigger rather than listed as a draft problem (the editor never produces one).

## 5. Integrating into the latest production branch

1. Rebase or merge this branch onto the current `production-v1` / `main` in a fresh worktree, then
   resolve the conflicts below.
2. **Migration ordering:** `20261111090000` must sort after every migration already applied in
   production. If production has gained a migration with a later timestamp, rename this file to a
   newer timestamp before applying. The migration name is the only thing that changes.
   - If a newer migration does `create or replace function` on any wrapped function
     (`tables_public_book`, `tables_public_waitlist_join`, `tables_public_venue`,
     `tables_reservation_detail`, `tables_waitlist`, `tables_export_guest`, `tables_anonymize_guest`)
     or on `private.tables_menu_problems`, it must be applied **before** this one. Otherwise it would
     replace a wrapper and silently drop answer validation or exposure. After rebasing, grep the
     newer migrations for those names.
3. **Verify locally:**
   - `supabase db reset`, check that the last line is `Finished supabase db reset`, then
     `supabase test db`.
   - `local-db.ps1 -Action types` and `types-check`.
   - typecheck, lint, vitest, build, and the Playwright spec above.
4. **Production (only with explicit approval and a fresh backup):**
   - Apply the single migration.
   - Run the read-only check: the `tables_guard_public_pages` triggers exist, and anon has execute
     on the wrappers but not on `private.*_core`.
   - Deploy the frontend.
   - The feature is inert until an owner saves a design; menus without images are unchanged.

**Rollback:** `supabase/rollback/tables-visual-customization-down.sql`. It refuses while answers
exist (export first), restores the original commands, grants and menu checker, and drops the
guards, validators and columns. Designs and menu images stay as harmless JSON that the previous app
ignores. Run it before `tables-down.sql` if both are ever needed. It was dry-run locally inside a
rolled-back transaction (§3.2).

## 6. Possible conflicts with the production session
Files that the other session was editing or planned to edit, which this branch also touches:
- `src/tables/host/DetailPanel.tsx`: +2 lines (import and `<CustomAnswers … />` under the request
  line). Low risk.
- `src/tables/domain/draft.ts`: `normalizeDraft` gains one spread line and an import. Keep it in any
  rewrite, otherwise VenueSetup saves will drop `publicPages`.
- `src/tables/public/BookingPage.tsx`: the details step now uses `GuestFields`; the local
  `Field`/`inputCls` moved to `GuestFields.tsx`. Expect a real merge here if the other session edited
  the form.
- `src/tables/domain/types.ts` (`publicPages?`, `CustomAnswer`, `WaitlistEntry.customAnswers`) and
  `src/tables/domain/status.ts` (untouched here).
- `src/tables/owner/VenueSetup*` and `docs/tables/IMPLEMENTATION_PROGRESS.md`: untouched here, to
  avoid conflicts. Add a progress entry after merging.
- Also touched:
  - `src/App.tsx` (2 routes)
  - `ManagePage.tsx` (published look)
  - `VenueOverview.tsx` (1 link)
  - `WaitlistPages.tsx`, `PublicShell.tsx`, `MenuPage.tsx`, `MenusPage.tsx`, `i18n.ts`, `errors.ts`
  - `tables.css` (appended block)
  - `client.ts`
  - `database.generated.ts` (regenerate after merging rather than hand-merging)

## 7. Changed files
**New**
- `src/tables/domain/publicPages.ts`, `publicPages.test.ts`: model, presets, normalization, validation, look
- `src/tables/owner/PublicPagesStudio.tsx`: design studio; `src/tables/owner/MenuImages.tsx`: image slot and gallery editor
- `src/tables/public/GuestFields.tsx`, `PagePreview.tsx`, `look.ts`: configurable fields, iframe preview, look and asset helpers
- `src/tables/host/CustomAnswers.tsx`
- `supabase/migrations/20261111090000_tables_visual_customization.sql`
- `supabase/tests/database/tables_visual_customization.test.sql`
- `supabase/rollback/tables-visual-customization-down.sql`
- `e2e/tables/visual-customization.spec.ts`
- `docs/tables/VISUAL_CUSTOMIZATION_HANDOFF.md`

**Modified**
- `src/App.tsx`: `/t-preview` and `/app/tables/:venueId/design` routes
- `src/tables/data/client.ts`: menu media types, `PublicVenue.pages/brandKit/assetOwner`, `customAnswers`
- `src/tables/domain/types.ts`, `draft.ts`, `errors.ts`
- `src/tables/owner/MenusPage.tsx` (Codex partial work completed), `VenueOverview.tsx` (studio link)
- `src/tables/public/BookingPage.tsx`, `WaitlistPages.tsx`, `ManagePage.tsx`, `MenuPage.tsx`, `PublicShell.tsx`, `i18n.ts`
- `src/tables/host/DetailPanel.tsx`, `WaitlistView.tsx`
- `src/tables/tables.css` (appended public-page design layer)
- `src/production/database.generated.ts` (regenerated)
