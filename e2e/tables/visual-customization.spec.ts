/**
 * Formangle Tables — visual customization (menu images, customizable booking / waitlist pages).
 *
 *  1. Owner designs the pages in the studio (preset, wording, extra question), sees the live
 *     preview at phone / tablet / desktop, is warned before leaving unsaved work, saves a draft,
 *     finds it again after a reload, and only publishing changes what guests see. A guest then
 *     books with the extra question; the answer is stored for the team.
 *  2. Owner uploads a menu hero, a two-image gallery (reordered), a section image and a dish
 *     image, removes one, publishes; guests see the images in order with object-cover framing.
 *  3. Sweep of the customized guest pages and the studio at 320–1440 px, light and dark display,
 *     Hebrew and English: no horizontal overflow, no tiny targets, no serious axe violations.
 * Runs only against the disposable local stack (see ../stack.ts). Evidence: test-evidence/tables/visual-customization.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from '../stack';
import { newContext, overflow, seedBusiness, seedVenue, signIn, smallTargets, warmUp, type Business } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const OUT = 'test-evidence/tables/visual-customization';
const SIZES = [{ w: 320, h: 640 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 430, h: 932 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1280, h: 860 }, { w: 1440, h: 900 }];

let biz: Business;
let venue: { id: string; slug: string };

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await warmUp(browser);
  biz = await seedBusiness('בר הנמל', 1);
  venue = await seedVenue(biz, { publicWaitlist: true, tables: 10 });
});

/** A real PNG drawn in the browser (so uploads go through the same downscaling path as owners use). */
async function png(page: Page, color: string, label: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const b64 = await page.evaluate(([c, l]) => {
    const cv = document.createElement('canvas');
    cv.width = 900; cv.height = 600;
    const g = cv.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 900, 600);
    grd.addColorStop(0, c!); grd.addColorStop(1, '#222222');
    g.fillStyle = grd; g.fillRect(0, 0, 900, 600);
    g.fillStyle = '#ffffff'; g.font = 'bold 80px sans-serif'; g.fillText(l!, 60, 320);
    return cv.toDataURL('image/png').split(',')[1]!;
  }, [color, label]);
  return { name: `${label}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true, animations: 'disabled' });
}

test('owner designs, saves, reloads and publishes the guest pages; a guest answers the extra question', async ({ browser }) => {
  const ctx = await newContext(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await signIn(page, biz.owner, `/app/tables/${venue.id}/design`);
  await expect(page.getByRole('heading', { name: 'עיצוב דפי ההזמנה' })).toBeVisible();
  await page.getByRole('switch', { name: 'עיצוב מותאם אישית' }).click();
  await page.getByRole('radio', { name: /בר קוקטיילים/ }).click();
  await expect(page.getByRole('radio', { name: /בר קוקטיילים/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByText('טקסטים · הזמנת שולחן').click();
  await page.getByLabel('כותרת', { exact: true }).fill('שולחן בבר');
  await page.getByLabel('הודעה אחרי ההזמנה').fill('החניה ברחוב הסמוך חינם אחרי 19:00');
  await page.getByText('שדות ושאלות', { exact: true }).click();
  await page.getByRole('button', { name: 'שאלה נוספת' }).click();
  await page.getByLabel('ניסוח השאלה').fill('יש אלרגיות שכדאי שנדע?');
  await page.getByLabel('חובה לענות').check();

  // Live preview follows the draft at three device sizes.
  const frame = page.frameLocator('iframe[title="תצוגה מקדימה של דף האורחים"]');
  await expect(frame.getByRole('heading', { name: 'שולחן בבר' })).toBeVisible();
  await expect(frame.getByText('יש אלרגיות שכדאי שנדע?')).toBeVisible();
  await expect(frame.getByText('תצוגה מקדימה של הטיוטה — שום דבר לא נשלח מכאן.')).toBeVisible();
  for (const [label, width] of [['טאבלט', '768px'], ['מחשב', '1280px'], ['טלפון', '390px']] as const) {
    await page.getByRole('radio', { name: label }).click();
    await expect(page.locator('iframe[title="תצוגה מקדימה של דף האורחים"]')).toHaveCSS('width', width);
  }
  await expect(page.getByText('לא נשמר', { exact: true })).toBeVisible();
  await shot(page, 'studio-editing-1280');

  // Unsaved work: leaving asks first (dismiss = stay).
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: /← ביסטרו הנמל/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/tables/${venue.id}/design$`));

  await page.getByRole('button', { name: 'שמירת טיוטה' }).click();
  await expect(page.getByText('נשמר כטיוטה · לא פורסם')).toBeVisible();

  // Saved draft survives a reload; guests still see the published (standard) page.
  await page.reload();
  await page.getByText('טקסטים · הזמנת שולחן').click();
  await expect(page.getByLabel('כותרת', { exact: true })).toHaveValue('שולחן בבר');
  const guest = await newContext(browser, { width: 390, height: 844 }, true);
  const g = await guest.newPage();
  await g.goto(`/t/${venue.slug}`);
  await expect(g.getByRole('heading', { name: 'הזמנת שולחן' })).toBeVisible();
  await expect(g.locator('.fz-pp')).toHaveCount(0);

  await page.getByRole('button', { name: 'פרסום' }).click();
  await expect(page.getByText('דפי ההזמנה פורסמו — האורחים רואים את העיצוב החדש')).toBeVisible();
  await expect(page.getByText('מעודכן באתר')).toBeVisible();

  // Guest sees the published design and must answer the required question.
  await g.reload();
  await expect(g.getByRole('heading', { name: 'שולחן בבר' })).toBeVisible();
  await expect(g.locator('.fz-pp')).toHaveAttribute('data-pp-card', 'elevated');
  // The studio preview inherits exactly what guests inherit (Brand Kit accent included).
  const accent = (loc: import('@playwright/test').Locator) => loc.evaluate((el) => getComputedStyle(el).getPropertyValue('--pp-l-accent').trim());
  await page.reload();
  expect(await accent(frame.locator('.fz-pp'))).toBe(await accent(g.locator('.fz-pp')));
  await g.getByRole('button', { name: 'מחר' }).first().click();
  await g.locator('section[aria-labelledby="times-h"] button').first().click();
  await g.getByLabel('שם מלא').fill('נועה בדיקה');
  await g.getByLabel('טלפון נייד').fill('050-5550199');
  await g.getByLabel('קראתי ואני מסכים/ה לתנאי ההזמנה').check();
  await g.getByRole('button', { name: 'אישור ההזמנה' }).click();
  await expect(g.getByText('צריך לענות על השאלה הזו.').first()).toBeVisible();
  await g.getByLabel(/יש אלרגיות שכדאי שנדע\?/).fill('שומשום');
  await g.getByRole('button', { name: 'אישור ההזמנה' }).click();
  await expect(g.getByRole('heading', { name: 'ההזמנה מאושרת' })).toBeVisible();
  await expect(g.getByText('החניה ברחוב הסמוך חינם אחרי 19:00')).toBeVisible();
  await shot(g, 'guest-confirmed-390');
  await g.getByRole('link', { name: 'פתיחת דף ההזמנה' }).click();
  await expect(g.getByText('קוד הזמנה')).toBeVisible();
  await expect(g.locator('.fz-pp')).toHaveCount(1); // the manage page wears the same published look
  expect(await overflow(g)).toEqual([]);
  await shot(g, 'guest-manage-390');
  const rows = await sql<{ custom_answers: { label: string; value: string }[] }>(
    `select custom_answers from public.tables_reservations where venue_id = $1 and guest_name = 'נועה בדיקה'`, [venue.id]);
  expect(rows[0]?.custom_answers).toEqual([expect.objectContaining({ label: 'יש אלרגיות שכדאי שנדע?', value: 'שומשום' })]);
  await guest.close();
  await ctx.close();
});

test('owner adds menu images (hero, ordered gallery, section, dish), removes one and publishes', async ({ browser }) => {
  const ctx = await newContext(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await signIn(page, biz.owner, `/app/tables/${venue.id}/menus`);
  await page.getByLabel('תפריט חדש').fill('תפריט ערב');
  await page.getByRole('button', { name: 'יצירה' }).click();
  await page.getByRole('button', { name: 'מנה חדשה' }).click();
  await page.getByLabel('שם המנה').fill('ברוסקטה');
  await page.getByLabel('מחיר לתצוגה').fill('₪38');

  const files = page.locator('input[type=file]');
  const uploaded = async (i: number, color: string, label: string) => {
    const before = (await sql<{ n: number }>('select count(*)::int n from public.organization_assets where organization_id = $1', [biz.orgId]))[0]!.n;
    await files.nth(i).setInputFiles(await png(page, color, label));
    await expect.poll(async () => (await sql<{ n: number }>('select count(*)::int n from public.organization_assets where organization_id = $1', [biz.orgId]))[0]!.n).toBe(before + 1);
    return (await sql<{ id: string }>('select id from public.organization_assets where organization_id = $1 order by created_at desc limit 1', [biz.orgId]))[0]!.id;
  };
  const hero = await uploaded(0, '#B4532A', 'HERO');
  const g1 = await uploaded(1, '#1F6F5C', 'G1');
  await expect(page.getByRole('list', { name: 'תמונות הגלריה לפי הסדר' }).getByRole('listitem')).toHaveCount(1);
  const g2 = await uploaded(1, '#5B3FA6', 'G2');
  await expect(page.getByRole('list', { name: 'תמונות הגלריה לפי הסדר' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'הזזת תמונה 1 מאוחר יותר' }).click();
  const section = await uploaded(2, '#2A5DB4', 'SEC');
  const dish = await uploaded(3, '#B42A6F', 'DISH');
  await expect(page.getByRole('button', { name: 'החלפת תמונה למנה' })).toBeVisible();
  await shot(page, 'menu-editor-1280');

  await page.getByRole('button', { name: 'שמירת טיוטה' }).click();
  await expect(page.getByText('הטיוטה נשמרה')).toBeVisible();
  const [m] = await sql<{ draft: { hero?: { imageAssetId?: string }; gallery?: string[]; sections: { imageAssetId?: string; items: { imageAssetId?: string }[] }[] } }>(
    'select draft from public.tables_menus where venue_id = $1 and status <> $2', [venue.id, 'archived']);
  expect(m!.draft.hero?.imageAssetId).toBe(hero);
  expect(m!.draft.gallery).toEqual([g2, g1]);
  expect(m!.draft.sections[0]!.imageAssetId).toBe(section);
  expect(m!.draft.sections[0]!.items[0]!.imageAssetId).toBe(dish);

  // Remove the section image (simple remove), then publish.
  await page.getByRole('button', { name: 'הסרת תמונה לקטגוריה' }).click();
  await page.getByRole('button', { name: 'פרסום התפריט' }).click();
  await expect(page.getByText('התפריט פורסם')).toBeVisible();
  const [p] = await sql<{ doc: { sections: { imageAssetId?: string }[] } }>(
    `select v.snapshot->'doc' doc from public.tables_menus m join public.tables_menu_versions v on v.id = m.published_version_id where m.venue_id = $1`, [venue.id]);
  expect(p!.doc.sections[0]!.imageAssetId).toBeUndefined();

  // Guests: images load, in order, framed with object-cover and fixed aspect ratios.
  for (const size of [{ width: 320, height: 640 }, { width: 1440, height: 900 }]) {
    const gctx = await newContext(browser, size, size.width < 768);
    const gp = await gctx.newPage();
    await gp.goto(`/t/${venue.slug}/menu`);
    await expect(gp.getByRole('heading', { name: 'תפריט ערב' })).toBeVisible();
    const imgs = gp.locator('main img');
    await expect(imgs).toHaveCount(4); // hero, two gallery photos, dish (section image removed)
    await gp.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('main img')].every((i) => i.complete && i.naturalWidth > 0));
    const srcs = await imgs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    expect(srcs[0]).toContain(hero);
    expect(srcs[1]).toContain(g2);
    expect(srcs[2]).toContain(g1);
    expect(srcs[3]).toContain(dish);
    for (const fit of await imgs.evaluateAll((els) => els.map((e) => getComputedStyle(e).objectFit))) expect(fit).toBe('cover');
    expect(await overflow(gp)).toEqual([]);
    await shot(gp, `guest-menu-${size.width}`);
    await gctx.close();
  }
  await ctx.close();
});

test('customized guest pages and the studio: 320–1440 px, light/dark, Hebrew/English', async ({ browser }) => {
  const problems: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const lang of ['he', 'en'] as const) {
      const ctx = await newContext(browser, { width: 390, height: 844 });
      await ctx.addInitScript((t) => { try { localStorage.setItem('fz_tables_theme', t); } catch { /* */ } }, theme);
      const page = await ctx.newPage();
      const q = lang === 'en' ? '?lang=en' : '';
      for (const [screen, url, ready] of [
        ['book', `/t/${venue.slug}${q}`, lang === 'en' ? 'Book a table' : 'שולחן בבר'],
        ['waitlist', `/t/${venue.slug}/waitlist${q}`, lang === 'en' ? 'Waitlist' : 'רשימת המתנה'],
        ['menu', `/t/${venue.slug}/menu${q}`, 'תפריט ערב'],
      ] as const) {
        await page.goto(url);
        // English keeps the owner's Hebrew wording where the owner wrote it (owner content).
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        void ready;
        for (const size of SIZES) {
          await page.setViewportSize({ width: size.w, height: size.h });
          await page.waitForTimeout(150);
          const tag = `${screen}-${lang}-${theme}-${size.w}`;
          if (size.w === 390 || size.w === 1280 || size.w === 320) await shot(page, tag);
          for (const o of await overflow(page)) problems.push(`${tag} overflow ${o}`);
          for (const s of await smallTargets(page)) problems.push(`${tag} target ${s}`);
          if (size.w === 390 || size.w === 1280) {
            const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
            for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) problems.push(`${tag} axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
          }
        }
      }
      await ctx.close();
    }
  }
  // The owner studio at the same sizes (light and dark).
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await newContext(browser, { width: 1280, height: 900 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('fz_tables_theme', t); } catch { /* */ } }, theme);
    const page = await ctx.newPage();
    await signIn(page, biz.owner, `/app/tables/${venue.id}/design`);
    await expect(page.getByRole('heading', { name: 'עיצוב דפי ההזמנה' })).toBeVisible();
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.waitForTimeout(200);
      const tag = `studio-${theme}-${size.w}`;
      if ([320, 390, 768, 1440].includes(size.w)) await shot(page, tag);
      for (const o of await overflow(page)) problems.push(`${tag} overflow ${o}`);
      for (const s of await smallTargets(page)) problems.push(`${tag} target ${s}`);
    }
    // Phone: the preview opens as a full-screen sheet and closes again.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'תצוגה מקדימה' }).click();
    await expect(page.locator('iframe[title="תצוגה מקדימה של דף האורחים"]')).toBeVisible();
    await shot(page, `studio-${theme}-preview-sheet-390`);
    await page.getByRole('button', { name: 'סגירה' }).click();
    await expect(page.locator('iframe[title="תצוגה מקדימה של דף האורחים"]')).toBeHidden();
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(problems, null, 2));
  expect(problems).toEqual([]);
});
