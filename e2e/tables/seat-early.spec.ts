/**
 * A booking days ahead: the reservation sheet still shows the seating action (disabled) and says when
 * seating opens, instead of offering only "arrived".
 */
import { expect, test } from '@playwright/test';
import { asUser, newContext, seedBusiness, seedVenue, signIn, today } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('seating shows on a future booking with the time it opens', async ({ browser }) => {
  const biz = await seedBusiness('הושבה מוקדמת', 1);
  const venue = await seedVenue(biz, { approval: 'auto' });
  const host = biz.hosts[0]!;
  const day = today(2);
  await asUser(host.id, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({
    source: 'phone', serviceKey: 'dinner', date: day, time: '20:00', party: 2, name: 'שני רוזן', phone: '050-0008594',
  }), crypto.randomUUID()]);

  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  await signIn(page, host, `/app/tables/${venue.id}/live?date=${day}`);
  await page.getByText('שני רוזן').first().click();
  const seat = page.getByRole('button', { name: /^הושבה/ });
  await expect(seat).toBeVisible();
  await expect(seat).toBeDisabled();
  await expect(page.getByText(/ההושבה נפתחת ב־17:00 ביום ההזמנה/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'הגיעו (ממתינים לשולחן)' })).toBeVisible();
  await page.screenshot({ path: 'test-evidence/tables/seat-early.png' });
  await ctx.close();
});
