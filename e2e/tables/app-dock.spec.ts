/**
 * The Formangle app's phone and tablet dock: glass capsule, tap and drag between sections, the
 * new-workflow action, and the sidebar taking over from 1024 px.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { newContext, overflow, seedBusiness, signIn, smallTargets, warmUp, type Business } from './fixtures';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const OUT = 'test-evidence/tables/app-dock';
let biz: Business;

test.beforeAll(async ({ browser }) => {
  await warmUp(browser);
  fs.mkdirSync(OUT, { recursive: true });
  biz = await seedBusiness('סטודיו הדוק', 1);
});

test('phone: tap and drag between sections, new workflow, full menu', async ({ browser }) => {
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  await signIn(page, biz.owner, '/app');
  const dock = page.getByRole('navigation', { name: 'ניווט מהיר' });
  await expect(dock).toBeVisible();
  await expect(dock.getByRole('link', { name: 'בית' })).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/phone-home.png` });
  expect(await overflow(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);

  await dock.getByRole('link', { name: /בקשות/ }).click();
  await expect(page).toHaveURL(/\/app\/requests$/);
  await expect(dock.getByRole('link', { name: /בקשות/ })).toHaveAttribute('aria-current', 'page');

  // Drag from "בקשות" to "תהליכים" and release: the dock navigates there.
  const from = (await dock.getByRole('link', { name: /בקשות/ }).boundingBox())!;
  const to = (await dock.getByRole('link', { name: 'תהליכים' }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/app\/workflows$/);
  await expect(dock.getByRole('link', { name: 'תהליכים' })).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/phone-workflows.png` });

  await dock.getByRole('button', { name: 'עוד — התפריט המלא' }).click();
  await expect(page.getByRole('dialog', { name: 'תפריט' })).toBeVisible();
  await page.getByRole('dialog', { name: 'תפריט' }).getByRole('button', { name: 'סגירת תפריט' }).last().click();

  await dock.getByRole('link', { name: 'תהליך חדש' }).click();
  await expect(page).toHaveURL(/\/app\/workflows\/new$/);
  await ctx.close();
});

test('tablet keeps the dock; desktop uses the sidebar', async ({ browser }) => {
  for (const [size, visible] of [[{ width: 768, height: 1024 }, true], [{ width: 1280, height: 860 }, false]] as const) {
    const ctx = await newContext(browser, size, size.width < 1024);
    const page = await ctx.newPage();
    await signIn(page, biz.owner, '/app');
    const dock = page.getByRole('navigation', { name: 'ניווט מהיר' });
    if (visible) await expect(dock).toBeVisible(); else await expect(dock).toBeHidden();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/home-${size.width}.png` });
    expect(await overflow(page)).toEqual([]);
    await ctx.close();
  }
});
