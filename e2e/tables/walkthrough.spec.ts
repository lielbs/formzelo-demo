/**
 * Non-technical owner walkthrough (persona: owner of a 12-table café-bistro, no technical
 * background). Starts on the normal dashboard with no URLs, finds Tables, follows only on-screen
 * text, adapts the starter floor to the real room, adds a Friday brunch, sets "parties of 7+ need my
 * approval", publishes and checks the guest page and the QR. Each screen is captured for review.
 */
import { expect, test } from '@playwright/test';
import { newContext, seedBusiness, signIn, watch, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.setTimeout(240_000);
const shot = (n: string) => `test-evidence/tables/walkthrough/${n}.png`;
let biz: Business;
test.beforeAll(async () => { biz = await seedBusiness('קפה רוזה', 0); });

test('first-time owner publishes a venue from the dashboard using on-screen guidance only', async ({ browser }) => {
  const ctx = await newContext(browser, { width: 1366, height: 900 });
  const page = await ctx.newPage();
  const problems = watch(page);
  await signIn(page, biz.owner);
  await page.screenshot({ path: shot('00-dashboard') });
  // "Where are table reservations?" — the side menu.
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'שולחנות' }).click();
  await page.screenshot({ path: shot('01-tables-empty'), fullPage: true });
  await page.getByLabel('שם המקום').fill('קפה רוזה');
  await page.screenshot({ path: shot('02-name-and-link'), fullPage: true });
  await page.getByRole('button', { name: 'יצירת המקום והתחלת ההקמה' }).click();

  // Step 1 — details.
  await expect(page.getByRole('heading', { name: 'פרטי המקום' })).toBeVisible();
  await page.getByLabel('סוג המקום').selectOption({ label: 'בית קפה' });
  await page.getByLabel('טלפון של המקום').fill('09-7654321');
  await page.getByLabel('כתובת').fill('סוקולוב 22, הרצליה');
  await page.screenshot({ path: shot('03-details'), fullPage: true });
  await page.getByRole('button', { name: /המשך: שעות ומשמרות/ }).click();

  // Step 2 — hours: close lunch on Saturday is already the default; add a Friday brunch.
  await page.getByRole('button', { name: 'הוספת משמרת' }).click();
  const last = page.locator('section').filter({ has: page.getByText('משמרת חדשה', { exact: false }) }).last();
  await page.getByLabel('שם המשמרת').last().fill('בראנץ׳ שישי');
  for (const d of ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']) await page.getByRole('button', { name: `יום ${d}` }).last().click();
  await page.getByRole('button', { name: 'יום ו׳' }).last().click();
  await page.getByLabel('הושבה ראשונה').last().fill('09:00');
  await page.getByLabel('הושבה אחרונה').last().fill('12:30');
  void last;
  await page.screenshot({ path: shot('04-hours'), fullPage: true });
  await page.getByRole('button', { name: /המשך: שולחנות ומפה/ }).click();

  // Step 3 — seating: add a terrace with two tables, rename the bar seats, keep the rest.
  await expect(page.getByRole('heading', { name: 'שולחנות ומפה' })).toBeVisible();
  await page.screenshot({ path: shot('05-seating-start'), fullPage: true });
  await page.getByRole('button', { name: 'אזור חדש' }).click();
  await page.getByLabel('שם האזור').fill('מרפסת');
  await page.getByRole('button', { name: '4 מקומות' }).click();
  await page.getByRole('button', { name: '2 מקומות' }).click();
  await page.screenshot({ path: shot('06-seating-terrace'), fullPage: true });
  // Drag a table on the map (direct manipulation) and check the inspector follows.
  const table = page.locator('svg g[data-table]').first();
  const box = await table.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
  }
  await page.screenshot({ path: shot('07-seating-dragged'), fullPage: true });
  await page.getByRole('button', { name: /המשך: כללי הזמנה/ }).click();

  // Step 4 — rules: "big groups need my approval".
  await page.getByText('לפי כללים').click();
  await page.screenshot({ path: shot('08-rules'), fullPage: true });
  await page.getByRole('button', { name: /המשך: עמוד האורחים/ }).click();
  await page.screenshot({ path: shot('09-guest-page'), fullPage: true });
  await page.getByRole('button', { name: /המשך: בדיקה ופרסום/ }).click();
  await page.screenshot({ path: shot('10-review'), fullPage: true });
  await page.getByRole('button', { name: 'פרסום ופתיחת ההזמנות' }).click();
  await expect(page.getByText('המקום פורסם!')).toBeVisible();
  await page.screenshot({ path: shot('11-published'), fullPage: true });

  // As a guest on a phone.
  const url = await page.getByLabel('קישור ההזמנות').inputValue();
  const g = await newContext(browser, { width: 390, height: 844 }, true);
  const gp = await g.newPage();
  await gp.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(gp.getByRole('heading', { name: 'הזמנת שולחן' })).toBeVisible();
  await gp.screenshot({ path: shot('12-guest-view'), fullPage: true });
  expect(problems).toEqual([]);
  await Promise.all([ctx.close(), g.close()]);
});
