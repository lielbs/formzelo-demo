/**
 * Multi-context journeys: a guest books in a clean phone context while two hosts watch the same
 * shift in their own browsers; hosts collide and reconcile; approval, modify/cancel, walk-in,
 * waitlist offer → guest notice → seating, access revocation and offline truth.
 */
import { expect, test, type Page } from '@playwright/test';
import { warmUp } from './fixtures';
import { sql } from '../stack';
import { asUser, newContext, seedBusiness, seedVenue, signIn, today, watch, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });
let biz: Business;
let venue: { id: string; slug: string };
const evidence: Record<string, number> = {};

test.beforeAll(async ({ browser }) => { await warmUp(browser); });
test.beforeAll(async () => {
  biz = await seedBusiness('ביסטרו הנמל', 2);
  venue = await seedVenue(biz, { approval: 'conditional', publicWaitlist: true, tables: 12 });
});

async function openShift(page: Page, date = today()) {
  await page.goto(`/app/tables/${venue.id}/live?date=${date}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /מחובר|מתעדכן/ }).first()).toBeVisible();
}

test('guest books on a phone; both hosts see it without reloading', async ({ browser }) => {
  const h1 = await newContext(browser, { width: 1024, height: 768 }, true);
  const h2 = await newContext(browser, { width: 1280, height: 860 });
  const p1 = await h1.newPage();
  const p2 = await h2.newPage();
  const problems = [...watch(p1), ...watch(p2)];
  await signIn(p1, biz.hosts[0]!, `/app/tables/${venue.id}/live`);
  await signIn(p2, biz.hosts[1]!, `/app/tables/${venue.id}/live`);
  const day = today(1);
  await openShift(p1, day);
  await openShift(p2, day);
  await expect(p1.getByText('מחובר — מתעדכן בזמן אמת')).toBeVisible({ timeout: 20_000 });

  const g = await newContext(browser, { width: 375, height: 812 }, true);
  const gp = await g.newPage();
  problems.push(...watch(gp));
  await gp.goto(`/t/${venue.slug}`);
  await gp.waitForTimeout(3000);
  console.log('GUEST URL', gp.url(), (await gp.locator('body').innerText()).slice(0, 120).split('\n').join(' | '));
  await gp.getByRole('button', { name: 'מחר' }).click();
  await gp.getByRole('button', { name: '3', exact: true }).click();
  await gp.locator('section[aria-labelledby="times-h"] [data-slot]', { hasText: '19:30' }).click();
  await gp.getByLabel('שם מלא').fill('נועה ברק');
  await gp.getByLabel('טלפון נייד').fill('052-3456789');
  await gp.getByRole('checkbox', { name: /קראתי ואני מסכים/ }).check();
  const t0 = Date.now();
  await gp.getByRole('button', { name: 'אישור ההזמנה' }).click();
  await expect(gp.getByRole('heading', { name: 'ההזמנה מאושרת' })).toBeVisible();
  await expect(p1.getByText('נועה ברק')).toBeVisible({ timeout: 15_000 });
  evidence.realtimeHost1Ms = Date.now() - t0;
  await expect(p2.getByText('נועה ברק')).toBeVisible({ timeout: 15_000 });
  evidence.realtimeHost2Ms = Date.now() - t0;
  // Guest result never claims a message was sent.
  await expect(gp.getByText('לא שלחנו הודעה')).toBeVisible();
  expect(problems).toEqual([]);
  await Promise.all([h1.close(), h2.close(), g.close()]);
});

test('two hosts act on the same party: one wins, the other sees the current state', async ({ browser }) => {
  const day = today();
  const r = await asUser<{ reservationId: string }>(biz.hosts[0]!.id, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id,
    JSON.stringify({ source: 'walk_in', date: day, party: 2, name: 'שולחן מתנגש', seatNow: true }), crypto.randomUUID()]);
  void r;
  const h1 = await newContext(browser, { width: 1024, height: 768 });
  const h2 = await newContext(browser, { width: 1024, height: 768 });
  const [p1, p2] = [await h1.newPage(), await h2.newPage()];
  await signIn(p1, biz.hosts[0]!, `/app/tables/${venue.id}/live`);
  await signIn(p2, biz.hosts[1]!, `/app/tables/${venue.id}/live`);
  await openShift(p1, day);
  await openShift(p2, day);
  const row1 = p1.locator('li', { hasText: 'שולחן מתנגש' });
  const row2 = p2.locator('li', { hasText: 'שולחן מתנגש' });
  await expect(row1.getByRole('button', { name: 'סיום' })).toBeVisible();
  await expect(row2.getByRole('button', { name: 'סיום' })).toBeVisible();
  // Freeze host 2's view (no realtime) so it acts on stale data, like a slow tablet.
  await h2.setOffline(true);
  await row1.getByRole('button', { name: 'סיום' }).click();
  await expect(row1.getByText('הסתיים')).toBeVisible();
  await h2.setOffline(false);
  // Either realtime already refreshed host 2 (button gone) or the server refuses the stale action.
  await row2.getByRole('button', { name: 'סיום' }).click({ timeout: 3_000 }).catch(() => undefined);
  await expect(row2.getByText('הסתיים')).toBeVisible({ timeout: 15_000 });
  await expect(p2.getByText(/עדכן את ההזמנה|לא מתאימה למצב הנוכחי/).first().or(row2.getByText('הסתיים'))).toBeVisible();
  const [ev] = await sql<{ n: string }>(`select count(*) n from public.tables_reservation_events e join public.tables_reservations r on r.id=e.reservation_id where r.venue_id=$1 and r.guest_name='שולחן מתנגש'`, [venue.id]);
  expect(Number(ev!.n)).toBe(2); // created + one completion, never two
  await Promise.all([h1.close(), h2.close()]);
});

test('large party request is approved by a host; guest page shows pending then confirmed', async ({ browser }) => {
  const g = await newContext(browser, { width: 390, height: 844 }, true);
  const gp = await g.newPage();
  await gp.goto(`/t/${venue.slug}`);
  await gp.getByRole('button', { name: 'מחר' }).click();
  await gp.getByRole('button', { name: '8', exact: true }).click();
  await gp.locator('section[aria-labelledby="times-h"] [data-slot]', { hasText: '20:00' }).click();
  await expect(gp.getByText('בקשה — המקום יאשר')).toBeVisible();
  await gp.getByLabel('שם מלא').fill('ערב חברה');
  await gp.getByLabel('טלפון נייד').fill('053-9998877');
  await gp.getByRole('checkbox', { name: /קראתי/ }).check();
  await gp.getByRole('button', { name: 'שליחת בקשה' }).click();
  await expect(gp.getByRole('heading', { name: 'הבקשה התקבלה — ממתינה לאישור' })).toBeVisible();
  await gp.getByRole('link', { name: 'פתיחת דף ההזמנה' }).click();
  await expect(gp.getByRole('heading', { name: 'ממתינה לאישור המקום' })).toBeVisible();

  const h = await newContext(browser, { width: 1024, height: 768 });
  const hp = await h.newPage();
  await signIn(hp, biz.hosts[0]!, `/app/tables/${venue.id}/live`);
  await openShift(hp, today(1));
  await hp.locator('li', { hasText: 'ערב חברה' }).getByRole('button', { name: 'אישור' }).click();
  await expect(hp.locator('li', { hasText: 'ערב חברה' }).getByText('הוזמן')).toBeVisible();
  await gp.reload();
  await expect(gp.getByRole('heading', { name: 'מאושרת' })).toBeVisible();
  await Promise.all([g.close(), h.close()]);
});

test('guest changes the time, then cancels; the slot reopens', async ({ browser }) => {
  const g = await newContext(browser, { width: 360, height: 740 }, true);
  const gp = await g.newPage();
  await gp.goto(`/t/${venue.slug}?lang=en`);
  await gp.getByRole('button', { name: /Tomorrow/ }).click();
  await gp.locator('section[aria-labelledby="times-h"] [data-slot]', { hasText: '18:00' }).click();
  await gp.getByLabel('Full name').fill('Alex Rivera');
  await gp.getByLabel('Mobile phone').fill('+44 7700 900123');
  await gp.getByRole('checkbox', { name: /accept the booking terms/ }).check();
  await gp.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(gp.getByRole('heading', { name: 'Your booking is confirmed' })).toBeVisible();
  await gp.getByRole('link', { name: 'Open booking page' }).click();
  await expect(gp.getByText('You can cancel yourself until')).toBeVisible();
  await gp.getByRole('button', { name: 'Change time or party size' }).click();
  await gp.locator('section[aria-labelledby="mod-h"] button', { hasText: '18:30' }).click();
  await gp.getByRole('button', { name: 'Save change' }).click();
  await expect(gp.getByText('Your booking was updated.')).toBeVisible();
  await expect(gp.getByText('18:30')).toBeVisible();
  await gp.getByRole('button', { name: 'Cancel booking' }).click();
  await gp.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(gp.getByText('Your booking was cancelled.')).toBeVisible();
  await expect(gp.getByRole('heading', { name: 'Cancelled' })).toBeVisible();
  // A tampered link reveals nothing.
  await gp.goto('/t/r?lang=en#t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await expect(gp.getByText('This link is not available')).toBeVisible();
  await g.close();
});

test('walk-in seated immediately; waitlist QR join → offer → guest notice → seated', async ({ browser }) => {
  const h = await newContext(browser, { width: 1024, height: 768 }, true);
  const hp = await h.newPage();
  await signIn(hp, biz.hosts[0]!, `/app/tables/${venue.id}/live`);
  await openShift(hp);
  await hp.getByRole('button', { name: 'הוספה', exact: true }).click();
  await hp.getByRole('radio', { name: 'מזדמנים עכשיו' }).click();
  await hp.getByRole('button', { name: '4', exact: true }).click();
  await hp.getByLabel('שם', { exact: true }).fill('זוג מהרחוב');
  await hp.getByRole('button', { name: 'הושבה עכשיו' }).click();
  await expect(hp.locator('li', { hasText: 'זוג מהרחוב' }).getByText('הושבו')).toBeVisible();

  const g = await newContext(browser, { width: 375, height: 812 }, true);
  const gp = await g.newPage();
  await gp.goto(`/t/${venue.slug}/waitlist`);
  await gp.getByRole('button', { name: '2', exact: true }).click();
  await gp.getByLabel('שם מלא').fill('ממתינה בכניסה');
  await gp.getByLabel('טלפון נייד').fill('054-1212121');
  await gp.getByRole('checkbox', { name: /מסכים/ }).check();
  await gp.getByRole('button', { name: 'הצטרפות לרשימה' }).click();
  await expect(gp.getByText('אתם ברשימת ההמתנה')).toBeVisible();
  await expect(gp.getByText(/הערכה בלבד/)).toBeVisible();

  await hp.getByRole('radio', { name: /המתנה/ }).click();
  const row = hp.locator('li', { hasText: 'ממתינה בכניסה' });
  await row.getByRole('button', { name: /לשמור (את )?שולחן/ }).click();
  await expect(row.getByText(/שמור להם/)).toBeVisible();
  await gp.reload();
  await expect(gp.getByText('השולחן שלכם מוכן! גשו לעמדת הקבלה.')).toBeVisible();
  await row.getByRole('button', { name: /הושבה עכשיו/ }).click();
  await expect(hp.locator('li', { hasText: 'ממתינה בכניסה' })).toHaveCount(0);
  await gp.reload();
  await expect(gp.getByText('הושבתם. בתיאבון!')).toBeVisible();
  await Promise.all([h.close(), g.close()]);
});

test('revoked host loses the shift on the next refresh; other tenant is denied; offline is explicit', async ({ browser }) => {
  const other = await seedBusiness('עסק אחר', 1);
  const h = await newContext(browser, { width: 1024, height: 768 });
  const hp = await h.newPage();
  await signIn(hp, biz.hosts[1]!, `/app/tables/${venue.id}/live`);
  await openShift(hp);
  await h.setOffline(true);
  await hp.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(hp.getByText(/אין חיבור לאינטרנט/)).toBeVisible();
  await expect(hp.getByRole('button', { name: 'הוספה', exact: true })).toBeDisabled();
  await h.setOffline(false);
  await hp.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(hp.getByText(/אין חיבור לאינטרנט/)).toHaveCount(0);
  await asUser(biz.owner.id, 'select public.tables_assign_staff($1,$2,null)', [venue.id, biz.hosts[1]!.id]);
  await hp.reload();
  await expect(hp.getByText(/משהו השתבש|אין לכם הרשאה/).first()).toBeVisible();
  const o = await newContext(browser);
  const op = await o.newPage();
  await signIn(op, other.owner, `/app/tables/${venue.id}`);
  await expect(op.getByText(/אין לכם הרשאה|משהו השתבש/).first()).toBeVisible();
  await Promise.all([h.close(), o.close()]);
});

test.afterAll(async () => {
  const fs = await import('node:fs');
  fs.mkdirSync('test-evidence/tables', { recursive: true });
  fs.writeFileSync('test-evidence/tables/journeys.json', JSON.stringify({ at: new Date().toISOString(), ...evidence }, null, 2));
});
