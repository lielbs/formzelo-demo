/**
 * Per-person access (production code path, local stack): the owner gives one host "Tables only"
 * and the manager "Formangle only" from the team card; each sees only their part of the app.
 */
import { expect, test } from '@playwright/test';
import { newContext, seedBusiness, seedVenue, signIn, watch } from './fixtures';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: 'serial' });

test('owner sets access; Tables-only and Formangle-only staff see only their part', async ({ browser }) => {
  const biz = await seedBusiness('הרשאות', 1);
  const venue = await seedVenue(biz);
  const host = biz.hosts[0]!;

  const owner = await newContext(browser);
  const op = await owner.newPage();
  const problems = watch(op);
  await signIn(op, biz.owner, '/app/settings');
  await op.getByLabel(`גישה של ${host.email}`).selectOption('tables');
  await expect(op.getByText('הגישה עודכנה')).toBeVisible();
  await op.getByLabel(`גישה של ${biz.manager.email}`).selectOption('formangle');
  await expect(op.getByLabel(`גישה של ${biz.manager.email}`)).toHaveValue('formangle');
  await op.screenshot({ path: 'test-evidence/access/owner-team.png', fullPage: true });
  expect(problems).toEqual([]);
  await owner.close();

  // Tables only: lands on Tables, the dock has only Tables and the account, processes redirect.
  const t = await newContext(browser, { width: 390, height: 844 }, true);
  const tp = await t.newPage();
  await signIn(tp, host, '/app');
  await expect(tp).toHaveURL(/\/app\/tables$/);
  const dock = tp.getByRole('navigation', { name: 'ניווט מהיר' });
  await expect(dock.getByText('שולחנות')).toBeVisible();
  await expect(dock.getByText('תהליכים')).toHaveCount(0);
  await expect(tp.getByText('ביסטרו הנמל')).toBeVisible();
  await tp.goto('/app/workflows');
  await expect(tp).toHaveURL(/\/app\/tables$/);
  await tp.screenshot({ path: 'test-evidence/access/tables-only.png' });
  await t.close();

  // Formangle only: no Tables in the menu, Tables screens redirect home.
  const f = await newContext(browser);
  const fp = await f.newPage();
  await signIn(fp, biz.manager, '/app');
  await expect(fp.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'תהליכים' })).toBeVisible();
  await expect(fp.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'שולחנות' })).toHaveCount(0);
  await fp.goto(`/app/tables/${venue.id}`);
  await expect(fp).toHaveURL(/\/app$/);
  await f.close();
});
