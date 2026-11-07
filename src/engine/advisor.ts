/**
 * Built-in studio advice: plain rules over the workflow, no model and nothing leaves the
 * browser. Each tip says what to do, why it helps the business, and (when possible) does it
 * in one tap. Only actionable tips are returned, most valuable first.
 */
import { isDisplayField, type Intake, type WorkflowConfig, type WorkflowField } from '../domain/schema';
import { completionOf } from './completion';
import { hasOptionCapacity } from './capacity';
import { hasIntakeRules } from './intake';
import { newId } from '../lib/id';
import { field as makeField } from './templates';

export type AdviceTarget = 'design' | 'booking' | 'intake' | 'presence' | 'completion' | 'workflow' | 'brand';

export type AdviceFix =
  /** Changes the draft directly (undoable like any edit). */
  | { kind: 'apply'; label: string; apply: (c: WorkflowConfig) => void }
  /** Opens the panel where the owner decides. */
  | { kind: 'open'; label: string; target: AdviceTarget };

export interface Advice {
  id: string;
  /** What the tip protects or improves, for the small label. */
  area: 'לקוחות' | 'יומן' | 'עומס' | 'מיתוג' | 'אמון';
  title: string;
  why: string;
  fix: AdviceFix;
}

export interface AdviceInput {
  config: WorkflowConfig;
  intake?: Intake;
  hasLogo: boolean;
  presenceLinks: number;
}

const inputs = (c: WorkflowConfig) => c.steps.flatMap((s) => s.fields).filter((f) => !isDisplayField(f) && f.type !== 'info');
const isContact = (f: WorkflowField) => f.type === 'phone' || f.type === 'email' || f.role === 'customer_phone' || f.role === 'customer_email';
const LONG_STEP = 6;
// Places matter for sign-ups; an order "for an event" (flowers, catering) is not one.
const REGISTRATION = /הרשמ|סדנ|קורס|חוג|כנס|מרוץ|ריצ|מחזור|שיעור/;

export function advise({ config, intake, hasLogo, presenceLinks }: AdviceInput): Advice[] {
  const out: Advice[] = [];
  const all = inputs(config);
  const booking = config.booking?.enabled ? config.booking : undefined;

  const contact = all.find(isContact);
  if (!contact) {
    out.push({
      id: 'contact',
      area: 'לקוחות',
      title: 'הוסיפו שדה טלפון',
      why: 'בלי טלפון או אימייל אין לכם דרך לחזור ללקוח אחרי שהוא שולח.',
      fix: {
        kind: 'apply',
        label: 'הוספת טלפון',
        apply: (c) => void c.steps[c.steps.length - 1]!.fields.push(makeField('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' })),
      },
    });
  } else if (!contact.required) {
    out.push({
      id: 'contact-required',
      area: 'לקוחות',
      title: `סמנו את ״${contact.label}״ כחובה`,
      why: 'בקשה בלי פרטי קשר היא בקשה שאי אפשר לטפל בה.',
      fix: { kind: 'apply', label: 'לסמן כחובה', apply: (c) => c.steps.forEach((s) => s.fields.forEach((f) => f.id === contact.id && (f.required = true))) },
    });
  }

  const long = config.steps.find((s) => s.fields.filter((f) => !isDisplayField(f) && f.type !== 'info').length > LONG_STEP);
  if (long) {
    const count = long.fields.filter((f) => !isDisplayField(f) && f.type !== 'info').length;
    out.push({
      id: `split-${long.id}`,
      area: 'לקוחות',
      title: `פצלו את ״${long.title}״ לשני שלבים`,
      why: `יש בו ${count} שאלות. שלבים קצרים מרגישים קלים יותר, ויותר לקוחות מגיעים עד הסוף.`,
      fix: {
        kind: 'apply',
        label: 'פיצול לשניים',
        apply: (c) => {
          const at = c.steps.findIndex((s) => s.id === long.id);
          const step = c.steps[at];
          if (!step) return;
          const half = Math.ceil(step.fields.length / 2);
          const rest = step.fields.splice(half);
          c.steps.splice(at + 1, 0, { ...structuredClone(step), id: newId('stp'), title: `${step.title} (המשך)`, description: undefined, fields: rest });
        },
      },
    });
  }

  const date = all.find((f) => f.type === 'date');
  if (date && !booking) {
    out.push({
      id: 'booking',
      area: 'יומן',
      title: 'הפעילו כללי הזמנה',
      why: `יש לכם שדה ״${date.label}״. כללי הזמנה מגבילים ימים ושעות ומונעים שני לקוחות על אותו מועד.`,
      fix: { kind: 'open', label: 'להגדרת ימים ושעות', target: 'booking' },
    });
  }
  if (booking && !booking.minNoticeHours) {
    out.push({
      id: 'notice',
      area: 'יומן',
      title: 'בקשו הזמנה לפחות שעתיים מראש',
      why: 'כך לא תופתעו מבקשה לעוד עשר דקות. אפשר לשנות לכל מספר שעות.',
      fix: { kind: 'apply', label: 'שעתיים מראש', apply: (c) => void (c.booking && (c.booking.minNoticeHours = 2)) },
    });
  }
  if (booking && !booking.maxDaysAhead) {
    out.push({
      id: 'ahead',
      area: 'יומן',
      title: 'הגבילו הזמנות ל-60 יום קדימה',
      why: 'היומן נשאר בשליטה שלכם, ולא מגיעות בקשות לתאריכים שעוד לא תכננתם.',
      fix: { kind: 'apply', label: 'עד 60 יום', apply: (c) => void (c.booking && (c.booking.maxDaysAhead = 60)) },
    });
  }

  const looksLikeRegistration = REGISTRATION.test(`${config.title} ${config.description}`);
  if (looksLikeRegistration && !booking && !hasOptionCapacity(config) && !intake?.maxTotal) {
    out.push({
      id: 'places',
      area: 'עומס',
      title: 'קבעו מספר מקומות',
      why: 'כשהמקומות נגמרים הטופס נסגר לבד, והלקוחות רואים הודעה מסודרת במקום להירשם לחינם.',
      fix: { kind: 'open', label: 'לקבלת בקשות', target: 'intake' },
    });
  } else if (!hasIntakeRules(intake) && !booking) {
    out.push({
      id: 'load',
      area: 'עומס',
      title: 'החליטו כמה בקשות אתם מקבלים',
      why: 'אפשר להגביל ליום או לשבוע, לסגור זמנית או לקבוע תאריך סיום — והכול חל מיד.',
      fix: { kind: 'open', label: 'לקבלת בקשות', target: 'intake' },
    });
  }

  if (!hasLogo) {
    out.push({ id: 'logo', area: 'מיתוג', title: 'העלו לוגו', why: 'טופס עם הלוגו שלכם נראה כמו העסק שלכם ולא כמו טופס כללי.', fix: { kind: 'open', label: 'לערכת המותג', target: 'brand' } });
  }
  if (presenceLinks === 0) {
    out.push({
      id: 'presence',
      area: 'אמון',
      title: 'הוסיפו טלפון, וואטסאפ ומיקום',
      why: 'לקוח שרואה איך להשיג אתכם סומך יותר ושולח בביטחון.',
      fix: { kind: 'open', label: 'לנוכחות דיגיטלית', target: 'presence' },
    });
  }
  if (!config.description.trim()) {
    out.push({ id: 'description', area: 'לקוחות', title: 'כתבו משפט פתיחה', why: 'משפט אחד שמסביר מה מקבלים ובכמה זמן עוזר ללקוח להתחיל.', fix: { kind: 'open', label: 'לפרטי התהליך', target: 'workflow' } });
  }
  if (!config.confirmation?.nextSteps?.length) {
    out.push({
      id: 'next-steps',
      area: 'אמון',
      title: 'ספרו ללקוח מה קורה אחרי השליחה',
      why: 'לקוח שיודע מתי תחזרו אליו לא מתקשר לשאול.',
      fix: {
        kind: 'apply',
        label: 'הוספת שלבי המשך',
        apply: (c) => void (c.confirmation = { ...(c.confirmation ?? {}), nextSteps: ['נעבור על הבקשה', 'נחזור אליכם בטלפון תוך יום עסקים', 'אחרי האישור תקבלו את כל הפרטים'] }),
      },
    });
  }
  if (booking && completionOf(config).mode === 'request' && config.pricing.enabled) {
    out.push({ id: 'deposit', area: 'יומן', title: 'שקלו מקדמה', why: 'מקדמה קטנה מצמצמת ביטולים של הרגע האחרון.', fix: { kind: 'open', label: 'לסיום ותשלום', target: 'completion' } });
  }
  return out;
}
