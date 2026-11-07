/**
 * The studio's field library. Each entry is plain WorkflowField data (one or
 * several fields); "action" entries open a studio panel instead, and
 * "unavailable" entries are listed honestly but cannot be added.
 */
import { runtimeConfiguration } from '../../../production/runtime';
import {
  AlignJustify,
  CalendarCheck,
  Calendar,
  CheckSquare,
  CircleDot,
  Clock,
  Contact,
  FileText,
  FileUp,
  GalleryHorizontal,
  GitBranch,
  Hash,
  Heading,
  Image as ImageIcon,
  Info,
  Layers,
  LayoutGrid,
  ListChecks,
  Mail,
  MapPin,
  Minus,
  PenTool,
  Phone,
  Receipt,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
  SquareStack,
  ThumbsUp,
  Ticket,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { FieldAppearance, FieldType, WorkflowField } from '../../../domain/schema';
import { uniqueFieldKey } from '../../../engine/builder';
import { newId } from '../../../lib/id';

export type BlockGroup = 'basic' | 'business' | 'presentation' | 'advanced';
export type BlockAction = 'presence' | 'logic' | 'step' | 'booking' | 'completion';

export interface BlockDef {
  id: string;
  label: string;
  /** One line, in the owner's words: what the customer sees. */
  hint: string;
  group: BlockGroup;
  icon: LucideIcon;
  type: FieldType;
  appearance?: FieldAppearance;
  make: () => Partial<WorkflowField>;
  /** Inserts several related fields at once (e.g. customer details). */
  makeMany?: () => (Partial<WorkflowField> & { type: FieldType; key: string })[];
  /** Opens a studio panel instead of inserting a field. */
  action?: BlockAction;
  /** Listed for discoverability but not available in the demo — the reason, shown to the owner. */
  unavailable?: string;
  keywords?: string;
}

const opt = (label: string, value: string, extra: Record<string, unknown> = {}) => ({ id: newId('opt'), label, value, ...extra });

export const BLOCKS: BlockDef[] = [
  // ---------- basic ----------
  { id: 'text', label: 'טקסט קצר', hint: 'שם, נושא או תשובה של שורה אחת', group: 'basic', icon: Type, type: 'text', make: () => ({ label: 'טקסט קצר' }) },
  { id: 'textarea', label: 'טקסט ארוך', hint: 'הערות, תיאור או בקשה מפורטת', group: 'basic', icon: AlignJustify, type: 'textarea', make: () => ({ label: 'פרטים נוספים', placeholder: 'ספרו לנו במה מדובר' }) },
  { id: 'email', label: 'אימייל', hint: 'כתובת מייל עם בדיקת תקינות', group: 'basic', icon: Mail, type: 'email', make: () => ({ label: 'אימייל', role: 'customer_email' }), keywords: 'מייל דואר' },
  { id: 'phone', label: 'טלפון', hint: 'מספר נייד עם בדיקת תקינות', group: 'basic', icon: Phone, type: 'phone', make: () => ({ label: 'טלפון', role: 'customer_phone' }), keywords: 'נייד' },
  { id: 'number', label: 'מספר', hint: 'גיל, כמות, תקציב — עם מינימום ומקסימום', group: 'basic', icon: Hash, type: 'number', make: () => ({ label: 'מספר' }) },
  { id: 'radio', label: 'בחירה אחת', hint: 'רשימת אפשרויות שבוחרים מהן אחת', group: 'basic', icon: CircleDot, type: 'radio', appearance: 'list', make: () => ({ label: 'בחירה', options: [opt('אפשרות 1', 'option_1'), opt('אפשרות 2', 'option_2'), opt('אפשרות 3', 'option_3')] }), keywords: 'רדיו' },
  { id: 'multiselect', label: 'בחירה מרובה', hint: 'אפשר לסמן כמה אפשרויות', group: 'basic', icon: CheckSquare, type: 'multiselect', make: () => ({ label: 'מה מעניין אתכם?', options: [opt('אפשרות א', 'option_a'), opt('אפשרות ב', 'option_b'), opt('אפשרות ג', 'option_c')] }) },
  { id: 'select', label: 'רשימה נפתחת', hint: 'הרבה אפשרויות בתפריט קומפקטי', group: 'basic', icon: ListChecks, type: 'select', make: () => ({ label: 'בחירה מרשימה', options: [opt('אפשרות 1', 'option_1'), opt('אפשרות 2', 'option_2')] }), keywords: 'dropdown' },
  { id: 'date', label: 'תאריך', hint: 'לוח שנה, עם טווח ימים מותר', group: 'basic', icon: Calendar, type: 'date', make: () => ({ label: 'תאריך', min: 1, max: 90 }) },
  { id: 'time', label: 'שעה', hint: 'בחירה מתוך שעות שאתם מגדירים', group: 'basic', icon: Clock, type: 'time', make: () => ({ label: 'שעה', options: ['10:00', '12:00', '14:00', '16:00'].map((t) => opt(t, t)) }) },

  // ---------- business ----------
  {
    id: 'customer',
    label: 'פרטי לקוח',
    hint: 'שם, טלפון ואימייל — מסודרים בתיבת הבקשות',
    group: 'business',
    icon: Contact,
    type: 'text',
    make: () => ({}),
    makeMany: () => [
      { key: 'full_name', label: 'שם מלא', type: 'text', required: true, role: 'customer_name' },
      { key: 'phone', label: 'טלפון', type: 'phone', required: true, role: 'customer_phone' },
      { key: 'email', label: 'אימייל', type: 'email', role: 'customer_email' },
    ],
    keywords: 'שם קשר contact',
  },
  { id: 'tiles', label: 'בחירת חבילה ומחיר', hint: 'כרטיסים עם מחיר — הסכום מתעדכן מיד', group: 'business', icon: LayoutGrid, type: 'radio', appearance: 'tiles', make: () => ({ label: 'בחרו חבילה', required: true, options: [opt('בסיסי', 'basic', { price: 100, description: 'החבילה הבסיסית' }), opt('מורחב', 'plus', { price: 180, description: 'הבחירה הנפוצה' }), opt('פרימיום', 'premium', { price: 260, description: 'הכול כלול' })] }), keywords: 'מחיר חבילה tiles' },
  { id: 'quantity', label: 'כמות (+/−)', hint: 'כמות עם כפתורי פלוס ומינוס', group: 'business', icon: SquareStack, type: 'number', appearance: 'stepper', make: () => ({ label: 'כמות', min: 1, max: 20 }) },
  { id: 'addons', label: 'תוספות בתשלום', hint: 'בחירה מרובה, כל תוספת עם מחיר', group: 'business', icon: Sparkles, type: 'multiselect', make: () => ({ label: 'תוספות', options: [opt('תוספת א', 'extra_a', { price: 50 }), opt('תוספת ב', 'extra_b', { price: 80 })] }) },
  { id: 'checkbox', label: 'תוספת בודדת', hint: 'תיבת סימון אחת, עם או בלי מחיר', group: 'business', icon: CheckSquare, type: 'checkbox', make: () => ({ label: 'תוספת', price: 30 }) },
  { id: 'address', label: 'כתובת', hint: 'רחוב, מספר ועיר — למשלוח או לביקור', group: 'business', icon: MapPin, type: 'textarea', make: () => ({ label: 'כתובת', placeholder: 'רחוב, מספר, עיר', max: 200 }), keywords: 'משלוח' },
  {
    id: 'booking',
    label: 'בקשת הזמנה',
    hint: 'תאריך, שעה ומספר משתתפים — באישור העסק',
    group: 'business',
    icon: CalendarCheck,
    type: 'date',
    make: () => ({}),
    makeMany: () => [
      { key: 'booking_date', label: 'תאריך', type: 'date', required: true, role: 'date', min: 0, max: 60 },
      { key: 'booking_time', label: 'שעה', type: 'time', required: true, options: ['18:00', '19:00', '20:00', '21:00'].map((t) => opt(t, t)) },
      { key: 'party_size', label: 'מספר משתתפים', type: 'number', required: true, min: 1, max: 12, appearance: 'stepper' },
    ],
    keywords: 'תור הזמנה booking',
  },
  { id: 'decision', label: 'אישור / דחייה', hint: 'הלקוח מאשר או דוחה פריט, עם מחיר', group: 'business', icon: ThumbsUp, type: 'decision', make: () => ({ label: 'פריט לאישור', price: 100, helpText: 'תיאור קצר של הפריט', required: true, priority: 'recommended' }), keywords: 'approval' },
  { id: 'consent', label: 'אישור תנאים', hint: 'תיבת סימון חובה לפני שליחה', group: 'business', icon: ShieldCheck, type: 'checkbox', make: () => ({ label: 'קראתי ואני מסכים/ה לתנאים', required: true }), keywords: 'הסכמה תקנון' },
  { id: 'file', label: runtimeConfiguration.mode === 'demo' ? 'צירוף קובץ (דמו: שם הקובץ בלבד)' : 'קישור לקובץ', hint: runtimeConfiguration.mode === 'demo' ? 'בדמו נשמר רק שם הקובץ — הקובץ עצמו לא נשמר ולא נשלח' : 'הלקוח מדביק קישור לקובץ (Drive, Dropbox) או את שם המסמך', group: 'business', icon: FileUp, type: 'file', make: () => ({ label: 'צירוף קובץ', helpText: 'בדמו נשמר שם הקובץ בלבד' }), keywords: 'מסמך העלאה' },
  { id: 'signature', label: 'חתימה דיגיטלית', hint: 'חתימה מאומתת', group: 'business', icon: PenTool, type: 'text', make: () => ({}), unavailable: 'לא זמין כרגע: חתימה עם תוקף מחייבת זיהוי ושרת מאובטח.' },

  // ---------- presentation ----------
  { id: 'heading', label: 'כותרת וטקסט', hint: 'מסבירים ללקוח מה הולך לקרות', group: 'presentation', icon: Heading, type: 'heading', make: () => ({ label: 'כותרת', content: 'כמה מילים שמסבירות ללקוח מה הולך לקרות.' }) },
  { id: 'info', label: 'הודעת מידע', hint: 'פרט חשוב בתיבה בולטת', group: 'presentation', icon: Info, type: 'info', make: () => ({ label: 'לתשומת לבכם', helpText: 'פרט חשוב שהלקוח צריך לדעת.' }) },
  { id: 'highlights', label: 'כרטיסי יתרונות', hint: 'שירות אישי, משלוח מהיר, אחריות', group: 'presentation', icon: Sparkles, type: 'highlights', make: () => ({ label: 'למה אצלנו', items: [{ id: newId('hl'), title: 'שירות אישי', icon: 'heart' }, { id: newId('hl'), title: 'מענה מהיר', icon: 'clock' }, { id: newId('hl'), title: 'אחריות מלאה', icon: 'shield' }] }) },
  { id: 'image', label: 'תמונה', hint: 'איור מקומי או תמונה שלכם', group: 'presentation', icon: ImageIcon, type: 'image', make: () => ({ label: 'תמונה', media: ['decor'] }) },
  { id: 'gallery', label: 'גלריה', hint: 'כמה תמונות בשורה', group: 'presentation', icon: GalleryHorizontal, type: 'gallery', make: () => ({ label: 'גלריה', media: ['bouquet_m', 'cake', 'decor'] }) },
  { id: 'divider', label: 'קו מפריד', hint: 'מחלק את השלב לחלקים', group: 'presentation', icon: Minus, type: 'divider', make: () => ({ label: 'מפריד' }) },
  { id: 'price_breakdown', label: 'פירוט מחיר', hint: 'סיכום הסכום כפי שמחושב עכשיו', group: 'presentation', icon: Receipt, type: 'price_breakdown', make: () => ({ label: 'פירוט ההצעה' }) },
  { id: 'terms', label: 'תנאים', hint: 'מדיניות ביטול, תקנון או הבהרות', group: 'presentation', icon: ScrollText, type: 'terms', make: () => ({ label: 'תנאים', content: 'ביטול עד 48 שעות מראש ללא עלות.' }) },
  { id: 'doc', label: 'מה צריך להכין', hint: 'רשימת מסמכים או הכנות', group: 'presentation', icon: FileText, type: 'heading', make: () => ({ label: 'מה צריך להכין', content: 'צילום תעודה, אישור ניהול חשבון ודוח שנתי.' }) },
  { id: 'contact_actions', label: 'כפתורי יצירת קשר', hint: 'וואטסאפ, ניווט, אינסטגרם — מערכת המותג', group: 'presentation', icon: Share2, type: 'info', make: () => ({}), action: 'presence', keywords: 'וואטסאפ waze social' },

  // ---------- advanced (capabilities, not fields) ----------
  { id: 'adv_condition', label: 'הצגה מותנית', hint: 'שאלה שמופיעה רק לפי תשובה קודמת', group: 'advanced', icon: GitBranch, type: 'info', make: () => ({}), action: 'logic', keywords: 'תנאי condition' },
  { id: 'adv_step', label: 'שלב נוסף', hint: 'מחלקים תהליך ארוך לכמה מסכים', group: 'advanced', icon: Layers, type: 'info', make: () => ({}), action: 'step', keywords: 'multi step' },
  { id: 'adv_pricing', label: 'חישוב מחיר ותשלום', hint: runtimeConfiguration.mode === 'demo' ? 'מחיר לפי בחירות, עמלות ומקדמה (מדומה)' : 'מחיר לפי בחירות, עמלות ומקדמה (מוצג ללקוח, ללא גבייה)', group: 'advanced', icon: Receipt, type: 'info', make: () => ({}), action: 'completion', keywords: 'price' },
  { id: 'adv_booking', label: 'כללי הזמנה ומקומות', hint: 'ימים פתוחים, שעות ותפוסה לכל משבצת', group: 'advanced', icon: Ticket, type: 'info', make: () => ({}), action: 'booking', keywords: 'capacity' },
];

export const BLOCK_GROUPS: { id: BlockGroup; label: string; hint: string }[] = [
  { id: 'basic', label: 'בסיסי', hint: 'השאלות הנפוצות' },
  { id: 'business', label: 'עסקי', hint: 'מחירים, הזמנות, אישורים ופרטי לקוח' },
  { id: 'presentation', label: 'תצוגה', hint: 'מוצג ללקוח, בלי מילוי' },
  { id: 'advanced', label: 'מתקדם', hint: 'לוגיקה, שלבים, מחירים והזמנות' },
];

export function searchBlocks(q: string): BlockDef[] {
  const s = q.trim().toLowerCase();
  if (!s) return BLOCKS;
  return BLOCKS.filter((b) => `${b.label} ${b.hint} ${b.keywords ?? ''}`.toLowerCase().includes(s));
}

/** Fields for a library entry, with keys that do not collide with the workflow's. */
export function createBlocks(def: BlockDef, existingKeys: string[]): WorkflowField[] {
  if (def.unavailable || def.action) return [];
  const used = [...existingKeys];
  const parts = def.makeMany?.() ?? [{ key: def.id.replace(/[^a-z_]/g, '') || 'field', type: def.type, ...(def.appearance ? { appearance: def.appearance } : {}), ...def.make() }];
  return parts.map((p) => {
    const key = uniqueFieldKey(used, p.key ?? def.id);
    used.push(key);
    return { required: false, label: def.label, ...p, id: newId('fld'), key } as WorkflowField;
  });
}

/** Back-compat single-field helper. */
export const createBlock = (def: BlockDef, existingKeys: string[]) => createBlocks(def, existingKeys)[0]!;

export function blockIcon(f: WorkflowField): LucideIcon {
  const fields = BLOCKS.filter((b) => !b.action && !b.makeMany && !b.unavailable);
  const byAppearance = f.appearance && fields.find((b) => b.type === f.type && b.appearance === f.appearance);
  return (byAppearance || fields.find((b) => b.type === f.type && !b.appearance) || fields.find((b) => b.type === f.type))?.icon ?? Type;
}
