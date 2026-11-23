// Automatic accessibility check (axe, WCAG 2.1 A/AA) of the screens the UX overhaul changed,
// at three sizes and in dark mode. Headless; nothing is created anywhere.
//   Tables (fictional venue):  npm run dev:mock      → APP=http://localhost:5199 node e2e/mock/axe.mjs tables
//   Formangle (demo data):     npm run dev           → DEMO=http://localhost:5200 node e2e/mock/axe.mjs demo
// Prints one line per screen and size with the serious and critical findings, and writes the full
// list to test-evidence/ux/axe-<group>.json.
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { APP, LIVE, SLUG, VENUE_ID, wire } from './tables-mock.mjs';

const group = process.argv[2] ?? 'tables';
const only = process.argv[3];
const DEMO = process.env.DEMO ?? 'http://localhost:5200';
const SIZES = {
  d: { viewport: { width: 1440, height: 900 } },
  t: { viewport: { width: 1180, height: 820 }, hasTouch: true },
  m: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  'm-dark': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' },
};
const TABLES = [
  ['dashboard', '/app', true], ['tables-home', '/app/tables', true], ['venue', `/app/tables/${VENUE_ID}`, true], ['setup', `/app/tables/${VENUE_ID}/setup`, true],
  ['menus', `/app/tables/${VENUE_ID}/menus`, true], ['design', `/app/tables/${VENUE_ID}/design`, true], ['analytics', `/app/tables/${VENUE_ID}/analytics`, true],
  ['live', LIVE, true], ['live-add', `${LIVE}?add=1`, true], ['guest-book', `/t/${SLUG}`, false], ['guest-menu', `/t/${SLUG}/menu`, false],
  ['guest-waitlist', `/t/${SLUG}/waitlist`, false], ['guest-manage', '/t/r#t=Tokxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', false],
  ['guest-wl-status', '/t/w#t=Wxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', false],
];
// Demo screens; ids are read from the lists, so the demo seed may change freely.
const DEMO_SCREENS = [
  ['dashboard', '/app'], ['workflows', '/app/workflows'], ['studio', 'first:/app/workflows'], ['requests', '/app/requests'],
  ['request', 'first:/app/requests'], ['brand', '/app/brand'], ['analytics', '/app/analytics'], ['settings', '/app/settings'], ['public-form', '/f/bloom-flowers'],
];

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL === 'chromium' ? undefined : (process.env.E2E_BROWSER_CHANNEL ?? 'msedge') });
const report = [];
const screens = group === 'demo' ? DEMO_SCREENS.map(([n, p]) => [n, p, false]) : TABLES;
for (const [name, path, signedIn] of screens) {
  if (only && !name.startsWith(only)) continue;
  for (const [k, size] of Object.entries(SIZES)) {
    const context = await browser.newContext({ ...size, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    const page = await context.newPage();
    try {
    let url;
    if (group === 'demo') {
      let target = path;
      if (path.startsWith('first:')) {
        const list = path.slice(6);
        await page.goto(DEMO + list, { timeout: 120_000 });
        const href = await page.locator(`a[href^="${list}/"]:not([href$="/new"])`).first().getAttribute('href', { timeout: 30_000 });
        target = href;
      }
      url = DEMO + target;
    } else {
      await wire(page, { signedIn });
      url = APP + path;
    }
    await page.goto(url, { timeout: 120_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    report.push({ screen: name, size: k, url: page.url(), violations: bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(0, 3).join(' ') })) , count: v.nodes.length })) });
    console.log(`${name.padEnd(16)} ${k.padEnd(6)} ${bad.length ? bad.map((v) => `${v.id}×${v.nodes.length}`).join(' ') : 'ok'}`);
    } catch (e) {
      // One screen that cannot load does not stop the others; it is reported as a failure.
      report.push({ screen: name, size: k, error: String(e).slice(0, 300) });
      console.log(`${name.padEnd(16)} ${k.padEnd(6)} ERROR ${String(e).split(String.fromCharCode(10))[0]}`);
    }
    await context.close();
  }
}
await browser.close();
mkdirSync('test-evidence/ux', { recursive: true });
writeFileSync(`test-evidence/ux/axe-${group}${only ? '-' + only : ''}.json`, JSON.stringify(report, null, 2));
