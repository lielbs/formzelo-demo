import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import pagesYml from '../../.github/workflows/pages.yml?raw';
import viteConfig from '../../vite.config.ts?raw';
import { PRODUCT_LOCKUP, PRODUCT_NAME } from '../components/Brand';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { DomainRuleError } from '../data/repository';
import { DEMO_LINKS, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { migrateOrgData } from '../data/migrations';
import { SCHEMA_VERSION } from '../domain/schema';
import type { PresenceLink } from '../domain/theme';
import { linksForWorkflow, normalizeLink, normalizeHttpsUrl, reviewLink, shouldAskForReview, showsIn, validLinks, whatsappDigits } from '../engine/presence';
import { DEFAULT_CONTACT_EMAIL, resolveSalesEmail, salesMailto } from '../lib/links';
import { pageTitle, workflowTitle } from '../lib/meta';
import { effectiveTheme, freezeTheme } from '../theme/brand';
import { buildTheme } from '../theme/presets';

class MemoryStore implements KeyValueStore {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  key = (i: number) => [...this.m.keys()][i] ?? null;
  get length() {
    return this.m.size;
  }
}
const fresh = async () => {
  const repo = new LocalStorageRepository(new MemoryStore());
  await repo.init();
  return repo;
};
const link = (platform: PresenceLink['platform'], value: string, extra: Partial<PresenceLink> = {}): PresenceLink => ({ id: `l_${platform}_${value.length}`, platform, value, enabled: true, ...extra });
const ok = (p: PresenceLink['platform'], v: string) => {
  const r = normalizeLink(p, v);
  return r.ok ? r.href : null;
};

describe('link normalization and validation', () => {
  it('rejects executable, local and malformed destinations', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'vbscript:x', 'ftp://example.com', 'https://localhost/x', 'https://127.0.0.1', 'https://user:pass@example.com', 'https://exa mple.com', 'https://"onmouseover=x', 'not a url']) {
      expect(normalizeHttpsUrl(bad).ok, bad).toBe(false);
    }
  });

  it('upgrades http and bare domains to https', () => {
    expect(ok('website', 'http://bloom.example/shop')).toBe('https://bloom.example/shop');
    expect(ok('website', 'bloom.example')).toBe('https://bloom.example/');
  });

  it('checks service hostnames, including mobile / short variants', () => {
    expect(ok('instagram', 'https://www.instagram.com/bloom/')).toBeTruthy();
    expect(ok('instagram', '@bloom.studio')).toBe('https://www.instagram.com/bloom.studio');
    expect(ok('instagram', 'https://instagram.com.evil.example/bloom')).toBeNull();
    expect(ok('facebook', 'https://m.facebook.com/bloom')).toBeTruthy();
    expect(ok('facebook', 'https://fb.me/bloom')).toBeTruthy();
    expect(ok('facebook', 'https://evilfacebook.com/bloom')).toBeNull();
    expect(ok('tiktok', '@bloom')).toBe('https://www.tiktok.com/@bloom');
    expect(ok('tiktok', 'https://vm.tiktok.com/ZS123/')).toBeTruthy();
    expect(ok('waze', 'https://waze.com/ul/hsv8x')).toBeTruthy();
    expect(ok('waze', 'https://ul.waze.com/ul?place=1')).toBeTruthy();
    expect(ok('waze', 'https://maps.app.goo.gl/x')).toBeNull();
    expect(ok('youtube', 'https://youtu.be/abc')).toBeTruthy();
    expect(ok('linkedin', 'https://www.linkedin.com/company/x')).toBeTruthy();
  });

  it('never confuses Google Maps navigation with the review-writing link', () => {
    expect(ok('google_maps', 'https://maps.app.goo.gl/AbC123')).toBeTruthy();
    expect(ok('google_maps', 'https://www.google.com/maps/place/x')).toBeTruthy();
    expect(ok('google_maps', 'https://www.google.com/search?q=x')).toBeNull();
    expect(ok('google_review', 'https://g.page/r/CabcDEF123/review')).toBeTruthy();
    expect(ok('google_review', 'https://search.google.com/local/writereview?placeid=ChIJ123')).toBeTruthy();
    const mapsInReview = normalizeLink('google_review', 'https://maps.app.goo.gl/AbC123');
    expect(mapsInReview.ok).toBe(false);
    expect(!mapsInReview.ok && mapsInReview.error).toMatch(/ביקורת/);
    expect(ok('google_review', 'https://g.page/r/CabcDEF123')).toBeNull();
  });

  it('builds tel:, mailto: and WhatsApp links from contact details', () => {
    expect(ok('phone', '03-555-0100')).toBe('tel:035550100');
    expect(ok('phone', '+972 50 555 0100')).toBe('tel:+972505550100');
    expect(ok('phone', '12')).toBeNull();
    expect(ok('email', 'hello@bloom.example.com')).toBe('mailto:hello@bloom.example.com');
    expect(ok('email', 'hello@bloom?subject=x')).toBeNull();
    expect(whatsappDigits('050-555-0100')).toBe('972505550100');
    expect(ok('whatsapp', '050-555-0100')).toBe('https://wa.me/972505550100');
    expect(ok('whatsapp', 'https://wa.me/972505550100')).toBeTruthy();
    expect(ok('whatsapp', 'https://evil.example/972505550100')).toBeNull();
  });

  it('custom links accept safe https only and keep plain-text labels', () => {
    const [c] = validLinks([link('custom', 'https://valley-run.example/rules', { label: '<b>תקנון</b>', description: 'כללים', icon: 'link' })]);
    expect(c!.href).toBe('https://valley-run.example/rules');
    expect(c!.label).toBe('<b>תקנון</b>'); // rendered as a text node, never as HTML
    expect(validLinks([link('custom', 'javascript:alert(1)')])).toEqual([]);
  });
});

describe('presence resolution', () => {
  const kit = [link('instagram', '@bloom'), link('waze', 'https://waze.com/ul/x'), link('phone', '03-555-0100', { enabled: false }), link('google_review', 'https://g.page/r/X/review'), link('website', 'javascript:alert(1)')];

  it('shows only enabled, valid links in the owner order, without the review link', () => {
    expect(linksForWorkflow(kit).map((l) => l.platform)).toEqual(['instagram', 'waze']);
    const reordered = [kit[1]!, kit[0]!];
    expect(linksForWorkflow(reordered).map((l) => l.platform)).toEqual(['waze', 'instagram']);
  });

  it('respects selected-only and hidden visibility', () => {
    expect(linksForWorkflow(kit, { visibility: 'selected', selected: [kit[1]!.id] }).map((l) => l.platform)).toEqual(['waze']);
    expect(linksForWorkflow(kit, { visibility: 'hidden' })).toEqual([]);
  });

  it('maps placements to slots', () => {
    expect(showsIn('header_completion', 'header') && showsIn('header_completion', 'completion') && !showsIn('header_completion', 'footer')).toBe(true);
    expect(['header', 'footer', 'completion'].every((s) => showsIn('all', s as 'header'))).toBe(true);
    expect(showsIn('completion', 'footer')).toBe(false);
  });

  it('asks for a Google review only after a completed service, when enabled and configured', () => {
    expect(reviewLink(kit)?.platform).toBe('google_review');
    expect(shouldAskForReview({ enabled: true, hasReviewLink: true, status: 'completed' })).toBe(true);
    for (const status of ['submitted', 'in_review', 'approved', 'rejected', 'cancelled']) expect(shouldAskForReview({ enabled: true, hasReviewLink: true, status })).toBe(false);
    expect(shouldAskForReview({ enabled: false, hasReviewLink: true, status: 'completed' })).toBe(false);
    expect(shouldAskForReview({ enabled: true, hasReviewLink: false, status: 'completed' })).toBe(false);
  });

  it('drafts take live kit links; older designs without links keep their look', () => {
    const plain = buildTheme('modern_minimal');
    expect(effectiveTheme(plain, { ...defaultKit(), links: [] }).presence).toBeUndefined();
    const withLinks = effectiveTheme(plain, { ...defaultKit(), links: kit });
    expect(withLinks.presence?.links).toHaveLength(kit.length);
    expect(freezeTheme(plain, { ...defaultKit(), links: kit }).presence?.links).toHaveLength(kit.length);
  });
});

function defaultKit() {
  return { displayName: 'x', description: '', palette: { primary: '#111111', secondary: '#222222', accent: '#333333', background: '#FFFFFF' }, typography: 'neutral' as const, button: 'solid' as const, density: 'comfortable' as const, logoPlacement: 'start' as const, decorations: true, personality: 'modern_minimal' as const, links: [], updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('Brand Kit links in the repository', () => {
  it('persist per workspace and stay isolated', async () => {
    const store = new MemoryStore();
    const repo = new LocalStorageRepository(store);
    await repo.init();
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.bloom);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, links: [link('instagram', '@real.bloom')] });
    const again = new LocalStorageRepository(store);
    expect((await again.getBrandKit(DEMO_ORG_IDS.bloom)).links.map((l) => l.value)).toEqual(['@real.bloom']);
    expect((await again.getBrandKit(DEMO_ORG_IDS.autocare)).links.some((l) => l.value === '@real.bloom')).toBe(false);
  });

  it('rejects unsafe links at the trust boundary', async () => {
    const repo = await fresh();
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.bloom);
    await expect(repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, links: [link('website', 'javascript:alert(1)')] })).rejects.toBeInstanceOf(DomainRuleError);
    await expect(repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, links: [link('website', '', { enabled: true })] })).rejects.toBeInstanceOf(DomainRuleError);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, links: [link('website', '', { enabled: false })] });
  });

  it('freezes links at publish; kit edits need a republish', async () => {
    const repo = await fresh();
    const wf = (await repo.listWorkflows(DEMO_ORG_IDS.bloom)).find((w) => w.slug === DEMO_SLUGS.flowers)!;
    const before = (await repo.resolvePublic(DEMO_SLUGS.flowers))!.version;
    expect(before.design.presence?.links?.map((l) => l.id)).toEqual(DEMO_LINKS[DEMO_ORG_IDS.bloom]!.map((l) => l.id));
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.bloom);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, links: [link('instagram', '@after.edit')] });
    const unchanged = (await repo.resolvePublic(DEMO_SLUGS.flowers))!.version;
    expect(unchanged.id).toBe(before.id);
    expect(unchanged.design.presence?.links?.some((l) => l.value === '@after.edit')).toBe(false);
    await repo.publishWorkflow(DEMO_ORG_IDS.bloom, wf.id);
    const republished = (await repo.resolvePublic(DEMO_SLUGS.flowers))!.version;
    expect(republished.version).toBe(before.version + 1);
    expect(republished.design.presence?.links?.map((l) => l.value)).toEqual(['@after.edit']);
    // Workflow-level settings travel with the version.
    expect(republished.design.presence?.reviewCta).toBe(true);
    const old = await repo.getVersion(DEMO_ORG_IDS.bloom, before.id);
    expect(old!.design.presence?.links?.some((l) => l.value === '@after.edit')).toBe(false);
  });

  it('demo booking requests never ask for a review', async () => {
    const repo = await fresh();
    expect((await repo.resolvePublic(DEMO_SLUGS.booking))!.version.design.presence?.reviewCta).toBe(false);
  });
});

describe('migration v4 -> v5', () => {
  it('adds sample links to demo kits only, leaving published versions untouched', async () => {
    const repo = await fresh();
    const data = structuredClone(await repo.exportWorkspace(DEMO_ORG_IDS.autocare)) as unknown as Record<string, unknown> & { brandKit: Record<string, unknown>; versions: unknown[] };
    data.schemaVersion = 4;
    delete data.brandKit.links;
    const versions = JSON.stringify(data.versions);
    const { value, migrated } = migrateOrgData(data);
    const v = value as typeof data & { brandKit: { links: PresenceLink[] } };
    expect(migrated).toBe(true);
    expect(v.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v.brandKit.links.every((l) => l.sample)).toBe(true);
    expect(v.brandKit.links.map((l) => l.platform)).toContain('waze');
    expect(JSON.stringify(v.versions)).toBe(versions);

    const real = structuredClone(data) as typeof data & { organization: { isDemo: boolean } };
    real.organization.isDemo = false;
    expect(((migrateOrgData(real).value as typeof v).brandKit.links)).toEqual([]);
  });

  it('demo sample links are flagged and never point at real accounts with live hrefs', () => {
    for (const links of Object.values(DEMO_LINKS)) {
      for (const l of links) {
        expect(l.sample).toBe(true);
        expect(normalizeLink(l.platform, l.value).ok).toBe(true);
      }
    }
  });
});

describe('Formangle brand, metadata, sales contact and Pages routing', () => {
  it('uses the canonical product name and lockup', () => {
    expect(PRODUCT_NAME).toBe('Formangle');
    expect(PRODUCT_LOCKUP).toBe('Formangle by RockStack');
  });

  it('titles pages by brand, and customer workflows by the business', () => {
    expect(pageTitle('/')).toMatch(/^Formangle by RockStack/);
    expect(pageTitle('/tour')).toBe('סיור מודרך · Formangle');
    expect(pageTitle('/app/brand/')).toBe('ערכת מותג · Formangle');
    expect(pageTitle('/f/bloom-flowers')).toBeNull();
    // Formangle Tables: owner screens are titled; guest pages and the host shift title themselves.
    expect(pageTitle('/app/tables')).toBe('שולחנות · Formangle');
    expect(pageTitle('/app/tables/0f0e/setup')).toBe('שולחנות · הקמה · Formangle');
    expect(pageTitle('/t/bistro')).toBeNull();
    expect(pageTitle('/t/r')).toBeNull();
    expect(pageTitle('/app/tables/0f0e/live')).toBeNull();
    expect(workflowTitle('הזמנת זר פרחים', 'Bloom Studio')).toBe('הזמנת זר פרחים · Bloom Studio');
  });

  it('index.html carries the Formangle title, description and Open Graph tags', () => {
    const html = indexHtml;
    expect(html).toMatch(/<title>Formangle by RockStack/);
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:site_name', 'name="description"']) expect(html).toContain(tag);
    expect(html.replace(/formzelo-demo/g, '')).not.toMatch(/formzelo/i);
  });

  it('no product-facing "Formzelo" remains in the source (storage keys and repo URL excepted)', () => {
    const sources = import.meta.glob(['../**/*.{ts,tsx,css}', '!../test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(40);
    const offenders = Object.entries(sources).flatMap(([f, text]) =>
      text
        .split('\n')
        .filter((line) => /formzelo/i.test(line) && !/formzelo:(v1|ui)|formzelo-demo|previous name \(Formzelo\)/.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('sales inquiries always go to the RockStack address, with a validated override', () => {
    expect(DEFAULT_CONTACT_EMAIL).toBe('contact@rockstackds.com');
    expect(resolveSalesEmail(undefined)).toBe('contact@rockstackds.com');
    expect(resolveSalesEmail('  ')).toBe('contact@rockstackds.com');
    expect(resolveSalesEmail('not-an-email')).toBe('contact@rockstackds.com');
    expect(resolveSalesEmail('sales@rockstackds.com')).toBe('sales@rockstackds.com');
    const href = salesMailto('נושא', 'גוף');
    expect(href.startsWith('mailto:contact@rockstackds.com?subject=')).toBe(true);
    expect(href).not.toContain('github.com');
  });

  it('builds GitHub Pages at the custom-domain root and keeps SPA fallback', () => {
    const wf = pagesYml;
    expect(wf).toContain('VITE_BASE: /');
    expect(wf).toContain('VITE_SITE_URL: https://formangle.rockstackds.com');
    // SPA fallback: the production app answers /live/ deep links directly; other paths go back to the demo.
    expect(wf).toContain(`sed 's#<head>#<head><script src="/site-fallback.js"></script>#' dist/live/index.html > dist/404.html`);
    expect(wf).toContain('VITE_BASE: /live/');
    expect(wf).toContain('VITE_SUPABASE_URL: https://ppgdbqhwbzlgzwsjmkor.supabase.co');
    expect(wf).not.toMatch(/sb_secret_[A-Za-z0-9_-]{16,}/);
    expect(viteConfig).toContain('VITE_BASE');
  });
});
