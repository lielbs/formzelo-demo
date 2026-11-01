# Deployment and custom-domain readiness

## Today: GitHub Pages (free)
`.github/workflows/pages.yml` on every push to `main`:
`npm ci` → `npm test` → `npm run build` (`VITE_BASE=/<repo>/`) → `cp dist/index.html dist/404.html`
→ `actions/deploy-pages`. Live: https://formangle.rockstackds.com/ (custom domain: `public/CNAME`, DNS on Cloudflare,
build with `VITE_BASE=/` and `VITE_SITE_URL=https://formangle.rockstackds.com`). The former
`https://lielbs.github.io/formzelo-demo/<path>` addresses 301-redirect to `https://formangle.rockstackds.com/<path>`
(verified for `/f/<slug>`, `?r=` personal links, `/pricing`, `/tour`), so shared links and printed QR codes keep working.

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

## Custom domain (done)
Configured by the owner: `public/CNAME` = `formangle.rockstackds.com`, the workflow builds at the domain root, and the
domain is set in GitHub → Settings → Pages with DNS on Cloudflare. Router basename, in-app links, share links and QR codes
derive from `import.meta.env.BASE_URL` and `window.location` (`src/lib/links.ts`), so no code change was needed.

Other free static hosts (Cloudflare Pages, Netlify) also map `route.html` to `/route` and
can add real security headers; switching is a deployment change only.

## Local checks
```bash
npm run typecheck
npm test
npm run build
npx vite preview --port 4174
```
