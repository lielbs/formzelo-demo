/**
 * Puts the facts an owner wrote onto a starting form: their own items and prices on the right
 * question, how many people, deposits, delivery, the questions they asked for — and flags every
 * value that is still a sample. Deterministic; it never invents a price, a name or a rule.
 */
import type { FieldOption, WorkflowConfig, WorkflowField } from '../domain/schema';
import { newId } from '../lib/id';
import type { Industry } from './industries';
import { field, step } from './templates';
import { deliveryInfo, depositInfo, minimumOrder, minimumQuantity, peopleRange, type PricedItem } from './understand';

export interface Tailoring {
  adjustments: string[];
  notes: string[];
}

const CHOICE = ['radio', 'select', 'multiselect'];
const COUNT = /סועד|אורח|משתתפ|אנשים|איש|ילדים|מוזמנ|מגיע|כמה|נפשות|מנות/;
const ADDON_KEY = /^(extras|addons|add_ons|services|diet)$/;
export const allFields = (c: WorkflowConfig): WorkflowField[] => c.steps.flatMap((s) => s.fields);
export const guestsField = (c: WorkflowConfig) => allFields(c).find((f) => f.type === 'number' && COUNT.test(f.label));
const opt = (value: string, label: string, extra: Partial<FieldOption> = {}): FieldOption => ({ id: newId('opt'), value, label, ...extra });
const ils = (n: number) => `${n.toLocaleString('he-IL')} ₪`;

function freeKey(c: WorkflowConfig, base: string): string {
  const taken = new Set(allFields(c).map((f) => f.key));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** The step a new "about the request" question belongs in: the first one that is not only contact details. */
function workStep(c: WorkflowConfig) {
  return c.steps.find((s) => s.fields.some((f) => !f.role && !['highlights', 'info'].includes(f.type))) ?? c.steps[0]!;
}
/** The step for logistics (date, address): the one holding the date, else the last before contact details. */
function logisticsStep(c: WorkflowConfig) {
  const withDate = c.steps.find((s) => s.fields.some((f) => f.type === 'date'));
  if (withDate) return withDate;
  const contactIdx = c.steps.findIndex((s) => s.fields.some((f) => f.role === 'customer_phone'));
  return c.steps[Math.max(0, contactIdx > 0 ? contactIdx - 1 : c.steps.length - 1)]!;
}
function insertAfterIntro(fields: WorkflowField[], f: WorkflowField) {
  const at = fields.findIndex((x) => !['highlights', 'info', 'heading'].includes(x.type));
  fields.splice(at < 0 ? fields.length : at, 0, f);
}

/** The question that holds a business's catalogue: the first choice with prices on two or more options. */
export function primaryPriced(c: WorkflowConfig): WorkflowField | undefined {
  return allFields(c).find((f) => CHOICE.includes(f.type) && !ADDON_KEY.test(f.key) && (f.options ?? []).filter((o) => o.price).length >= 2);
}

const HEADINGS: [RegExp, string][] = [
  [/גדלים|גודל/, 'גודל'],
  [/מארז/, 'בחרו מארז'],
  [/תפריט/, 'תפריט'],
  [/חבילות|חבילה/, 'בחרו חבילה'],
  [/מגשים|מגש/, 'אילו מגשים?'],
  [/טיפולים|טיפול/, 'איזה טיפול?'],
  [/שירותים|שירות/, 'איזה שירות?'],
  [/כרטיסים|כרטיס/, 'סוג כרטיס'],
  [/מחירון|מחירים/, 'מה תרצו להזמין?'],
];

const stripPrices = (f: WorkflowField) => {
  delete f.price;
  f.options?.forEach((o) => delete o.price);
  if (f.multiplyByKey && !f.options?.some((o) => o.price)) delete f.multiplyByKey;
};

/** Owner items onto the form. Returns true when the form now carries the owner's own prices. */
export function applyItems(c: WorkflowConfig, items: PricedItem[], industry: Industry | null, t: Tailoring, catalog = false): boolean {
  const named = items.filter((i) => i.name);
  const main = named.filter((i) => !i.addon);
  const addons = named.filter((i) => i.addon);
  let amounts = items.filter((i) => !i.name);
  // "תרומה חודשית 50, 100 או 250": one named amount heading a list of amounts.
  let amountsLabel: string | undefined;
  if (main.length === 1 && amounts.length >= 1 && items.indexOf(main[0]!) === 0) {
    amountsLabel = main[0]!.name;
    amounts = [main[0]!, ...amounts];
    main.splice(0, 1);
  }
  if (!items.length) return false;
  c.pricing.enabled = true;
  const perPerson = items.some((i) => i.unit === 'person');
  const ensureGuests = () => {
    let g = guestsField(c);
    if (!g) {
      g = field(freeKey(c, 'guests'), 'מספר אורחים', 'number', { required: true, min: 1, max: 500, appearance: 'stepper' });
      insertAfterIntro(workStep(c).fields, g);
    }
    return g;
  };

  let owned: WorkflowField | undefined;
  if (main.length >= 2) {
    const heading = main.find((i) => i.heading)?.heading;
    const label = (heading && HEADINGS.find(([re]) => re.test(heading))?.[1]) ?? undefined;
    const target = primaryPriced(c);
    const steppers = allFields(c).filter((f) => f.type === 'number' && f.price && !COUNT.test(f.label));
    const options = main.map((i, n) => opt(`item_${n + 1}`, i.name, { price: i.price, ...(i.minutes ? { description: `${i.minutes} דק׳` } : {}) }));
    if (catalog || (!target && steppers.length >= 2)) {
      // A product list: a quantity for each item.
      const host = steppers.length ? c.steps.find((s) => s.fields.includes(steppers[0]!))! : workStep(c);
      const at = steppers.length ? host.fields.indexOf(steppers[0]!) : host.fields.findIndex((x) => !['highlights', 'info', 'heading'].includes(x.type));
      host.fields = host.fields.filter((f) => !steppers.includes(f));
      const qty = main.map((i, n) => field(freeKey(c, `item_${n + 1}`), i.name, 'number', { min: 0, max: 50, price: i.price, appearance: 'stepper', helpText: `${ils(i.price)}${i.unit === 'person' ? ' לאדם' : ''}` }));
      host.fields.splice(at < 0 ? host.fields.length : at, 0, ...qty);
      owned = qty[0];
    } else if (target) {
      target.options = options;
      // The owner's products replace a sample budget scale: the question names what is chosen.
      if (label) target.label = label;
      else if (/תקציב/.test(target.label) && industry?.itemsLabel) target.label = industry.itemsLabel;
      if (target.type === 'select') target.type = 'radio';
      target.appearance = options.length <= 6 ? 'tiles' : 'list';
      owned = target;
    } else {
      owned = field(freeKey(c, 'item'), label ?? industry?.itemsLabel ?? 'מה תרצו להזמין?', 'radio', { required: true, appearance: options.length <= 6 ? 'tiles' : 'list', options });
      insertAfterIntro(workStep(c).fields, owned);
    }
    if (perPerson && owned.type !== 'number') owned.multiplyByKey = ensureGuests().key;
    t.adjustments.push(`המחירים שכתבתם: ${main.map((i) => `${i.name} ${ils(i.price)}`).join(', ')}`);
  } else if (main.length === 1 || (amounts.length === 1 && !main.length)) {
    const item = main[0] ?? amounts[0]!;
    const target = primaryPriced(c);
    const match = target?.options?.find((o) => item.name && (o.label.includes(item.name) || item.name.includes(o.label)));
    if (item.unit === 'hour' || item.unit === 'night') {
      const word = item.unit === 'hour' ? 'שעות' : 'לילות';
      let n = allFields(c).find((f) => f.type === 'number' && f.label.includes(word));
      if (!n) {
        n = field(freeKey(c, item.unit === 'hour' ? 'hours' : 'nights'), `כמה ${word}?`, 'number', { required: true, min: 1, max: item.unit === 'hour' ? 12 : 30, appearance: 'stepper' });
        insertAfterIntro(workStep(c).fields, n);
      }
      n.price = item.price;
      n.helpText = `${ils(item.price)} ל${item.unit === 'hour' ? 'שעה' : 'לילה'}`;
      if (target) stripPrices(target);
      allFields(c).filter((f) => f.multiplyByKey === n!.key).forEach(stripPrices);
      owned = n;
    } else if (match) {
      match.price = item.price;
      owned = target;
    } else if (perPerson) {
      const g = ensureGuests();
      g.price = item.price;
      g.helpText = `${ils(item.price)} ${item.name ? `ל${item.name.replace(/^ל/, '')}` : 'לאדם'}`.replace('לאורח', 'לאורח').trim();
      if (target) {
        // One price per guest replaces the sample menu.
        const host = c.steps.find((s) => s.fields.includes(target))!;
        host.fields = host.fields.filter((f) => f !== target);
      }
      owned = g;
    } else {
      c.pricing.fees = c.pricing.fees.filter((f) => !/משלוח/.test(f.label));
      c.pricing.fees.unshift({ id: newId('fee'), label: item.name || 'מחיר', amount: item.price });
      if (target) stripPrices(target);
    }
    t.adjustments.push(`המחיר שכתבתם: ${item.name ? `${item.name} ` : ''}${ils(item.price)}`);
  }

  if (addons.length) {
    const host = allFields(c).find((f) => f.type === 'multiselect' && /^(extras|addons)$/.test(f.key));
    const options = addons.map((i, n) => opt(`addon_${n + 1}`, i.name, { price: i.price }));
    if (host) host.options = options;
    else workStep(c).fields.push(field(freeKey(c, 'addons'), 'תוספות', 'multiselect', { appearance: 'tiles', options }));
    t.adjustments.push(`תוספות: ${addons.map((i) => `${i.name} ${ils(i.price)}`).join(', ')}`);
  }

  if (amounts.length >= 2 && !main.length) {
    // A list of amounts: the donation sum, or price tiers of the main choice ("120/180/250").
    const target = allFields(c).find((f) => CHOICE.includes(f.type) && /סכום/.test(f.label)) ?? primaryPriced(c);
    const options = [...amounts.map((a) => opt(`a${a.price}`, ils(a.price), { price: a.price })), ...(target?.options?.filter((o) => o.value === 'other') ?? [])];
    if (target) target.options = options;
    else insertAfterIntro(workStep(c).fields, field(freeKey(c, 'amount'), amountsLabel ?? 'סכום', 'radio', { required: true, appearance: 'chips', options }));
    if (target && target.options?.length && !/סכום/.test(target.label)) target.appearance = 'chips';
    c.pricing.fees = c.pricing.fees.filter((f) => items.some((i) => i.price === f.amount) || /משלוח/.test(f.label));
    t.adjustments.push(`סכומים: ${amounts.map((a) => ils(a.price)).join(', ')}`);
  }

  // With the owner's own price list in place, sample prices elsewhere would mislead.
  if (main.length >= 2) {
    for (const f of allFields(c)) if (f !== owned && !(f.type === 'number' && owned?.type === 'number' && f.price && main.some((m) => m.name === f.label)) && !(f.type === 'multiselect' && addons.length && f.options?.some((o) => o.value.startsWith('addon_')))) stripPrices(f);
    c.pricing.fees = c.pricing.fees.filter((f) => items.some((i) => i.price === f.amount));
  }
  return true;
}

/** Choices the owner listed without prices ("בחירת מנה: בשר, דג או צמחוני") onto the matching question. */
export function applyNamedOptions(c: WorkflowConfig, list: { head?: string; items: string[] }, t: Tailoring, fallbackLabel?: string): boolean {
  if (list.items.length < 2) return false;
  const stem = list.head?.replace(/^(ה|ב|ל)/, '').slice(0, 3);
  const target = (stem ? allFields(c).find((f) => CHOICE.includes(f.type) && f.label.includes(stem)) : undefined) ?? (stem ? undefined : primaryPriced(c));
  const options = list.items.map((label, i) => opt(`opt_${i + 1}`, label));
  if (target) {
    target.options = options;
    target.appearance = 'chips';
  } else {
    insertAfterIntro(workStep(c).fields, field(freeKey(c, 'choice'), list.head ? `בחירת ${list.head.replace(/^ה/, '')}` : fallbackLabel ?? 'מה מתאים לכם?', 'radio', { required: true, appearance: 'chips', options }));
  }
  t.adjustments.push(`האפשרויות שכתבתם: ${list.items.join(', ')}`);
  return true;
}

/** How many people (range), smallest quantities and places per group. */
export function applyPeople(c: WorkflowConfig, prompt: string, t: Tailoring, opts: { addIfMissing?: boolean; label?: string } = {}) {
  const r = peopleRange(prompt);
  if (r.min !== undefined || r.max !== undefined) {
    let g = guestsField(c);
    if (!g && opts.addIfMissing) {
      g = field(freeKey(c, 'guests'), opts.label ?? 'מספר משתתפים', 'number', { required: true, appearance: 'stepper', min: 1 });
      insertAfterIntro(workStep(c).fields, g);
    }
    if (g) {
      if (r.min !== undefined) g.min = r.min;
      if (r.max !== undefined) g.max = r.max;
      if (g.min !== undefined && g.max !== undefined && g.min > g.max) g.max = Math.max(g.min, r.max ?? g.min);
      g.helpText = g.min !== undefined && g.max !== undefined ? `בין ${g.min} ל-${g.max}` : g.max !== undefined ? `עד ${g.max}` : `לפחות ${g.min}`;
      t.adjustments.push(`מספר ${g.label.replace(/^מספר\s*/, '')}: ${g.helpText}`);
    }
  }
  const q = minimumQuantity(prompt);
  if (q) {
    const word = q.unit === 'hours' ? /שעות/ : q.unit === 'nights' ? /לילות/ : /כמות|חולצות|יחידות|פריטים/;
    const f = allFields(c).find((x) => x.type === 'number' && word.test(x.label));
    if (f) {
      f.min = q.n;
      if (f.max !== undefined && f.max < q.n) f.max = q.n * 4;
      t.adjustments.push(`מינימום: ${q.n}`);
    }
  }
  return r;
}

/** Deposit percent or a fixed deposit, on a priced form. */
export function applyDeposit(c: WorkflowConfig, prompt: string, approval: boolean, t: Tailoring) {
  const d = depositInfo(prompt);
  if (!d) return;
  if (d.percent && c.pricing.enabled) {
    c.pricing.depositPercent = d.percent;
    c.completion = { mode: 'deposit', depositPercent: d.percent, depositTiming: approval || !/(בהזמנה|בשליחה|בעת ההזמנה|מיד)/.test(prompt) ? 'after_approval' : 'on_submit' };
    t.adjustments.push(`סיום: מקדמה של ${d.percent}%`);
  } else if (d.amount) {
    if (c.completion?.mode === 'deposit') c.completion = { mode: c.pricing.enabled ? 'quote' : 'request' };
    c.pricing.depositPercent = 0;
    t.notes.push(`מקדמה של ${ils(d.amount)}${d.perPerson ? ' לאדם' : ''}: בטופס מקדמה נקבעת כאחוז מהסכום. קבעו אחוז ב"סיום ותשלום", או תאמו את המקדמה ישירות מול הלקוח.`);
  }
}

/** Delivery fee as written, free delivery, or free delivery above an amount. */
export function applyDelivery(c: WorkflowConfig, prompt: string, t: Tailoring) {
  const d = deliveryInfo(prompt);
  if (d?.fee) {
    c.pricing.enabled = true;
    const fee = c.pricing.fees.find((f) => /משלוח/.test(f.label));
    if (fee) fee.amount = d.fee;
    else c.pricing.fees.push({ id: newId('fee'), label: 'משלוח', amount: d.fee, ...(deliveryChoice(c) ? { condition: deliveryChoice(c) } : {}) });
    t.adjustments.push(`משלוח: ${ils(d.fee)}`);
  } else if (d?.free) {
    c.pricing.fees = c.pricing.fees.filter((f) => !/משלוח/.test(f.label));
    if (d.freeAbove) t.notes.push(`משלוח חינם מעל ${ils(d.freeAbove)}: הטופס לא מוריד את דמי המשלוח לפי סכום. ציינו את זה בתיאור, או הורידו את המשלוח מההזמנה ידנית.`);
    else t.adjustments.push('משלוח ללא עלות');
  }
  const min = minimumOrder(prompt);
  if (min) t.notes.push(`מינימום הזמנה ${ils(min)}: הטופס לא חוסם הזמנה קטנה יותר. ציינו את זה בתיאור הטופס.`);
}

function deliveryChoice(c: WorkflowConfig) {
  const f = allFields(c).find((x) => CHOICE.includes(x.type) && x.options?.some((o) => o.value === 'delivery'));
  return f ? { fieldKey: f.key, operator: 'equals' as const, value: 'delivery' } : undefined;
}

/* ---------- questions the owner asked for ---------- */

type Maker = (c: WorkflowConfig) => { f: WorkflowField; where: 'work' | 'logistics' };
const REQUESTED: [RegExp, (c: WorkflowConfig) => boolean, Maker][] = [
  [/תאריך לידה/, (c) => allFields(c).some((f) => /לידה/.test(f.label)), (c) => ({ f: field(freeKey(c, 'birth_date'), 'תאריך לידה', 'date', { min: -36500, max: 0 }), where: 'work' })],
  [/מספר רכב|מספר רישוי|לוחית רישוי|מספר הרכב/, (c) => allFields(c).some((f) => /רישוי|מספר רכב/.test(f.label)), (c) => ({ f: field(freeKey(c, 'car_plate'), 'מספר רכב (רישוי)', 'text', { required: true, placeholder: '12-345-67' }), where: 'work' })],
  [/משקל/, (c) => allFields(c).some((f) => /משקל/.test(f.label)), (c) => ({ f: field(freeKey(c, 'weight'), 'משקל (ק״ג)', 'number', { min: 20, max: 300 }), where: 'work' })],
  [/גובה/, (c) => allFields(c).some((f) => /גובה/.test(f.label)), (c) => ({ f: field(freeKey(c, 'height'), 'גובה (ס״מ)', 'number', { min: 50, max: 230 }), where: 'work' })],
  [/מטרות|מטרה/, (c) => allFields(c).some((f) => /מטר/.test(f.label)), (c) => ({ f: field(freeKey(c, 'goals'), 'מה המטרות?', 'textarea'), where: 'work' })],
  [/קהל יעד/, (c) => allFields(c).some((f) => /קהל/.test(f.label)), (c) => ({ f: field(freeKey(c, 'audience'), 'קהל יעד', 'textarea'), where: 'work' })],
  [/תקציב/, (c) => allFields(c).some((f) => /תקציב/.test(f.label)), (c) => ({ f: field(freeKey(c, 'budget'), 'תקציב משוער', 'text', { placeholder: 'בשקלים' }), where: 'work' })],
  [/(גודל|שטח)\s*(?:הדירה|הנכס|ב)?\s*(?:במ"ר|במ״ר|מ"ר|מ״ר)|לפי שטח|גודל במ/, (c) => allFields(c).some((f) => /מ״ר|שטח|גודל/.test(f.label)), (c) => ({ f: field(freeKey(c, 'size_sqm'), /שטח/.test(c.title) ? 'שטח (מ״ר)' : 'גודל / שטח (מ״ר)', 'number', { min: 1, max: 100000 }), where: 'work' })],
  [/דחיפות|דחוף/, (c) => allFields(c).some((f) => /דחיפות|דחוף/.test(f.label)), (c) => ({ f: field(freeKey(c, 'urgency'), 'דחיפות', 'radio', { required: true, appearance: 'chips', options: [opt('regular', 'רגיל'), opt('urgent', 'דחוף')] }), where: 'work' })],
  [/תיאור (?:ה)?(?:בעיה|מקרה|עבודה|תקלה|פנייה)|יתאר|לתאר/, (c) => allFields(c).some((f) => f.type === 'textarea' && /תיאור|מה קורה|מה צריך/.test(f.label)), (c) => ({ f: field(freeKey(c, 'details'), 'תיאור קצר', 'textarea', { required: true, placeholder: 'מה צריך? כמה שיותר פרטים' }), where: 'work' })],
  [/חיסונ/, (c) => allFields(c).some((f) => /חיסונ/.test(f.label)), (c) => ({ f: field(freeKey(c, 'vaccines'), 'החיסונים בתוקף', 'checkbox', { required: true }), where: 'work' })],
  [/הסעה|הסעות/, (c) => allFields(c).some((f) => /הסעה/.test(f.label)), (c) => ({ f: field(freeKey(c, 'shuttle'), 'צריכים הסעה?', 'radio', { appearance: 'chips', options: [opt('yes', 'כן'), opt('no', 'לא')] }), where: 'work' })],
  [/מספר אורחים|מספר מוזמנים|כמה אורחים|כמה מגיעים|מספר מנות|כמה מנות|מספר משתתפים|כמה משתתפים|כמה אנשים|לפי מספר אורחים/, (c) => Boolean(guestsField(c)), (c) => ({ f: field(freeKey(c, 'guests'), 'מספר אורחים', 'number', { required: true, min: 1, max: 1000, appearance: 'stepper' }), where: 'work' })],
  [/כתובת|עד הבית|הביתה|ביקור בית|בבית ה(?:לקוח|לקוחה|תלמיד|תלמידה|מטופל|מטופלת)|אצלכם בבית|מגיעה? אליכם|מגיעים אליכם|בבית שלכם/, (c) => allFields(c).some((f) => /כתובת/.test(f.label)), (c) => ({ f: field(freeKey(c, 'address'), 'כתובת', 'text', { required: true, placeholder: 'רחוב, מספר, עיר' }), where: 'logistics' })],
  [/תמונ|צילום של|להעלות|לוגו|קובץ|קבצים/, (c) => allFields(c).some((f) => f.type === 'file'), (c) => ({ f: field(freeKey(c, 'photos'), 'תמונות או קבצים', 'file', { helpText: 'שם הקובץ או קישור לתיקייה משותפת' }), where: 'work' })],
  [/תאריך|מועד|מתי/, (c) => allFields(c).some((f) => f.type === 'date'), (c) => ({ f: field(freeKey(c, 'requested_date'), 'תאריך מבוקש', 'date', { min: 0, role: allFields(c).some((f) => f.role === 'date') ? undefined : 'date' }), where: 'logistics' })],
];

export function applyRequestedFields(c: WorkflowConfig, text: string, t: Tailoring) {
  for (const [re, has, make] of REQUESTED) {
    if (!re.test(text) || has(c)) continue;
    const { f, where } = make(c);
    const s = where === 'work' ? workStep(c) : logisticsStep(c);
    const contactAt = s.fields.findIndex((x) => x.role === 'customer_name' || x.role === 'customer_phone');
    s.fields.splice(contactAt < 0 ? s.fields.length : contactAt, 0, f);
    t.adjustments.push(`נוספה שאלה: ${f.label}`);
  }
}

/** Notice ("3 ימים מראש") and reach ("עד חודש קדימה") on the date question of a form without a booking calendar. */
export function applyDateWindow(c: WorkflowConfig, noticeHours?: number, daysAhead?: number) {
  if (c.booking?.enabled) return;
  const date = allFields(c).find((f) => f.type === 'date' && (f.role === 'date' || !/לידה/.test(f.label)));
  if (!date) return;
  if (noticeHours) date.min = Math.ceil(noticeHours / 24);
  if (daysAhead) date.max = daysAhead;
  if (date.min !== undefined && date.max !== undefined && date.max < date.min) date.max = date.min + 30;
  if (noticeHours && noticeHours >= 24) date.helpText = `הזמנה לפחות ${noticeHours % 24 === 0 ? `${noticeHours / 24} ימים` : `${noticeHours} שעות`} מראש`.replace('1 ימים', 'יום');
}

/** Every price in the form that the owner did not write is a sample; say so, once, in plain words. */
export function flagSamples(c: WorkflowConfig, prompt: string, t: Tailoring) {
  const written = new Set<number>();
  for (const m of prompt.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)) written.add(Number(m[0]));
  const labels = new Set<string>();
  for (const f of allFields(c)) {
    if (f.price && !written.has(f.price)) labels.add(f.label);
    if (f.options?.some((o) => o.price && !written.has(o.price))) labels.add(f.label);
  }
  for (const fee of c.pricing.fees) if (fee.amount && !written.has(fee.amount)) labels.add(fee.label);
  if (labels.size && c.pricing.enabled) t.notes.push(`המחירים ב${[...labels].slice(0, 4).map((l) => `"${l.replace(/[?:]$/, '')}"`).join(', ')} הם לדוגמה. עדכנו אותם לפני הפרסום.`);
}

/** A product order built from the owner's list (restaurant delivery, café, shop). */
export function productOrder(o: { title: string; description: string; items: PricedItem[]; text: string; deliveryWords: boolean; itemsLabel?: string }): WorkflowConfig {
  const main = o.items.filter((i) => i.name && !i.addon);
  const orderFields: WorkflowField[] = main.length
    ? main.map((i, n) => field(`item_${n + 1}`, i.name, 'number', { min: 0, max: 50, price: i.price, appearance: 'stepper', helpText: ils(i.price) }))
    : [field('order', o.itemsLabel ?? 'מה תרצו להזמין?', 'textarea', { required: true, placeholder: 'פריטים, כמויות ובקשות מיוחדות' })];
  const addons = o.items.filter((i) => i.name && i.addon);
  if (addons.length === 1) orderFields.push(field('addon_1', addons[0]!.name, 'checkbox', { price: addons[0]!.price, helpText: `בתוספת ${ils(addons[0]!.price)}` }));
  else if (addons.length > 1) orderFields.push(field('addons', 'תוספות', 'multiselect', { appearance: 'tiles', options: addons.map((a, n) => opt(`addon_${n + 1}`, a.name, { price: a.price })) }));
  const sizes = o.text.match(/מיד(?:ה|ות)\s*:?\s*((?:(?:XXL|XL|XS|S|M|L|\d{2})[\s,/]*(?:ו-?|או)?\s*){2,})/i);
  if (sizes) {
    const list = sizes[1]!.split(/[\s,/]+|ו-?|או/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    orderFields.push(field('size', 'מידה', 'radio', { required: true, appearance: 'chips', options: [...new Set(list)].map((s) => opt(s.toLowerCase(), s)) }));
  }
  if (/צבע/.test(o.text)) orderFields.push(field('color', 'צבע מבוקש', 'text', { placeholder: 'למשל: שחור, לבן, לפי התמונה' }));
  if (/ריח/.test(o.text)) orderFields.push(field('scent', 'ריח מבוקש', 'text'));
  if (/טעם|טעמים/.test(o.text)) orderFields.push(field('flavor', 'טעם', 'text'));
  if (/חריטה|כיתוב|הקדשה/.test(o.text)) orderFields.push(field('inscription', /חריטה/.test(o.text) ? 'נוסח החריטה' : 'נוסח הכיתוב', 'text', { max: 60 }));
  orderFields.push(field('notes', 'הערות להזמנה', 'textarea', { placeholder: 'בקשות מיוחדות, אלרגיות…', max: 400 }));
  const pickupAndDelivery = /איסוף/.test(o.text) && /משלוח/.test(o.text);
  const handover: WorkflowField[] = [];
  if (o.deliveryWords) {
    if (pickupAndDelivery || /משלוח/.test(o.text)) {
      handover.push(field('delivery', 'איך תרצו לקבל?', 'radio', { required: true, appearance: 'tiles', options: [opt('pickup', 'איסוף עצמי'), opt('delivery', 'משלוח')] }));
      handover.push(field('address', 'כתובת למשלוח', 'text', { required: true, placeholder: 'רחוב, מספר, עיר', condition: { fieldKey: 'delivery', operator: 'equals', value: 'delivery' } }));
    }
  }
  handover.push(field('date', /איסוף/.test(o.text) && !/משלוח/.test(o.text) ? 'תאריך איסוף' : 'תאריך', 'date', { required: true, role: 'date', min: 0, max: 60 }));
  return {
    title: o.title,
    description: o.description,
    mode: 'public',
    caseFields: [],
    steps: [
      step('ההזמנה', orderFields),
      step('מסירה', handover),
      step('פרטים', [
        field('full_name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone', placeholder: '050-1234567' }),
      ]),
    ],
    pricing: { enabled: main.length + addons.length > 0, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ להזמנה' },
    branding: { primaryColor: '#E96B3D', logoText: 'העסק שלי' },
    consent: { required: true, text: 'ידוע לי שההזמנה סופית רק לאחר אישור העסק.' },
    successMessage: 'ההזמנה התקבלה! נאשר אותה בהקדם.',
    completion: { mode: main.length + addons.length ? 'quote' : 'request' },
    confirmation: { title: 'ההזמנה התקבלה', nextSteps: ['נבדוק את ההזמנה ונאשר', 'תקבלו עדכון כשההזמנה מוכנה'] },
  };
}
