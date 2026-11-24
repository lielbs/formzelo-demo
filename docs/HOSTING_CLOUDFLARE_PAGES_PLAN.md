# Hosting move: GitHub Pages → Cloudflare Pages (done 2026-11-19)

Status: **live on Cloudflare Pages since 2026-11-19 (phase 3 done).** GitHub Pages still deploys as the fallback.
Written 2026-11-19 after the UI/UX review (finding #1).

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

### Phase 0: Cloudflare connects to the repository (no API keys anywhere)

Chosen on 2026-11-19 instead of a token in GitHub secrets: Cloudflare's own Git integration builds
the site, so no key is created, copied or stored.

1. The founder signs in to the Cloudflare dashboard (I never enter passwords).
2. Workers & Pages → Create → Pages → **Connect to Git** → GitHub → repository
   `lielbs/formzelo-demo`. GitHub asks the founder to authorise the Cloudflare Pages app for this
   one repository (an OAuth grant; the founder approves it).
3. Build settings: production branch `main`; build command `npm run build:cloudflare`; output
   directory `dist`; no environment variables (all public values live in the script). Node 22
   comes from `.node-version`. Preview deployments: **none** (pushes to `production-v1` would
   otherwise use up free builds).

### Phase 1: code (done, commit 09e716d)

* `scripts/build-cloudflare.mjs` (`npm run build:cloudflare`) builds both apps like the GitHub
  Pages workflow, without `404.html` (Pages SPA mode at the root), and writes:
* `dist/_redirects`: rewrites to `/live/` with status 200. **Not** `/live/index.html`, because
  Pages turns that path into `/live/` and the rewrite then falls through to the root app (seen in
  `wrangler pages dev`).

  ```
  /live/t/*     /live/  200
  /live/f/*     /live/  200
  /live/app/*   /live/  200
  ```

* `dist/_headers`: `nosniff`, referrer policy, HSTS (1 day at first),
  `frame-ancestors 'self'` on staff, account and tracking screens (customer forms and booking
  pages stay embeddable), and `Cache-Control: public, max-age=0, must-revalidate, no-transform`
  on every path, so Cloudflare never injects its analytics beacon (added after the cutover).
* Checked locally with `wrangler pages dev dist`:
  * `/live/t/zigel-bar`, `/live/t/zigel-bar/menu`, `/live/f/zigel-bar-private-events`, `/` and
    `/demo` answer 200 and render real data, with no console errors.
  * The assets load as `application/javascript`, and the headers are present.
* GitHub Pages keeps deploying every commit, so it stays the live site and the fallback.

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

### Phase 4: tidy up (done 2026-11-24, approved)

* HSTS `max-age` raised to 31536000, in `_headers` and in the Pages Function responses
  (`edge/serve.ts`), which `_headers` does not reach.
* GitHub Pages deploy switched to `workflow_dispatch` only. It stays available as the rollback
  target. `public/CNAME` stays (harmless on Cloudflare).

### Phase 5: previews with the business's own name and photo (done 2026-11-19, approved)

Shipped as `functions/live/t/[[path]].ts` and `functions/live/f/[slug].ts`, backed by `edge/serve.ts` and `edge/preview.ts` (with tests in `src/test/edgePreview.test.ts`). The Fail open/closed setting is **Fail open** (the default), so static pages are still served if the allowance runs out.


* A Pages Function on `/live/t/*` and `/live/f/*` reads the public venue or form (the existing
  public RPCs `tables_public_venue` and `resolve_public_workflow`, publishable key only) and
  rewrites `og:title`, `og:description`, `og:image` and `<title>` with `HTMLRewriter`, cached for
  5 minutes. Result: sharing a booking link shows "Zigel Bar — table booking" with the venue's
  photo.
* Cost: Functions count against the Workers free allowance (100,000 requests per day). Current
  traffic is far below that. If the allowance were ever exceeded, those routes would error, so
  the function is limited to these two routes and a usage alert is set in the dashboard.

## Rollback

* Since phase 4, GitHub Pages holds the last version it built. Before moving the CNAME back,
  run the `pages.yml` workflow by hand (Actions -> Run workflow) so it serves the current `main`.

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
| Repository access for Cloudflare | Git integration limited to this one repository; no API token exists |
| Cost | Free plan limits verified above; static requests are not metered; phase 5 is optional |

## Alternative that was considered and not recommended

Staying on GitHub Pages and generating a static `.html` copy for every published venue and form
on a schedule. It needs a public list of all business slugs (an enumeration of the client list),
and a new venue stays 404 until the next run. It also adds no security headers.
