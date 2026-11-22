// Screenshots of every Tables screen on the fictional venue, for "before / after" comparisons.
//   1. npm run dev:mock          (the app in production mode against a local address nothing listens on)
//   2. npm run shots:tables [name-prefix]  → test-evidence/ux/<date>/<screen>-<d|t|m>.png
// Also prints page height, console errors and controls smaller than 40 px, per screen and size.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { APP, LIVE, SLUG, VENUE_ID, wire } from './tables-mock.mjs';

const OUT = `test-evidence/ux/${process.env.SHOTS_TAG ?? new Date().toISOString().slice(0, 10)}/`;
mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const SIZES = { d: { viewport: { width: 1440, height: 900 } }, t: { viewport: { width: 1180, height: 820 }, hasTouch: true }, m: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const SCREENS = [
  ['tables-home', '/app/tables', true], ['venue', `/app/tables/${VENUE_ID}`, true], ['setup', `/app/tables/${VENUE_ID}/setup`, true],
  ['menus', `/app/tables/${VENUE_ID}/menus`, true], ['design', `/app/tables/${VENUE_ID}/design`, true], ['analytics', `/app/tables/${VENUE_ID}/analytics`, true],
  ['live', LIVE, true], ['guest-book', `/t/${SLUG}`, false], ['guest-menu', `/t/${SLUG}/menu`, false], ['guest-waitlist', `/t/${SLUG}/waitlist`, false],
  ['guest-manage', '/t/r#t=Tokxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', false], ['guest-wl-status', '/t/w#t=Wxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', false],
];
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL === 'chromium' ? undefined : (process.env.E2E_BROWSER_CHANNEL ?? 'msedge') });
const summary = [];
for (const [name, path, signedIn] of SCREENS) {
  if (only && !name.startsWith(only)) continue;
  for (const [k, size] of Object.entries(SIZES)) {
    const context = await browser.newContext({ ...size, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (c) => { if (c.type() === 'error') errors.push(c.text().slice(0, 160)); });
    await wire(page, { signedIn });
    await page.goto(APP + path, { timeout: 120_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}${name}-${k}.png` });
    await page.screenshot({ path: `${OUT}${name}-${k}-full.png`, fullPage: true });
    const m = await page.evaluate(() => {
      const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const small = [...document.querySelectorAll('button, a, [role=button], [role=radio], [role=tab]')].filter(shown)
        .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 40 || r.width < 40; }).length;
      return { height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > window.innerWidth, small };
    });
    summary.push({ screen: name, size: k, ...m, errors: errors.length });
    console.log(`${name.padEnd(16)} ${k}  height ${m.height}  overflow ${m.overflow}  small-controls ${m.small}  errors ${errors.length}${errors.length ? ' · ' + errors[0] : ''}`);
    await context.close();
  }
}
writeFileSync(`${OUT}summary.json`, JSON.stringify(summary, null, 2));
await browser.close();
