/**
 * Finishing touches for a process created from a template: a short strip above the form, a badge,
 * three promises with icons and a background pattern, chosen by business area. Without them a new
 * form opens as a bare list of fields; with them it reads like a business page.
 *
 * Wording is deliberately about how the form works (nothing is final until approved, the price is
 * shown before sending, details stay with the business), never invented facts about the business
 * (opening hours, delivery times). Everything is editable in the Design Studio.
 */
import type { ThemeExtras } from '../domain/theme';
import type { TemplateCategory } from './library';

type Finish = Required<Pick<ThemeExtras, 'ribbon' | 'badge' | 'promises' | 'pattern'>>;

const FINISH: Record<TemplateCategory, Finish> = {
  beauty: {
    ribbon: 'בוחרים טיפול ומועד — ונחזור לאישור התור',
    badge: 'טיפול אישי',
    promises: [{ icon: 'sparkles', text: 'מותאם אליכם' }, { icon: 'calendar', text: 'אישור תור אישי' }, { icon: 'shield', text: 'הפרטים נשמרים אצלנו' }],
    pattern: 'dots',
  },
  health: {
    ribbon: 'כמה שאלות קצרות לפני שנקבע — כדי להתאים לכם בדיוק',
    badge: 'ליווי מקצועי',
    promises: [{ icon: 'heart', text: 'התאמה אישית' }, { icon: 'shield', text: 'פרטים חסויים' }, { icon: 'calendar', text: 'תיאום מועד נוח' }],
    pattern: 'waves',
  },
  food: {
    ribbon: 'מספרים מה רוצים — ונחזור עם אישור ומחיר מסודר',
    badge: 'מהמטבח שלנו',
    promises: [{ icon: 'chef', text: 'הכנה טרייה' }, { icon: 'check', text: 'המחיר מוצג מראש' }, { icon: 'clock', text: 'עדכון כשהכול מוכן' }],
    pattern: 'diamonds',
  },
  events: {
    ribbon: 'ספרו לנו על האירוע — ההצעה מגיעה אליכם לאישור',
    badge: 'אירועים',
    promises: [{ icon: 'star', text: 'תכנון לפי האירוע' }, { icon: 'calendar', text: 'שריון תאריך באישור' }, { icon: 'check', text: 'בלי התחייבות עד אישור' }],
    pattern: 'confetti',
  },
  professional: {
    ribbon: 'מפרטים את הצורך — ונחזור עם הצעה ברורה',
    badge: 'שירות מקצועי',
    promises: [{ icon: 'check', text: 'הצעה מפורטת' }, { icon: 'shield', text: 'סודיות מלאה' }, { icon: 'phone', text: 'איש קשר אחד' }],
    pattern: 'grid',
  },
  home: {
    ribbon: 'תיאור קצר ותמונה — ונחזור עם הערכה מסודרת',
    badge: 'בעלי מקצוע',
    promises: [{ icon: 'wrench', text: 'עבודה לפי הזמנה' }, { icon: 'check', text: 'רק מה שאישרתם' }, { icon: 'calendar', text: 'תיאום הגעה' }],
    pattern: 'stripes',
  },
  auto: {
    ribbon: 'פרטי הרכב והבעיה — ואנחנו מתאמים את השאר',
    badge: 'שירות לרכב',
    promises: [{ icon: 'wrench', text: 'אבחון מסודר' }, { icon: 'check', text: 'רק מה שאישרתם' }, { icon: 'phone', text: 'עדכון כשהרכב מוכן' }],
    pattern: 'grid',
  },
  education: {
    ribbon: 'ההרשמה פתוחה — המקום נשמר אחרי אישור',
    badge: 'הרשמה',
    promises: [{ icon: 'heart', text: 'יחס אישי' }, { icon: 'calendar', text: 'מסלול שמתאים לכם' }, { icon: 'shield', text: 'פרטים מוגנים' }],
    pattern: 'confetti',
  },
  retail: {
    ribbon: 'בוחרים, מוסיפים ברכה — והמחיר מתעדכן תוך כדי',
    badge: 'הזמנה אישית',
    promises: [{ icon: 'sparkles', text: 'מותאם אישית' }, { icon: 'check', text: 'המחיר מוצג מראש' }, { icon: 'truck', text: 'איסוף או משלוח' }],
    pattern: 'dots',
  },
  pets: {
    ribbon: 'ספרו לנו על החבר/ה על ארבע — ונדאג לכל השאר',
    badge: 'באהבה',
    promises: [{ icon: 'heart', text: 'יחס חם ואישי' }, { icon: 'calendar', text: 'תיאום מועד נוח' }, { icon: 'shield', text: 'הפרטים נשמרים אצלנו' }],
    pattern: 'dots',
  },
  travel: {
    ribbon: 'בוחרים תאריכים והרכב — ונחזור עם אישור זמינות',
    badge: 'אירוח',
    promises: [{ icon: 'star', text: 'חוויה מותאמת' }, { icon: 'calendar', text: 'אישור זמינות' }, { icon: 'check', text: 'בלי התחייבות עד אישור' }],
    pattern: 'waves',
  },
  community: {
    ribbon: 'כמה פרטים קצרים — וזה אצלנו',
    badge: 'קהילה',
    promises: [{ icon: 'heart', text: 'פתוח לכולם' }, { icon: 'check', text: 'אישור במייל או בוואטסאפ' }, { icon: 'shield', text: 'פרטים מוגנים' }],
    pattern: 'confetti',
  },
};

/** The eight built-in starting points, mapped to the closest business area. */
const BASE: Record<string, TemplateCategory> = {
  flower_order: 'retail',
  garage_repairs: 'auto',
  restaurant_event: 'events',
  table_booking: 'food',
  contest_registration: 'community',
  document_collection: 'professional',
  quote_request: 'professional',
};

/** Starter extras for a template, or undefined for a blank form. */
export function starterExtras(categoryOrTemplate: string): ThemeExtras | undefined {
  const category = (categoryOrTemplate in FINISH ? categoryOrTemplate : BASE[categoryOrTemplate]) as TemplateCategory | undefined;
  return category ? structuredClone(FINISH[category]) : undefined;
}
