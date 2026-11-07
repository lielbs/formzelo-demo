/**
 * Responsive QA across phone, tablet and desktop widths. Runs against the demo dev server
 * (shared UI) and the production-mode pages that need no account. For every route and width:
 * no horizontal overflow, no clipped button text, no tiny touch targets on phones, no errors.
 * Screenshots land in test-results/responsive for visual review.
 *   E2E_DEMO_URL=http://localhost:5173 npx playwright test e2e/responsive.spec.ts
 */
import { expect, test } from '@playwright/test';

const DEMO = process.env.E2E_DEMO_URL ?? 'http://localhost:5173';
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440];
const ROUTES: [string, string][] = [
  ['landing', `${DEMO}/`],
  ['pricing', `${DEMO}/pricing`],
  ['dashboard', `${DEMO}/app`],
  ['workflows', `${DEMO}/app/workflows`],
  ['new-workflow', `${DEMO}/app/workflows/new`],
  ['requests', `${DEMO}/app/requests`],
  ['brand', `${DEMO}/app/brand`],
  ['settings', `${DEMO}/app/settings`],
  ['analytics', `${DEMO}/app/analytics`],
  ['public-form', `${DEMO}/f/bloom-flowers`],
  ['operator', '/operator'],
  ['invite', '/invite#invitation_token=' + 'a'.repeat(64) + '&organization_id=00000000-0000-4000-8000-000000000000'],
  ['reset', '/reset#recovery_token=' + 'b'.repeat(64)],
  ['signin', '/app'],
];

for (const [name, url] of ROUTES) {
  test(`${name} fits every width`, async ({ browser }) => {
    const report: string[] = [];
    for (const width of WIDTHS) {
      const phone = width < 768;
      const ctx = await browser.newContext({ viewport: { width, height: phone ? 800 : 900 }, isMobile: phone, hasTouch: phone });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(m.text()));
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(700);
      const issues = await page.evaluate((isPhone) => {
        const out: string[] = [];
        const doc = document.documentElement;
        if (doc.scrollWidth > doc.clientWidth + 1) out.push(`horizontal overflow ${doc.scrollWidth - doc.clientWidth}px`);
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 3;
        };
        for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role=button]')) {
          if (!visible(el) || el.closest('[aria-hidden=true], .sr-only')) continue;
          const label = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30);
          // Clipped text: the rendered text itself is wider than the control (decorative pseudo-elements ignored).
          if (el.innerText.trim() && getComputedStyle(el).overflow !== 'visible') {
            const range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            if (text.width > box.width + 2) out.push(`clipped: "${label}"`);
          }
          const r = el.getBoundingClientRect();
          if (isPhone && (r.height < 24 || r.width < 24) && el.innerText.trim().length < 3) out.push(`tiny target ${Math.round(r.width)}x${Math.round(r.height)}: "${label}"`);
        }
        return [...new Set(out)].slice(0, 8);
      }, phone);
      if (issues.length || errors.length) report.push(`${width}px: ${[...issues, ...errors.map((e) => `error: ${e.slice(0, 120)}`)].join(' | ')}`);
      if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: `test-results/responsive/${name}-${width}.png`, fullPage: false });
      await ctx.close();
    }
    expect(report).toEqual([]);
  });
}
