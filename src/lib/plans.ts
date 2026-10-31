/**
 * RockStack-managed Formangle packages. Proposed commercial packages shown for
 * sales conversations: there is no checkout, billing, subscription activation
 * or usage-limit enforcement in this demo. Every amount excludes VAT.
 */
import { salesMailto } from './links';

export type PackageKey = 'business' | 'business_plus' | 'enterprise';

export interface Package {
  key: PackageKey;
  name: string;
  /** Monthly fee in ILS before VAT; null = custom quote. */
  monthly: number | null;
  /** One-time setup fee in ILS before VAT; null = part of the custom quote. */
  setup: number | null;
  audience: string;
  /** Short value statement for the workflow allowance. */
  workflows: string;
  features: string[];
  recommended?: boolean;
  cta: string;
  emailSubject: string;
}

export const PACKAGES: Package[] = [
  {
    key: 'business',
    name: 'Business',
    monthly: 399,
    setup: 990,
    audience: 'לעסק שרוצה להעביר את הפניות וההזמנות לתהליך דיגיטלי ממותג.',
    workflows: 'עד 3 תהליכים פעילים',
    features: ['ערכת מותג לעסק', 'חוויות לקוח ממותגות', 'ניהול בקשות בלוח בקרה', 'נוכחות דיגיטלית וקישורים עסקיים', 'תמיכה רגילה', 'הקמה אישית על ידי RockStack'],
    cta: 'פנייה לגבי Business',
    emailSubject: 'Formangle Business — בקשה לפרטים',
  },
  {
    key: 'business_plus',
    name: 'Business Plus',
    monthly: 499,
    setup: 1490,
    recommended: true,
    audience: 'לעסק עם כמה שירותים, אישורים ותהליכים מורכבים יותר.',
    workflows: 'עד 8 תהליכים פעילים',
    features: ['כל מה שב-Business', 'תהליכים עם תנאים ולוגיקה מורכבת', 'אפיון והקמה של תהליכים עסקיים מתקדמים', 'תמיכה מורחבת', 'הטמעה אישית על ידי RockStack'],
    cta: 'פנייה לגבי Business Plus',
    emailSubject: 'Formangle Business Plus — בקשה לפרטים',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    setup: null,
    audience: 'לארגונים עם כמה סניפים, אינטגרציות ונפחי פעילות גבוהים.',
    workflows: 'היקף לפי אפיון',
    features: ['ריבוי סניפים', 'תהליכים מורכבים', 'אינטגרציות מותאמות', 'נפחי פעילות גבוהים', 'פרויקט הטמעה מותאם'],
    cta: 'תיאום שיחת אפיון',
    emailSubject: 'Formangle Enterprise — תיאום שיחת אפיון',
  },
];

export const PRICING_TERMS = {
  vat: 'כל המחירים אינם כוללים מע״מ.',
  indicative: 'מחירי חבילות מוצעים, בכפוף לאפיון ולהצעת מחיר.',
  managed: 'RockStack מאפיינת, מקימה ומתאימה את Formangle לצרכים של העסק שלכם.',
  separate: 'אינטגרציות ופיתוח מותאם מתומחרים בנפרד, לפי היקף.',
  noSelfService: 'אין רכישה עצמית באתר: כל חבילה נמכרת ומוגדרת ישירות על ידי RockStack.',
} as const;

export function packageMailto(p: Package): string {
  const price = p.monthly === null ? 'הצעת מחיר מותאמת' : `${p.monthly} ₪ לחודש + ${p.setup?.toLocaleString('en-US')} ₪ הקמה חד-פעמית (לפני מע״מ)`;
  const body = [
    `שלום, אשמח לשמוע על חבילת ${p.name} של Formangle.`,
    `החבילה: ${p.name} · ${price}`,
    'שם העסק:',
    'תחום הפעילות:',
    'אילו תהליכים הייתי רוצה להעביר לדיגיטל:',
    '',
  ].join('\n');
  return salesMailto(p.emailSubject, body);
}

export const DEMO_REQUEST_SUBJECT = 'תיאום הדגמה של Formangle לעסק שלי';

export function demoRequestMailto(): string {
  return salesMailto(
    DEMO_REQUEST_SUBJECT,
    ['שלום, אשמח לתאם הדגמה אישית של Formangle לעסק שלי.', 'שם העסק:', 'תחום הפעילות:', 'מה הלקוחות שלנו צריכים להזמין, לאשר או למלא:', 'זמנים נוחים לשיחה:', ''].join('\n'),
  );
}
