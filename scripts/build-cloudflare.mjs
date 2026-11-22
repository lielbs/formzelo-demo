#!/usr/bin/env node
/**
 * Build for Cloudflare Pages (docs/HOSTING_CLOUDFLARE_PAGES_PLAN.md). Cloudflare runs
 * `npm ci && npm run build:cloudflare` on every push to main and serves `dist/`.
 *
 * Same two apps as the GitHub Pages workflow (.github/workflows/pages.yml): the demo at the root
 * and the production app at /live/. Differences:
 *   - no 404.html: Pages then treats the root as a single-page app and answers unknown demo paths
 *     with the root index.html and status 200;
 *   - _redirects: the production app's dynamic routes (/live/t/*, /live/f/*, /live/app/*) are
 *     rewritten to /live/ (its index) with status 200. The target is /live/, not /live/index.html:
 *     Pages turns index.html into its folder URL, and a rewrite to it falls through to the root
 *     app (checked with `wrangler pages dev`). Pages follows redirects even when a file matches,
 *     so the rules never name /live/assets/ (no /live/* catch-all);
 *   - _headers: security headers static hosting could not send before, and `no-transform`
 *     so Cloudflare never injects scripts (its analytics beacon) into the pages.
 * Only public values appear here: the publishable key is public by design, and the runtime refuses
 * any other project or a secret key.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://formangle.rockstackds.com';
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

run('npx tsc --noEmit');
run('npx vite build', { VITE_BASE: '/', VITE_SITE_URL: SITE });
run('npx vite build --outDir dist/live --emptyOutDir', {
  VITE_BASE: '/live/',
  VITE_SITE_URL: SITE,
  VITE_FORMANGLE_MODE: 'production',
  VITE_SUPABASE_PROJECT_REF: 'ppgdbqhwbzlgzwsjmkor',
  VITE_SUPABASE_URL: 'https://ppgdbqhwbzlgzwsjmkor.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_f4SQeCD1MuE78Fgf-ZVr7Q_bxJhowCy',
});

writeFileSync('dist/_redirects', [
  '# Production app (/live): client routes that have no file of their own. Status 200 = rewrite.',
  '/live/t/*     /live/  200',
  '/live/f/*     /live/  200',
  '/live/app/*   /live/  200',
  '',
].join('\n'));

// Staff, account and tracking screens may only be framed by the site itself (clickjacking).
// Customer forms and booking pages stay embeddable: owners embed them on their own sites.
const sameOrigin = ['/live/app/*', '/live/app', '/live/operator*', '/live/invite*', '/live/reset*', '/live/track*', '/live/t/r*', '/live/t/w*', '/app/*', '/operator*', '/invite*', '/reset*', '/track*'];
// Hashed build files never change under the same name: browsers keep them for a year instead of
// asking again on every visit. Pages joins repeated headers, so these rules first detach the
// site-wide value with "! Cache-Control"; they must come AFTER the "/*" rule (rules apply in file
// order, and a detach only removes what an earlier rule added).
// https://developers.cloudflare.com/pages/configuration/headers/
export const IMMUTABLE_PATHS = ['/assets/*', '/live/assets/*'];
const HEADERS = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Strict-Transport-Security: max-age=31536000',
  // no-transform: Cloudflare must not rewrite pages (it would inject its analytics beacon, which
  // the CSP blocks and the privacy notice does not mention). Pages and data revalidate every time.
  '  Cache-Control: public, max-age=0, must-revalidate, no-transform',
  ...IMMUTABLE_PATHS.flatMap((p) => [p, '  ! Cache-Control', '  Cache-Control: public, max-age=31536000, immutable, no-transform']),
  ...sameOrigin.flatMap((p) => [p, "  Content-Security-Policy: frame-ancestors 'self'"]),
  '',
].join('\n');
writeFileSync('dist/_headers', HEADERS);
if (HEADERS.indexOf('/assets/*') < HEADERS.indexOf('/*\n') || !HEADERS.includes('! Cache-Control')) throw new Error('_headers: the immutable asset rules must follow the site-wide rule');
for (const dir of ['dist/assets', 'dist/live/assets']) {
  // Only hashed names may be cached forever (name-hash.ext); anything else there would go stale.
  const plain = readdirSync(dir).filter((n) => !/-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(n));
  if (plain.length) throw new Error(`${dir} has files without a content hash (cached for a year): ${plain.slice(0, 5).join(', ')}`);
}

// The same guarantees the GitHub Pages workflow checks.
for (const f of ['dist/index.html', 'dist/live/index.html', 'dist/live/track.html', 'dist/live/invite.html', 'dist/live/reset.html']) {
  if (!existsSync(f)) throw new Error(`missing ${f}`);
}
if (existsSync('dist/404.html')) throw new Error('dist/404.html must not exist (it disables single-page mode)');
if (!readFileSync('dist/live/index.html', 'utf8').includes('/live/assets/')) throw new Error('/live app does not load its own assets');
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk('dist');
for (const f of files) {
  if (!/\.(html|js|css|json|txt|map)$/.test(f)) continue;
  if (/sb_secret_[A-Za-z0-9_-]{16,}|c2VydmljZV9yb2xl/.test(readFileSync(f, 'utf8'))) throw new Error(`secret-like value in ${f}`);
}
if (files.length > 20000) throw new Error(`${files.length} files: over the Pages free limit`);
console.log(`Cloudflare build ready: ${files.length} files.`);
