/**
 * Changing the date in the live shift replaces only the list: the header, summary and controls stay,
 * the full-screen loader never returns, and actions wait until the new day has arrived.
 */
import { expect, test } from '@playwright/test';
import { asUser, newContext, seedBusiness, seedVenue, signIn, today } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('date change keeps the screen and swaps only the list', async ({ browser }) => {
  const biz = await seedBusiness('מעבר תאריך', 1);
  const venue = await seedVenue(biz, { approval: 'auto' });
  const host = biz.hosts[0]!;
  await asUser(host.id, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({
    source: 'phone', serviceKey: 'dinner', date: today(1), time: '20:00', party: 2, name: 'אורחי מחר', phone: '050-0001111',
  }), crypto.randomUUID()]);

  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  await signIn(page, host, `/app/tables/${venue.id}/live?date=${today()}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Record whether the full-screen loader appears at any moment from here on.
  await page.evaluate(() => {
    (window as unknown as { __splash: boolean }).__splash = false;
    new MutationObserver(() => { if (document.querySelector('.fz-splash')) (window as unknown as { __splash: boolean }).__splash = true; })
      .observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'יום הבא' }).click();
  await expect(page.getByText('אורחי מחר')).toBeVisible();
  await page.getByRole('button', { name: 'יום קודם' }).click();
  await expect(page.getByText('אורחי מחר')).toHaveCount(0);
  await page.getByRole('button', { name: 'יום הבא' }).click();
  await expect(page.getByText('אורחי מחר')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __splash: boolean }).__splash)).toBe(false);
  await expect(page.locator('#shift-main')).not.toHaveAttribute('aria-busy', 'true');
  await ctx.close();
});
