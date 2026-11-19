# Hosting move: GitHub Pages → Cloudflare Pages (plan, not started)

Status: **plan only — waiting for founder approval.** Nothing in Cloudflare, DNS or the deploy
workflow has been changed. Written 2026-11-19 after the UI/UX review (finding #1).

## Why

Every dynamic guest link answers **HTTP 404** today (`/live/t/<venue>`, `/live/f/<form>`,
`/live/t/<venue>/menu`, `/live/app/...`). GitHub Pages can only serve them through `404.html`, and
it always returns status 404 with that page. Verified 2026-11-19:

```
/live/t/zigel-bar                 404
/live/f/zigel-bar-private-events  404
/live/                            200
```

Consequences:

* WhatsApp, Facebook, Telegram and Google may treat a shared link as a broken page: no preview or
  a generic "Formangle" preview. Owners share these links daily.
* Search engines do not index 404 pages, so a business's booking page cannot appear in Google.
* GitHub Pages cannot send response headers, so `frame-ancestors`, HSTS and other security headers
  exist only as browser code (`src/lib/frameGuard.ts`) and a `<meta>` CSP.

Cloudflare Pages fixes all three, at zero cost.

## Facts this plan relies on (checked 2026-11-19)

* DNS for `rockstackds.com` is **already on Cloudflare** (`adam.ns.cloudflare.com`,
  `suzanne.ns.cloudflare.com`). `formangle.rockstackds.com` is a `CNAME` to `lielbs.github.io`.
  No DNS-provider move is needed; only that one record changes.
* Cloudflare Pages docs:
  * Without a top-level `404.html`, Pages treats the project as a single-page application and
    serves the root `index.html` for paths that are not files (status 200).
  * `_redirects` supports `200` rewrites. **Redirects are always followed, whether or not a file
    matches**, so rules must name app routes precisely. A catch-all `/live/*` would also rewrite
    `/live/assets/*.js` and break the app.
  * Free plan: 500 builds/month, 20,000 files per site (this site is about 830), 25 MiB per file,
    100 custom domains, 100 `_headers` rules, 2,100 redirects.
* Supabase: Edge Functions accept `FORMANGLE_APP_ORIGIN = https://formangle.rockstackds.com`, and
  Auth redirect URLs use the same domain. **Same domain after the move → no Supabase change.**

## Phases

### Phase 0: founder setup in Cloudflare and GitHub (about 10 minutes; I cannot create accounts or keys)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Direct Upload** → project name
   `formangle`. Skip the upload.
2. My Profile → API Tokens → Create Token → Custom: permission **Account · Cloudflare Pages · Edit**,
   for this account only. No zone or DNS permissions.
3. GitHub → `lielbs/formzelo-demo` → Settings → Secrets and variables → Actions:
   * secret `CLOUDFLARE_API_TOKEN` = the token
   * secret `CLOUDFLARE_ACCOUNT_ID` = Account ID (dashboard sidebar)

### Phase 1: code (me, one commit, nothing user-visible yet)

* The deploy workflow keeps building exactly as today and keeps deploying to GitHub Pages, which
  stays the live site and the fallback. A new step copies `dist` to `dist-cf`, removes `404.html`
  (so Pages uses SPA mode for the demo at the root), adds the two files below, and runs
  `wrangler pages deploy dist-cf --project-name=formangle --branch=main` through
  `cloudflare/wrangler-action`, pinned to a commit SHA. The step is skipped when the secrets
  are missing.
* `dist-cf/_redirects` (production-app client routes that have no file; assets are never matched):

  ```
  /live/t/*     /live/index.html  200
  /live/f/*     /live/index.html  200
  /live/app/*   /live/index.html  200
  ```

  `/live/track`, `/live/invite`, `/live/reset`, `/live/operator`, `/live/app` and the demo routes
  already have their own static `.html` copies (`STATIC_ROUTES` in `vite.config.ts`). Pages serves
  them without the extension. Unknown demo paths fall back to the root `index.html` (SPA mode).
* `dist-cf/_headers`:

  ```
  /*
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Strict-Transport-Security: max-age=86400
  /live/app/*
    Content-Security-Policy: frame-ancestors 'self'
  /live/operator*
    Content-Security-Policy: frame-ancestors 'self'
  /live/invite*
    Content-Security-Policy: frame-ancestors 'self'
  /live/reset*
    Content-Security-Policy: frame-ancestors 'self'
  /live/track*
    Content-Security-Policy: frame-ancestors 'self'
  /live/assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```

  Customer forms and booking pages stay embeddable, because owners embed them. The `<meta>` CSP
  stays as it is; the header policy adds only what a meta tag cannot carry. HSTS starts at one day
  and is raised to one year after a stable week.
* Test: a script that checks the status code, the `content-type` and that the assets load for each
  route on `https://formangle.pages.dev`.

### Phase 2: verify on `formangle.pages.dev` (me, no risk to the live site)

* `200` for `/live/t/zigel-bar`, `/live/t/zigel-bar/menu`, `/live/t/zigel-bar/waitlist`,
  `/live/f/zigel-bar-private-events`, `/live/app`, `/live/track`, `/`, `/demo`, `/f/bloom-flowers`.
* Every JS and CSS file loads, with no console errors. The demo opens. Booking pages show real
  availability (read-only; nothing is submitted).
* Expected difference: Edge Functions (invite onboarding, account deletion, operator tools) refuse
  the `pages.dev` origin, by design. They are checked after the cutover.
* Screenshots at 390, 320 and 1280, the same as the UI review.

### Phase 3: cutover (**needs your explicit go**; it changes one DNS record)

* Choose a quiet hour: **not** Thursday to Saturday evening, when restaurants take bookings.
* Pages project → Custom domains → add `formangle.rockstackds.com`. Because the zone is in the same
  account, Cloudflare replaces the `CNAME lielbs.github.io` with `formangle.pages.dev` and issues
  the certificate, usually within minutes.
* Right after: `curl` status codes as in phase 2 on the real domain, sign-in page loads, the
  `Production smoke` workflow runs green, and the Edge Function preflight passes for the real
  origin. Then an Impact Networks staff screen and a booking page are checked by hand.

### Phase 4: tidy up (after 7 stable days)

* HSTS `max-age` raised to 31536000.
* GitHub Pages deploy switched to `workflow_dispatch` only. It stays available as the rollback
  target. `public/CNAME` stays (harmless on Cloudflare).

### Phase 5 (optional, separate approval): previews with the business's own name and photo

* A Pages Function on `/live/t/*` and `/live/f/*` reads the public venue or form (the existing
  public RPCs `tables_public_venue` and `resolve_public_workflow`, publishable key only) and
  rewrites `og:title`, `og:description`, `og:image` and `<title>` with `HTMLRewriter`, cached for
  5 minutes. Result: sharing a booking link shows "Zigel Bar — table booking" with the venue's
  photo.
* Cost: Functions count against the Workers free allowance (100,000 requests per day). Current
  traffic is far below that. If the allowance were ever exceeded, those routes would error, so
  the function is limited to these two routes and a usage alert is set in the dashboard.

## Rollback

* Phases 1–2: nothing live changes. Remove the workflow step.
* After phase 3: in Cloudflare DNS, set `formangle.rockstackds.com` back to
  `CNAME lielbs.github.io` (DNS only). GitHub Pages has kept deploying every commit, so the old
  site is current. Expect a few minutes for DNS. GitHub may need up to an hour to serve HTTPS for
  the domain again if its certificate lapsed; check *Settings → Pages* and re-tick "Enforce
  HTTPS" if asked.

## Risks

| Risk | Mitigation |
|---|---|
| A rewrite rule catches asset files | Rules name only `/live/t/*`, `/live/f/*`, `/live/app/*`; assets live under `/live/assets/` |
| A staff route without a static copy breaks | Phase 2 checks every route in `src/App.tsx` |
| Brief certificate gap at cutover | Quiet hour; Cloudflare usually issues within minutes; rollback is one DNS edit |
| Cloudflare token misuse | Token limited to *Pages · Edit* on one account, stored only as a GitHub secret |
| Cost | Free plan limits verified above; static requests are not metered; phase 5 is optional |

## Alternative that was considered and not recommended

Staying on GitHub Pages and generating a static `.html` copy for every published venue and form
on a schedule. It needs a public list of all business slugs (an enumeration of the client list),
and a new venue stays 404 until the next run. It also adds no security headers.
