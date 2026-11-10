/**
 * Formangle Tables E2E fixtures: synthetic businesses, staff and venues on the disposable local
 * stack only (the helpers in ../stack refuse any other host). Passwords are generated per run and
 * never leave this process.
 */
import { randomUUID } from 'node:crypto';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { createUser, sql } from '../stack';

const DB_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const password = () => `Tb-${randomUUID()}`;

export interface Person { id: string; email: string; password: string }
export interface Business { orgId: string; slug: string; owner: Person; hosts: Person[]; manager: Person }

export async function seedBusiness(name = 'Tables Test', hosts = 2): Promise<Business> {
  const run = uniq();
  const slug = `tb-${run}`;
  const mk = async (role: string): Promise<Person> => {
    const email = `${role}-${run}@example.test`;
    const pw = password();
    return { id: await createUser(email, pw), email, password: pw };
  };
  const owner = await mk('owner');
  const manager = await mk('manager');
  const hostList: Person[] = [];
  for (let i = 0; i < hosts; i++) hostList.push(await mk(`host${i + 1}`));
  const [org] = await sql<{ id: string }>(`insert into public.organizations(slug,name,status) values ($1,$2,'active') returning id`, [slug, `${name} ${run}`]);
  const orgId = org!.id;
  await sql('insert into public.organization_settings(organization_id) values ($1)', [orgId]);
  await sql(`insert into public.brand_configurations(organization_id,config) values ($1,$2)`, [orgId, JSON.stringify({ displayName: name, palette: { primary: '#1F6F5C' }, links: [] })]);
  await sql(`insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner')`, [orgId, owner.id]);
  for (const p of [manager, ...hostList]) await sql(`insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'staff')`, [orgId, p.id]);
  await sql('insert into public.tables_organization_features(organization_id,enabled) values ($1,true)', [orgId]);
  return { orgId, slug, owner, hosts: hostList, manager };
}

/** Runs SQL as an authenticated user through the same RPCs the app calls. */
export async function asUser<T = unknown>(userId: string, text: string, values: unknown[] = []): Promise<T> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const r = await c.query(text, values);
    await c.query('commit');
    return Object.values(r.rows[0] ?? {})[0] as T;
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

export function venueDraft(name: string, opts: { tables?: number; approval?: 'auto' | 'manual' | 'conditional'; publicWaitlist?: boolean; leadMinutes?: number; cancelCutoff?: number } = {}) {
  const hall = randomUUID();
  const terrace = randomUUID();
  const n = opts.tables ?? 12;
  const tables = Array.from({ length: n }, (_, i) => {
    const seats = i < n / 3 ? 2 : i < (2 * n) / 3 ? 4 : 6;
    return {
      id: randomUUID(), label: String(i + 1), zoneId: i < n - 3 ? hall : terrace, minCovers: seats === 2 ? 1 : seats - 2, maxCovers: seats,
      shape: seats === 2 ? 'square' : seats === 4 ? 'round' : 'rect', x: 30 + (i % 5) * 150, y: 30 + Math.floor(i / 5) * 130, w: seats === 6 ? 120 : 70, h: 70, rotation: 0,
    };
  });
  const six = tables.filter((t) => t.maxCovers === 6);
  return {
    schema: 1,
    basics: { name, timezone: 'Asia/Jerusalem', venueType: 'restaurant', locale: 'he', address: 'הרצל 10, תל אביב', phone: '03-5551234' },
    services: [
      { key: 'lunch', name: 'צהריים', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '12:00', lastSeating: '15:00', durationMinutes: 90 },
      { key: 'dinner', name: 'ערב', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', lastSeating: '22:30', durationMinutes: 120 },
      { key: 'late', name: 'לילה', weekdays: [4, 5], start: '23:00', lastSeating: '01:00', durationMinutes: 90 },
    ],
    zones: [{ id: hall, name: 'אולם', sort: 0 }, { id: terrace, name: 'מרפסת', sort: 1 }],
    tables,
    combinations: six.length >= 2 ? [{ id: randomUUID(), label: `${six[0]!.label}+${six[1]!.label}`, tableIds: [six[0]!.id, six[1]!.id], minCovers: 7, maxCovers: 12, priority: 0 }] : [],
    policy: {
      slotMinutes: 15, leadMinutes: opts.leadMinutes ?? 0, horizonDays: 30, minParty: 1, maxParty: 12, bufferMinutes: 10,
      approvalMode: opts.approval ?? 'auto', pendingMode: 'unallocated', pendingHoldMinutes: 15,
      cancelCutoffMinutes: opts.cancelCutoff ?? 120, modifyCutoffMinutes: opts.cancelCutoff ?? 120, allowGuestModify: true,
      rules: opts.approval === 'conditional' ? [{ id: 'large', priority: 1, enabled: true, when: { partyAtLeast: 7 }, then: 'require_manual' }] : [],
      zoneChoice: true, zonePreference: 'soft', pacing: null,
      waitlist: { publicEnabled: opts.publicWaitlist ?? true, offerMinutes: 10 },
    },
    guest: { intro: 'מטבח ים-תיכוני עונתי.', terms: 'ניתן לבטל עד שעתיים לפני דרך הקישור. איחור של 15 דקות ומעלה — השולחן עשוי להימסר.', showWhatsapp: true },
  };
}

/** Creates, configures and publishes a venue through the real commands; assigns hosts. */
export async function seedVenue(b: Business, opts: Parameters<typeof venueDraft>[1] = {}) {
  const slug = `v-${uniq()}`;
  const created = await asUser<{ id: string; lockVersion: number }>(b.owner.id, 'select public.tables_create_venue($1,$2,$3)', [b.orgId, 'ביסטרו הנמל', slug]);
  const draft = venueDraft('ביסטרו הנמל', opts);
  const saved = await asUser<{ lockVersion: number }>(b.owner.id, 'select public.tables_save_draft($1,$2,$3)', [created.id, JSON.stringify(draft), created.lockVersion]);
  await asUser(b.owner.id, 'select public.tables_publish_venue($1,$2)', [created.id, saved.lockVersion]);
  for (const h of b.hosts) await asUser(b.owner.id, `select public.tables_assign_staff($1,$2,'host')`, [created.id, h.id]);
  await asUser(b.owner.id, `select public.tables_assign_staff($1,$2,'manager')`, [created.id, b.manager.id]);
  return { id: created.id, slug, draft };
}

export const today = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

export async function newContext(browser: Browser, size: { width: number; height: number } = { width: 1280, height: 860 }, touch = false): Promise<BrowserContext> {
  return browser.newContext({ viewport: size, isMobile: touch, hasTouch: touch, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
}

export async function signIn(page: Page, who: Person, path = '/app') {
  await page.goto(path);
  await page.getByLabel('אימייל').fill(who.email);
  await page.getByLabel('סיסמה').fill(who.password);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByLabel('אימייל')).toHaveCount(0, { timeout: 20_000 });
}

/** Collects page errors and console errors (fails the journey if any appear). */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|WebSocket|realtime/i.test(m.text()) && problems.push(`console: ${m.text()}`));
  return problems;
}

/** Horizontal overflow check: nothing may be wider than the viewport. */
export async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`document ${document.documentElement.scrollWidth}>${vw}`);
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && style.visibility === 'hidden') return;
      let p: HTMLElement | null = el.parentElement;
      while (p) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) return; p = p.parentElement; }
      if (r.right > vw + 1 || r.left < -1) bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')} [${Math.round(r.left)},${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    });
    return bad.slice(0, 10);
  });
}

/** Interactive elements smaller than 24×24 CSS px (WCAG 2.2 minimum), excluding inline text links. */
export async function smallTargets(page: Page, min = 24): Promise<string[]> {
  return page.evaluate((m) => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>('button, [role=button], a[href], input:not([type=hidden]), select, [role=radio]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return;
      if (el.closest('.sr-only')) return;
      if (r.width < m || r.height < m) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 25)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out.slice(0, 10);
  }, min);
}

/** Loads every lazy Tables chunk once so Vite's first-run dependency optimisation cannot reload a page mid-test. */
export async function warmUp(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const path of ['/t/warm-up', '/t/r', '/t/w', '/t/warm-up/menu', '/t/warm-up/waitlist', '/app/tables/00000000-0000-4000-8000-000000000000/live', '/app/tables']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }
  await page.waitForTimeout(1500);
  await ctx.close();
}
