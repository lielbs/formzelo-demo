# Formangle by RockStack — local demo

**לכל עסק יש את הזווית שלו.** · *Every business. A different angle.*

**Formangle** (Form + Angle) is RockStack Digital Solutions' branded digital-workflow and business-process platform: customer-facing workflows (requests, approvals, bookings, registrations, optional payment), business branding and digital presence, and an owner dashboard. It is marketed, configured and supported by RockStack — not a public self-service SaaS. One schema-driven engine renders every workflow — flower orders, garage repair approvals, restaurant events and bookings, contest registrations, document collection, quote requests — with no per-business pages.

> **Naming and compatibility.** The product was previously called *Formzelo*. The repository (`lielbs/formzelo-demo`), the npm package name, the GitHub Pages path (`/formzelo-demo/`) and the browser storage namespace (`formzelo:v1:` / `formzelo:ui:`) intentionally keep the old name so existing links, deep links and every visitor's saved data keep working. Renaming the repository or moving to a Formangle domain is a separate, future decision.

**Brand assets** (local, editable SVG): `public/favicon.svg` (app icon), `public/brand/formangle-mark.svg`, `public/brand/formangle-lockup.svg`, `public/brand/formangle-lockup-dark.svg`; `public/og-image.png` (1200×630 social preview, rendered locally from the same SVG). In code: `src/components/Brand.tsx` (`BrandMark`, `Wordmark`, `Logo` full / compact / stacked, `PRODUCT_NAME`). The mark is an "F" whose arms are cut at one angle, with an orange wedge — a form seen from a different angle. Canonical spelling: **Formangle**.

> **This is a local demo.** It runs entirely in your browser with `localStorage`. There is no server, no account, no AI model, no payments, no real messages and no real reservations. Every simulation is labeled in the UI.

> **Release Candidate 1.0** (branch `rc-v1`): Formangle Actions, publishing & sharing (QR / WhatsApp / website snippets), external payment link timing and preview, deployment readiness. See `docs/RELEASE_NOTES_RC1.md`, `docs/ARCHITECTURE_BACKEND.md` (what is local vs. simulated vs. not connected, and the minimum backend), `docs/DEPLOYMENT.md` (custom-domain readiness), `docs/LEGAL_PLACEHOLDERS.md` and `docs/RELEASE_CANDIDATE_PROGRESS.md` (handoff log).

---

**Live demo (GitHub Pages):** https://lielbs.github.io/formzelo-demo/ — runs entirely in your browser (localStorage). Theme gallery: https://lielbs.github.io/formzelo-demo/themes

## Quick start

Requirements: Node.js 18+ (tested with Node 24.15 / npm 11.12).

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Type-check (`tsc --noEmit`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |

No API keys or cloud services are needed. **Zero operating cost by design:** static hosting on GitHub Pages, data in the visitor's browser, no paid AI, database, auth, payment, SMS or asset services.

Optional build-time variable:

| Variable | Effect |
| --- | --- |
| `VITE_CONTACT_EMAIL` | The "רוצים תהליך כזה לעסק שלכם?" button opens the visitor's mail app (`mailto:`) with a prepared message to **contact@rockstackds.com** (default in `src/lib/links.ts`). Setting this variable overrides the address. No leads are collected or stored by the demo. On Pages, set it as a repository variable (Settings → Secrets and variables → Actions → Variables → `VITE_CONTACT_EMAIL`); `pages.yml` already passes it to the build.

---

## Deploying to GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main`: `npm ci` → `npm test` → `npm run build` with `VITE_BASE=/<repo>/` → copies `index.html` to `404.html` (SPA fallback for deep links like `/app/requests/<id>`) → deploys with `actions/deploy-pages`. The build also writes `<route>.html` entries for marketing pages and public demo flows (`STATIC_ROUTES` in `vite.config.ts`) so those links answer 200, and adds a self-only Content-Security-Policy meta; `VITE_SITE_URL` (optional repository variable) sets og:image / og:url for a future custom domain (`docs/DEPLOYMENT.md`). The router basename and every raw link go through `src/lib/links.ts`, so the app works under any sub-path. Pages must be set to **Source: GitHub Actions** in the repository settings.

Local check of the sub-path build:

```bash
VITE_BASE=/formzelo-demo/ npm run build
```

## Demo navigation

| Route | What to try |
| --- | --- |
| `/` | Sales-first landing page: "כל הפניות והתהליכים של העסק. בחוויה אחת שמרגישה כמו המותג שלכם." Primary CTA **צפו בהדגמה** (→ `/tour`), secondary **תיאום הדגמה לעסק** (prepared email to RockStack sales). The hero's builder panel ("מתארים את הצורך — ומקבלים תהליך מוכן לעריכה.") runs the local generator into the real renderer. Customer → business → RockStack story, five live examples, brand and completion showcases, package cards, FAQ, interest CTA and an explicit "what the demo doesn't do" note. |
| `/tour` | **Guided sales demo (≈2 min):** 1 choose a business type → 2 see its workflow (real renderer, phone / desktop) → 3 brand it (name, logo kept in memory only, colour, design style) → 4 fill it as a customer (a real local submission; garage opens a personal case first) → 5 see the owner view (the request, its status / payment badges, the workflow's objective metric, recent requests, buttons into the dashboard and the studio) → interest CTA. |
| `/demo` | Pick one of four fictional workspaces: **Bloom Studio** (flowers), **AutoCare Garage** (repairs), **Urban Table** (private events + table booking), **Valley Run** (race registration). Also: reset demo data. |
| `/app` | Dashboard: KPI cards, onboarding checklist, recent requests with filters, activity timeline, simulated notifications. |
| `/app/workflows` | Search, filter, open, copy link, duplicate, archive/restore. |
| `/app/workflows/new` | **"מה נרצה ליצור היום?"** — four implemented ways to start: describe in Hebrew, an industry template, a blank workflow (one step with name + phone), or duplicate an existing workflow. Then choose the customer experience (בוטיק / מקצועי / מודרני / פרימיום / מינימלי / יצירתי — the six design personalities, shown as live thumbnails), review what was prepared, and continue in the studio. |
| `/app/workflows/:id` | **Design studio** with four modes — **תוכן** (structure pane · live canvas · contextual inspector), **עיצוב**, **לוגיקה** (every condition, price rule, fee, capacity limit and booking rule in plain Hebrew, plus the logic checker) and **תצוגה ובדיקה** (full-width customer test run on phone / tablet / desktop). **הוספת שדה** opens a searchable library grouped as בסיסי / עסקי / תצוגה / מתקדם with a live preview rendered by the real field component in the workflow's theme. Field settings are progressive: title, help, required/optional, options and prices first; condition, multiplier, limits, type and internal key under "הגדרות מתקדמות". Duplicate (fresh ids, unique key), delete with an undo toast, undo / redo (Ctrl+Z / Ctrl+Shift+Z), "הכול שמור" status, save draft, a publish readiness checklist and a success state with the public link shown only after the repository confirms the new version. |
| `/app/brand` | **Brand kit**, in four tabs (`?tab=details|design|links|preview`): **פרטי העסק**, **עיצוב ומיתוג**, **קישורים עסקיים** (the Business Engagement Kit — see below) and **תצוגה מקדימה** (phone / desktop preview, brand summary and the links customers will see). Save status, unsaved-changes guard, and invalid links jump you to their tab. Contents: display name, description, logo + secondary logo + cover (local upload), 4 brand colors with local colour extraction from the logo, typography, button shape, density, logo placement, decorations on/off, default design personality. Live preview on a real workflow. |
| `/app/requests` | Inbox with status tabs, search, workflow filter, payment-state filter (none / quote / outstanding / paid — all simulated), sorting, **תיק חדש** (garage case). |
| `/app/requests/:id` | Answers, booking card (request vs confirmed), completion & payment summary, price breakdown, approve / reject / request changes / complete / cancel, simulated "mark paid", internal notes, event timeline, notification previews. |
| `/app/analytics` | Computed live from local runs: per-day chart, approval rate, response time, value per workflow. Toggle **כולל נתוני דמו** to exclude seeded data. |
| `/app/settings` | Workspace settings, simulated team, storage usage, JSON export, reset, **payment connectors catalog** (PayPlus, Cardcom, Tranzila, Grow/Meshulam, Pelecard, HYP, SUMIT, iCount, Morning, PayMe, Z-Credit, iCredit, Other — all "not connected · future"). |
| `/f/:slug` | Public customer flow, e.g. `/f/bloom-flowers`, `/f/urban-table-events`, `/f/urban-table-booking`, `/f/valley-run`, `/f/autocare-repairs?r=run_demo_garage_case`. |
| `/pricing` | **RockStack-managed packages** (proposed, subject to discovery and a quote; all prices exclude VAT): **Business** 399 ₪/month (up to 3 active workflows), **Business Plus** 499 ₪/month (up to 8, complex logic, extended support — recommended), **Enterprise** custom quote. One-time setup fees are not published as amounts: they vary with the scope and the business's needs and are set in the quote. Each CTA opens a prepared email to `contact@rockstackds.com` with a package-specific subject. Comparison table (desktop), what setup includes, integrations / custom development priced separately. No checkout, billing, subscription activation, signup or usage-limit enforcement. |
| `/themes` | Theme gallery: the six presets rendered live by the real engine, desktop/phone toggle, mix any theme with any sample content. |

### Scripted walkthroughs (all verified in a browser)

1. **Flower order** → `/f/bloom-flowers` → bouquet style, budget 350, pastel, birthday → greeting (live card preview), sender, gift wrap (+20) → recipient, address, date → summary shows 350 + 20 + 30 delivery = **₪400** → choose **תשלום מדומה עכשיו** or **מאוחר יותר** (no card fields, nothing charged) → consent → submit. Open `/demo` → Bloom Studio: the request is first in the dashboard.
2. **Garage** → `/f/autocare-repairs?r=run_demo_garage_case` → approve brake pads (650) and wipers (140), decline cabin filter (180) → **₪790** → consent → submit. The AutoCare inbox shows each decision separately. To start another case: AutoCare → **בקשות → תיק חדש**.
3. **Builder** → `/app/workflows/new` → type e.g. `סטודיו ליוגה שרוצה טופס הרשמה לשיעור ניסיון עם תאריך ואימייל` → create → save → edit title / add a field → **פרסום** → **שיתוף → פתיחה כלקוח** → submit.
4. **Restaurant event** → `/f/urban-table-events` → 20 guests, chef menu (240/guest), wine (65/guest), cake (450) = **₪6,550**; the 20% deposit (**₪1,310**) is requested only after approval (simulated). Pick "אירוע עסקי" to see the conditional company field. Approve in Urban Table → "ממתין למקדמה" → mark paid (simulation).
5. **Table booking** → `/f/urban-table-booking` → Sundays are rejected; slots show "מקומות אחרונים" / "מלא" from requests stored in this browser → submit → confirmation says **בקשת הזמנה — טרם אושרה** → approve in Urban Table (**אישור ההזמנה**) → the customer link now shows **הזמנה מאושרת**.
6. **Brand kit** → `/app/brand` → change the primary colour / logo placement → save. Inheriting drafts update in the studio; the public link keeps the published look until you publish a new version.
7. **Persistence / isolation** → reload any page: everything persists. Switch workspaces from the sidebar: each workspace shows only its own data and brand kit.
8. **Composed workflow** → `/app/workflows/new` → pick the example `תהליך הרשמה לתחרות עם שלושה מסלולים, הגבלת משתתפים, אישור הורה לקטינים ותשלום אופציונלי` → the creation screen lists what was detected (registration, minors, 3 tracks, participant limit, parental consent, optional payment) and an amber **"דורש בדיקה או לא נתמך בדמו"** box → save → the studio shows the same review notes (owner-only) → publish → the public page offers three priced tracks with "נותרו N מקומות" (counted in this browser), a parent-consent step that appears only for ages under 18, and a simulated pay-now / pay-later checkout.
10. **Contest showcase** → `/f/valley-run` → three tracks with places left (the half marathon shows "נותרו 2 מקומות", counted from this browser's registrations) → age 15 adds the parent-consent step, age 30 doesn't → simulated pay-now or pay-later → Valley Run inbox.
11. **Guided tour** → `/tour` → pick any business → brand it → submit as a customer → the owner view shows your request; **פתיחה בלוח הבקרה** opens it in that workspace.
9. **Booking lifecycle** → submit a table booking → the confirmation shows a progress strip (נשלחה → בבדיקה → מאושרת) and **ביטול בקשת ההזמנה** → cancel (two-step) → "ההזמנה בוטלה. המקום לא שמור." and the slot is released.

---

## Architecture

```
src/
  domain/schema.ts        Zod schemas = single source of truth for every entity + inferred TS types
  domain/theme.ts         WorkflowTheme (design) + Asset schemas and asset size limits
  theme/                  Theme engine (presentation only, no business logic)
    presets.ts            Six art-directed presets + buildTheme()
    resolver.ts           ThemeResolver interface + deterministic KeywordThemeResolver (not AI)
    tokens.ts             Theme → CSS custom properties + data-* attributes, contrast repair/warnings
    brand.ts              Brand kit → effective theme; freezeTheme() for publishing
    PresetPreview.tsx     Miniature built from real tokens (gallery / pickers)
    color.ts              WCAG contrast helpers
    art.tsx               Original local SVG artwork (hero art, option illustrations) + inference
    theme.css             All themed component styles; container queries for layout
    ThemeScope.tsx        Applies a theme to a subtree; bundles local @fontsource fonts
  engine/                 Pure, framework-free business logic (unit-tested)
    conditions.ts         Declarative condition evaluation (closed operator set)
    pricing.ts            Option prices, add-ons, per-unit multipliers, fees (price calculation only)
    completion.ts         Completion / payment modes, payment plans and simulated states (independent from pricing)
    booking.ts            Booking rules: open days, slots, local capacity, request vs confirmed; AvailabilityProvider seam
    ai.ts                 AIProvider interface — inactive; only the local deterministic provider exists
    validation.ts         Builds Zod validators per field; display formatting
    transitions.ts        Run state machine + owner actions
    templates.ts          Real WorkflowConfig templates
    compose.ts            DEMO intent analysis (purpose, audience, choices, capacity, consent, approval, payment, booking,
                          unsupported requirements) + composition of registration / survey flows from reusable blocks
    generator.ts          DEMO entry point: composes or adapts the closest template, attaches owner-only review notes (not AI)
    capacity.ts           Limited places per option (e.g. 30 per track), counted locally — not a cross-device guarantee
    metrics.ts            Objective-aware metrics (bookings, approvals, quotes, registrations, simulated payments)
    runs.ts               Builds a run submission + simulated notification previews
  data/
    repository.ts         Async FormangleRepository interface (storage-agnostic contract)
    localRepository.ts    localStorage implementation: versioned keys, Zod-validated reads, quarantine/recovery, local image assets
    migrations.ts         Pure forward migrations applied on read (v1 → v2 designs, v2 → v3 brand kit + booking demo)
    seed.ts               Fictional demo workspaces
    store.tsx             React context + useRepoQuery hook (refetch on writes, cross-tab via `storage` event)
  integrations/payments.ts  PaymentProviderAdapter interface, provider catalog, simulated adapter (no live integrations)
  renderer/               The ONE universal workflow renderer: field controls, content blocks, hero, stepper, price summary,
                          checkout (simulated), reservation card, review, confirmation
  pages/app/WorkflowEditor.tsx  Design studio shell (structure · canvas · inspector, undo/redo, drag-and-drop reordering)
  hooks/useUnsavedGuard.ts      Unsaved-change protection: beforeunload + capture-phase guard on in-app links / workspace switches
  pages/app/editor/       Block library, inspectors, Design panel, device previews
  pages/app/BrandKit.tsx  Workspace brand kit
  components/             UI primitives, layout, timeline, tables, modals
  pages/                  Marketing pages, public flow, /app pages (code-split)
  test/                   Vitest suites
```

Key decisions:

- **One renderer, many businesses.** `WorkflowRenderer` reads a `WorkflowConfig` and handles steps, progress, validation, conditional display, live totals, summary, consent and submission. Flowers, garage and restaurant are only data.
- **Repository boundary.** Pages only call `FormangleRepository`. The interface is async so a `SupabaseRepository` (or REST client) can replace `LocalStorageRepository` by changing one line in `src/data/store.tsx`.
- **Validation at every boundary.** Every localStorage read is parsed with Zod; every write is validated before persisting; the generator's output is parsed; submissions are re-validated in the repository (not only in the UI).
- **Immutable versions.** Publishing snapshots the draft into a `WorkflowVersion`. A run stores `versionId` and is always rendered and priced with that version, even after re-publishing.
- **No arbitrary code.** Conditions use a fixed operator enum; pricing is declarative. Nothing from configuration is ever evaluated as JavaScript.
- **Design is separate from business data.** `Workflow.design` (draft) and `WorkflowVersion.design` (frozen at publish) hold a `WorkflowTheme`; `WorkflowConfig` stays purely business. Old runs render with the exact config **and** design of their version.
- **Payment is optional and separate from pricing.** `WorkflowConfig.completion.mode` is one of `request`, `quote`, `fixed`, `calculated`, `deposit` (on submit / after approval), `pay_after_approval`, `external_link` (https only). Request / quote runs have payment status `none` / `quote` and never appear as outstanding. Every "paid" state is suffixed `_simulated`; the demo never shows card fields and never contacts a provider. Legacy versions without `completion` keep their original behaviour (derived in `engine/completion.ts`).
- **Booking requests are not confirmations.** A booking stays "בקשת הזמנה — טרם אושרה" until the business approves it. Availability is computed from requests in this browser only and is explicitly not a guarantee; production capacity enforcement belongs server-side behind `AvailabilityProvider`.
- **Brand kit + per-workflow override.** Workflows with `design.inheritBrand` take colours, type, button shape, density, logo and cover from the workspace brand kit; publishing stores the *resolved* theme with inheritance off, so brand edits never alter published versions.
- **Content is data, never markup.** Blocks (heading, text, terms, highlights, image, gallery, divider, price breakdown) render user text as React text nodes; images are local illustration keys or workspace asset ids (regex-validated, never URLs).
- **Performance.** The public flow is bundled eagerly; owner pages, the app shell (`AppLayout`) and Recharts are lazy-loaded chunks. Vendor code is split into stable chunks (`vendor-react`, `vendor-router`, `vendor-zod`, `vendor-forms`) so deploys don't invalidate them and they download in parallel. Fonts are local (`@fontsource`, OFL) and only downloaded when a theme uses them.
- **Composition before templates.** The generator first builds a structured `PromptIntent`; registration and survey requests are assembled from blocks (choice tiles with per-option capacity, participant details, conditional parent-consent step, completion mode), domain requests adapt the closest template. Anything the demo can't do safely (real SMS, signatures, invoices, card charging, calendar sync, ID numbers…) becomes an owner-only `draftNotes` entry, never a fake feature.
- **Measure by objective.** Dashboard and analytics classify each workflow (`booking`, `approval`, `quote`, `payment`, `registration`, `request`) and only payment workflows report (simulated) money. Garage approvals count approved items, not revenue; rejected / cancelled requests never show an open payment.

### Theme engine

Six presets that differ in composition, hero, typography, component shapes, density and motion — not only color:

| Preset | Palette | Composition / hero | Type | Components | Default for |
| --- | --- | --- | --- | --- | --- |
| Floral Boutique | blush, ivory, sage | editorial split · organic panel with live order card | Frank Ruhl Libre + Heebo | soft cards, underline inputs, illustrated tiles, pill buttons, dots progress | flowers, gifts |
| Automotive Precision | charcoal, graphite, restrained orange | decision layout · dark technical band with case spec plate | IBM Plex Sans Hebrew | outlined, sharp, compact, numbered progress, explicit approve/decline cards | garage, repairs |
| Hospitality Premium | espresso, cream, terracotta | product grid + sticky estimate · atmospheric hero | Bellefair + Heebo | elevated, filled inputs, menu/extras gallery, step tabs | restaurants, events |
| Corporate Modern | white, navy, slate | centered · compact trust header | Heebo | outlined rows, step checklist | offices, documents |
| Creative Studio | paper, violet, yellow, black | centered · bold poster | Secular One + Rubik | high-contrast inverted selection, hard shadows, expressive motion | studios, workshops |
| Modern Minimal | neutral greys | centered · minimal | Rubik | flat, chips, progress bar | anything unrecognised |

All variation flows through CSS custom properties + `data-*` attributes set by `ThemeScope`; layout uses **container queries**, so the editor's 390 px / 1280 px previews are the real layouts. Contrast is enforced: button text color is computed, link/icon colors are darkened to ≥ 4.5:1, and the Design tab warns about weak owner colors. `prefers-reduced-motion` disables all animation.

**Automatic selection** (`theme/resolver.ts`): `KeywordThemeResolver` scores Hebrew keyword stems in the prompt/title/description/industry plus a weight for the source template (flower → floral, garage → automotive, restaurant → hospitality, documents/quotes → corporate, studio/design/workshop → creative), with modern minimal as fallback. It returns a preset, confidence, matched words and a Hebrew reason. It is deterministic and local; the `ThemeResolver` interface is the seam for a future model-backed resolver.

**Presentation inference** (`renderer/appearance.ts`, `theme/art.tsx`): fields may carry an optional `appearance` (`tiles | list | chips | swatches | stepper | card_preview`) and decisions a `priority`; with `auto`, the renderer infers them (bounded number → quantity stepper, color options → swatches, "ברכה" textarea → greeting-card preview, menu/bouquet/cake/DJ… → local illustrations). Illustrations are always captioned **"איור להמחשה"** — no product photos or diagnostic images are invented.

**Design tab** (editor): preset gallery built from the real tokens, recommended theme + reason, reset-to-recommended, undo, revert unsaved design, colors, typography, hero, composition, card/input/option/button variants, radius, shadow, density, progress, motion, mobile options, logo/cover upload. "Save draft" stores config + design; "Publish" freezes both into a new version.

**Local images**: uploads are decoded and re-encoded on a canvas (strips EXIF), downscaled and compressed (logo ≤ 80 KB, cover ≤ 320 KB, ≤ 1.2 MB per workspace) and stored under `formzelo:v1:assets:<orgId>` — never inside versions. Images used by a published version can't be deleted; missing/corrupt assets fall back to the illustration.

**Migration**: data schema v2 (namespace stays `formzelo:v1:`). On first read, v1 workspaces get a resolver-chosen design on every workflow and the same design frozen onto existing versions; runs, answers and statuses are untouched. The original payload is kept under `formzelo:v1:pre-v2:*`.

### Completion modes, booking and blocks (schema v3)

```ts
completion?: { mode: 'request'|'quote'|'fixed'|'calculated'|'deposit'|'pay_after_approval'|'external_link',
               fixedAmount?, depositPercent?, depositTiming?: 'on_submit'|'after_approval',
               allowPayLater?, externalUrl? /* https only */, externalLabel?, providerId? /* future, catalog only */ }
booking?:    { enabled, dateKey, timeKey?, guestsKey?, openWeekdays: number[], slots: 'HH:MM'[],
               capacityPerSlot, capacityUnit: 'bookings'|'guests' }
confirmation?: { title?, nextSteps?: string[] }
WorkflowField += time | heading | image | gallery | divider | highlights | price_breakdown | terms,
                 content?, media?: (artKey|assetId)[], items?: {title, text?, icon?}[], appearance: …|image_cards
Payment.status: none | quote | payment_requested | deposit_requested | paid_simulated | deposit_paid_simulated | external_link
OrgData.brandKit: { displayName, description, logo/secondaryLogo/cover asset ids, palette{primary,secondary,accent,background},
                    typography, button, density, logoPlacement, decorations, personality }
```

### Premium layer (stage, display type, living artwork, motion)

`theme/premium.css` sits on top of the theme layer and lifts every design through the same tokens:

- **Stage:** for banner, immersive, centered and compact heroes (not the side-by-side editorial layout or posters) the hero colour runs edge to edge and continues under the top of the form card, which floats on it with a soft shadow (true black on dark designs). The art's sides fade into the band.
- **Display type** at real display sizes (≈56px desktop), tighter leading, larger step titles and card padding.
- **Living artwork:** each of the 12 hero illustrations has its own slow motion — petals sway, candles flicker and glow, a gauge needle sweeps, waves travel, the sun rises behind arches, confetti drifts, leaves turn, stars twinkle — plus a drifting ambient light on atmospheric designs. Only real heroes move; gallery thumbnails stay still.
- **Choreography:** hero parts enter one after another, the card settles into place (motion only, never hidden), fields rise in sequence, steps slide; the completion mark lands with a ring and a burst.
- **Tactile controls:** options lift on hover, press down, and their check lands with a spring; inputs glow on focus; the primary button lifts, its arrow moves, and luxury / glam / hospitality / wedding / tech / night designs get a light sweep. Night designs add neon light; luxury and wedding cards carry a fine inner frame.
- **Accessibility:** all motion is transform / opacity only, follows the theme's motion level, and is removed for `prefers-reduced-motion` (hover travel included), `motion: none` and print. Tests (`premium.test.ts`) check the guard, the thumbnail scoping and the keyframe properties.

### Fill experiences and business add-ons

Designs now differ in how the customer walks through the form, not only in how it looks. `theme.flow` picks one of five experiences (`theme/signature.css`); every preset ships with one (`SIGNATURES` in `theme/presets.ts`) and the owner can switch it under **Design Studio → חוויית מילוי**:

| Experience | What the customer gets | Default for |
|---|---|---|
| `card` | The whole step in one floating card (the original look) | modern minimal |
| `focus` | One question per screen in large type, a question counter and progress line, Enter to continue; presentation blocks travel with the next question (`engine/focus.ts`) | hospitality, spa, glam, medical, tech, luxury, night, travel |
| `editorial` | An open magazine page: no card, chapter headings, rules between questions, an ornament before the navigation | floral, bakery, bistro, wedding, nature, community |
| `console` | A rail of steps beside the content and a two-column working grid of fields, numbered questions | garage, corporate, legal, finance, home services, academy |
| `playful` | Outlined cards, hard offset shadows, highlighted titles, stickers | creative, celebration, kids, pets, fitness |

`theme.extras` holds the business's own touches, edited under **Design Studio → תוספות שמייחדות את העסק** and kept when the style changes: an announcement strip, a sticker on the opening, a note from the owner (name, role, message, optional photo), up to four short promises with icons, a background texture (dots, grid, waves, confetti, stripes, diamonds — SVG built only from palette colours) and a personal sign-off on the confirmation. All owner text is rendered as text; empty text renders nothing.

Both fields are optional: designs saved before them render exactly as before (`card`, no add-ons). Schema v6 migrates only the fictional demo workspaces, giving each demo business its experience and add-ons on the draft and the published version (`data/demoExtras.ts`); business config, runs and answers are untouched.

### The business's own images

`theme.media` (optional) decides how the business's photos and logo sit in a design — edited under **Design Studio → תמונות העסק ולוגו**, kept when the style changes (`renderer/media.tsx`, `theme/media.css`):

- **Photo of the place** (`hero.coverAssetId`) in five placements: behind the opening (the original behaviour), half of the opening, a shaped frame (rounded, arch, circle, organic — the default follows the design's artwork), a wide band under the title, or soft ambience behind the whole page. Side-by-side placements measure the opening itself (a container query), so a narrow editorial column stays stacked.
- **Colour treatment:** natural, in the brand colours (duotone from primary and accent), black-and-white, warm or soft — so a phone photo still belongs to the page. Product photos on choice cards always stay natural.
- **Gallery** of up to six business photos (the place, dishes, haircuts, work) as a strip, mosaic, polaroids or a fanned stack, placed in the opening, at the start of the form or on the confirmation. The default layout follows the experience (magazine → mosaic, playful → polaroid, focus → stack).
- **Logo styles:** plain, on a badge, a centred seal, or a large wordmark.
- In the studio, an empty placement shows a labelled frame where the photo will sit; customers never see empty slots. Images are local workspace assets only (the schema rejects URLs and data: values).

### Design library and template library

- **26 designs** (`theme/presets.ts` core six + `theme/presetLibrary.ts`), grouped in 9 categories (יופי וטיפוח, אוכל ואירוח, אירועים וחגיגות, שירותים מקצועיים, בריאות וכושר, בית/רכב/שירותי שטח, חינוך וילדים, פנאי/טבע/תיירות, כללי). Each one is a full art direction — palette, typography, hero layout, composition, decoration, card / input / option / button shapes, radius, depth, density, progress and motion — including two dark designs (יוקרה כהה, ניאון לילה). Every design has a one-word *experience* name (שליו, זוהר, מתוק, חגיגי, אמין, אנרגטי…), a description and "best for".
- **Typography:** 11 presets; five new ones use free OFL Hebrew fonts bundled locally with `@fontsource` (David Libre, Varela Round, Amatic SC, Suez One, Assistant) — no font CDN, no cost. **Hero artwork:** 12 local SVG decorations (new: geometric, waves, arches, celebration, botanical, constellation).
- **Design picker (`theme/PresetPicker.tsx`)** with category filters and live thumbnails, used on the creation screen, in the studio and in the Brand Kit; `/themes` shows all designs with a filter and previews each new design on a library template made for it. The guided tour keeps the six core designs to stay short.
- **49 ready-made templates (`engine/library.ts`)** in 12 topics (beauty, health, food, events, professional services, home, auto, education, retail, pets, travel, community) — e.g. hair salon, nails, spa, bridal makeup, personal training, yoga, clinic, nutrition intake, catering, custom cake, Friday trays, cooking workshop, wedding inquiry, photographer quote, kids' birthday, RSVP, conference registration, VIP guest list, consultation, legal intake, tax-refund check, agency onboarding, property viewing, technician, renovation, cleaning, moving, gardening, car service, class signup, private lessons, summer camp, course enrollment, gift box, custom print, dog boarding, pet grooming, cabin booking, guided tour, volunteering, donation pledge (no payment), satisfaction survey — plus the original eight. Each template is plain `WorkflowConfig` data with real prices, per-unit multipliers, capacities and conditional questions where they fit, paired with its design; everything stays editable. The creation screen's "תבנית לפי תחום" shows them in a searchable, filterable gallery with themed thumbnails.
- Stored designs keep working: the new preset ids, typography presets and decorations are additive enum values.

### Builder: creation paths, field library and logic

- **Creation paths (`engine/builder.ts`):** `START_OPTIONS` lists only implemented options (describe / template / blank / duplicate). `blankWorkflow()` is schema-valid and publishable. `duplicateField()` copies with fresh field / option ids, a unique snake_case key and no inbox role; `insertFields()` places new fields right after the selected one; `pushHistory` / `undoHistory` / `redoHistory` are the studio's undo stack (60 steps, typing coalesces).
- **Field library (`pages/app/editor/blockLibrary.ts`):** basic (short / long text, email, phone, number, single / multiple choice, dropdown, date, time), business (customer details = name + phone + email with inbox roles, package-and-price cards, quantity, paid add-ons, single add-on, address, booking request = date + time + party size, approve / reject, terms acknowledgment, file *name only* — labelled as demo), presentation (heading, info, highlights, image, gallery, divider, price breakdown, terms, "what to prepare", contact actions → digital presence panel) and advanced capabilities that open the right panel (conditional display, extra step, pricing & payment, booking rules & capacity). **Digital signature is listed as unavailable** ("requires identity verification and a secure server") and cannot be added.
- **Logic (`engine/logic.ts`):** conditions read as "הצג את השאלה הזו רק כאשר [שאלה] [תנאי] [ערך]" with a plain-language summary. Only *earlier* answerable questions can be condition sources, which makes circular dependencies impossible by construction; operators are filtered by the source field's type. `logicIssues()` reports forward / self / missing references, display-block sources, stale option values, missing comparison values, non-numeric multipliers, duplicate keys, inverted min / max, choice fields without options, negative prices, conditional first steps, fees and booking rules pointing at deleted fields. `publishReadiness()` turns this into the publish checklist; errors block publishing (saving a draft stays allowed), warnings (no contact field, unreviewed generation notes) inform.

### Business Engagement Kit (digital presence, schema v5)

Configured once per workspace in **ערכת מותג → נוכחות דיגיטלית וקישורים עסקיים**: Instagram, Facebook, TikTok, WhatsApp, Waze, Google Maps, Google Reviews, website, YouTube, LinkedIn, phone, email and custom links (label, URL, icon, optional description). Each link can be added, edited, cleared, removed, enabled / disabled and reordered, with inline validation and a "will open: …" preview; the live workflow preview on the same page updates as you type. Saving is blocked while an enabled link is invalid, and the repository re-checks every link at the trust boundary.

- **Validation (`src/engine/presence.ts`, pure):** only `https:` (http is upgraded), `tel:`, `mailto:` and normalized `https://wa.me/<digits>` can be produced. `javascript:`, `data:`, `file:` and every other scheme, credentials in URLs, localhost / IP hosts, whitespace and quote characters are rejected. Service links must match the service's hostnames (subdomains such as `m.facebook.com`, `vm.tiktok.com`, `ul.waze.com` allowed; look-alikes such as `instagram.com.evil.example` rejected). `@handle` input expands for Instagram, TikTok and YouTube; Israeli numbers become `972…` for WhatsApp. Links are re-validated every time they are rendered, labels are plain text, and external links open with `target="_blank" rel="noopener noreferrer"`.
- **Google Reviews:** a dedicated "קישור לכתיבת ביקורת בגוגל" field that accepts only the review-writing link (`g.page/r/…/review` or `search.google.com/local/writereview…`); a Google Maps link pasted there is rejected with an explanation, and the help text explains how to copy the link from the Google Business Profile. The neutral CTA "שתפו את החוויה שלכם בגוגל" appears only when the owner enabled it for that workflow **and** the request was marked **completed** (a delivered service) — never after a mere request, booking inquiry or approval, never filtered by satisfaction, no incentives, no ratings, and the app never claims a review was written.
- **Per workflow (Design Studio → נוכחות דיגיטלית):** visibility (all / selected / hidden), placement (header, footer, completion, header + completion, footer + completion, all), style (icon row, icon + label, premium action cards, compact mobile navigation) and the review-request toggle. Stored in the draft design, so undo / redo, save draft and the unsaved-changes guard apply. The workflow's primary action stays dominant; engagement links sit outside the form card, and on completion screens below the confirmation details.
- **Publishing:** the Brand Kit links are resolved and frozen into the published version's design (`WorkflowTheme.presence.links`). Editing the Brand Kit never changes a published version; the owner republishes to apply link changes. Versions published before v5 have no `presence` and look exactly as before.
- **Demo content:** the four fictional businesses have sample links (Bloom: Instagram / website / WhatsApp / phone / review; AutoCare: Waze / WhatsApp / phone / Maps / review; Urban Table: Instagram / Maps / website / phone / TikTok; Valley Run: website / Instagram / Facebook / custom "תקנון המרוץ"). Every sample link is flagged `sample` and rendered as a labelled, **non-clickable** preview ("קישורי דוגמה של עסק בדיוני — לא פעילים בדמו"), so visitors are never sent to real, unrelated accounts; domains use reserved names (`.example`, `example.com`) and fictional 555 numbers where the platform allows. Editing a sample value turns it into a real, clickable link.
- **Migration v4 → v5:** brand kits gain a `links` list (empty for real workspaces; the demo workspaces get their sample links). Published versions are untouched. Browsers that already had the demo see the links in drafts and the Brand Kit immediately, and in public flows after a republish or **/demo → איפוס**.
- **Sales contact ≠ business contact:** the "שליחת פנייה ל-RockStack" CTA always opens `mailto:contact@rockstackds.com` (validated `VITE_CONTACT_EMAIL` override; no public GitHub fallback). A business's own email in its Brand Kit is a separate field shown only inside that business's workflows.

**Schema v4:** no structural change to stored workspaces (version bump only, original kept under `formzelo:v1:pre-v4:*`). On the first read of an older browser's meta, demo workspaces introduced later (currently **Valley Run**) are added alongside existing data — never replacing a workspace, and skipped if their slug is already taken by one of the owner's workflows. New template: `contest_registration`.

**Schema additions after v3 (no migration needed — all optional):** `FieldOption.capacity` (places per option, counted locally), `WorkflowConfig.draftNotes` (owner-only review notes from generation). Booking runs gained a customer-side cancellation through the personal link (`cancelRunByCustomer`, booking workflows only, recorded as a customer `status_changed` event).

Booking lifecycle (from run status): `submitted` → **requested**, `in_review` → **pending approval**, `changes_requested` → **update requested**, `approved` / `completed` → **confirmed**, `rejected` → **rejected**, `cancelled` → **cancelled**. Rejected and cancelled requests release their slot and option places.

**Migration v2 → v3** (on first read, original kept under `formzelo:v1:pre-v3:*`): creates each workspace's brand kit from its main workflow design, marks workflows that already match it as inheriting (no visual change), leaves published versions byte-for-byte unchanged, and adds the new **Urban Table booking** demo (workflow + sample requests) to existing Urban Table workspaces without touching their runs. Run references are now "highest + 1", so added runs never collide. No data reset is required; **/demo → איפוס** gives the newest seeds (e.g. Bloom's bouquet-style tiles and highlights appear only in fresh seeds, because published versions are immutable).

### Formangle Actions (schema v7)

Structured owner → customer requests on a run (`OrgData.actions`, `CustomerActionSchema`, rules in `engine/actions.ts`): **approval** (two answers, default "מאשר / לא מאשר"), **choice** (exactly two owner-written answers) and **update** (no answer). Each action freezes its title, details, optional amount, both labels and the run's workflow version; it is never edited — the owner can cancel it while open, and changed terms mean a new action. The customer answers once on the personal request page (`/f/<slug>?r=<runId>`; approving an amount asks for confirmation); expiry is derived from `expiresAt`. Every step is a `RunEvent` (`action_created` / `action_responded` / `action_cancelled`, with `actionId`), tagged apart from internal notes in the timeline. Repository: `listActions`, `createAction` (refuses an identical open action), `cancelAction`, `getPublicActions`, `respondToAction`. Owner UI: "פעולה חדשה ללקוח" with a live preview in the business's design, actions list, "צפייה כלקוח" (`?from=inbox` adds a strip back to the request); inbox badges and filters; dashboard "החלטות לקוחות". In the demo, owner and customer share one browser; nothing is sent, and answers are not electronic signatures.

### Visual standard (`theme/atelier.css`)

Loaded last over every design. Default style is typographic: no clip-art, stickers or pills; one strong opening, hairline promises and highlights, calm notes, typographic option cards with a catalogue index. Each experience family has its own signature opening (magazine: giant initial; concierge: spotlight and hairline; technical: blueprint grid and registration marks; poster: outlined initial; minimal: Swiss rule), drawn with pseudo-elements only where the space is guaranteed empty. Taps, selection, hover and the opening have guarded motion. Illustrations are the owner's choice (`theme.illustrations`, `illustrationSpots`: opening / option cards / image blocks) and always sit in their own frame (`data-art='panel'`). The Brand Kit's decorations switch controls the graphic marks. Thumbnails use `theme/SignatureMark.tsx`, so the gallery shows what forms really look like.

### Publishing and sharing

After publishing: version and time, link, WhatsApp share (`https://wa.me/?text=…`), QR code (`qrcode-generator`, generated locally; PNG / SVG download; `share.test.ts` decodes it back with `jsqr`), and website snippets (link button, iframe — the host sends no frame-blocking headers). `lib/share.ts → linkReach` tells the owner honestly where the link opens: seeded demo flows on any device, anything published only in this browser nowhere else.

### Data model

| Entity | Notes |
| --- | --- |
| `Organization` | Workspace (brand, contact email, `isDemo`). |
| `Membership` | Simulated owner/staff; no real auth. |
| `Workflow` | Slug, status (`draft`/`published`/`archived`), editable `draft` config, `publishedVersionId`. |
| `WorkflowVersion` | Immutable snapshot of a config **and design** with a version number. |
| `WorkflowTheme` | Design tokens (preset, palette, typography, hero, composition, component variants, radius, shadow, density, progress, motion, mobile, logo). Stored as `Workflow.design` / `WorkflowVersion.design`. |
| `Asset` | Local downscaled logo/cover image (data URL), per workspace, separate key. |
| `WorkflowStep` / `WorkflowField` | Part of the config (see below). |
| `WorkflowRun` | A customer submission/case, bound to `versionId`; answers, case answers, price lines, total, payment status. |
| `RunAnswer` | `fieldKey`, label, raw value and human-readable display value. |
| `RunEvent` | Timeline: case created, submitted, status changes, internal notes, simulated notifications/payments. |
| `NotificationPreview` | Email/SMS/WhatsApp preview, `simulated: true`, never sent. |
| `UsageEvent` | Generated, published, link copied, submitted… (feeds onboarding/analytics). |

All entities have stable prefixed IDs (`wf_…`, `run_…`) and `createdAt`/`updatedAt`.

### Workflow schema (`WorkflowConfig`)

```ts
{
  title, description,
  mode: 'public' | 'case',          // case = owner opens a case and sends a personal link (?r=<runId>)
  caseFields: WorkflowField[],       // filled by the owner, read-only for the customer
  steps: [{ id, title, description?, condition?, fields: WorkflowField[] }],
  pricing: { enabled, currency: 'ILS', fees: [{ label, amount, condition? }], depositPercent, totalLabel },
  branding: { primaryColor: '#RRGGBB', logoText },
  consent: { required, text },
  disclaimer?, successMessage
}

WorkflowField {
  id, key /* snake_case, stable */, label,
  type: text | textarea | email | phone | number | date | select | radio | multiselect
      | checkbox | decision | file | info,
  required, placeholder?, helpText?,
  options?: [{ id, label, value, price?, description?, image?, swatch? }],
  price?,          // checkbox when checked / decision when approved / number per unit
  multiplyByKey?,  // multiply this field's price by a numeric field (e.g. per guest)
  min?, max?,      // number: bounds · date: days from today · text: max length
  condition?: { fieldKey, operator: equals|notEquals|includes|isTrue|isFalse|notEmpty|isEmpty|gt|lt, value? },
  role?: customer_name | customer_phone | customer_email | date,
  appearance?: auto | tiles | list | chips | swatches | stepper | card_preview,  // presentation hint
  priority?: critical | recommended | optional                                  // decision urgency badge
}
```

Run statuses: `awaiting_customer → submitted → in_review → approved → completed`, plus `changes_requested` (customer can edit and resubmit via the same link), `rejected` (can be reopened), `cancelled`. Invalid transitions throw.

### Prompt generator (DEMO)

`engine/compose.ts` reads the prompt into a `PromptIntent`: purpose (registration, survey, order, booking, quote, documents, approval), subject (תחרות, סדנה, קורס…), audience (minors, businesses), choice groups with counts in digits or Hebrew number words ("שלושה מסלולים", "2 מועדים"), participant limits ("עד 12 משתתפים" / "הגבלת משתתפים"), parental consent (kept distinct from business approval), approval, payment preference (none / optional / required / deposit / after approval / quote), booking, files, email, address, and a list of unsupported requirements. Registration and survey intents are composed from blocks; other intents use `engine/generator.ts`, which normalizes Hebrew text (strips niqqud/punctuation), matches keyword stems allowing up to two attached prefix letters (ו/ה/ב/ל/מ/ש/כ) so "זר" does not match "עזרה", scores templates, applies modifiers (תמונות, מקדמה, משלוח, אימייל, כתובת, תאריך) and falls back to an editable generic form. Request phrasing ("תיצור לי…") is stripped from titles. Reference scenarios covered by tests and offered as labelled examples on the creation screen: restaurant table reservation without payment, flower customisation with delivery pricing (colours, greeting card and delivery are listed as detected), garage approval without payment (the *customer* approves — not reported as a business-approval step), contest registration, salon appointments (sample services by business kind — hair, nails, beauty, clinic, advisory — beauty prompts get the boutique style instead of the restaurant one), corporate onboarding with documents (a requested signature becomes a review note), and private-event quotation (event template with a price estimate; "optional deposit" → deposit after approval + a review note explaining how to drop it). Theme recommendation stays keyword-based. The UI labels this **"יצירה מקומית מתבניות — בתוך הדפדפן"** and product copy never uses the term "AI"; `engine/ai.ts` holds the inactive `AIProvider` seam for a future model that must return a schema-validated `WorkflowConfig`.

---

## Testing

```bash
npm test
```

209 unit tests in `src/test/` (engine, repository, themes, `v3.test.ts`, `v4.test.ts`, `lifecycle.test.ts`, `prompts.test.ts`, `valley.test.ts`, `presence.test.ts`, `builder.test.ts`, `sales.test.ts`, `library.test.ts`, `premium.test.ts`, `signature.test.ts`, `media.test.ts`, `actions.test.ts`, `share.test.ts`, `deploy.test.ts`, `atelier.test.ts`):

- **Visual standard (`atelier.test.ts`):** no illustrations unless the owner turns them on; the owner's illustration choice and spots survive a change of design; motion only behind the reduced-motion guard with transform/opacity keyframes; decorative marks excluded beside summary cards, on condensed or photo openings; drawings framed in their own panel.

- **Formangle Actions (`actions.test.ts`):** exactly two frozen options for approval / choice and none for updates (schema-enforced); owner input validated (missing / identical answers, empty title, past expiry, closed request); one answer with the original terms kept; no answer after cancel or expiry; answered actions cannot be cancelled; duplicate open actions refused; per-request grouping for the inbox; repository round trip owner → customer link → timeline, cross-workflow access refused, persistence across instances; v6 → v7 migration (sample actions for demo workspaces only, runs untouched).
- **Sharing (`share.test.ts`):** QR codes decode back to the exact URL; SVG output safe; non-http(s) URLs refused; WhatsApp link encoding; HTML-escaped snippets; link reach (seeded demo vs. local-only).
- **Deployment (`deploy.test.ts`):** static entries for every public demo flow and marketing page; no hardcoded host in `index.html`; `VITE_SITE_URL` wired in the workflow; strict CSP.

- **Builder (`builder.test.ts`):** only implemented creation paths; blank workflow valid and publishable; every template, seeded draft and published version passes the logic checker; generated workflows valid; library groups and required entries; unavailable signature; every library entry yields schema-valid fields with unique keys; customer-details roles; insertion position; duplication (ids, key, options, role); key sanitizing; undo / redo semantics; configuration survives a schema round-trip; plain-language conditions; earlier-only condition sources; circular / forward / self / missing references; stale values, missing values, bad multipliers, conditional first step; duplicate keys, inverted limits, broken booking references; operators by type; readiness errors vs warnings; price integrity.
- **Design and template libraries (`theme.test.ts`, `library.test.ts`):** at least 24 valid designs, each structurally unique and with a unique palette, ≥10 typographies and ≥12 decorations in use, every category with a real choice, contrast for every design (text ≥7:1, buttons and links ≥4.5:1), dark designs readable; at least 45 templates with unique ids and titles, every topic covered, every template schema-valid, logic-clean, publishable, with unique keys and fresh ids per build, paired with a valid design (≥20 different designs in use); library prices / conditional fees / multipliers compute correctly; search by text and category; demo-only capabilities labelled.
- **Sales (`sales.test.ts`):** exactly Business / Business Plus / Enterprise with 399, 499 and a custom quote, no published setup amounts (variable-setup wording); VAT, indicative, managed-service and separately-priced wording; each package CTA and the demo-request CTA open `mailto:contact@rockstackds.com` with distinct subjects; the pricing page renders both fees and no checkout; the previous Start / Grow / Scale packages are gone from code and docs; landing headline and CTAs; product copy never uses the term "AI", the generator is described as a local template-based engine, and no AI API host appears in the source; six named experiences; four Brand Kit areas; choice cards are named by their title and described by description, price and places.

- **Business Engagement Kit & rebrand (`presence.test.ts`):** unsafe / local / malformed URLs rejected; http → https; service hostnames incl. mobile and short variants, look-alikes rejected; Google Maps vs review-link separation; tel / mailto / WhatsApp normalization; custom links as plain text; enabled-only, owner order, selected / hidden visibility; placement → slot mapping; review request only for completed services; drafts resolve live links, old designs unchanged; per-workspace persistence and isolation; trust-boundary rejection; freeze at publish, Brand Kit edits need a republish, previous versions unchanged; demo bookings never ask for reviews; v4 → v5 migration; sample links flagged; Formangle name / lockup, page titles (brand vs business), index.html Open Graph tags, no product-facing "Formzelo" left in `src/`; RockStack sales address with validated override and no GitHub fallback; GitHub Pages base path and SPA fallback.

- **Reference prompts (`prompts.test.ts`):** the seven business scenarios above produce the expected template / completion / theme / notes; every labelled example yields a valid workflow with at least medium confidence.
- **Valley Run & v4 migration (`valley.test.ts`):** valid seed with 8 of 10 half-marathon places held; parent consent shown and enforced only below 18; a track closes when its last places are taken; a v3 browser gains the Valley Run workspace without touching existing runs.

- **Schema:** all templates and seeded workspaces validate; malformed configs and unknown operators are rejected.
- **Pricing:** flower (budget + wrap + delivery), garage (only approved repairs), restaurant (per-guest × guests, flat extras, 20% deposit), hidden fields never charged.
- **Validation/conditions:** conditional required field, guest bounds, phone format, date window, required decisions.
- **Transitions:** happy path, invalid jumps, no customer-only actions offered to owners.
- **Generator:** example prompts map to the expected template; stem false-positives avoided; fallback + modifiers.
- **Repository (in-memory store):** workspace isolation, persistence across instances, consent enforcement, garage decisions & total, version binding after re-publish, restaurant approval + simulated deposit, generated workflow publish, corrupt-storage recovery.
- **Themes (`theme.test.ts`):** resolver mapping for all six presets + fallback + stem false positives; six structurally distinct valid presets; schema rejects bad colors/presets/remote images; contrast of buttons/links for every preset; contrast repair; appearance and illustration inference; v1→v2 migration (pure and in-place with backup, runs preserved); draft design persistence; version immutability (old version + old run keep their design, restore brings it back); asset size limits, missing-asset rejection, in-use deletion refusal, workspace scoping, corrupt asset fallback.

- **v3 (`v3.test.ts`):** completion modes (legacy derivation, request/quote never outstanding, deposit on submit / after approval, pay after approval, fixed, calculated with pay-later, safe external links), booking (closed days, unoffered slots, local capacity, rejected requests free the slot), content blocks never become answers / validation errors and reject remote media, brand kit effective/frozen theme, brand kit persistence & per-workspace isolation, workflow override of the brand kit, upload removal blocked while referenced, flower pay-now / pay-later + simulated mark-paid, garage no-payment submission (₪790), booking request → approval → `booking_confirmed`, restaurant ₪9,600 + deposit after approval, conditional company field, custom prompt → create → publish → submit → correct inbox, v2 → v3 migration (pure, in place, booking demo appended, unique references).

- **Composition (`v4.test.ts`):** the contest prompt yields purpose, subject, 3 tracks, capacity, parental consent and optional payment (and no business approval); it is composed from blocks with priced tracks, 30 places each, calculated completion with pay-later, review notes, creative theme; the parent step shows only under 18; price follows the chosen track; explicit numbers / approval / no-payment wording; unsupported requirements (signature, SMS, invoice) become notes; domain prompts keep their templates; surveys compose without payment.
- **Lifecycle (`lifecycle.test.ts`):** every run status maps to a booking stage; requested → pending → confirmed → cancelled; rejection frees places; customer self-cancellation (once, booking flows only); option capacity counted from holding runs and enforced on submit; objective classification; garage approvals never reported as payments.

Browser end-to-end checks after the v4 polish (local headless Edge, fresh profiles, console clean): contest prompt → detected chips + review notes → save → studio banner → publish → public page with priced tracks and places left → age 12 shows the parent step → simulated checkout → submit → places drop to "נותר מקום אחד"; table booking → progress strip → customer cancel → "ההזמנה בוטלה"; studio drag-and-drop reorder, undo, redo, leave-guard blocks sidebar navigation until confirmed; long Hebrew title stays clear of hero artwork; 3,000-character greeting and empty-step validation (3 errors, focus to first); zero horizontal overflow on 15 routes at 375 / 390 / 768 / 1024 / 1440 px and in the studio at 375 / 768 / 1024 / 1440 px.

Browser end-to-end checks for v3 (local headless Edge over the DevTools protocol, fresh profiles, console clean): flower calculated total ₪400 with simulated pay-now → "שולם (סימולציה)"; garage 2 approved / 1 declined → ₪790 with "no payment" checkout and audit-style confirmation; restaurant ₪9,600, deposit ₪1,920 requested only after approval; table booking rejects Sunday, shows local slot availability, confirmation "בקשת הזמנה — טרם אושרה", owner approval → customer page "הזמנה מאושרת"; brand kit edit → live preview → saved, published flower page unchanged until republish; custom prompt (salon) → booking flow without restaurant wording → studio add block → publish → submit → inbox shows it with no payment; zero horizontal overflow on 13 routes at 390 / 768 / 1024 / 1440 px.

Earlier browser end-to-end checks (scripted over the DevTools protocol in local headless Edge against the dev server, fresh profiles): A flower order ₪400 → appears in the Bloom inbox; B garage approve 2 / decline 1 → ₪790 with per-item decisions; C restaurant 30 guests, chef menu, wine, cake → ₪9,600, deposit ₪1,920, conditional company field enforced, owner approval → simulated deposit paid; D Hebrew prompt → auto theme (creative) → override at creation → override + custom color + undo in the Design tab → publish → public page uses the frozen design → submit; E reload keeps data and design, later draft edits don't touch the published version; F workspace isolation; G no horizontal overflow at 375 px (landing, three flows, dashboard, editor) and in the 1440 px editor; console free of errors.

---

## Known limits of the local demo

- **localStorage only.** Data lives in this browser profile on this device (~5 MB quota). It does **not** sync across devices, browsers or private windows. The seeded demo flows open anywhere (every browser seeds them); a workflow created or published only here shows "הקישור אינו זמין" elsewhere, and the share panel says so.
- **Formangle Actions are local.** The customer answers in the same browser as the owner (use "צפייה כלקוח"). Nothing is delivered to a customer's phone; an answer is a recorded choice, not an electronic signature.
- Personal request links use random run ids (`?r=`) with no expiry or revocation. Production needs signed, expiring tokens (`docs/ARCHITECTURE_BACKEND.md`).
- Clearing site data deletes everything. Use **Settings → ייצוא JSON** for a backup.
- If stored data fails Zod validation, it is copied to `formzelo:v1:corrupt:*` and the demo workspace is re-seeded; a notice appears in Settings.
- File fields store only the file name and size; file content is never stored or sent.
- No authentication: anyone using this browser is the "owner". Memberships are simulated.
- No real AI, messages, payments, signatures or delivery-availability checks. Garage approvals have no legal or e-signature validity.
- Writes from two tabs at the same moment are last-write-wins per workspace.
- Package prices are proposed commercial packages for sales conversations. The demo does not enforce workflow allowances, bill, or activate subscriptions.
- The studio's test mode does not save a submission; publish and open the public link to create a real (local) request.
- Real mobile browsers were not used for QA; checks ran in headless Edge with phone-sized viewports.
- Sample demo links are deliberately inert. Real links work as soon as an owner enters them, but no reachability check is made (no network calls).
- Uploaded images live only in this browser and count toward the localStorage quota (capped at 1.2 MB per workspace). In production they'd go to object storage.
- Option illustrations are generic local SVGs, inferred by keywords; they are labelled as illustrative and are not product photos.
- Browsers that ran the earlier demo keep their data after the upgrade (migrated in place). Their stored demo workflows predate the new presentation hints, so some fields fall back to inferred styling (e.g. a dropdown instead of chips); **/demo → איפוס נתוני הדמו** loads the fully art-directed seeds.
- **Payments are simulated.** No provider is connected; "paid" means a labelled demo button was pressed. External payment links open the business's own page and their outcome is unknown to the app.
- **Booking availability is local.** It counts requests stored in this browser; two devices can request the same slot. Nothing is reserved until the business approves, and even then only in this browser.
- **Generation is deterministic keyword matching, not AI.** Unknown prompts produce an editable generic form; the `AIProvider` interface is inactive.
- The unsaved-changes guard (studio and brand kit) covers reload/close and every in-app link or workspace switch. Browser back/forward buttons are not intercepted (the app uses `BrowserRouter`, not a data router).
- Option capacity ("נותרו N מקומות") and booking availability count submissions stored in this browser only.
- Generated names, descriptions and sample prices of composed choices are placeholders and are flagged in the review notes.
- The guided tour's branding (name, logo, colour, style) is a preview only; the uploaded logo lives in memory and disappears when you leave the tour. Use **ערכת מותג** to save branding.
- There is no lead backend. The interest button opens a `mailto:` to contact@rockstackds.com; nothing is sent unless the visitor sends the email from their own mail app.
- Theme selection is keyword-based; unusual wording may pick a less fitting preset — the owner can always override it.

---

## Roadmap to production (not implemented — no paid services used)

1. **Backend & database:** Postgres (e.g. Supabase) with tables mirroring `schema.ts`; implement `SupabaseRepository` behind the same interface; DB migrations; row-level security per organization.
2. **Server auth:** real accounts, organization membership & roles enforced server-side; signed, expiring personal case links (also authorising Formangle Actions answers, one per action, enforced by a unique constraint).
3. **Server-side validation:** reuse `engine/` (pure TS) in API routes / edge functions so pricing and validation can't be bypassed by the client.
4. **Payments:** implement `PaymentProviderAdapter` server-side for the chosen Israeli provider (hosted checkout, signed webhooks, provider transaction ids); the client never marks payments as paid.
5. **Bookings:** server-side transactional capacity (`AvailabilityProvider`, e.g. Postgres exclusion constraints) and optional calendar sync; confirmations only after a successful hold.
6. **Theme resolver:** optionally implement `ThemeResolver` with a model that returns a preset + token overrides validated by `WorkflowThemeSchema`, keeping the keyword resolver as fallback.
7. **Genuine AI provider:** replace `generator.ts` with a model call that returns JSON validated by `WorkflowConfigSchema`; keep the deterministic generator as fallback; bound tokens, cost, rate and retries; human review before publish.
8. **Billing:** subscription plans via a licensed payment provider; real deposits via hosted checkout with webhooks.
9. **Messaging & jobs:** queue + workers for email/SMS/WhatsApp with templates, retries and opt-out.
10. **Audit log:** append-only event store for every state change and admin action.
11. **Secure storage:** object storage for uploads with virus scanning, size limits and signed URLs; data retention policy.
12. **Rate limits & abuse protection** on public links and submissions; bot protection.
13. **Backups & recovery:** automated DB backups, point-in-time restore, tested restore runbook; monitoring and alerting.
