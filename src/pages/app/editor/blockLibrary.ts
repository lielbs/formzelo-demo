/** Reusable blocks offered by the studio's "add block" library. Each one is plain WorkflowField data. */
import {
  AlignJustify,
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  FileUp,
  GalleryHorizontal,
  Hash,
  Heading,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  ListChecks,
  Mail,
  Minus,
  Phone,
  Receipt,
  ScrollText,
  ShieldCheck,
  Sparkles,
  SquareStack,
  Tags,
  ThumbsUp,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { FieldAppearance, FieldType, WorkflowField } from '../../../domain/schema';
import { newId } from '../../../lib/id';

export interface BlockDef {
  id: string;
  label: string;
  group: 'content' | 'input' | 'choice' | 'approval';
  icon: LucideIcon;
  type: FieldType;
  appearance?: FieldAppearance;
  make: (key: string) => Partial<WorkflowField>;
}

const opt = (label: string, value: string, extra: Record<string, unknown> = {}) => ({ id: newId('opt'), label, value, ...extra });

export const BLOCKS: BlockDef[] = [
  { id: 'heading', label: 'כותרת וטקסט', group: 'content', icon: Heading, type: 'heading', make: () => ({ label: 'כותרת', content: 'כמה מילים שמסבירות ללקוח מה הולך לקרות.' }) },
  { id: 'info', label: 'הודעת מידע', group: 'content', icon: Info, type: 'info', make: () => ({ label: 'לתשומת לבכם', helpText: 'פרט חשוב שהלקוח צריך לדעת.' }) },
  { id: 'highlights', label: 'יתרונות / שירותים', group: 'content', icon: Sparkles, type: 'highlights', make: () => ({ label: 'למה אצלנו', items: [{ id: newId('hl'), title: 'שירות אישי', icon: 'heart' }, { id: newId('hl'), title: 'מענה מהיר', icon: 'clock' }, { id: newId('hl'), title: 'אחריות מלאה', icon: 'shield' }] }) },
  { id: 'image', label: 'תמונה', group: 'content', icon: ImageIcon, type: 'image', make: () => ({ label: 'תמונה', media: ['decor'] }) },
  { id: 'gallery', label: 'גלריה', group: 'content', icon: GalleryHorizontal, type: 'gallery', make: () => ({ label: 'גלריה', media: ['bouquet_m', 'cake', 'decor'] }) },
  { id: 'divider', label: 'קו מפריד', group: 'content', icon: Minus, type: 'divider', make: () => ({ label: 'מפריד' }) },
  { id: 'price_breakdown', label: 'פירוט מחיר', group: 'content', icon: Receipt, type: 'price_breakdown', make: () => ({ label: 'פירוט ההצעה' }) },
  { id: 'terms', label: 'תנאים', group: 'content', icon: ScrollText, type: 'terms', make: () => ({ label: 'תנאים', content: 'ביטול עד 48 שעות מראש ללא עלות.\n\nהמחירים כוללים מע״מ.' }) },
  { id: 'text', label: 'טקסט קצר', group: 'input', icon: Type, type: 'text', make: () => ({ label: 'טקסט קצר' }) },
  { id: 'textarea', label: 'טקסט ארוך', group: 'input', icon: AlignJustify, type: 'textarea', make: () => ({ label: 'פרטים נוספים' }) },
  { id: 'email', label: 'אימייל', group: 'input', icon: Mail, type: 'email', make: () => ({ label: 'אימייל', role: 'customer_email' }) },
  { id: 'phone', label: 'טלפון', group: 'input', icon: Phone, type: 'phone', make: () => ({ label: 'טלפון', role: 'customer_phone' }) },
  { id: 'number', label: 'מספר', group: 'input', icon: Hash, type: 'number', make: () => ({ label: 'מספר' }) },
  { id: 'quantity', label: 'כמות (+/−)', group: 'input', icon: SquareStack, type: 'number', appearance: 'stepper', make: () => ({ label: 'כמות', min: 1, max: 20 }) },
  { id: 'date', label: 'תאריך', group: 'input', icon: Calendar, type: 'date', make: () => ({ label: 'תאריך', min: 1, max: 90 }) },
  { id: 'time', label: 'שעה', group: 'input', icon: Clock, type: 'time', make: () => ({ label: 'שעה', options: ['10:00', '12:00', '14:00', '16:00'].map((t) => opt(t, t)) }) },
  { id: 'file', label: 'קובץ (דמו)', group: 'input', icon: FileUp, type: 'file', make: () => ({ label: 'קובץ', helpText: 'בדמו נשמר שם הקובץ בלבד' }) },
  { id: 'select', label: 'רשימה נפתחת', group: 'choice', icon: ListChecks, type: 'select', make: () => ({ label: 'בחירה', options: [opt('אפשרות 1', 'option_1'), opt('אפשרות 2', 'option_2')] }) },
  { id: 'tiles', label: 'אריחי בחירה', group: 'choice', icon: LayoutGrid, type: 'radio', appearance: 'tiles', make: () => ({ label: 'בחירה', options: [opt('בסיסי', 'basic', { price: 100, description: 'החבילה הבסיסית' }), opt('מורחב', 'plus', { price: 180, description: 'הכי פופולרי' }), opt('פרימיום', 'premium', { price: 260, description: 'הכול כלול' })] }) },
  { id: 'image_cards', label: 'כרטיסי תמונה', group: 'choice', icon: ImageIcon, type: 'radio', appearance: 'image_cards', make: () => ({ label: 'בחירה עם תמונות', options: [opt('אפשרות 1', 'option_1', { image: 'cake' }), opt('אפשרות 2', 'option_2', { image: 'decor' })] }) },
  { id: 'chips', label: 'תגיות', group: 'choice', icon: Tags, type: 'radio', appearance: 'chips', make: () => ({ label: 'בחירה מהירה', options: [opt('בוקר', 'morning'), opt('צהריים', 'noon'), opt('ערב', 'evening')] }) },
  { id: 'swatches', label: 'צבעים', group: 'choice', icon: SquareStack, type: 'radio', appearance: 'swatches', make: () => ({ label: 'צבע', options: [opt('ורוד', 'pink', { swatch: '#F4C6D0' }), opt('ירוק', 'green', { swatch: '#B7D3B0' }), opt('זהב', 'gold', { swatch: '#D8B26E' })] }) },
  { id: 'multiselect', label: 'בחירה מרובה / תוספות', group: 'choice', icon: CheckSquare, type: 'multiselect', make: () => ({ label: 'תוספות', options: [opt('תוספת א', 'extra_a', { price: 50 }), opt('תוספת ב', 'extra_b', { price: 80 })] }) },
  { id: 'checkbox', label: 'תיבת סימון / תוספת', group: 'choice', icon: CheckSquare, type: 'checkbox', make: () => ({ label: 'תוספת', price: 30 }) },
  { id: 'consent', label: 'הסכמה לתנאים', group: 'approval', icon: ShieldCheck, type: 'checkbox', make: () => ({ label: 'קראתי ואני מסכים/ה לתנאים', required: true }) },
  { id: 'decision', label: 'אישור / דחייה', group: 'approval', icon: ThumbsUp, type: 'decision', make: () => ({ label: 'פריט לאישור', price: 100, helpText: 'תיאור קצר של הפריט', required: true, priority: 'recommended' }) },
  { id: 'doc', label: 'הסבר מסמך', group: 'content', icon: FileText, type: 'heading', make: () => ({ label: 'מה צריך להכין', content: 'צילום תעודה, אישור ניהול חשבון ודוח שנתי.' }) },
];

export const BLOCK_GROUPS: { id: BlockDef['group']; label: string }[] = [
  { id: 'content', label: 'תוכן ותצוגה' },
  { id: 'input', label: 'שדות' },
  { id: 'choice', label: 'בחירה ותמחור' },
  { id: 'approval', label: 'אישור והסכמה' },
];

export function createBlock(def: BlockDef, existingKeys: string[]): WorkflowField {
  let i = existingKeys.length + 1;
  const base = def.id.replace(/[^a-z_]/g, '') || 'field';
  while (existingKeys.includes(`${base}_${i}`)) i++;
  const key = `${base}_${i}`;
  return { id: newId('fld'), key, type: def.type, required: false, label: def.label, ...(def.appearance ? { appearance: def.appearance } : {}), ...def.make(key) } as WorkflowField;
}

export function blockIcon(f: WorkflowField): LucideIcon {
  const byAppearance = f.appearance && BLOCKS.find((b) => b.type === f.type && b.appearance === f.appearance);
  return (byAppearance || BLOCKS.find((b) => b.type === f.type && !b.appearance) || BLOCKS.find((b) => b.type === f.type))?.icon ?? Type;
}
