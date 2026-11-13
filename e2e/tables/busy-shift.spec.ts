/**
 * Busy shift in real browsers: three hosts (tablet landscape, tablet portrait, desktop) work the
 * same live shift at the same time while guests keep booking. Hosts press the one-tap action on
 * overlapping rows, so they collide. Afterwards every host screen (list and floor) must show the
 * same truth as the database. Measurements: test-evidence/tables/busy-shift-browser.json.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { sql } from '../stack';
import { asUser, newContext, seedBusiness, signIn, venueDraft, warmUp, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.setTimeout(600_000);
let biz: Business;
let venueId = '';
let slug = '';
const TZ = 'Asia/Jerusalem';
const nowMin = () => { const t = new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
const hhmm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;
const day = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

test.beforeAll(async ({ browser }) => {
  await warmUp(browser);
  biz = await seedBusiness('ביסטרו עמוס', 3);
  const start = Math.floor((nowMin() - 90) / 15) * 15;
  const draft = venueDraft('ביסטרו עמוס', { tables: 18, publicWaitlist: true });
  draft.services = [{ key: 'dinner', name: 'משמרת', weekdays: [0, 1, 2, 3, 4, 5, 6], start: hhmm(start), lastSeating: hhmm(start + 300), durationMinutes: 90 }];
  draft.policy.slotMinutes = 15;
  slug = `busy-${randomUUID().slice(0, 8)}`;
  const v = await asUser<{ id: string; lockVersion: number }>(biz.owner.id, 'select public.tables_create_venue($1,$2,$3)', [biz.orgId, 'ביסטרו עמוס', slug]);
  venueId = v.id;
  const s = await asUser<{ lockVersion: number }>(biz.owner.id, 'select public.tables_save_draft($1,$2,$3)', [venueId, JSON.stringify(draft), v.lockVersion]);
  await asUser(biz.owner.id, 'select public.tables_publish_venue($1,$2)', [venueId, s.lockVersion]);
  for (const h of biz.hosts) await asUser(biz.owner.id, `select public.tables_assign_staff($1,$2,'host')`, [venueId, h.id]);
  await asUser(biz.owner.id, `select public.tables_assign_staff($1,$2,'manager')`, [venueId, biz.manager.id]);
  // Earlier bookings (some now late), and parties already seated.
  for (let i = 0; i < 14; i++) {
    await asUser(biz.manager.id, 'select public.tables_staff_create_reservation($1,$2,$3)', [venueId, JSON.stringify({
      source: 'phone', serviceKey: 'dinner', date: day(), time: hhmm(start + (i % 10) * 15), party: 2 + (i % 4), name: `מוקדם ${i + 1}`, phone: `0503000${100 + i}`, overrideReason: 'הוזמן מוקדם',
    }), randomUUID()]).catch(() => undefined);
  }
  for (let i = 0; i < 5; i++) {
    await asUser(biz.hosts[0]!.id, 'select public.tables_staff_create_reservation($1,$2,$3)', [venueId, JSON.stringify({ source: 'walk_in', date: day(), party: 2 + (i % 3), name: `מזדמן ${i + 1}`, seatNow: true }), randomUUID()]).catch(() => undefined);
  }
});

async function rowStatuses(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll('#shift-main li').forEach((li) => {
      const name = li.querySelector('[data-guest-name]')?.textContent?.trim();
      const status = li.querySelector('.hs-status')?.textContent?.trim();
      if (name && status) out[name] = status;
    });
    return out;
  });
}

test('three hosts work one busy shift while guests book; every screen converges to the database', async ({ browser }) => {
  const sizes = [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 1280, height: 860 }];
  const hosts = await Promise.all(sizes.map(async (size, i) => {
    const ctx = await newContext(browser, size, i < 2);
    const page = await ctx.newPage();
    await signIn(page, biz.hosts[i]!, `/app/tables/${venueId}/live?date=${day()}`);
    await expect(page.getByText(/מחובר/).first()).toBeVisible({ timeout: 20_000 });
    return { ctx, page };
  }));
  const t0 = Date.now();
  let clicks = 0;
  let conflicts = 0;
  // Guests book in the background throughout.
  const guestLoop = (async () => {
    for (let i = 0; i < 16; i++) {
      const c = new (await import('pg')).default.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
      await c.connect();
      try {
        await c.query('begin'); await c.query('set local role anon');
        await c.query('select public.tables_public_book($1,$2,$3,$4)', [slug, JSON.stringify({ serviceKey: 'dinner', date: day(), time: hhmm(Math.ceil((nowMin() + 15) / 15) * 15 + (i % 8) * 15), party: 2 + (i % 5), name: `אורח ${i + 1}`, phone: `0524000${100 + i}`, termsAccepted: true }), randomUUID(), randomUUID()]);
        await c.query('commit');
      } finally { await c.end(); }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  // Hosts press the primary action on the first rows of "attention"/"arrived"/"seated" at the same time.
  for (let round = 0; round < 8; round++) {
    await Promise.all(hosts.map(async ({ page }, h) => {
      const buttons = page.locator('#shift-main li button.h-11.min-w-\\[6rem\\]');
      const n = await buttons.count();
      if (!n) return;
      const target = buttons.nth((round + h) % Math.min(n, 3));
      await target.click({ timeout: 5_000 }).then(() => { clicks++; }).catch(() => undefined);
      await page.waitForTimeout(250);
      conflicts += await page.getByText(/עדכן את ההזמנה|לא מתאימה למצב הנוכחי/).count();
    }));
  }
  await guestLoop;
  // Let realtime settle, then compare every screen with the database.
  await hosts[0]!.page.waitForTimeout(3000);
  const db = Object.fromEntries((await sql<{ guest_name: string; status: string }>(`select guest_name, status from public.tables_reservations where venue_id=$1 and service_date=$2`, [venueId, day()])).map((r) => [r.guest_name, r.status]));
  const he: Record<string, string> = { pending_approval: 'ממתין לאישור', confirmed: 'הוזמן', arrived: 'הגיעו', seated: 'הושבו', completed: 'הסתיים', cancelled: 'בוטל', no_show: 'לא הגיעו', rejected: 'נדחה', expired: 'פג תוקף' };
  const views = await Promise.all(hosts.map(({ page }) => rowStatuses(page)));
  const mismatches: string[] = [];
  for (const [i, v] of views.entries()) {
    for (const [name, status] of Object.entries(db)) {
      const shown = v[name];
      if (!shown) { mismatches.push(`host${i + 1}: missing ${name}`); continue; }
      if (shown !== he[status] && !(status === 'confirmed' && shown === 'מאחרים')) mismatches.push(`host${i + 1}: ${name} shows ${shown}, db ${status}`);
    }
  }
  // Floor view: occupied tables equal the tables of seated parties.
  const [{ n: occupiedDb }] = await sql<{ n: string }>(`select count(distinct a.physical_table_id) n from public.tables_allocations a join public.tables_reservations r on r.id=a.reservation_id where r.venue_id=$1 and a.state='seated'`, [venueId]);
  const floorCounts: number[] = [];
  for (const { page } of hosts) {
    await page.getByRole('radio', { name: 'מפה' }).click();
    floorCounts.push(await page.locator('[role=button][aria-label*="תפוס"]').count());
  }
  const [{ n: overlaps }] = await sql<{ n: string }>(`select count(*) n from public.tables_allocations a join public.tables_allocations b on a.physical_table_id=b.physical_table_id and a.id<b.id and a.occupied_during && b.occupied_during where a.venue_id=$1 and a.state in ('held','confirmed','seated') and b.state in ('held','confirmed','seated')`, [venueId]);
  const result = { at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), reservations: Object.keys(db).length, hostClicks: clicks, conflictMessagesSeen: conflicts, mismatches, occupiedTablesDb: Number(occupiedDb), floorOccupiedPerHost: floorCounts, overlappingAllocations: Number(overlaps) };
  fs.mkdirSync('test-evidence/tables', { recursive: true });
  fs.writeFileSync('test-evidence/tables/busy-shift-browser.json', JSON.stringify(result, null, 2));
  for (const [i, { page }] of hosts.entries()) await page.screenshot({ path: `test-evidence/tables/busy-shift/host${i + 1}-floor.png`, fullPage: true });
  expect(mismatches).toEqual([]);
  expect(Number(overlaps)).toBe(0);
  for (const c of floorCounts) expect(c).toBe(Number(occupiedDb));
  await Promise.all(hosts.map(({ ctx }) => ctx.close()));
});
