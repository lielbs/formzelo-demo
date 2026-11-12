/**
 * The host reservation list: shift pulse with quick filters, the time rail with a "now" mark,
 * the filter sheet, the add chooser and the phone dock — on a phone, a tablet and a desktop,
 * in light and dark. Screenshots go to test-evidence/tables/host-shift.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { asUser, newContext, overflow, seedBusiness, seedVenue, signIn, smallTargets, today, warmUp, type Business } from './fixtures';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const OUT = 'test-evidence/tables/host-shift';
let biz: Business;
let venue: { id: string; slug: string };

test.beforeAll(async ({ browser }) => {
  await warmUp(browser);
  fs.mkdirSync(OUT, { recursive: true });
  biz = await seedBusiness('ביסטרו המשמרת', 1);
  venue = await seedVenue(biz, { approval: 'auto', publicWaitlist: true, tables: 15 });
  const host = biz.hosts[0]!.id;
  const day = today();
  for (const party of [2, 4]) {
    await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({ source: 'walk_in', date: day, party, name: `מזדמנים ${party}`, seatNow: true }), crypto.randomUUID()]);
  }
  const names = ['דנה לוי', 'Michael Cohen', 'יוסי אברהם', 'רותם שמש', 'אבי ונועה', 'משפחת כהן-ברק'];
  let i = 0;
  for (const time of ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30']) {
    try {
      await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({
        source: 'phone', serviceKey: 'dinner', date: day, time, party: 2 + (i % 5), name: names[i], phone: `050-12345${String(10 + i)}`, requests: i % 3 === 0 ? 'יום הולדת' : '',
      }), crypto.randomUUID()]);
    } catch { /* the slot may already have passed today */ }
    i++;
  }
  await asUser(host, 'select public.tables_waitlist_add($1,$2,$3)', [venue.id, JSON.stringify({ name: 'משפחת לוי', party: 4, phone: '054-7770004' }), crypto.randomUUID()]);
});

async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  expect(await overflow(page), `${name}: horizontal overflow`).toEqual([]);
  expect(await smallTargets(page), `${name}: targets under 24px`).toEqual([]);
}

async function open(browser: import('@playwright/test').Browser, size: { width: number; height: number }, theme: 'light' | 'dark') {
  const ctx = await newContext(browser, size, size.width < 1024);
  await ctx.addInitScript((t) => { try { localStorage.setItem('fz_tables_theme', t); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  await signIn(page, biz.hosts[0]!, `/app/tables/${venue.id}/live`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^הכול:/ })).toBeVisible();
  return { ctx, page };
}

for (const theme of ['light', 'dark'] as const) {
  test(`phone: timeline, tiles, filters, add menu, tabs — ${theme}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, { width: 375, height: 812 }, theme);
    await shot(page, `phone-list-${theme}`);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);

    // The seated tile narrows the list to seated parties only; tapping it again shows everything.
    const seated = page.getByRole('button', { name: /^יושבים:/ });
    await seated.click();
    await expect(seated).toHaveAttribute('aria-pressed', 'true');
    const statuses = await page.locator('#shift-main .hs-card').count();
    expect(statuses).toBe(2);
    await shot(page, `phone-tile-seated-${theme}`);
    await seated.click();
    await expect(page.getByRole('button', { name: /^הכול:/ })).toHaveAttribute('aria-pressed', 'true');

    // Tap feedback: a control sinks while pressed and springs back after release.
    const filterBtn = page.getByRole('button', { name: /^סינון וסידור/ });
    const box = (await filterBtn.boundingBox())!;
    const scaleOf = () => filterBtn.evaluate((el) => Number(getComputedStyle(el).scale === 'none' ? 1 : getComputedStyle(el).scale));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(160);
    expect(await scaleOf()).toBeLessThan(0.95);
    await page.mouse.up();
    await page.waitForTimeout(700);
    expect(await scaleOf()).toBe(1);
    await page.getByRole('dialog', { name: 'סינון וסידור' }).getByRole('button', { name: 'סגירה' }).click();
    await expect(page.getByRole('dialog', { name: 'סינון וסידור' })).toBeHidden();

    // Filter sheet: the footer previews the result before applying.
    await page.getByRole('button', { name: /^סינון וסידור/ }).click();
    const sheet = page.getByRole('dialog', { name: 'סינון וסידור' });
    await expect(sheet).toBeVisible();
    await shot(page, `phone-filter-sheet-${theme}`);
    await sheet.getByRole('button', { name: /^2\s*\d/ }).click();
    const apply = sheet.getByRole('button', { name: /^הצגת \d+ הזמנות$/ });
    const n = Number((await apply.textContent())!.match(/\d+/)![0]);
    await apply.click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'הסרת הסינון 2 סועדים' })).toBeVisible();
    expect(await page.locator('#shift-main .hs-card').count()).toBe(n);
    await shot(page, `phone-filtered-${theme}`);
    await page.getByRole('button', { name: 'ניקוי הכול' }).click();
    await expect(page.getByRole('button', { name: 'ניקוי הכול' })).toBeHidden();

    // Dock add: three described choices; walk-in opens the add sheet in that mode.
    await page.getByRole('button', { name: 'הוספה', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'מה מוסיפים?' });
    await expect(chooser.getByRole('button')).toHaveCount(4); // three choices + close
    await shot(page, `phone-add-chooser-${theme}`);
    await chooser.getByRole('button', { name: /מזדמנים עכשיו/ }).click();
    const add = page.getByRole('dialog', { name: 'הוספה למשמרת' });
    await expect(add).toBeVisible();
    await expect(add.getByRole('radio', { name: 'מזדמנים עכשיו' })).toHaveAttribute('aria-checked', 'true');
    await add.getByRole('button', { name: 'ביטול' }).click();

    // Dock drag: press on the list tab, slide to the waitlist tab, release.
    const dockTab = (name: RegExp | string) => page.getByRole('navigation', { name: 'תצוגות המשמרת' }).getByRole('radio', { name });
    const from = await dockTab('רשימה').boundingBox();
    const to = await dockTab(/המתנה/).boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(dockTab(/המתנה/)).toHaveAttribute('aria-checked', 'true');
    // Keyboard: arrows move between views (left = next in Hebrew).
    await dockTab(/המתנה/).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dockTab('מפה')).toHaveAttribute('aria-checked', 'true');
    await expect(dockTab('מפה')).toBeFocused();
    await dockTab('רשימה').click();
    await expect(dockTab('רשימה')).toHaveAttribute('aria-checked', 'true');

    // Tab bar.
    await page.getByRole('radio', { name: 'מפה' }).click();
    await shot(page, `phone-floor-${theme}`);
    await page.getByRole('radio', { name: /המתנה/ }).click();
    await expect(page.getByText('משפחת לוי', { exact: true })).toBeVisible();
    await shot(page, `phone-waitlist-${theme}`);
    await ctx.close();
  });

  for (const size of [{ width: 320, height: 640 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    test(`${size.width}x${size.height} list — ${theme}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, size, theme);
      await shot(page, `list-${size.width}x${size.height}-${theme}`);
      // The phone dock never shows on tablets and desktops (they use the in-page view switch).
      const dock = page.getByRole('navigation', { name: 'תצוגות המשמרת' });
      if (size.width >= 768) await expect(dock).toBeHidden(); else await expect(dock).toBeVisible();
      if (size.width >= 1024) {
        await page.getByRole('button', { name: /פתיחת פרטים/ }).first().click();
        await expect(page.getByRole('complementary', { name: 'פרטים' })).toBeVisible();
        await shot(page, `detail-${size.width}x${size.height}-${theme}`);
      }
      await ctx.close();
    });
  }
}

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
  test(`book from a table — walk-in now and a later time (${size.width})`, async ({ browser }) => {
    const { ctx, page } = await open(browser, size, 'light');
    await page.locator('[role=radio]:visible', { hasText: 'מפה' }).click();
    const freeTables = page.locator('[role=button][aria-label*="מוכן"]');
    await expect(freeTables.first()).toBeVisible();
    const before = await page.locator('[role=button][aria-label*="תפוס"]').count();

    // Walk-in now on a free table.
    const first = (await freeTables.first().getAttribute('aria-label'))!.match(/שולחן (\S+),/)![1]!;
    await freeTables.first().click();
    const panel = page.getByRole('complementary', { name: 'פרטים' });
    await expect(panel.getByRole('heading', { name: 'הוספה לשולחן הזה' })).toBeVisible();
    await panel.getByRole('button', { name: 'הושבה עכשיו' }).click();
    const sheet = page.getByRole('dialog', { name: `שולחן ${first}` });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/table-walkin-${size.width}.png` });
    await sheet.getByRole('textbox', { name: 'שם' }).fill('זוג מהרחוב');
    await page.getByRole('button', { name: `הושבה עכשיו בשולחן ${first}` }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.locator('[role=button][aria-label*="תפוס"]').count()).toBe(before + 1);

    // A later time on another free table: only that table's free times are offered.
    const panelClose = page.getByRole('button', { name: 'סגירת הפרטים' });
    if (await panelClose.isVisible()) await panelClose.click();
    const second = page.locator('[role=button][aria-label*="מוכן"]').last();
    const label = (await second.getAttribute('aria-label'))!.match(/שולחן (\S+),/)![1]!;
    await second.click();
    await panel.getByRole('button', { name: 'הזמנה לשעה' }).click();
    const later = page.getByRole('dialog', { name: `שולחן ${label}` });
    await expect(later.getByRole('group', { name: 'שעה פנויה בשולחן הזה' })).toBeVisible();
    await expect(later.locator('[aria-busy=true]')).toHaveCount(0);
    const slot = later.locator('button[aria-label$=" פנוי"]').last(); // the latest free time, away from the lead-time edge
    if (await slot.count()) {
      const time = (await slot.getAttribute('aria-label'))!.split(' ')[0]!;
      await slot.click();
      await later.getByRole('textbox', { name: /שם/ }).fill(`הזמנה מהמפה ${size.width}`);
      await page.screenshot({ path: `${OUT}/table-later-${size.width}.png` });
      await page.getByRole('button', { name: `שמירת הזמנה ל-${time}` }).click();
      await expect(later).toBeHidden();
      // The table panel lists the new booking straight away.
      await expect(panel.getByText(`הזמנה מהמפה ${size.width}`)).toBeVisible();
      await page.getByRole('button', { name: 'סגירת הפרטים' }).click();
      await page.locator('[role=radio]:visible', { hasText: 'רשימה' }).click();
      const card = page.locator('#shift-main .hs-card', { hasText: `הזמנה מהמפה ${size.width}` });
      await expect(card).toBeVisible();
      await expect(card).toContainText(label);
    }
    await ctx.close();
  });
}
