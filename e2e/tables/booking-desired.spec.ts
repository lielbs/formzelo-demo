/**
 * Guest booking by desired time, with the public RPCs mocked (no database needed): the guest asks
 * for a taken time, sees the nearest free times and the waitlist, and a near time opens the details.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'test-evidence/booking-desired';
const venue = {
  slug: 'mock-bistro', name: 'ביסטרו הנמל', timezone: 'Asia/Jerusalem', paused: false, address: 'הרצל 10, תל אביב', phone: '+97235551234', venueType: 'restaurant',
  intro: 'מטבח ים-תיכוני עונתי.', terms: 'אפשר לבטל עד שעתיים לפני.', showWhatsapp: true,
  policy: { minParty: 1, maxParty: 10, horizonDays: 30, leadMinutes: 0, cancelCutoffMinutes: 120, modifyCutoffMinutes: 120, allowGuestModify: true, zoneChoice: false, waitlistPublic: true },
  zones: [], services: [
    { key: 'lunch', name: 'צהריים', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '12:00', lastSeating: '15:00' },
    { key: 'dinner', name: 'ערב', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', lastSeating: '22:00' },
  ],
  brand: { displayName: null, palette: { primary: '#7C3AED' } }, serverNow: new Date().toISOString(),
};
const availability = (date, full) => ({
  date, state: full ? 'full' : 'open',
  services: full ? [] : [
    { key: 'lunch', name: 'צהריים', slots: [] },
    { key: 'dinner', name: 'ערב', slots: [{ time: '18:00', approval: 'instant' }, { time: '18:30', approval: 'instant' }, { time: '21:30', approval: 'instant' }] },
  ],
});

test('desired time → nearest free times → waitlist', async ({ browser }) => {
fs.mkdirSync(OUT, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', hasTouch: true });
const page = await ctx.newPage();
let full = false;
await page.route('**/rest/v1/rpc/**', async (route) => {
  const url = route.request().url();
  const body = route.request().postDataJSON() ?? {};
  if (url.endsWith('tables_public_venue')) return route.fulfill({ json: venue });
  if (url.endsWith('tables_public_availability')) return route.fulfill({ json: availability(body.p_date, full) });
  return route.fulfill({ json: null });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('/t/mock-bistro');
await page.getByText('באיזו שעה?').waitFor();
await page.locator('#times-h').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/1-times.png`, fullPage: true });
const chips = await page.locator('[data-slot], [data-desired]').allInnerTexts();
expect(chips.join(' ')).toContain('20:00');
// Ask for 20:00 (taken): nearest free times and the waitlist button appear.
await page.getByRole('button', { name: '20:00' }).click();
await page.getByText('השעה 20:00 תפוסה.').waitFor();
const near = await page.locator('[data-near]').allInnerTexts();
expect(near).toEqual(['18:00', '18:30', '21:30']);
const wait = await page.getByRole('link', { name: 'הצטרפות לרשימת ההמתנה' }).count();
expect(wait).toBe(1);
await page.getByRole('status').filter({ hasText: 'תפוסה' }).scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/2-taken.png`, fullPage: false });
// Choosing a near time goes to the details step.
await page.locator('[data-near]').first().click();
await page.getByText('הפרטים שלכם').first().waitFor();

// A full day: message, waitlist and next day without choosing.
full = true;
await page.goto('/t/mock-bistro');
await page.getByText('אין מקום פנוי בתאריך הזה').waitFor();
await page.screenshot({ path: `${OUT}/3-full.png`, fullPage: false });
await expect(page.getByRole('link', { name: 'הצטרפות לרשימת ההמתנה' })).toHaveCount(1);
expect(errors).toEqual([]);
await ctx.close();
});
