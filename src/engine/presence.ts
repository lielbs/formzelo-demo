/**
 * Business Engagement Kit — digital presence links.
 *
 * Pure, framework-free. Every stored link is re-validated here before it is
 * rendered (stored data is never trusted): only https:, tel:, mailto: and
 * normalized WhatsApp links can come out, and service links must point at the
 * service's own hostnames. Nothing is ever rendered as HTML.
 */
import { PRESENCE_PLATFORMS, type PresenceLink, type PresenceSettings } from '../domain/theme';

export { PRESENCE_PLATFORMS };
export type PresencePlatform = (typeof PRESENCE_PLATFORMS)[number];

export type PlatformGroup = 'social' | 'navigation' | 'contact' | 'reviews' | 'custom';

export interface PlatformInfo {
  label: string;
  group: PlatformGroup;
  kind: 'url' | 'phone' | 'email' | 'whatsapp';
  placeholder: string;
  help?: string;
  /** Allowed hostnames (a subdomain of one also matches). Absent = any public https host. */
  hosts?: string[];
  /** Extra path rule for hosts shared with other services (e.g. google.com). */
  path?: (u: URL) => boolean;
  /** Short handle → full URL (e.g. "@bloom"). */
  handle?: (h: string) => string;
}

const handle = (base: string, at = false) => (h: string) => `${base}${at ? '@' : ''}${encodeURIComponent(h)}`;
const isGoogle = (host: string) => /(^|\.)google\.[a-z.]{2,6}$/.test(host);

export const PLATFORMS: Record<PresencePlatform, PlatformInfo> = {
  instagram: { label: 'אינסטגרם', group: 'social', kind: 'url', placeholder: 'instagram.com/העסק או ‎@העסק', hosts: ['instagram.com', 'instagr.am'], handle: handle('https://www.instagram.com/') },
  facebook: { label: 'פייסבוק', group: 'social', kind: 'url', placeholder: 'facebook.com/העסק', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  tiktok: { label: 'טיקטוק', group: 'social', kind: 'url', placeholder: 'tiktok.com/@העסק או ‎@העסק', hosts: ['tiktok.com'], handle: handle('https://www.tiktok.com/', true) },
  whatsapp: { label: 'וואטסאפ', group: 'contact', kind: 'whatsapp', placeholder: '050-1234567 או wa.me/972501234567', hosts: ['wa.me', 'whatsapp.com'], help: 'מספר טלפון ישראלי או קישור wa.me. הקישור פותח שיחה עם העסק.' },
  waze: { label: 'ניווט בוויז', group: 'navigation', kind: 'url', placeholder: 'waze.com/ul/…', hosts: ['waze.com'], help: 'בוויז: חיפוש העסק ← שיתוף ← העתקת קישור.' },
  google_maps: {
    label: 'גוגל מפות',
    group: 'navigation',
    kind: 'url',
    placeholder: 'maps.app.goo.gl/…',
    help: 'קישור ניווט למיקום העסק. זה לא קישור לביקורות.',
    path: (u) => u.hostname === 'maps.app.goo.gl' || u.hostname === 'maps.google.com' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps')) || (isGoogle(u.hostname) && u.pathname.startsWith('/maps')),
  },
  google_review: {
    label: 'ביקורת בגוגל',
    group: 'reviews',
    kind: 'url',
    placeholder: 'g.page/r/…/review',
    help: 'קישור לכתיבת ביקורת בגוגל: בפרופיל העסק בגוגל (Google Business Profile) ← "בקשת ביקורות" ← העתקת הקישור. קישור ניווט של גוגל מפות לא מתאים כאן.',
    path: (u) => (u.hostname === 'g.page' && /^\/r\/[^/]+\/review\/?$/.test(u.pathname)) || (u.hostname === 'search.google.com' && u.pathname.startsWith('/local/writereview')),
  },
  website: { label: 'אתר העסק', group: 'social', kind: 'url', placeholder: 'https://www.העסק.co.il' },
  youtube: { label: 'יוטיוב', group: 'social', kind: 'url', placeholder: 'youtube.com/@העסק', hosts: ['youtube.com', 'youtu.be'], handle: handle('https://www.youtube.com/', true) },
  linkedin: { label: 'לינקדאין', group: 'social', kind: 'url', placeholder: 'linkedin.com/company/העסק', hosts: ['linkedin.com'] },
  phone: { label: 'טלפון', group: 'contact', kind: 'phone', placeholder: '03-1234567' },
  email: { label: 'אימייל', group: 'contact', kind: 'email', placeholder: 'hello@business.co.il' },
  custom: { label: 'קישור מותאם', group: 'custom', kind: 'url', placeholder: 'https://…' },
};

export const GROUP_LABELS: Record<PlatformGroup, string> = {
  social: 'רשתות ואתר',
  navigation: 'ניווט',
  contact: 'יצירת קשר',
  reviews: 'ביקורות',
  custom: 'פעולות מותאמות',
};

export type NormalizeResult = { ok: true; href: string; display: string; external: boolean } | { ok: false; error: string };

const hostMatches = (host: string, allowed: string[]) => allowed.some((a) => host === a || host.endsWith(`.${a}`));

/** Accepts only https (http is upgraded). Rejects javascript:, data:, file:, credentials, local hosts and IPs. */
export function normalizeHttpsUrl(raw: string): NormalizeResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'השדה ריק' };
  if (input.length > 500) return { ok: false, error: 'הקישור ארוך מדי' };
  if (/[\s<>"'`\\]/.test(input)) return { ok: false, error: 'הקישור מכיל תווים לא חוקיים' };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(input)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return { ok: false, error: 'מותרים רק קישורי https' };
  let url: URL;
  try {
    url = new URL(scheme ? input : `https://${input.replace(/^\/+/, '')}`);
  } catch {
    return { ok: false, error: 'הקישור אינו תקין' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return { ok: false, error: 'מותרים רק קישורי https' };
  if (url.username || url.password) return { ok: false, error: 'קישור עם שם משתמש או סיסמה אינו מותר' };
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.startsWith('[')) {
    return { ok: false, error: 'הכתובת חייבת להיות אתר ציבורי' };
  }
  const display = `${host.replace(/^www\./, '')}${url.pathname === '/' ? '' : decodeURI(url.pathname)}`.slice(0, 60);
  return { ok: true, href: url.toString(), display, external: true };
}

/** Phone digits for tel:. Israeli local numbers keep their 0; + allowed once at the start. */
export function normalizePhone(raw: string): NormalizeResult {
  const v = raw.trim();
  if (!/^\+?[\d\s\-().]{7,22}$/.test(v)) return { ok: false, error: 'מספר טלפון לא תקין' };
  const digits = v.replace(/[^\d+]/g, '');
  const count = digits.replace('+', '').length;
  if (count < 7 || count > 15 || digits.lastIndexOf('+') > 0) return { ok: false, error: 'מספר טלפון לא תקין' };
  return { ok: true, href: `tel:${digits}`, display: v, external: false };
}

/** International digits for wa.me (Israeli 05X… → 9725X…). */
export function whatsappDigits(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return /^\d{8,15}$/.test(d) ? d : null;
}

export function normalizeEmail(raw: string): NormalizeResult {
  const v = raw.trim().replace(/^mailto:/i, '');
  if (!/^[^\s@<>"'?&]+@[^\s@<>"'?&]+\.[a-z]{2,}$/i.test(v) || v.length > 120) return { ok: false, error: 'כתובת אימייל לא תקינה' };
  return { ok: true, href: `mailto:${v}`, display: v, external: false };
}

export function normalizeLink(platform: PresencePlatform, raw: string): NormalizeResult {
  const info = PLATFORMS[platform];
  const value = raw.trim();
  if (!value) return { ok: false, error: 'השדה ריק' };
  if (info.kind === 'phone') return normalizePhone(value.replace(/^tel:/i, ''));
  if (info.kind === 'email') return normalizeEmail(value);
  if (info.kind === 'whatsapp' && !/[a-z]/i.test(value)) {
    const d = whatsappDigits(value);
    return d ? { ok: true, href: `https://wa.me/${d}`, display: value, external: true } : { ok: false, error: 'מספר וואטסאפ לא תקין' };
  }
  // "@name" (dots allowed) or a bare word is a handle; anything else is treated as a URL.
  const isHandle = /^@[\w.-]{2,40}$/.test(value) || /^[\w-]{2,40}$/.test(value);
  const expanded = info.handle && isHandle ? info.handle(value.replace(/^@/, '')) : value;
  const res = normalizeHttpsUrl(expanded);
  if (!res.ok) return res;
  const url = new URL(res.href);
  const host = url.hostname.toLowerCase();
  if (info.hosts && !hostMatches(host, info.hosts)) return { ok: false, error: `הקישור חייב להיות של ${info.label} (${info.hosts[0]})` };
  if (info.path && !info.path(url)) {
    if (platform === 'google_review') {
      return { ok: false, error: isGoogle(host) || host.endsWith('goo.gl') ? 'זה קישור ניווט או חיפוש — נדרש הקישור לכתיבת ביקורת (g.page/r/…/review)' : 'נדרש הקישור לכתיבת ביקורת מפרופיל העסק בגוגל (g.page/r/…/review)' };
    }
    return { ok: false, error: `הקישור חייב להיות של ${info.label}` };
  }
  if (platform === 'whatsapp' && host.endsWith('whatsapp.com') && !/^\/send/.test(url.pathname) && host !== 'wa.me') {
    return { ok: false, error: 'נדרש קישור wa.me או api.whatsapp.com/send' };
  }
  return res;
}

export interface ResolvedLink {
  id: string;
  platform: PresencePlatform;
  label: string;
  description?: string;
  icon: PresenceLink['icon'];
  href: string;
  display: string;
  external: boolean;
  /** Demo placeholder: shown as a labelled, non-clickable preview. */
  sample: boolean;
}

export const DEFAULT_PRESENCE: PresenceSettings = { visibility: 'all', selected: [], placement: 'footer_completion', style: 'icon_label', reviewCta: false };

export const presenceOf = (s?: Partial<PresenceSettings>): PresenceSettings => ({ ...DEFAULT_PRESENCE, ...s });

/** Enabled, valid, de-duplicated kit links in the owner's order. */
export function validLinks(links: PresenceLink[]): ResolvedLink[] {
  const out: ResolvedLink[] = [];
  for (const l of links) {
    if (!l.enabled) continue;
    const r = normalizeLink(l.platform, l.value);
    if (!r.ok || out.some((o) => o.href === r.href)) continue;
    out.push({
      id: l.id,
      platform: l.platform,
      label: (l.label?.trim() || PLATFORMS[l.platform].label).slice(0, 40),
      description: l.description?.trim() || undefined,
      icon: l.icon,
      href: r.href,
      display: r.display,
      external: r.external,
      sample: Boolean(l.sample),
    });
  }
  return out;
}

/** Links a workflow shows, after its visibility setting. Google Review is never a general link — it's the review CTA. */
export function linksForWorkflow(links: PresenceLink[], settings?: Partial<PresenceSettings>): ResolvedLink[] {
  const s = presenceOf(settings);
  if (s.visibility === 'hidden') return [];
  const valid = validLinks(links).filter((l) => l.platform !== 'google_review');
  return s.visibility === 'selected' ? valid.filter((l) => s.selected.includes(l.id)) : valid;
}

export function reviewLink(links: PresenceLink[]): ResolvedLink | null {
  return validLinks(links).find((l) => l.platform === 'google_review') ?? null;
}

export type PresenceSlot = 'header' | 'footer' | 'completion';
export function showsIn(placement: PresenceSettings['placement'], slot: PresenceSlot): boolean {
  switch (placement) {
    case 'header':
      return slot === 'header';
    case 'footer':
      return slot === 'footer';
    case 'completion':
      return slot === 'completion';
    case 'header_completion':
      return slot !== 'footer';
    case 'footer_completion':
      return slot !== 'header';
    case 'all':
      return true;
  }
}

/**
 * The neutral review request appears only when the owner enabled it, a valid
 * review link exists, and the service was actually delivered (status "completed").
 * Never after a mere request or booking inquiry, never filtered by satisfaction.
 */
export function shouldAskForReview(opts: { enabled: boolean; hasReviewLink: boolean; status: string }): boolean {
  return opts.enabled && opts.hasReviewLink && opts.status === 'completed';
}
