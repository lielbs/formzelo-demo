// Keyboard pass: presses Tab through the key screens and lists every focused element that shows no
// visible focus indicator (no outline, ring or shadow), and whether focus ever leaves an open dialog.
//   APP=http://localhost:5199 DEMO=http://localhost:5200 node e2e/mock/keyboard.mjs
import { chromium } from 'playwright';
import { APP, LIVE, VENUE_ID, wire } from './tables-mock.mjs';

const DEMO = process.env.DEMO ?? 'http://localhost:5200';
const TABS = 40;
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL === 'chromium' ? undefined : (process.env.E2E_BROWSER_CHANNEL ?? 'msedge') });

async function walk(name, open) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await context.newPage();
  try {
    const inDialog = await open(page);
    const seen = [];
    const bare = [];
    let escaped = false;
    for (let i = 0; i < TABS; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        // The indicator may be drawn by the element, by a wrapper (focus-within on a label), or, on the
        // floor map, by the .fz-focus outline beside the table shape.
        const shows = (node) => { if (!node || node.nodeType !== 1) return false; const cs = getComputedStyle(node); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); };
        const mapRing = el.closest('g')?.querySelector('.fz-focus');
        const ring = shows(el) || shows(el.parentElement) || shows(el.parentElement?.parentElement) || (!!mapRing && Number(getComputedStyle(mapRing).opacity) > 0);
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
        return { tag: el.tagName.toLowerCase(), label, ring, dialog: !!el.closest('[role=dialog],[role=alertdialog]') };
      });
      if (!f) continue;
      seen.push(f.label);
      if (!f.ring && !bare.some((b) => b.label === f.label)) bare.push(f);
      if (inDialog && !f.dialog) escaped = true;
    }
    console.log(`${name.padEnd(16)} stops ${new Set(seen).size}  no-ring ${bare.length}${inDialog ? `  focus-left-dialog ${escaped}` : ''}`);
    for (const b of bare) console.log(`    · ${b.tag} "${b.label}"`);
  } catch (e) {
    console.log(`${name.padEnd(16)} ERROR ${String(e).split(String.fromCharCode(10))[0]}`);
  }
  await context.close();
}

const demoFirst = async (page, list) => {
  await page.goto(DEMO + list, { timeout: 120_000 });
  const href = await page.locator(`a[href^="${list}/"]:not([href$="/new"])`).first().getAttribute('href', { timeout: 30_000 });
  await page.goto(DEMO + href);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
};

await walk('request', async (page) => { await demoFirst(page, '/app/requests'); return false; });
await walk('studio', async (page) => { await demoFirst(page, '/app/workflows'); return false; });
await walk('field-library', async (page) => {
  await demoFirst(page, '/app/workflows');
  await page.locator('button:visible', { hasText: 'הוספת שדה' }).first().click();
  await page.getByRole('dialog').waitFor();
  return true;
});
await walk('menu-editor', async (page) => {
  await wire(page, { signedIn: true });
  await page.goto(`${APP}/app/tables/${VENUE_ID}/menus`, { timeout: 120_000 });
  await page.locator('main li button.flex-1').first().waitFor({ timeout: 60_000 });
  return false;
});
await walk('dish-drawer', async (page) => {
  await wire(page, { signedIn: true });
  await page.goto(`${APP}/app/tables/${VENUE_ID}/menus`, { timeout: 120_000 });
  await page.locator('main li button.flex-1').first().click({ timeout: 60_000 });
  await page.getByRole('dialog').waitFor();
  return true;
});
await walk('live', async (page) => {
  await wire(page, { signedIn: true });
  await page.goto(APP + LIVE, { timeout: 120_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  return false;
});
await browser.close();
