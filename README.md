# formzelo by RockStack — local demo

**כל רעיון הופך לתהליך.** · מתארים. יוצרים. שולחים.

Formzelo turns a business owner's plain-language (Hebrew) description into a shareable, multi-step customer workflow. One schema-driven engine renders every workflow — flower orders, garage repair approvals, restaurant events, document collection, quote requests, or any generic form — with no per-business pages.

> **This is a local demo.** It runs entirely in your browser with `localStorage`. There is no server, no account, no AI model, no payments, no real messages and no real reservations. Every simulation is labeled in the UI.

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

No environment variables, API keys or cloud services are needed.

---

## Deploying to GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main`: `npm ci` → `npm test` → `npm run build` with `VITE_BASE=/<repo>/` → copies `index.html` to `404.html` (SPA fallback for deep links like `/f/<slug>`) → deploys with `actions/deploy-pages`. The router basename and every raw link go through `src/lib/links.ts`, so the app works under any sub-path. Pages must be set to **Source: GitHub Actions** in the repository settings.

Local check of the sub-path build:

```bash
VITE_BASE=/formzelo-demo/ npm run build
```

## Demo navigation

| Route | What to try |
| --- | --- |
| `/` | Landing page. Edit the prompt in the hero and press **יצירה** — the right pane is the real renderer. **צרו תהליך עכשיו** opens the builder. |
| `/demo` | Pick one of three fictional workspaces: **Bloom Studio** (flowers), **AutoCare Garage** (repairs), **Urban Table** (private events). Also: reset demo data. |
| `/app` | Dashboard: KPI cards, onboarding checklist, recent requests with filters, activity timeline, simulated notifications. |
| `/app/workflows` | Search, filter, open, copy link, duplicate, archive/restore. |
| `/app/workflows/new` | Describe a workflow in Hebrew (or click an example). See detected template + keywords, a live preview, then save as draft. |
| `/app/workflows/:id` | Editor: title/description, mode (public / personal case), case fields, steps & fields (type, required, options, prices, order, conditions, min/max), pricing (fees, deposit %), branding, consent. Live preview, versions (view / restore), share link, open case. |
| `/app/requests` | Inbox with status tabs, search, workflow filter, **תיק חדש** (garage case). |
| `/app/requests/:id` | Answers, price breakdown, approve / reject / request changes / complete / cancel, simulated deposit, internal notes, event timeline, notification previews. |
| `/app/analytics` | Computed live from local runs: per-day chart, approval rate, response time, value per workflow. Toggle **כולל נתוני דמו** to exclude seeded data. |
| `/app/settings` | Workspace brand, simulated team, storage usage, JSON export, reset. |
| `/f/:slug` | Public customer flow, e.g. `/f/bloom-flowers`, `/f/urban-table-events`, `/f/autocare-repairs?r=run_demo_garage_case`. |
| `/pricing` | Illustrative plans: 99 / 199 / 399 ₪ per month — no billing. |
| `/themes` | Theme gallery: the six presets rendered live by the real engine, desktop/phone toggle, mix any theme with any sample content. |

### Scripted walkthroughs (all verified in a browser)

1. **Flower order** → `/f/bloom-flowers` → budget 350, pastel, birthday → greeting, sender, gift wrap (+20) → recipient, address, date → summary shows 350 + 20 + 30 delivery = **₪400** → consent → submit. Open `/demo` → Bloom Studio: the request is first in the dashboard; approve it in the request page.
2. **Garage** → `/f/autocare-repairs?r=run_demo_garage_case` → approve brake pads (650) and wipers (140), decline cabin filter (180) → **₪790** → consent → submit. The AutoCare inbox shows each decision separately. To start another case: AutoCare → **בקשות → תיק חדש**.
3. **Builder** → `/app/workflows/new` → type e.g. `סטודיו ליוגה שרוצה טופס הרשמה לשיעור ניסיון עם תאריך ואימייל` → create → save → edit title / add a field → **פרסום** → **שיתוף → פתיחה כלקוח** → submit.
4. **Restaurant** → `/f/urban-table-events` → 20 guests, chef menu (240/guest), wine (65/guest), cake (450) = **₪6,550**, deposit 20% = **₪1,310** (simulated). Pick "אירוע עסקי" to see the conditional company field. Approve in Urban Table → "ממתין למקדמה" → mark deposit paid (simulation).
5. **Persistence / isolation** → reload any page: everything persists. Switch workspaces from the sidebar: each workspace shows only its own data.

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
    color.ts              WCAG contrast helpers
    art.tsx               Original local SVG artwork (hero art, option illustrations) + inference
    theme.css             All themed component styles; container queries for layout
    ThemeScope.tsx        Applies a theme to a subtree; bundles local @fontsource fonts
  engine/                 Pure, framework-free business logic (unit-tested)
    conditions.ts         Declarative condition evaluation (closed operator set)
    pricing.ts            Option prices, add-ons, per-unit multipliers, fees, deposit
    validation.ts         Builds Zod validators per field; display formatting
    transitions.ts        Run state machine + owner actions
    templates.ts          Real WorkflowConfig templates
    generator.ts          DEMO Hebrew keyword → template mapper (not AI)
    runs.ts               Builds a run submission + simulated notification previews
  data/
    repository.ts         Async FormzeloRepository interface (storage-agnostic contract)
    localRepository.ts    localStorage implementation: versioned keys, Zod-validated reads, quarantine/recovery, local image assets
    migrations.ts         Pure forward migrations (v1 → v2 adds designs) applied on read
    seed.ts               Fictional demo workspaces
    store.tsx             React context + useRepoQuery hook (refetch on writes, cross-tab via `storage` event)
  renderer/               The ONE universal workflow renderer: field controls, hero, stepper, price summary, review, confirmation
  pages/app/editor/       Field editor, Design tab (DesignPanel) and phone/desktop DevicePreview
  components/             UI primitives, layout, timeline, tables, modals
  pages/                  Marketing pages, public flow, /app pages (code-split)
  test/                   Vitest suites
```

Key decisions:

- **One renderer, many businesses.** `WorkflowRenderer` reads a `WorkflowConfig` and handles steps, progress, validation, conditional display, live totals, summary, consent and submission. Flowers, garage and restaurant are only data.
- **Repository boundary.** Pages only call `FormzeloRepository`. The interface is async so a `SupabaseRepository` (or REST client) can replace `LocalStorageRepository` by changing one line in `src/data/store.tsx`.
- **Validation at every boundary.** Every localStorage read is parsed with Zod; every write is validated before persisting; the generator's output is parsed; submissions are re-validated in the repository (not only in the UI).
- **Immutable versions.** Publishing snapshots the draft into a `WorkflowVersion`. A run stores `versionId` and is always rendered and priced with that version, even after re-publishing.
- **No arbitrary code.** Conditions use a fixed operator enum; pricing is declarative. Nothing from configuration is ever evaluated as JavaScript.
- **Design is separate from business data.** `Workflow.design` (draft) and `WorkflowVersion.design` (frozen at publish) hold a `WorkflowTheme`; `WorkflowConfig` stays purely business. Old runs render with the exact config **and** design of their version.
- **Performance.** The public flow is bundled eagerly; owner pages and Recharts are lazy-loaded chunks. Fonts are local (`@fontsource`, OFL) and only downloaded when a theme uses them.

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

`engine/generator.ts` normalizes Hebrew text (strips niqqud/punctuation), matches keyword stems allowing up to two attached prefix letters (ו/ה/ב/ל/מ/ש/כ) so "זר" does not match "עזרה", scores templates, and falls back to an editable generic form. Modifiers add fields/fees for words such as תמונות, מקדמה, משלוח, אימייל, כתובת, תאריך. The UI always labels this **"יצירת דמו מקומית — ללא חיבור ל-AI"**.

---

## Testing

```bash
npm test
```

50 unit tests in `src/test/`:

- **Schema:** all templates and seeded workspaces validate; malformed configs and unknown operators are rejected.
- **Pricing:** flower (budget + wrap + delivery), garage (only approved repairs), restaurant (per-guest × guests, flat extras, 20% deposit), hidden fields never charged.
- **Validation/conditions:** conditional required field, guest bounds, phone format, date window, required decisions.
- **Transitions:** happy path, invalid jumps, no customer-only actions offered to owners.
- **Generator:** example prompts map to the expected template; stem false-positives avoided; fallback + modifiers.
- **Repository (in-memory store):** workspace isolation, persistence across instances, consent enforcement, garage decisions & total, version binding after re-publish, restaurant approval + simulated deposit, generated workflow publish, corrupt-storage recovery.
- **Themes (`theme.test.ts`):** resolver mapping for all six presets + fallback + stem false positives; six structurally distinct valid presets; schema rejects bad colors/presets/remote images; contrast of buttons/links for every preset; contrast repair; appearance and illustration inference; v1→v2 migration (pure and in-place with backup, runs preserved); draft design persistence; version immutability (old version + old run keep their design, restore brings it back); asset size limits, missing-asset rejection, in-use deletion refusal, workspace scoping, corrupt asset fallback.

Browser end-to-end checks (scripted over the DevTools protocol in local headless Edge against the dev server, fresh profiles): A flower order ₪400 → appears in the Bloom inbox; B garage approve 2 / decline 1 → ₪790 with per-item decisions; C restaurant 30 guests, chef menu, wine, cake → ₪9,600, deposit ₪1,920, conditional company field enforced, owner approval → simulated deposit paid; D Hebrew prompt → auto theme (creative) → override at creation → override + custom color + undo in the Design tab → publish → public page uses the frozen design → submit; E reload keeps data and design, later draft edits don't touch the published version; F workspace isolation; G no horizontal overflow at 375 px (landing, three flows, dashboard, editor) and in the 1440 px editor; console free of errors.

---

## Known limits of the local demo

- **localStorage only.** Data lives in this browser profile on this device (~5 MB quota). It does **not** sync across devices, browsers or private windows. A public link opened elsewhere shows "הקישור אינו זמין".
- Clearing site data deletes everything. Use **Settings → ייצוא JSON** for a backup.
- If stored data fails Zod validation, it is copied to `formzelo:v1:corrupt:*` and the demo workspace is re-seeded; a notice appears in Settings.
- File fields store only the file name and size; file content is never stored or sent.
- No authentication: anyone using this browser is the "owner". Memberships are simulated.
- No real AI, messages, payments, signatures or delivery-availability checks. Garage approvals have no legal or e-signature validity.
- Writes from two tabs at the same moment are last-write-wins per workspace.
- Uploaded images live only in this browser and count toward the localStorage quota (capped at 1.2 MB per workspace). In production they'd go to object storage.
- Option illustrations are generic local SVGs, inferred by keywords; they are labelled as illustrative and are not product photos.
- Browsers that ran the earlier demo keep their data after the upgrade (migrated in place). Their stored demo workflows predate the new presentation hints, so some fields fall back to inferred styling (e.g. a dropdown instead of chips); **/demo → איפוס נתוני הדמו** loads the fully art-directed seeds.
- Theme selection is keyword-based; unusual wording may pick a less fitting preset — the owner can always override it.

---

## Roadmap to production (not implemented — no paid services used)

1. **Backend & database:** Postgres (e.g. Supabase) with tables mirroring `schema.ts`; implement `SupabaseRepository` behind the same interface; DB migrations; row-level security per organization.
2. **Server auth:** real accounts, organization membership & roles enforced server-side; signed, expiring personal case links.
3. **Server-side validation:** reuse `engine/` (pure TS) in API routes / edge functions so pricing and validation can't be bypassed by the client.
4. **Theme resolver:** optionally implement `ThemeResolver` with a model that returns a preset + token overrides validated by `WorkflowThemeSchema`, keeping the keyword resolver as fallback.
5. **Genuine AI provider:** replace `generator.ts` with a model call that returns JSON validated by `WorkflowConfigSchema`; keep the deterministic generator as fallback; bound tokens, cost, rate and retries; human review before publish.
6. **Billing:** subscription plans via a licensed payment provider; real deposits via hosted checkout with webhooks.
7. **Messaging & jobs:** queue + workers for email/SMS/WhatsApp with templates, retries and opt-out.
8. **Audit log:** append-only event store for every state change and admin action.
9. **Secure storage:** object storage for uploads with virus scanning, size limits and signed URLs; data retention policy.
10. **Rate limits & abuse protection** on public links and submissions; bot protection.
11. **Backups & recovery:** automated DB backups, point-in-time restore, tested restore runbook; monitoring and alerting.
