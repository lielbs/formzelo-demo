/**
 * Owner journey on the production code path (local stack): open Tables, create a venue, walk
 * the setup wizard with mostly default choices, edit the floor, publish, and see the public page.
 */
import { expect, test } from '@playwright/test';
import { newContext, overflow, seedBusiness, signIn, watch, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });
let biz: Business;
const shots = (name: string) => `test-evidence/tables/owner/${name}.png`;

test.beforeAll(async () => { biz = await seedBusiness('ביסטרו בדיקה', 1); });

for (const size of [{ width: 1280, height: 860, tag: 'd' }, { width: 390, height: 844, tag: 'm' }]) {
  test(`owner sets up and publishes a venue (${size.width}px)`, async ({ browser }) => {
    const ctx = await newContext(browser, size, size.width < 500);
    const page = await ctx.newPage();
    const problems = watch(page);
    await signIn(page, biz.owner);
    if (size.width < 1024) await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await page.getByRole('link', { name: 'שולחנות' }).click();
    await expect(page.getByRole('heading', { name: 'שולחנות' })).toBeVisible();
    await page.screenshot({ path: shots(`${size.tag}-01-home`), fullPage: true });

    const name = size.tag === 'd' ? 'ביסטרו הנמל' : 'קפה הגן';
    await page.getByLabel('שם המקום').fill(name);
    await page.getByRole('button', { name: 'יצירת המקום והתחלת ההקמה' }).click();
    await expect(page.getByRole('heading', { name: 'פרטי המקום' })).toBeVisible();
    await page.getByLabel('טלפון של המקום').fill('03-5551234');
    await page.getByLabel('כתובת').fill('הרצל 10, תל אביב');
    await expect(page.getByRole('status').filter({ hasText: /^נשמר/ })).toBeVisible();
    await page.screenshot({ path: shots(`${size.tag}-02-basics`), fullPage: true });
    expect(await overflow(page)).toEqual([]);

    await page.getByRole('button', { name: /המשך: שעות ומשמרות/ }).click();
    await expect(page.getByRole('heading', { name: 'שעות ומשמרות' })).toBeVisible();
    await page.screenshot({ path: shots(`${size.tag}-03-hours`), fullPage: true });
    expect(await overflow(page)).toEqual([]);

    await page.getByRole('button', { name: /המשך: שולחנות ומפה/ }).click();
    await expect(page.getByRole('heading', { name: 'שולחנות ומפה' })).toBeVisible();
    await page.screenshot({ path: shots(`${size.tag}-04-seating`), fullPage: true });
    expect(await overflow(page)).toEqual([]);
    // Accessible list alternative: rename table 1 → 10A and add an 8-seat table.
    await page.getByRole('radio', { name: 'רשימה' }).click();
    await page.getByLabel('מספר').first().fill('1A');
    await page.getByRole('button', { name: '8 מקומות' }).click();
    await page.screenshot({ path: shots(`${size.tag}-05-seating-list`), fullPage: true });

    await page.getByRole('button', { name: /המשך: כללי הזמנה/ }).click();
    await expect(page.getByRole('heading', { name: 'כללי הזמנה' })).toBeVisible();
    await page.getByText('לפי כללים').click();
    await page.screenshot({ path: shots(`${size.tag}-06-rules`), fullPage: true });
    expect(await overflow(page)).toEqual([]);

    await page.getByRole('button', { name: /המשך: עמוד האורחים/ }).click();
    await page.screenshot({ path: shots(`${size.tag}-07-guest`), fullPage: true });
    await page.getByRole('button', { name: /המשך: בדיקה ופרסום/ }).click();
    await expect(page.getByText('הכול מוכן לפרסום')).toBeVisible();
    await page.screenshot({ path: shots(`${size.tag}-08-review`), fullPage: true });
    expect(await overflow(page)).toEqual([]);
    await page.getByRole('button', { name: 'פרסום ופתיחת ההזמנות' }).click();
    await expect(page.getByText('המקום פורסם! אורחים יכולים להזמין עכשיו.')).toBeVisible();
    await page.screenshot({ path: shots(`${size.tag}-09-published`), fullPage: true });
    expect(await overflow(page)).toEqual([]);

    const url = await page.getByLabel('קישור ההזמנות').inputValue();
    const guest = await ctx.newPage();
    await guest.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(guest.getByRole('heading', { name: 'הזמנת שולחן' })).toBeVisible();
    await expect(guest.getByText(name).first()).toBeVisible();
    await guest.screenshot({ path: shots(`${size.tag}-10-guest-page`), fullPage: true });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
