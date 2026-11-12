/**
 * Screen audit (production code path, local stack): every main screen on a phone, a tablet and a
 * desktop. Saves screenshots and a report of horizontal overflow and text cut off with an ellipsis
 * or clamp, so visual work can be measured. Run: npx playwright test e2e/tables/screens.spec.ts
 */
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { asUser, newContext, overflow, seedBusiness, seedVenue, signIn, today, warmUp, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });
const OUT = 'test-evidence/screens';
let biz: Business;
let venue: Awaited<ReturnType<typeof seedVenue>>;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  await warmUp(browser);
  fs.mkdirSync(OUT, { recursive: true });
  biz = await seedBusiness('ביסטרו הנמל', 1);
  venue = await seedVenue(biz, { approval: 'auto', publicWaitlist: true, tables: 12 });
  const host = biz.hosts[0]!.id;
  const names = ['דנה לוי', 'Michael Cohen', 'יוסי אברהם', 'רותם שמש', 'משפחת כהן-ברקוביץ׳ הגדולה מאוד', 'אבי ונועה'];
  let i = 0;
  for (const time of ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30']) {
    try {
      await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({
        source: 'phone', serviceKey: 'dinner', date: today(1), time, party: 2 + (i % 5), name: names[i], phone: `050-12345${String(10 + i)}`,
        requests: i % 2 === 0 ? 'יום הולדת, כיסא תינוק ושולחן ליד החלון אם אפשר' : '',
      }), crypto.randomUUID()]);
    } catch { /* ignore */ }
    i++;
  }
  const menu = await asUser<{ id: string }>(biz.owner.id, 'select public.tables_menu_create($1,$2)', [venue.id, 'תפריט ערב']);
  const doc = { sections: [
    { title: 'פתיחים', items: [{ name: 'פוקאצ׳ה מהטאבון', description: 'שמן זית, מלח ים ושום קונפי', price: '32' }, { name: 'סלט עגבניות שוק', description: 'בצל סגול, אורגנו, גבינת פטה כבשים', price: '46', dietary: ['vegetarian'] }] },
    { title: 'עיקריות', items: [{ name: 'פילה דניס', description: 'ירקות שורש צלויים ורוטב חמאת לימון', price: '118' }, { name: 'ניוקי ערמונים', description: 'חמאה חומה, מרווה ופרמזן', price: '84' }] },
  ] };
  const saved = await asUser<{ lockVersion: number }>(biz.owner.id, 'select public.tables_menu_save($1,$2,$3,$4)', [menu.id, 'תפריט ערב', JSON.stringify(doc), 0]).catch(() => null);
  if (saved) await asUser(biz.owner.id, 'select public.tables_menu_publish($1,$2)', [menu.id, saved.lockVersion]).catch(() => undefined);
});

/** Text cut short by an ellipsis or a line clamp (inputs excluded). */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      if (el.matches('input,textarea,select,svg,svg *') || !el.textContent?.trim()) return;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > window.innerHeight * 3) return;
      const ellipsis = s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
      const clamp = s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '' && el.scrollHeight > el.clientHeight + 2;
      if (ellipsis || clamp) out.push(`${ellipsis ? 'ellipsis' : 'clamp'} "${el.textContent.trim().slice(0, 50)}"`);
    });
    return [...new Set(out)].slice(0, 20);
  });
}

const SIZES = [{ width: 390, height: 844, tag: 'phone' }, { width: 820, height: 1180, tag: 'tablet' }, { width: 1280, height: 860, tag: 'desktop' }];
const report: Record<string, { overflow: string[]; clipped: string[] }> = {};

for (const size of SIZES) {
  test(`screens — ${size.tag}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await newContext(browser, size, size.width < 1024);
    const page = await ctx.newPage();
    const snap = async (name: string, full = true) => {
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${size.tag}-${name}.png`, fullPage: full });
      report[`${size.tag}/${name}`] = { overflow: await overflow(page), clipped: await clipped(page) };
    };
    await signIn(page, biz.owner, '/app');
    await snap('dashboard');
    if (size.tag === 'phone') {
      await page.goto('/app/workflows/new');
      await page.getByRole('button', { name: 'פרחים · זר בהתאמה' }).click();
      await page.getByRole('button', { name: 'יצירת תהליך', exact: true }).click();
      await page.getByRole('button', { name: 'המשך לסטודיו' }).first().click();
      await expect(page).toHaveURL(/\/app\/workflows\/[0-9a-f-]{36}$/);
    }
    await page.goto('/app/workflows/new'); await snap('workflow-new');
    await page.goto('/app/workflows'); await snap('workflows');
    await page.getByRole('link', { name: 'הזמנת זר פרחים' }).first().click();
    await expect(page).toHaveURL(/\/app\/workflows\/[0-9a-f-]{36}$/);
    await snap('editor', false);
    await page.goto('/app/requests'); await snap('requests');
    await page.goto('/app/brand'); await snap('brand');
    await page.goto('/app/settings'); await snap('settings');
    await page.goto('/app/tables'); await snap('tables-home');
    await page.goto(`/app/tables/${venue.id}`); await snap('venue');
    await page.goto(`/app/tables/${venue.id}/setup?step=hours`); await snap('setup-hours');
    await page.goto(`/app/tables/${venue.id}/menus`); await snap('menus');
    await page.goto(`/app/tables/${venue.id}/live?date=${today(1)}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await snap('shift-list', false);
    await page.getByRole('radio', { name: 'מפה' }).first().click().catch(() => undefined);
    await snap('shift-floor', false);
    await page.goto(`/t/${venue.slug}`); await snap('guest-booking');
    await page.goto(`/t/${venue.slug}/menu`); await snap('guest-menu');
    await ctx.close();
  });
}

test.afterAll(() => {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
});
