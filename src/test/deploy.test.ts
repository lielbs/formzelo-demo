import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import workflowYml from '../../.github/workflows/pages.yml?raw';
import { CSP, STATIC_ROUTES } from '../../vite.config';
import { DEMO_SLUGS } from '../data/seed';
import { INDEXABLE } from '../lib/meta';

describe('deployment readiness', () => {
  it('gives every public demo flow and marketing page a static entry (200 on deep links)', () => {
    for (const slug of Object.values(DEMO_SLUGS)) expect(STATIC_ROUTES).toContain(`f/${slug}`);
    for (const page of INDEXABLE.filter((p) => p !== '/')) expect(STATIC_ROUTES).toContain(page.slice(1));
  });

  it('keeps the site address in one place, ready for a custom domain', () => {
    expect(indexHtml).not.toMatch(/github\.io/);
    expect(indexHtml).toContain('__SITE_URL__/og-image.png');
    expect(workflowYml).toContain('VITE_SITE_URL');
    expect(workflowYml).toContain('cp dist/index.html dist/404.html');
  });

  it('ships a strict policy with only the dedicated Formangle API origin', () => {
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toContain('unsafe-eval');
    // The dedicated project only: API calls (connect-src) and brand images from its storage (img-src).
    expect(new Set(CSP.match(/https?:\/\/[^ ;]+/g))).toEqual(new Set(['https://ppgdbqhwbzlgzwsjmkor.supabase.co']));
    expect(CSP).toMatch(/img-src 'self' data: blob: https:\/\/ppgdbqhwbzlgzwsjmkor\.supabase\.co;/);
    expect(CSP).toContain("object-src 'none'");
  });
});
