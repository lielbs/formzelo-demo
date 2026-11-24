import { describe, expect, it } from 'vitest';
import { formPreview, rpcFor, targetOf, venuePreview } from '../../edge/preview';

const OWNER = '7acfa756-89ce-4342-8e75-5b805a0a58dd';
const asset = (id: string) => `https://ppgdbqhwbzlgzwsjmkor.supabase.co/storage/v1/object/public/brand-assets/${OWNER}/${id}`;

describe('shared-link previews (Cloudflare Pages Functions)', () => {
  it('recognises venue and form links, and never describes private manage links', () => {
    expect(targetOf('/live/t/zigel-bar')).toEqual({ kind: 'venue', slug: 'zigel-bar', page: 'booking' });
    expect(targetOf('/live/t/zigel-bar/menu')).toEqual({ kind: 'venue', slug: 'zigel-bar', page: 'menu' });
    expect(targetOf('/live/t/zigel-bar/waitlist/')).toEqual({ kind: 'venue', slug: 'zigel-bar', page: 'waitlist' });
    expect(targetOf('/live/f/zigel-bar-private-events')).toEqual({ kind: 'form', slug: 'zigel-bar-private-events' });
    for (const p of ['/live/t/r', '/live/t/w', '/live/t/r/abc', '/live/t/Zigel', '/live/t/a_b', '/live/t/x/other', '/live/app', '/live/f/a/b', '/live/t/%3Cscript%3E', '/live/t/%E0%A4%A', '/live/f/%']) {
      expect(targetOf(p)).toBeNull();
    }
    expect(rpcFor({ kind: 'form', slug: 'x' })).toEqual({ fn: 'resolve_public_workflow', body: { p_slug: 'x' } });
  });

  it('builds a venue preview from the public venue: page copy, then intro; page hero, then brand cover', () => {
    const v = {
      name: 'זיגל בר', intro: 'בר שכונתי', assetOwner: OWNER,
      pages: { theme: { heroAssetId: 'ast_72d94eccb7104d319d37' }, booking: { copy: { description: 'בוחרים שעה ומגיעים.' } } },
      brandKit: { coverAssetId: 'ast_00000000cover', logoAssetId: 'ast_000000000logo' },
    };
    const p = venuePreview(v, 'booking', 'https://formangle.rockstackds.com/live/t/zigel-bar', 'he')!;
    expect(p.title).toBe('זיגל בר — הזמנת שולחן');
    expect(p.description).toBe('בוחרים שעה ומגיעים.');
    expect(p.image).toBe(asset('ast_72d94eccb7104d319d37'));
    expect(venuePreview(v, 'menu', 'u', 'en')!.title).toBe('זיגל בר — Menu');
    expect(venuePreview(v, 'menu', 'u', 'he')!.description).toBe('בר שכונתי');
    const noPages = venuePreview({ ...v, pages: null }, 'booking', 'u', 'he')!;
    expect(noPages.image).toBe(asset('ast_00000000cover'));
  });

  it('ignores anything that is not a real asset id or owner (no injected URLs)', () => {
    const p = venuePreview({ name: 'X', assetOwner: OWNER, pages: { theme: { heroAssetId: 'https://evil.example/x.png' } } }, 'booking', 'u', 'he')!;
    expect(p.image).toBeNull();
    expect(venuePreview({ name: 'X', assetOwner: '../../etc', brandKit: { coverAssetId: 'ast_00000000cover' } }, 'booking', 'u', 'he')!.image).toBeNull();
    expect(venuePreview(null, 'booking', 'u', 'he')).toBeNull();
    expect(venuePreview({ name: '  ' }, 'booking', 'u', 'he')).toBeNull();
  });

  it('builds a form preview from the published version and adds the business name once', () => {
    const r = {
      organization: { id: OWNER, name: 'זיגל בר' },
      version: { orgId: OWNER, config: { title: 'אירועים פרטיים', description: 'ספרו לנו על האירוע.' }, design: { hero: { coverAssetId: 'ast_72d94eccb7104d319d37' }, logo: { assetId: 'ast_49a959882ffd4c0588de' } } },
    };
    const p = formPreview(r, 'https://formangle.rockstackds.com/live/f/x')!;
    expect(p.title).toBe('אירועים פרטיים · זיגל בר');
    expect(p.description).toBe('ספרו לנו על האירוע.');
    expect(p.image).toBe(asset('ast_72d94eccb7104d319d37'));
    expect(formPreview({ ...r, version: { ...r.version, config: { title: 'אירועים פרטיים בזיגל בר' } } }, 'u')!.title).toBe('אירועים פרטיים בזיגל בר');
    expect(formPreview({ version: { config: {} } }, 'u')).toBeNull();
  });
});

describe('security headers on shared links', () => {
  it('the preview function sends the same HSTS as the static pages (a browser keeps the last value it saw)', async () => {
    const { readFileSync } = await import('node:fs');
    const hsts = (file: string) => readFileSync(file, 'utf8').match(/strict-transport-security['":\s]+(max-age=\d+)/i)?.[1];
    expect(hsts('scripts/build-cloudflare.mjs')).toBe('max-age=31536000');
    expect(hsts('edge/serve.ts')).toBe(hsts('scripts/build-cloudflare.mjs'));
  });
});
