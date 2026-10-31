import { PRODUCT_LOCKUP } from '../components/Brand';

export const BRAND_TAGLINE = 'לכל עסק יש את הזווית שלו';

const ROUTE_TITLES: [RegExp, string][] = [
  [/^\/tour$/, 'סיור מודרך'],
  [/^\/demo$/, 'סביבות דמו'],
  [/^\/pricing$/, 'מחירים'],
  [/^\/themes$/, 'גלריית עיצובים'],
  [/^\/app$/, 'לוח בקרה'],
  [/^\/app\/workflows$/, 'תהליכים'],
  [/^\/app\/workflows\/new$/, 'תהליך חדש'],
  [/^\/app\/workflows\/[^/]+$/, 'סטודיו עיצוב'],
  [/^\/app\/requests(\/[^/]+)?$/, 'בקשות'],
  [/^\/app\/analytics$/, 'אנליטיקה'],
  [/^\/app\/settings$/, 'הגדרות'],
  [/^\/app\/brand$/, 'ערכת מותג'],
];

/**
 * Document title for a route. Customer-facing workflows (/f/…) are titled by the
 * business itself (see PublicFlow); everything else carries the Formangle brand.
 */
export function pageTitle(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/f/')) return null;
  if (path === '/') return `${PRODUCT_LOCKUP} — ${BRAND_TAGLINE}`;
  const hit = ROUTE_TITLES.find(([re]) => re.test(path));
  return `${hit ? hit[1] : 'הדף לא נמצא'} · Formangle`;
}

export const workflowTitle = (title: string, business: string) => `${title} · ${business}`;
