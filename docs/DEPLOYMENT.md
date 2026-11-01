# Deployment and custom-domain readiness

## Today: GitHub Pages (free)
`.github/workflows/pages.yml` on every push to `main`:
`npm ci` → `npm test` → `npm run build` (`VITE_BASE=/<repo>/`) → `cp dist/index.html dist/404.html`
→ `actions/deploy-pages`. Live: https://lielbs.github.io/formzelo-demo/

- **Deep links.** The build writes `<route>.html` copies of `index.html` for marketing pages and
  public demo flows (`STATIC_ROUTES` in `vite.config.ts`), so those URLs answer **200**. Any
  other path (e.g. `/app/requests/…`) is served by `404.html`, which boots the same app —
  it works in browsers, but the HTTP status is 404.
- **Security headers.** Static hosting cannot send headers. The built HTML carries a
  `Content-Security-Policy` meta (self-only scripts, no eval, `object-src 'none'`) and a
  referrer policy. `frame-ancestors` cannot be set from a meta tag, so the site can be
  embedded (the iframe snippet relies on this).
- **Optional repository variables:** `VITE_CONTACT_EMAIL` (sales address override),
  `VITE_SITE_URL` (public address for og:image / og:url).

## Later: a custom domain (not purchased, not configured)
1. Buy / verify the domain (owner decision; outside this repository).
2. GitHub → Settings → Pages → Custom domain; add the DNS records GitHub shows; enable HTTPS.
3. Set repository variables: `VITE_SITE_URL=https://<domain>` and change the build's
   `VITE_BASE` to `/` (the site moves to the domain root).
4. Push to `main`. Router basename, in-app links, share links and QR codes all derive from
   `import.meta.env.BASE_URL` and `window.location` (`src/lib/links.ts`), so no code change.
5. Old addresses: GitHub redirects `github.io` requests to the configured custom domain, but
   the path changes when `VITE_BASE` moves to `/`. Before announcing the switch, check that old
   deep links and printed QR codes (`…/formzelo-demo/f/<slug>`) still reach the right page; if
   not, keep `VITE_BASE=/formzelo-demo/` on the new domain or add redirect entries.

Other free static hosts (Cloudflare Pages, Netlify) also map `route.html` to `/route` and
can add real security headers; switching is a deployment change only.

## Local checks
```bash
npm run typecheck
npm test
VITE_BASE=/formzelo-demo/ npm run build
VITE_BASE=/formzelo-demo/ npx vite preview --port 4174
```
