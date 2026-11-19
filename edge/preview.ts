/**
 * Link previews for shared guest links (Cloudflare Pages Functions, `functions/live/**`).
 *
 * When a business shares `/live/t/<venue>` or `/live/f/<form>`, WhatsApp, Facebook, Telegram and
 * search engines read the page's <title> and Open Graph tags — they do not run the app. This module
 * turns the venue's or form's PUBLIC data (the same public RPCs the guest page calls, publishable key
 * only) into those tags. Pure functions: the Pages Functions do the fetching and the HTML rewrite.
 */

export const SITE = 'https://formangle.rockstackds.com';
export const SUPABASE_URL = 'https://ppgdbqhwbzlgzwsjmkor.supabase.co';
/** Public by design (the same key ships in the browser bundle); never a secret key. */
export const PUBLISHABLE_KEY = 'sb_publishable_f4SQeCD1MuE78Fgf-ZVr7Q_bxJhowCy';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET = /^ast_[a-z0-9]{8,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return ''; } };

export type Target =
  | { kind: 'venue'; slug: string; page: 'booking' | 'menu' | 'waitlist' }
  | { kind: 'form'; slug: string };

/** Which shared link this is, or null when the path is not one we describe (manage links stay private). */
export function targetOf(pathname: string): Target | null {
  const t = /^\/live\/t\/([^/]+)(?:\/(menu|waitlist))?\/?$/.exec(pathname);
  if (t) {
    const slug = decode(t[1]!);
    // /live/t/r and /live/t/w are a guest's private manage links: never looked up, never described.
    if (slug === 'r' || slug === 'w' || !SLUG.test(slug) || slug.length > 80) return null;
    return { kind: 'venue', slug, page: (t[2] as 'menu' | 'waitlist' | undefined) ?? 'booking' };
  }
  const f = /^\/live\/f\/([^/]+)\/?$/.exec(pathname);
  if (f) {
    const slug = decode(f[1]!);
    return SLUG.test(slug) && slug.length <= 80 ? { kind: 'form', slug } : null;
  }
  return null;
}

export interface Preview { title: string; description: string; image: string | null; url: string; locale: 'he_IL' | 'en_US' }

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const assetUrl = (owner: unknown, id: unknown) =>
  typeof owner === 'string' && UUID.test(owner) && typeof id === 'string' && ASSET.test(id)
    ? `${SUPABASE_URL}/storage/v1/object/public/brand-assets/${owner}/${id}`
    : null;

type Json = Record<string, unknown> | null | undefined;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const LABELS = {
  he: { booking: 'הזמנת שולחן', menu: 'תפריט', waitlist: 'רשימת המתנה' },
  en: { booking: 'Book a table', menu: 'Menu', waitlist: 'Waitlist' },
} as const;

/** Preview of a venue page from `tables_public_venue`. Same image rule as the page: own theme → page theme → brand cover → logo. */
export function venuePreview(v: Json, page: 'booking' | 'menu' | 'waitlist', url: string, lang: 'he' | 'en'): Preview | null {
  const venue = obj(v);
  const name = clip(venue.name, 80);
  if (!name) return null;
  const pages = obj(venue.pages);
  const pageCfg = obj(pages[page === 'menu' ? 'booking' : page]);
  const theme = pageCfg.ownTheme && pageCfg.theme ? obj(pageCfg.theme) : obj(pages.theme);
  const kit = obj(venue.brandKit);
  const owner = venue.assetOwner;
  const image = assetUrl(owner, theme.heroAssetId) ?? assetUrl(owner, kit.coverAssetId) ?? assetUrl(owner, theme.logoAssetId) ?? assetUrl(owner, kit.logoAssetId);
  const copy = obj(pageCfg.copy);
  const description = clip(page === 'booking' ? copy.description : '', 200) || clip(venue.intro, 200) || clip(venue.address, 120);
  return { title: `${name} — ${LABELS[lang][page]}`, description, image, url, locale: lang === 'en' ? 'en_US' : 'he_IL' };
}

/** Preview of a published form from `resolve_public_workflow` (its published version only). */
export function formPreview(r: Json, url: string): Preview | null {
  const res = obj(r);
  const version = obj(res.version);
  const config = obj(version.config);
  const design = obj(version.design);
  const org = obj(res.organization);
  const title = clip(config.title, 100);
  if (!title) return null;
  const owner = version.orgId ?? org.id;
  const image = assetUrl(owner, obj(design.hero).coverAssetId) ?? assetUrl(owner, obj(design.logo).assetId);
  const business = clip(org.name, 80);
  return {
    title: business && !title.includes(business) ? `${title} · ${business}` : title,
    description: clip(config.description, 200),
    image, url, locale: 'he_IL',
  };
}

/** The public RPC call for a target (POST body for PostgREST). */
export function rpcFor(t: Target): { fn: string; body: Record<string, string> } {
  return t.kind === 'venue' ? { fn: 'tables_public_venue', body: { p_slug: t.slug } } : { fn: 'resolve_public_workflow', body: { p_slug: t.slug } };
}
