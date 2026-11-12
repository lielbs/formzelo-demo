/**
 * Deleting things on the production code path (local stack): a process, a Tables venue (blocked
 * while guests are waiting), and the person's own account. Phone and desktop.
 */
import { expect, test } from '@playwright/test';
import { asUser, newContext, seedBusiness, seedVenue, signIn, today, watch } from './fixtures';
import { sql } from '../stack';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });
const shots = (name: string) => `test-evidence/deletions/${name}.png`;

test('the owner deletes a process from the list (phone)', async ({ browser }) => {
  const biz = await seedBusiness('מחיקות', 0);
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  const problems = watch(page);
  await signIn(page, biz.owner, '/app/workflows/new');
  await page.getByRole('button', { name: 'פרחים · זר בהתאמה' }).click();
  await page.getByRole('button', { name: 'יצירת תהליך', exact: true }).click();
  await page.getByRole('button', { name: 'המשך לסטודיו' }).first().click();
  await expect(page).toHaveURL(/\/app\/workflows\/[0-9a-f-]{36}$/);

  await page.goto('/app/workflows');
  const card = page.getByRole('listitem').filter({ hasText: 'הזמנת זר פרחים' });
  await card.getByRole('button', { name: 'מחיקה' }).click();
  const sheet = page.getByRole('alertdialog', { name: /למחוק את/ });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(450);
  await page.screenshot({ path: shots('m-process-confirm') });
  await sheet.getByRole('button', { name: 'מחיקה לצמיתות' }).click();
  await expect(page.getByText('התהליך נמחק')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'הזמנת זר פרחים' })).toHaveCount(0);
  const [row] = await sql<{ deleted_at: string | null; public_slug: string }>('select deleted_at, public_slug from public.workflows where organization_id = $1', [biz.orgId]);
  expect(row!.deleted_at).not.toBeNull();
  expect(row!.public_slug).toMatch(/^deleted-/);
  expect(problems).toEqual([]);
  await ctx.close();
});

test('a venue cannot be deleted while guests wait, then is deleted (desktop)', async ({ browser }) => {
  const biz = await seedBusiness('מחיקת מקום', 0);
  const venue = await seedVenue(biz);
  await asUser(biz.owner.id, 'select public.tables_waitlist_add($1,$2,$3)', [venue.id, JSON.stringify({ name: 'אורח ממתין', party: 2, date: today() }), crypto.randomUUID()]);
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const problems = watch(page);
  await signIn(page, biz.owner, `/app/tables/${venue.id}`);
  await page.getByRole('button', { name: 'מחיקת המקום' }).click();
  const sheet = page.getByRole('alertdialog', { name: /למחוק את ביסטרו הנמל/ });
  const go = sheet.getByRole('button', { name: 'מחיקת המקום' });
  await expect(go).toBeDisabled();
  await sheet.getByRole('textbox').fill('ביסטרו הנמל');
  await go.click();
  await expect(sheet.getByRole('alert')).toContainText('אורחים ברשימת ההמתנה');
  await page.screenshot({ path: shots('d-venue-blocked') });
  await sheet.getByRole('button', { name: 'ביטול' }).click();
  await expect(sheet).toHaveCount(0);

  await sql(`update public.tables_waitlist_entries set status = 'cancelled' where venue_id = $1`, [venue.id]);
  await page.getByRole('button', { name: 'מחיקת המקום' }).click();
  await sheet.getByRole('textbox').fill('ביסטרו הנמל');
  await sheet.getByRole('button', { name: 'מחיקת המקום' }).click();
  await expect(page).toHaveURL(/\/app\/tables$/);
  await expect(page.getByText('ביסטרו הנמל')).toHaveCount(0);
  const guest = await ctx.newPage();
  await guest.goto(`/t/${venue.slug}`);
  await expect(guest.getByText(/לא נמצא|אינו זמין|לא זמין/).first()).toBeVisible();
  expect(problems).toEqual([]);
  await ctx.close();
});

test('a person deletes their own account and can no longer sign in', async ({ browser }) => {
  const biz = await seedBusiness('חשבון למחיקה', 0);
  await sql(`delete from public.organization_memberships where organization_id = $1 and user_id = $2`, [biz.orgId, biz.manager.id]);
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  const problems = watch(page);
  await signIn(page, biz.owner, '/app/settings');
  await page.getByRole('button', { name: 'מחיקת החשבון' }).click();
  const sheet = page.getByRole('alertdialog', { name: 'למחוק את החשבון?' });
  await sheet.getByRole('textbox').fill('מחיקה');
  await page.screenshot({ path: shots('m-account-confirm') });
  await sheet.getByRole('button', { name: 'מחיקת החשבון' }).click();
  await expect(page.getByRole('button', { name: 'כניסה', exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('אימייל').fill(biz.owner.email);
  await page.getByLabel('סיסמה').fill(biz.owner.password);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  const [org] = await sql<{ status: string }>('select status from public.organizations where id = $1', [biz.orgId]);
  expect(org!.status).toBe('suspended');
  expect(problems.filter((p) => !/400|401|invalid/i.test(p))).toEqual([]);
  await ctx.close();
});
