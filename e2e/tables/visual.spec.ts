/**
 * Visual and accessibility sweep of every Formangle Tables screen at the required sizes, in
 * light and dark display, Hebrew RTL plus representative English LTR guest pages.
 * Each shot is checked for horizontal overflow and tiny touch targets; axe runs at a phone and a
 * desktop size per screen and theme. Screenshots + contact sheets go to test-evidence/tables/visual.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { warmUp } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';
import { asUser, newContext, overflow, seedBusiness, seedVenue, signIn, smallTargets, today, uniq, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });
test.setTimeout(900_000);

const OUT = 'test-evidence/tables/visual';
const ALL_SIZES = [
  { w: 320, h: 640 }, { w: 360, h: 740 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 430, h: 932 },
  { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1024, h: 1366 }, { w: 1280, h: 860 }, { w: 1366, h: 1024 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 },
];
/** TABLES_SWEEP=quick runs a phone, a tablet landscape and a desktop size only (iteration loop). */
const SIZES = process.env.TABLES_SWEEP === 'quick' ? ALL_SIZES.filter((x) => [390, 1280].includes(x.w) || (x.w === 1024 && x.h === 768)) : ALL_SIZES;
const THEMES = ['light', 'dark'] as const;
type Finding = { screen: string; theme: string; size: string; kind: string; detail: string };
const findings: Finding[] = [];
const shots: { screen: string; theme: string; size: { w: number; h: number }; file: string }[] = [];

let biz: Business;
let venue: { id: string; slug: string };
let manageToken = '';
let waitToken = '';

test.beforeAll(async ({ browser }) => { await warmUp(browser); });
test.beforeAll(async () => {
  biz = await seedBusiness('ביסטרו הנמל', 2);
  venue = await seedVenue(biz, { approval: 'conditional', publicWaitlist: true, tables: 15 });
  const host = biz.hosts[0]!.id;
  const day = today();
  // A lively shift: walk-ins seated now, upcoming bookings, a pending request, waitlist.
  for (const party of [2, 4, 3]) {
    await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({ source: 'walk_in', date: day, party, name: `מזדמנים ${party}`, seatNow: true }), crypto.randomUUID()]);
  }
  const names = ['דנה לוי', 'Michael Cohen', 'יוסי אברהם', 'רותם שמש', 'Sarah O’Brien', 'אבי ונועה', 'משפחת כהן-ברק', 'ליאור'];
  let i = 0;
  for (const time of ['18:00', '18:30', '19:00', '19:15', '19:30', '20:00', '20:30', '21:00']) {
    try {
      await asUser(host, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue.id, JSON.stringify({
        source: 'phone', serviceKey: 'dinner', date: day, time, party: 2 + (i % 4), name: names[i], phone: `050-12345${String(10 + i)}`, requests: i % 3 === 0 ? 'יום הולדת, כיסא תינוק' : '',
      }), crypto.randomUUID()]);
    } catch { /* slot may have passed late in the day */ }
    i++;
  }
  const pend = await asAnon('select public.tables_public_book($1,$2,$3,$4)', [venue.slug, JSON.stringify({ serviceKey: 'dinner', date: today(1), time: '20:00', party: 8, name: 'קבוצת עבודה', phone: '0521112233', termsAccepted: true }), crypto.randomUUID(), crypto.randomUUID()]) as { token: string };
  void pend;
  const booked = await asAnon('select public.tables_public_book($1,$2,$3,$4)', [venue.slug, JSON.stringify({ serviceKey: 'dinner', date: today(2), time: '19:30', party: 4, name: 'Guest Example', phone: '+44 20 7946 0958', termsAccepted: true }), crypto.randomUUID(), crypto.randomUUID()]) as { token: string };
  manageToken = booked.token;
  for (const [n, p] of [['משפחת לוי', 4], ['Tom', 2], ['שירה', 6]] as const) {
    await asUser(host, 'select public.tables_waitlist_add($1,$2,$3)', [venue.id, JSON.stringify({ name: n, party: p, phone: `054-77700${String(p).padStart(2, '0')}` }), crypto.randomUUID()]);
  }
  const w = await asAnon('select public.tables_public_waitlist_join($1,$2,$3,$4)', [venue.slug, JSON.stringify({ name: 'אורחת', phone: '0549990000', party: 2, consent: true }), crypto.randomUUID(), crypto.randomUUID()]) as { token: string };
  waitToken = w.token;
  const menu = await asUser<{ id: string }>(biz.owner.id, 'select public.tables_menu_create($1,$2)', [venue.id, 'תפריט ערב']);
  const doc = { sections: [
    { title: 'ראשונות', items: [{ name: 'סלט עגבניות שרי', description: 'שמן זית, בזיליקום, מלח ים', price: '₪42', dietary: ['vegan', 'gluten_free'], allergens: [] },
      { name: 'Burrata & figs', description: 'Fresh burrata, roasted figs, balsamic', price: '₪58', dietary: ['vegetarian'], allergens: ['dairy'] }] },
    { title: 'עיקריות', items: [{ name: 'פילה לברק על הגריל', description: 'ירקות שורש צלויים, טחינה', price: '₪96', allergens: ['fish', 'sesame'] }] },
  ] };
  await asUser(biz.owner.id, 'select public.tables_menu_save($1,$2,$3,0)', [menu.id, 'תפריט ערב', JSON.stringify(doc)]);
  await asUser(biz.owner.id, 'select public.tables_menu_publish($1,1)', [menu.id]);
});

async function asAnon(text: string, values: unknown[]) {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
  await c.connect();
  try {
    await c.query('begin');
    await c.query('set local role anon');
    const r = await c.query(text, values);
    await c.query('commit');
    return Object.values(r.rows[0])[0];
  } finally { await c.end(); }
}

async function sweep(page: Page, screen: string, theme: string, opts: { axe?: boolean; prepare?: () => Promise<void>; full?: boolean } = {}) {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.waitForTimeout(250);
    if (opts.prepare) await opts.prepare();
    const tag = `${screen}__${theme}__${size.w}x${size.h}`;
    const file = path.join(OUT, `${tag}.png`);
    await page.screenshot({ path: file, fullPage: opts.full !== false, animations: 'disabled' });
    shots.push({ screen, theme, size, file });
    for (const o of await overflow(page)) findings.push({ screen, theme, size: `${size.w}x${size.h}`, kind: 'overflow', detail: o });
    for (const s of await smallTargets(page)) findings.push({ screen, theme, size: `${size.w}x${size.h}`, kind: 'target<24', detail: s });
    if (opts.axe !== false && (size.w === 390 || size.w === 1280)) {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of r.violations) findings.push({ screen, theme, size: `${size.w}x${size.h}`, kind: `axe:${v.id}`, detail: `${v.impact} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')} — ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}` });
    }
  }
}

async function themed(browserContext: import('@playwright/test').BrowserContext, theme: string) {
  await browserContext.addInitScript((t) => { try { localStorage.setItem('fz_tables_theme', t); } catch { /* */ } }, theme);
}

for (const theme of THEMES) {
  test(`owner screens — ${theme}`, async ({ browser }) => {
    const ctx = await newContext(browser);
    await themed(ctx, theme);
    const page = await ctx.newPage();
    await signIn(page, biz.owner);
    await page.goto('/app/tables');
    await expect(page.getByRole('heading', { name: 'שולחנות', exact: true })).toBeVisible();
    await sweep(page, 'owner-home', theme);
    await page.goto(`/app/tables/${venue.id}`);
    await expect(page.getByRole('heading', { name: 'הקישור להזמנות' })).toBeVisible();
    await sweep(page, 'owner-overview', theme);
    for (const step of ['basics', 'hours', 'seating', 'rules', 'guest', 'review']) {
      await page.goto(`/app/tables/${venue.id}/setup?step=${step}`);
      await expect(page.locator('#step-title')).toBeVisible();
      await sweep(page, `owner-setup-${step}`, theme, { axe: step !== 'hours' || true });
    }
    await page.goto(`/app/tables/${venue.id}/setup?step=seating`);
    await page.getByRole('radio', { name: 'רשימה' }).click();
    await sweep(page, 'owner-setup-seating-list', theme);
    await page.goto(`/app/tables/${venue.id}/menus`);
    await expect(page.getByRole('heading', { name: 'תפריטים' })).toBeVisible();
    await sweep(page, 'owner-menus', theme);
    await page.goto(`/app/tables/${venue.id}/analytics`);
    await expect(page.getByRole('heading', { name: 'נתונים' })).toBeVisible();
    await page.waitForTimeout(500);
    await sweep(page, 'owner-analytics', theme);
    await ctx.close();
  });

  test(`host screens — ${theme}`, async ({ browser }) => {
    const ctx = await newContext(browser);
    await themed(ctx, theme);
    const page = await ctx.newPage();
    await signIn(page, biz.hosts[0]!, `/app/tables/${venue.id}/live?date=${today()}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('הושבו').first()).toBeVisible();
    await sweep(page, 'host-list', theme);
    await page.getByRole('radio', { name: 'מפה' }).click();
    await sweep(page, 'host-floor', theme);
    await page.getByRole('radio', { name: /המתנה/ }).click();
    await sweep(page, 'host-waitlist', theme);
    await page.getByRole('radio', { name: 'רשימה' }).click();
    await page.getByRole('button', { name: /פתיחת פרטים/ }).first().click();
    await expect(page.getByRole('complementary', { name: 'פרטים' })).toBeVisible();
    await sweep(page, 'host-detail', theme, { full: false });
    await page.getByRole('button', { name: 'סגירת הפרטים' }).click();
    await page.getByRole('button', { name: 'הוספה', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'הוספה למשמרת' })).toBeVisible();
    await page.waitForTimeout(600);
    await sweep(page, 'host-quickadd', theme, { full: false });
    await ctx.close();
  });

  test(`guest screens — ${theme}`, async ({ browser }) => {
    for (const lang of ['he', 'en'] as const) {
      const ctx = await newContext(browser, { width: 390, height: 844 }, false);
      await themed(ctx, theme);
      const page = await ctx.newPage();
      const q = lang === 'en' ? '?lang=en' : '';
      await page.goto(`/t/${venue.slug}${q}`);
      await expect(page.getByRole('heading', { name: lang === 'en' ? 'Book a table' : 'הזמנת שולחן' })).toBeVisible();
      await page.getByRole('button', { name: lang === 'en' ? 'Tomorrow' : 'מחר' }).first().click().catch(() => undefined);
      await page.waitForTimeout(800);
      await sweep(page, `guest-${lang}-book`, theme);
      const slot = page.locator('section[aria-labelledby="times-h"] button').first();
      if (await slot.count()) {
        await slot.click();
        await sweep(page, `guest-${lang}-details`, theme);
      }
      await page.goto(`/t/r${q}#t=${manageToken}`);
      await expect(page.getByText(lang === 'en' ? 'Booking code' : 'קוד הזמנה')).toBeVisible();
      await sweep(page, `guest-${lang}-manage`, theme);
      await page.goto(`/t/${venue.slug}/menu${q}`);
      await expect(page.getByRole('heading', { name: lang === 'en' ? 'Menu' : 'תפריט', exact: true })).toBeVisible();
      await sweep(page, `guest-${lang}-menu`, theme);
      if (lang === 'he') {
        await page.goto(`/t/${venue.slug}/waitlist`);
        await expect(page.getByRole('heading', { name: 'רשימת המתנה' })).toBeVisible();
        await sweep(page, 'guest-he-waitlist-join', theme);
        await page.goto(`/t/w#t=${waitToken}`);
        await expect(page.getByText('אתם ברשימת ההמתנה')).toBeVisible();
        await sweep(page, 'guest-he-waitlist-status', theme);
        await page.goto(`/t/r#t=${'x'.repeat(43)}`);
        await expect(page.getByText('הקישור אינו זמין')).toBeVisible();
        await sweep(page, 'guest-he-invalid-link', theme);
      }
      await ctx.close();
    }
  });
}

test('system preference follows the device colour scheme', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`/t/${venue.slug}`);
  await expect(page.getByRole('heading', { name: 'הזמנת שולחן' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('fz-dark'))).toBe(true);
  await page.getByRole('button', { name: /תצוגה: לפי המכשיר/ }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('fz-dark'))).toBe(false);
  await page.goto('/privacy');
  expect(await page.evaluate(() => document.documentElement.classList.contains('fz-dark'))).toBe(false);
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `findings-${uniq()}.json`), JSON.stringify(findings, null, 2));
  // Contact sheets: one per screen × theme, phones on one sheet and larger sizes on another.
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  const groups = new Map<string, typeof shots>();
  for (const s of shots) {
    const key = `${s.screen}__${s.theme}__${s.size.w <= 430 ? 'phones' : 'large'}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const [key, list] of groups) {
    const large = key.endsWith('large');
    const scale = large ? 0.3 : 0.6;
    const cells = list.map((s) => {
      const b64 = fs.readFileSync(s.file).toString('base64');
      return `<figure style="margin:0 12px 0 0;display:inline-block;vertical-align:top"><figcaption style="font:14px sans-serif">${s.size.w}×${s.size.h}</figcaption><img src="data:image/png;base64,${b64}" style="width:${Math.round(s.size.w * scale)}px;border:1px solid #888;max-height:${large ? 1100 : 1600}px;object-fit:cover;object-position:top"></figure>`;
    }).join('');
    await page.setContent(`<body style="margin:8px;background:#ccc;white-space:nowrap"><h1 style="font:bold 18px sans-serif">${key}</h1>${cells}</body>`);
    await page.screenshot({ path: path.join(OUT, 'sheets', `${key}.png`), fullPage: true });
  }
  await page.close();
});
