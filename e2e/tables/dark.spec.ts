/**
 * Dark mode across Formangle's staff screens (business app + Tables): every main screen on a phone
 * and a desktop, with axe contrast checks and an overflow check. Customer-branded previews stay light.
 * Screenshots: test-evidence/dark/<size>-<screen>.png.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { newContext, overflow, seedBusiness, seedVenue, signIn, today, warmUp, type Business } from './fixtures';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
const OUT = 'test-evidence/dark';
let biz: Business;
let venue: { id: string; slug: string };

test.beforeAll(async ({ browser }) => {
  await warmUp(browser);
  fs.mkdirSync(OUT, { recursive: true });
  biz = await seedBusiness('ביסטרו הנמל', 1);
  venue = await seedVenue(biz, { approval: 'auto', publicWaitlist: true, tables: 12 });
});

async function contrast(page: Page, name: string) {
  const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const bad = axe.violations.flatMap((v) => v.nodes.map((n) => `${name}: ${n.target.join(' ')}`)).slice(0, 8);
  return bad;
}

for (const size of [{ width: 390, height: 844, name: 'phone' }, { width: 1280, height: 860, name: 'desktop' }]) {
  test(`dark — ${size.name}`, async ({ browser }) => {
    const ctx = await newContext(browser, size, size.width < 1024);
    await ctx.addInitScript(() => { try { localStorage.setItem('fz_tables_theme', 'dark'); } catch { /* */ } });
    const page = await ctx.newPage();
    await signIn(page, biz.owner, '/app');
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('fz-dark'))).toBe(true);
    const problems: string[] = [];
    const screens: [string, string, () => Promise<unknown>][] = [
      ['dashboard', '/app', () => expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible()],
      ['workflows', '/app/workflows', () => expect(page.getByRole('heading', { name: 'תהליכים' })).toBeVisible()],
      ['requests', '/app/requests', () => expect(page.getByRole('heading', { name: 'בקשות' })).toBeVisible()],
      ['analytics', '/app/analytics', () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
      ['brand', '/app/brand', () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
      ['settings', '/app/settings', () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
      ['tables', '/app/tables', () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
      ['venue', `/app/tables/${venue.id}`, () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
      ['shift', `/app/tables/${venue.id}/live?date=${today()}`, () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
    ];
    for (const [name, path, ready] of screens) {
      await page.goto(path);
      await ready();
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.documentElement.classList.contains('fz-dark')), `${name}: dark`).toBe(true);
      await page.screenshot({ path: `${OUT}/${size.name}-${name}.png`, fullPage: false });
      problems.push(...(await overflow(page)).map((o) => `${name}: overflow ${o}`));
      problems.push(...(await contrast(page, name)));
    }
    // The page background really is dark.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(14, 15, 18)');
    fs.writeFileSync(`${OUT}/${size.name}-report.json`, JSON.stringify(problems, null, 2));
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
