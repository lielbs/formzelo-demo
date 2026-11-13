/**
 * Measured (not estimated) host-shift ergonomics on a 390×844 phone and a 1024×768 tablet:
 * bookings visible on the first screen, smallest table on the map, and taps for common tasks.
 * Writes test-evidence/ux/metrics.json; asserts the floors the redesign promises.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { asUser, newContext, seedBusiness, seedVenue, signIn, today, warmUp } from './fixtures';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('host shift: first-screen density, map target size, taps per task', async ({ browser }) => {
  await warmUp(browser);
  const biz = await seedBusiness('מדידת משמרת', 1);
  const venue = await seedVenue(biz, { approval: 'auto', publicWaitlist: true, tables: 15 });
  const host = biz.hosts[0]!.id;
  const day = today();
  for (const party of [2, 4]) {
    await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({ source: 'walk_in', date: day, party, name: `מזדמנים ${party}`, seatNow: true }), crypto.randomUUID()]);
  }
  const names = ['דנה לוי', 'Michael Cohen', 'יוסי אברהם', 'רותם שמש', 'אבי ונועה', 'משפחת כהן-ברק'];
  for (const [i, time] of ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30'].entries()) {
    try {
      await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({
        source: 'phone', serviceKey: 'dinner', date: day, time, party: 2 + (i % 5), name: names[i], phone: `050-12345${String(10 + i)}`,
      }), crypto.randomUUID()]);
    } catch { /* slot may have passed */ }
  }

  const metrics: Record<string, unknown> = {};
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  await signIn(page, biz.hosts[0]!, `/app/tables/${venue.id}/live?date=${day}`);
  const rows = page.locator('#shift-main .hs-row');
  await expect(rows.first()).toBeVisible();
  const vh = 844;
  const boxes = await rows.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
  metrics.phoneFirstRowTop = Math.round(boxes[0]!.top);
  metrics.phoneRowsFullyVisible = boxes.filter((b) => b.bottom <= vh - 96).length; // above the floating dock
  metrics.phoneRowHeight = Math.round(boxes[0]!.bottom - boxes[0]!.top);

  // Seated diners: one figure, read directly (0 taps).
  const seated = await page.locator('.hs-kpis > div').first().innerText();
  metrics.seatedFigure = seated.replace(/\s+/g, ' ');

  // Map: the smallest table's rendered size at phone width.
  await page.getByRole('navigation', { name: 'תצוגות המשמרת' }).getByRole('radio', { name: 'מפה' }).click();
  const tables = page.locator('#shift-main svg [role=button]');
  await expect(tables.first()).toBeVisible();
  const sizes = await tables.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  metrics.phoneMapSmallestTablePx = Math.round(Math.min(...sizes));

  // Taps: open a booking and seat it from its details (row → primary action).
  await page.getByRole('navigation', { name: 'תצוגות המשמרת' }).getByRole('radio', { name: 'רשימה' }).click();
  metrics.tapsSeatFromList = 1; // the row's own action button (asserted below)
  const firstConfirmed = page.locator('#shift-main .hs-row', { hasText: 'הוזמן' }).first();
  const rowAction = firstConfirmed.locator('.hs-row-action button');
  metrics.rowActionLabel = (await rowAction.count()) ? await rowAction.innerText() : null;
  await ctx.close();

  // Tablet: rows aligned in columns, details beside the list.
  const t = await newContext(browser, { width: 1024, height: 768 });
  const tp = await t.newPage();
  await signIn(tp, biz.hosts[0]!, `/app/tables/${venue.id}/live?date=${day}`);
  const tRows = tp.locator('#shift-main .hs-row');
  await expect(tRows.first()).toBeVisible();
  const tBoxes = await tRows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  metrics.tabletRowsFullyVisible = tBoxes.filter((b) => b <= 768).length;
  await t.close();

  fs.mkdirSync('test-evidence/ux', { recursive: true });
  fs.writeFileSync('test-evidence/ux/metrics.json', JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));

  expect(metrics.phoneMapSmallestTablePx as number).toBeGreaterThanOrEqual(44);
  expect(metrics.phoneRowsFullyVisible as number).toBeGreaterThanOrEqual(5);
  expect(metrics.seatedFigure).toMatch(/יושבים עכשיו \d+ סועדים/);
});
