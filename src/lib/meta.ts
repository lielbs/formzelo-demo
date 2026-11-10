import { PRODUCT_LOCKUP } from '../components/Brand';
import { publicBaseUrl } from './links';

export const BRAND_TAGLINE = 'לכל עסק יש את הזווית שלו';

const ROUTE_TITLES: [RegExp, string][] = [
  [/^\/tour$/, 'סיור מודרך'],
  [/^\/demo$/, 'סביבות דמו'],
  [/^\/pricing$/, 'מחירים'],
  [/^\/themes$/, 'גלריית עיצובים'],
  [/^\/privacy$/, 'פרטיות ותנאי שימוש'],
  [/^\/app$/, 'לוח בקרה'],
  [/^\/app\/workflows$/, 'תהליכים'],
  [/^\/app\/workflows\/new$/, 'תהליך חדש'],
  [/^\/app\/workflows\/[^/]+$/, 'סטודיו עיצוב'],
  [/^\/app\/requests(\/[^/]+)?$/, 'בקשות'],
  [/^\/app\/analytics$/, 'אנליטיקה'],
  [/^\/app\/settings$/, 'הגדרות'],
  [/^\/app\/brand$/, 'ערכת מותג'],
  [/^\/app\/tables$/, 'שולחנות'],
  [/^\/app\/tables\/[^/]+$/, 'שולחנות · המקום'],
  [/^\/app\/tables\/[^/]+\/setup$/, 'שולחנות · הקמה'],
  [/^\/app\/tables\/[^/]+\/menus$/, 'שולחנות · תפריטים'],
  [/^\/app\/tables\/[^/]+\/analytics$/, 'שולחנות · נתונים'],
  [/^\/operator$/, 'מסוף מפעיל'],
  [/^\/invite$/, 'הצטרפות'],
  [/^\/reset$/, 'סיסמה חדשה'],
  [/^\/track$/, 'הבקשה שלי'],
];

/**
 * Document title for a route. Customer-facing workflows (/f/…) are titled by the
 * business itself (see PublicFlow); everything else carries the Formangle brand.
 */
export function pageTitle(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  // Customer pages and the host shift set their own title (business / venue name).
  if (path.startsWith('/f/') || path.startsWith('/t/') || /^\/app\/tables\/[^/]+\/live$/.test(path)) return null;
  if (path === '/') return `${PRODUCT_LOCKUP} — ${BRAND_TAGLINE}`;
  const hit = ROUTE_TITLES.find(([re]) => re.test(path));
  return `${hit ? hit[1] : 'הדף לא נמצא'} · Formangle`;
}

/** Public marketing pages are indexable with a canonical URL; the app and customer flows are not. */
export const INDEXABLE = ['/', '/demo', '/pricing', '/themes', '/tour', '/privacy'];

function headTag<T extends HTMLElement>(selector: string, create: () => T): T {
  return (document.head.querySelector(selector) as T | null) ?? document.head.appendChild(create());
}

/**
 * Canonical and robots per route. SITE_URL comes from VITE_SITE_URL (a future custom domain)
 * and falls back to the current origin + base, so nothing hardcodes the GitHub Pages address.
 */
export function applyRouteMeta(pathname: string, siteUrl: string = SITE_URL()) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const indexable = INDEXABLE.includes(path);
  const robots = headTag('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }));
  robots.content = indexable ? 'index, follow' : 'noindex, nofollow';
  const canonical = document.head.querySelector('link[rel="canonical"]');
  if (indexable) {
    const link = (canonical as HTMLLinkElement | null) ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }));
    link.href = `${siteUrl}${path === '/' ? '/' : path}`;
  } else canonical?.remove();
}

export const SITE_URL = () => ((import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || publicBaseUrl());

export const workflowTitle = (title: string, business: string) => `${title} · ${business}`;
