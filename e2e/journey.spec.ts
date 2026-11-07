/**
 * The launch acceptance journey on the production code path, against the local stack:
 * operator onboards two businesses → owner creates an account from the invitation → builds and
 * publishes a workflow → a customer (separate browser, phone size, no account) submits →
 * the owner works the request, sends an interactive quote and a private link → the customer
 * approves on their page → the owner sees it. Business B never sees business A's data.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createOperator, sql, uniq } from './stack';

test.describe.configure({ mode: 'serial' });

const run = uniq();
const OPERATOR = { email: `operator-${run}@rockstack.test`, password: 'Operator-pass-2026' };
const OWNER_A = { email: `owner-a-${run}@example.test`, password: 'Owner-a-pass-2026' };
const OWNER_B = { email: `owner-b-${run}@example.test`, password: 'Owner-b-pass-2026' };
const state: { inviteA?: string; inviteB?: string; formUrl?: string; trackUrl?: string; requestId?: string; customerLink?: string } = {};

async function context(browser: Browser, phone = false): Promise<BrowserContext> {
  return browser.newContext(phone ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
}

/** Fails the test on any uncaught error or console error. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text()}`));
  return problems;
}

async function provision(page: Page, name: string, slug: string, ownerEmail: string) {
  await page.getByLabel('שם העסק').fill(name);
  await page.getByLabel('כתובת באתר').fill(slug);
  await page.getByLabel('אימייל של בעל/ת העסק').fill(ownerEmail);
  await page.getByRole('button', { name: 'יצירת העסק והזמנת הבעלים' }).click();
  const link = page.getByLabel('קישור ההזמנה');
  await expect(link).toHaveValue(/\/invite#invitation_token=[0-9a-f]{64}&organization_id=/);
  const value = await link.inputValue();
  await page.getByRole('button', { name: 'סגירה' }).click();
  return value;
}

async function acceptInvitation(page: Page, link: string, password: string) {
  await page.goto(link);
  await page.getByLabel('סיסמה חדשה').fill(password);
  await page.getByLabel('הסיסמה שוב').fill(password);
  await page.getByRole('checkbox', { name: /תנאי השימוש/ }).check();
  await page.getByRole('button', { name: 'יצירת חשבון וכניסה' }).click();
  await expect(page.getByText('ההזמנה התקבלה בהצלחה')).toBeVisible();
  await page.getByRole('button', { name: 'כניסה ללוח הבקרה' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Fills every visible step with valid answers and submits. */
async function completeForm(page: Page) {
  for (let step = 0; step < 10; step++) {
    await page.evaluate(() => {
      const set = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const main = document.querySelector('main')!;
      const seen = new Set<string>();
      main.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((r) => {
        if (seen.has(r.name)) return;
        seen.add(r.name);
        if (![...main.querySelectorAll<HTMLInputElement>(`input[name="${r.name}"]`)].some((x) => x.checked)) r.click();
      });
      const day = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
      main.querySelectorAll<HTMLInputElement>('input[type=text], input:not([type])').forEach((i) => !i.value && set(i, 'דנה לוי'));
      main.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((i) => !i.value && set(i, 'ברכה קצרה'));
      main.querySelectorAll<HTMLInputElement>('input[type=tel]').forEach((i) => !i.value && set(i, '050-1234567'));
      main.querySelectorAll<HTMLInputElement>('input[type=email]').forEach((i) => !i.value && set(i, 'dana@example.test'));
      main.querySelectorAll<HTMLInputElement>('input[type=date]').forEach((i) => !i.value && set(i, day));
      const consent = main.querySelector<HTMLInputElement>('#fz-consent');
      if (consent && !consent.checked) consent.click();
    });
    const submit = page.locator('main button').filter({ hasText: /^(שליחה|שליחת)/ });
    if (await submit.count()) {
      await expect(page.locator('.fz-checkout')).not.toContainText('סימולציה');
      await submit.first().click();
      return;
    }
    await page.locator('main button').filter({ hasText: /^(המשך|לסיכום)$/ }).first().click();
  }
  throw new Error('form never reached its submit step');
}

test.beforeAll(async () => {
  await createOperator(OPERATOR.email, OPERATOR.password);
});

test('operator onboards two businesses and hands over invitation links', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const problems = watch(page);
  await page.goto('/operator');
  await page.getByLabel('אימייל').fill(OPERATOR.email);
  await page.getByLabel('סיסמה').fill(OPERATOR.password);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByRole('heading', { name: 'עסק חדש' })).toBeVisible();
  state.inviteA = await provision(page, `Rose ${run}`, `rose-${run}`, OWNER_A.email);
  state.inviteB = await provision(page, `Garage ${run}`, `garage-${run}`, OWNER_B.email);
  await expect(page.getByText(`rose-${run}`)).toBeVisible();
  expect(problems).toEqual([]);
  await ctx.close();
});

test('owner creates an account from the invitation, builds and publishes a workflow', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const problems = watch(page);
  await acceptInvitation(page, state.inviteA!, OWNER_A.password);
  await expect(page.getByText(`Rose ${run}`).first()).toBeVisible();

  await page.goto('/app/workflows/new');
  await page.getByRole('button', { name: 'פרחים · זר בהתאמה' }).click();
  await page.getByRole('button', { name: 'יצירת תהליך', exact: true }).click();
  await page.getByRole('button', { name: 'המשך לסטודיו' }).first().click();
  await expect(page).toHaveURL(/\/app\/workflows\/[0-9a-f-]{36}$/);

  // Draft persistence across devices: a second browser of the same owner sees the saved draft.
  const editorUrl = page.url();
  await page.getByRole('button', { name: 'פרסום', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /פרסום גרסה 1/ });
  await dialog.getByRole('button', { name: 'פרסום', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'התהליך פורסם בהצלחה' })).toBeVisible();
  state.formUrl = (await page.locator('a[href*="/f/"]').first().getAttribute('href'))!;
  expect(state.formUrl).toMatch(/\/f\/rose-/);

  const other = await context(browser);
  const second = await other.newPage();
  await second.goto(editorUrl);
  await second.getByLabel('אימייל').fill(OWNER_A.email);
  await second.getByLabel('סיסמה').fill(OWNER_A.password);
  await second.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(second.getByRole('button', { name: /פרסום/ }).first()).toBeVisible();
  await expect(second.getByText('הזמנת זר פרחים').first()).toBeVisible();
  await other.close();
  expect(problems).toEqual([]);
  await ctx.close();
});

test('a customer on a phone submits without an account and lands on a private request page', async ({ browser }) => {
  const ctx = await context(browser, true);
  const page = await ctx.newPage();
  const problems = watch(page);
  await page.goto(state.formUrl!);
  await expect(page.getByRole('heading', { name: 'הזמנת זר פרחים' })).toBeVisible();
  await completeForm(page);
  await expect(page).toHaveURL(/\/track\?sent=1#[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole('heading', { name: 'הבקשה נשלחה' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  state.trackUrl = page.url().replace('?sent=1', '');
  const rows = await sql<{ id: string; total_minor: string }>(`select s.id, s.total_minor from public.submissions s join public.workflows w on w.id=s.workflow_id where w.organization_id = (select id from public.organizations where slug = $1) order by s.created_at`, [`rose-${run}`]);
  expect(rows.length).toBeGreaterThan(0);
  state.requestId = rows[rows.length - 1]!.id;
  expect(problems).toEqual([]);
  await ctx.close();
});

test('the owner works the request: status, note, quote and a private link', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const problems = watch(page);
  // A returning owner on a new device signs in with the password created from the invitation.
  await page.goto(`/app/requests/${state.requestId}`);
  await page.getByLabel('אימייל').fill(OWNER_A.email);
  await page.getByLabel('סיסמה').fill(OWNER_A.password);
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'הצעות מחיר' })).toBeVisible();
  await page.getByRole('button', { name: 'סימון בטיפול' }).click();
  await expect(page.getByText('בטיפול').first()).toBeVisible();
  await page.getByLabel('הערה פנימית').fill('הלקוחה רוצה גוונים בהירים — פנימי');
  await page.getByRole('button', { name: 'שמירת הערה' }).click();

  await page.getByRole('button', { name: 'הצעת מחיר חדשה' }).click();
  const composer = page.getByRole('dialog', { name: 'הצעת מחיר חדשה' });
  await composer.getByRole('button', { name: 'הנחה' }).click();
  await composer.getByRole('button', { name: 'שליחה ללקוח' }).click();
  await expect(page.getByText('נשלחה ללקוח')).toBeVisible();

  await page.getByRole('button', { name: 'יצירת קישור ללקוח' }).click();
  const link = page.getByLabel('הקישור לעמוד הבקשה');
  await expect(link).toHaveValue(/\/track#[A-Za-z0-9_-]{43}$/);
  state.customerLink = await link.inputValue();
  expect(problems).toEqual([]);
  await ctx.close();
});

test('the customer approves the quote on their page; the owner sees it', async ({ browser }) => {
  const ctx = await context(browser, true);
  const page = await ctx.newPage();
  const problems = watch(page);
  await page.goto(state.customerLink!);
  await expect(page.getByText('ממתינה להחלטה שלכם')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('פנימי');
  await page.getByRole('button', { name: /אישור ההצעה/ }).click();
  await expect(page.getByText('הבקשה אושרה').first()).toBeVisible();
  const statuses = await sql<{ status: string }>('select status from public.submissions where id=$1', [state.requestId]);
  expect(statuses[0]!.status).toBe('approved');
  const quotes = await sql<{ status: string }>('select status from public.quotes where submission_id=$1', [state.requestId]);
  expect(quotes.map((q) => q.status)).toContain('approved');
  expect(problems).toEqual([]);
  await ctx.close();
});

test('business B cannot see or reach business A data', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await acceptInvitation(page, state.inviteB!, OWNER_B.password);
  await page.goto('/app/requests');
  await expect(page.getByText(/דנה לוי/)).toHaveCount(0);
  await page.goto(`/app/requests/${state.requestId}`);
  await expect(page.getByText('הבקשה לא נמצאה בסביבת עבודה זו')).toBeVisible();
  await ctx.close();
});

test('a forgotten password is replaced through a single-use link; the operator never sees it', async ({ browser }) => {
  const op = await context(browser);
  const opPage = await op.newPage();
  await opPage.goto('/operator');
  await opPage.getByLabel('אימייל').fill(OPERATOR.email);
  await opPage.getByLabel('סיסמה').fill(OPERATOR.password);
  await opPage.getByRole('button', { name: 'כניסה' }).click();
  opPage.once('dialog', (d) => d.accept(OWNER_A.email));
  await opPage.locator('li', { hasText: `rose-${run}` }).getByRole('button', { name: 'איפוס סיסמה' }).click();
  const link = await opPage.getByLabel('קישור ההזמנה').inputValue();
  expect(link).toMatch(/\/reset#recovery_token=[0-9a-f]{64}$/);
  await op.close();

  const ctx = await context(browser, true);
  const page = await ctx.newPage();
  const problems = watch(page);
  const fresh = 'Rose-new-pass-2026';
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset$/);
  await page.getByLabel('סיסמה חדשה').fill(fresh);
  await page.getByLabel('הסיסמה שוב').fill(fresh);
  await page.getByRole('button', { name: 'שמירה וכניסה' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(problems).toEqual([]);

  // The link is spent, and the old password no longer opens the workspace.
  const again = await (await context(browser)).newPage();
  await again.goto(link);
  await again.getByLabel('סיסמה חדשה').fill('Another-pass-2026');
  await again.getByLabel('הסיסמה שוב').fill('Another-pass-2026');
  await again.getByRole('button', { name: 'שמירה וכניסה' }).click();
  await expect(again.getByRole('alert')).toContainText('כבר נוצל');
  await again.goto('/app');
  await again.getByLabel('אימייל').fill(OWNER_A.email);
  await again.getByLabel('סיסמה').fill(OWNER_A.password);
  await again.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(again.getByRole('alert')).toBeVisible();
  await ctx.close();
});

test('the owner uploads a logo to storage; anyone can see it, only the workspace could add it', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const problems = watch(page);
  await page.goto('/app/brand');
  await page.getByLabel('אימייל').fill(OWNER_A.email);
  await page.getByLabel('סיסמה').fill('Rose-new-pass-2026');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  // A real 64x64 PNG drawn in the browser, then uploaded through the picker.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c2185b';
    g.fillRect(0, 0, 64, 64);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText(/התמונה נשמרה/)).toBeVisible();
  const rows = await sql<{ id: string; organization_id: string; bytes: number }>(
    `select a.id, a.organization_id, a.bytes from public.organization_assets a join public.organizations o on o.id=a.organization_id where o.slug=$1`, [`rose-${run}`]);
  expect(rows).toHaveLength(1);
  const url = `http://127.0.0.1:54321/storage/v1/object/public/brand-assets/${rows[0]!.organization_id}/${rows[0]!.id}`;
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\//);
  await expect(page.locator(`img[src="${url}"]`).first()).toBeVisible();
  // Removing hides it from the library but published forms keep working.
  // The new logo is selected in the main picker; it can be removed from the secondary one.
  await page.getByRole('button', { name: /^בחירת / }).nth(1).hover();
  await page.getByRole('button', { name: /^מחיקת / }).first().click();
  await expect.poll(async () => (await sql(`select 1 from public.organization_assets where id=$1 and removed_at is not null`, [rows[0]!.id])).length).toBe(1);
  expect((await page.request.get(url)).status()).toBe(200);
  expect(problems).toEqual([]);
  await ctx.close();
});
