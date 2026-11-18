/**
 * DEMO local generation — deterministic Hebrew understanding, NOT an AI model.
 *
 * 1. The description is read into facts (engine/understand, engine/rules, engine/compose): the kind
 *    of business, priced items, choices, people, days and hours, deposits, delivery, approvals.
 * 2. The kind of business picks how the form works and what it starts from (engine/industries):
 *    an appointment calendar, a restaurant table, a registration, or a ready business form.
 * 3. The owner's facts are put on that form (engine/tailor) and every value that is still a sample
 *    is flagged in the owner-only review notes. Unsupported requirements become notes too.
 * The output is an ordinary, editable WorkflowConfig validated against the Zod schema.
 */
import { WorkflowConfigSchema, type Intake, type WorkflowConfig, type WorkflowField } from '../domain/schema';
import type { ThemeExtras, WorkflowTheme } from '../domain/theme';
import { recommendTheme, type ThemeRecommendation } from '../theme/resolver';
import { buildTheme, PRESETS } from '../theme/presets';
import { newId } from '../lib/id';
import { analyzePrompt, composeWorkflow, describeIntent, shouldCompose, type PromptIntent } from './compose';
import { normalizeHebrew, tokenMatches } from './hebrew';
import { detectIndustry, type Industry, type IndustryId } from './industries';
import { templateById } from './library';
import { GENERIC_SERVICE, readAppointment, readRules, type PromptRules } from './rules';
import { withSchedule } from './booking';
import { weekHours } from './schedule';
import { starterExtras } from './finish';
import {
  allFields,
  applyDateWindow,
  applyDelivery,
  applyDeposit,
  applyItems,
  applyNamedOptions,
  applyPeople,
  applyRequestedFields,
  flagSamples,
  guestsField,
  productOrder,
  type Tailoring,
} from './tailor';
import { buildGeneric, field, highlight, option, TEMPLATES, type TemplateKey } from './templates';
import { canonical, namedList, peopleRange, pricedItems, type PricedItem } from './understand';

export { normalizeHebrew };

const KEYWORDS: Record<Exclude<TemplateKey, 'generic'>, string[]> = {
  flower_order: ['פרח', 'זר', 'זרים', 'פלורי', 'משלוח פרחים', 'חנות פרחים', 'ורד', 'סידורי'],
  garage_repairs: ['מוסך', 'רכב', 'בלמים', 'רפידות', 'מכונאי', 'צמיגים', 'טיפול שנתי', 'מגבים', 'פילטר'],
  restaurant_event: ['מסעדה', 'אירוע פרטי', 'אירועים פרטיים', 'אירוע', 'אורחים', 'תפריט', 'קייטרינג', 'שף', 'ארוחה', 'בר מצווה', 'בת מצווה', 'יום הולדת'],
  table_booking: [
    'הזמנת שולחן', 'הזמנות שולחן', 'שולחנות', 'שולחן', 'קביעת תור', 'תור', 'תורים', 'מספרה', 'מניקור', 'קוסמטיקאית', 'פגישה', 'יומן', 'שעות פנויות', 'הזמנת מקום',
    'ספר', 'ברבר', 'מכון יופי', 'קוסמטיקה', 'ציפורניים', 'ספא', 'עיסוי', 'אימון', 'אימונים', 'מאמן', 'מאמנת', 'פילאטיס', 'יוגה',
    'קליניקה', 'פיזיותרפיה', 'מטפל', 'מטפלת', 'טיפולים', 'רופא', 'שיננית', 'וטרינר', 'שיעור פרטי', 'מורה פרטי', 'ריסים', 'גבות',
  ],
  // Registration prompts are composed from blocks (engine/compose), so this template is chosen explicitly, not by keywords.
  contest_registration: [],
  document_collection: ['מסמכים', 'מסמך', 'טופס 106', 'רואה חשבון', 'הנהלת חשבונות', 'קליטת לקוח', 'אישורים', 'צילום', 'להעלות', 'העלאת'],
  quote_request: ['הצעת מחיר', 'הצעה', 'שיפוץ', 'התקנה', 'קבלן', 'אינסטלטור', 'חשמלאי', 'הערכת עלות', 'ביקור', 'עבודה'],
};

export interface GenerationResult {
  /** A core template key, a library template id, or 'generic' for composed forms. */
  templateKey: TemplateKey | string;
  templateLabel: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  /** Human-readable list of what the local engine changed based on the prompt. */
  adjustments: string[];
  /** True when the workflow was assembled from blocks rather than a single template. */
  composed: boolean;
  intent: PromptIntent;
  /** Kind of business understood from the description. */
  industry: IndustryId;
  industryLabel: string;
  /** Capability chips detected in the prompt. */
  detected: string[];
  /** Requirements that need the owner's review or are not supported in the demo (also stored as config.draftNotes). */
  reviewNotes: string[];
  config: WorkflowConfig;
  /** When / how much the link accepts, read from the description (applied on create). */
  intake?: Intake;
  /** Operating rules understood from the description, in the owner's words. */
  understood: string[];
  /** Recommended completion mode (also applied to the config). */
  completionMode: NonNullable<WorkflowConfig['completion']>['mode'];
  /** Design chosen by the local theme resolver (not AI) — editable before saving. */
  theme: WorkflowTheme;
  themeRecommendation: ThemeRecommendation;
}

export function detectTemplate(prompt: string): { key: TemplateKey; matched: string[]; score: number } {
  const text = normalizeHebrew(prompt);
  const tokens = text.split(' ').filter(Boolean);
  let best: { key: TemplateKey; matched: string[]; score: number } = { key: 'generic', matched: [], score: 0 };
  for (const [key, words] of Object.entries(KEYWORDS) as [Exclude<TemplateKey, 'generic'>, string[]][]) {
    const matched = words.filter((w) => tokenMatches(text, tokens, w));
    // Multi-word phrases are stronger signals than single stems.
    const score = matched.reduce((s, w) => s + (w.includes(' ') ? 2 : 1), 0);
    if (score > best.score) best = { key, matched, score };
  }
  return best;
}

/** Request phrasing that should never end up in a customer-facing title. */
const REQUEST_PREFIX = /^(תיצור|תיצרי|צור|צרי|תבנה|תבני|בנה|בני|תעשה|תעשי|אני רוצה|אני צריך|אני צריכה|אנחנו רוצים|אנחנו צריכים|רוצה|צריך|צריכה)(?=\s)( לי| לנו)?( תהליך| טופס)?\s*/;

function titleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim().replace(REQUEST_PREFIX, '').trim();
  const first = (clean.split(/[.!?\n]/)[0] ?? clean).split(/\s+עם\s+|,|\s-\s|:/)[0]!.trim();
  return first.length > 30 ? `${first.slice(0, 28).trim()}` : first || 'טופס חדש';
}

const QUOTE = /(הצעת מחיר|הצעות מחיר|הצעה|הערכת עלות|הצעת [א-ת]+)/;

function applyModifiers(config: WorkflowConfig, text: string, adjustments: string[]): WorkflowConfig {
  const next = structuredClone(config);
  const lastStep = next.steps[next.steps.length - 1]!;
  const hasKey = (k: string) => next.steps.some((s) => s.fields.some((f) => f.key === k));

  if (/תמונ|צילומ/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'file'))) {
    lastStep.fields.push(field('photos', 'תמונות', 'file', { helpText: 'שם הקובץ או קישור לתיקייה משותפת' }));
    adjustments.push('נוסף שדה לתמונות (שם קובץ או קישור)');
  }
  if (/מקדמ/.test(text) && next.pricing.enabled) {
    if (!next.pricing.depositPercent) next.pricing.depositPercent = 20;
    if (next.completion?.mode !== 'deposit') {
      next.completion = { mode: 'deposit', depositPercent: next.pricing.depositPercent, depositTiming: 'after_approval' };
      adjustments.push('סיום: מקדמה של 20% אחרי אישור העסק');
    }
  } else if (/ללא תשלום|בלי תשלום|חינם|ללא עלות/.test(text)) {
    next.completion = { mode: 'request' };
    adjustments.push('סיום: בקשה בלבד, ללא תשלום');
  } else if (QUOTE.test(text) && next.completion?.mode !== 'quote') {
    next.completion = { mode: 'quote' };
    adjustments.push('סיום: הצעת מחיר — ללא גביית כסף');
  } else if (/תשלום|לשלם|ישלמו|תשלם/.test(text) && next.pricing.enabled) {
    next.completion = /אחרי אישור|לאחר אישור/.test(text) ? { mode: 'pay_after_approval' } : { mode: 'calculated', allowPayLater: true };
    adjustments.push(next.completion.mode === 'pay_after_approval' ? 'סיום: תשלום רק אחרי אישור' : 'סיום: תשלום הסכום המחושב');
  }
  if (/אימייל|מייל/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'email'))) {
    lastStep.fields.push(field('email', 'אימייל', 'email', { role: 'customer_email' }));
    adjustments.push('נוסף שדה אימייל');
  }
  if (/כתובת/.test(text) && !hasKey('address') && !allFields(next).some((f) => /כתובת/.test(f.label))) {
    lastStep.fields.push(field('address', 'כתובת', 'text'));
    adjustments.push('נוסף שדה כתובת');
  }
  if (/תאריך|מועד/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'date'))) {
    lastStep.fields.push(field('requested_date', 'תאריך מבוקש', 'date', { min: 0, role: 'date' }));
    adjustments.push('נוסף שדה תאריך מבוקש');
  }
  return next;
}

/* ---------- appointments ---------- */

/** Sample services per kind of appointment business; always flagged as placeholders. */
const SERVICES: [RegExp, string[]][] = [
  [/(מספר|ספר |תספורת|שיער)/, ['תספורת', 'צבע', 'פן ועיצוב']],
  [/(מניקור|פדיקור|ציפורנ|לק)/, ['מניקור', 'פדיקור', 'לק ג׳ל']],
  [/(קוסמטיק|טיפול פנים|איפור|ספא)/, ['טיפול פנים', 'איפור', 'הסרת שיער']],
  [/(קליניק|מרפא|רופא|פיזיותרפ|טיפול)/, ['פגישת היכרות', 'טיפול', 'ביקורת']],
  [/(יוע|עורך דין|רואה חשבון|משרד)/, ['פגישת ייעוץ', 'פגישת המשך']],
];

/** Services the owner named, in their order ("תספורת או צבע" → תספורת, צבע). */
const SERVICE_WORDS = [
  'תספורת וזקן', 'תספורת', 'צבע', 'פן', 'החלקה', 'גוונים', 'תסרוקת', 'זקן', 'מניקור', 'פדיקור', 'לק ג׳ל', 'לק גל', 'בניית ציפורניים', 'טיפול פנים',
  'איפור', 'הסרת שיער', 'עיסוי', 'פיזיותרפיה', 'דיקור', 'רפלקסולוגיה', 'שיאצו', 'ייעוץ', 'אבחון', 'בדיקה', 'ניקוי שיניים', 'הלבנה',
  'אימון אישי', 'שיעור ניסיון', 'צילום', 'קעקוע', 'פירסינג', 'הרמת ריסים', 'ריסים', 'עיצוב גבות', 'גבות', 'שעווה', 'רחצה', 'גזיזת ציפורניים',
];

export function namedServices(prompt: string): string[] {
  const t = ` ${prompt.replace(/[״"']/g, '׳')}`;
  // A whole word, optionally after one prefix letter: "לתספורת" yes, "פדיקור" is not "דיקור".
  const at = (w: string) => t.search(new RegExp(`[^א-ת][ולבהמש]?${w}(?![א-ת])`));
  const found = SERVICE_WORDS.map((w) => [w, at(w)] as const).filter(([, i]) => i >= 0);
  // A longer phrase covers its words ("הרמת ריסים" is not also "ריסים").
  return found
    .filter(([w, i]) => !found.some(([o, j]) => o !== w && o.includes(w) && j <= i && j + o.length >= i + w.length - 1))
    .sort((a, b) => a[1] - b[1])
    .map(([w]) => w);
}

export function appointmentServices(text: string, prompt = ''): string[] {
  const named = namedServices(prompt);
  if (named.length >= 2) return named.slice(0, 8);
  const sample = SERVICES.find(([re]) => re.test(text))?.[1] ?? ['פגישה ראשונה', 'פגישת המשך'];
  return named.length ? [named[0]!, ...sample.filter((s) => s !== named[0])] : sample;
}

/** One person per appointment unless the owner speaks of groups, couples or companions. */
const GROUPS = /(משתתפ|אנשים|קבוצ|זוגות|מלוו|סועדים|אורחים|כמה אנשים)/;

interface Service {
  name: string;
  minutes?: number;
  price?: number;
}

const bare = (s: string) => s.replace(/[׳'"]/g, '').replace(/\s+\d{1,3}\s*דק$/, '').replace(/^[ולה]-?(?=[א-ת]{3})/, '').trim();
/** The same service written twice ("לק ג׳ל" / "לק גל"); "תספורת" and "תספורת וזקן" stay two services. */
const same = (a: string, b: string) => bare(a) === bare(b);
/** A name already covered by a longer one ("הסרת שיער" inside "הסרת שיער בשעווה"). */
const covered = (list: Service[], n: string) => list.some((x) => same(x.name, n) || bare(x.name).includes(bare(n)));

/** "X, אבחון ראשוני וטיפול שבועי" — a short list right after the business name. */
function listAfterComma(prompt: string): string[] {
  const parts = prompt.split(/[,.]/).map((s) => s.trim());
  for (const part of parts.slice(1)) {
    const items = part.split(/\s+ו-?(?=[א-ת]{2})|\s+או\s+/).map((x) => x.trim());
    if (items.length >= 2 && items.every((x) => x && !/\d/.test(x) && x.split(' ').length <= 3 && !/(רוצה|צריך|תור|תורים|שעה|שעות|ימים|עד|בין|לפחות|הרשמה|תשלום|מקדמה|לקוחות|אישור|קביעת|שיעור של|טופס)/.test(x))) return items;
  }
  return [];
}

/** Services in the owner's words: lengths, prices and names merged, generic words ("תור", "שיעור") only when priced. */
function ownerServices(prompt: string, items: PricedItem[]): Service[] {
  const out: Service[] = [];
  const add = (s: Service) => {
    // Same name, different length: a separate service (עיסוי 45 / עיסוי 90).
    const hit = out.find((x) => same(x.name, s.name) && !(x.minutes && s.minutes && x.minutes !== s.minutes));
    if (hit) {
      hit.minutes ??= s.minutes;
      hit.price ??= s.price;
    } else out.push({ ...s });
  };
  for (const s of readAppointment(prompt).services ?? []) add(s);
  for (const i of items) if (i.name && !i.addon) add({ name: i.name.replace(/^(?:תור|פגישה)\s+ל-?(?=[א-ת]{2})/, ''), price: i.price, minutes: i.minutes });
  // "בנייה לוקחת שעה וחצי": a length for a service already named ("בניית ציפורניים").
  for (const s of [...out]) {
    if (s.price !== undefined || !s.minutes) continue;
    const word = s.name.replace(/\s+(?:לוקח|לוקחת|לוקחים|נמשך|נמשכת|נמשכים|אורך|אורכת)$/, '');
    if (word.includes(' ')) continue;
    const stem = bare(word).slice(0, 3);
    const owner = out.find((x) => x !== s && x.price !== undefined && bare(x.name).startsWith(stem));
    if (owner) {
      owner.minutes ??= s.minutes;
      out.splice(out.indexOf(s), 1);
    }
  }
  // The owner's own list first ("בדיקה תקופתית, ניקוי"), then single service words found anywhere.
  const list = namedList(prompt);
  if (!list.head) for (const n of list.items) if (!covered(out, n)) add({ name: n });
  for (const n of namedServices(prompt)) if (!covered(out, n)) add({ name: n });
  if (out.length < 2) for (const n of listAfterComma(prompt)) if (!covered(out, n)) add({ name: n });
  return out.filter((s) => !GENERIC_SERVICE.test(s.name) || s.price !== undefined).slice(0, 8);
}

function needsFields(industry: Industry | null): WorkflowField[] {
  const out: WorkflowField[] = [];
  for (const n of industry?.needs ?? []) {
    if (n === 'car') out.push(field('car_plate', 'מספר רכב (רישוי)', 'text', { required: true, placeholder: '12-345-67' }), field('car_model', 'דגם ושנה', 'text', { placeholder: 'לדוגמה: מאזדה 3, 2020' }));
    if (n === 'pet') out.push(field('pet_name', 'שם חיית המחמד', 'text', { required: true }), field('pet_kind', 'מי מגיע?', 'radio', { required: true, appearance: 'chips', options: [option('dog', 'כלב'), option('cat', 'חתול'), option('other', 'אחר')] }));
    if (n === 'address') out.push(field('property_address', 'כתובת הנכס', 'text', { required: true, placeholder: 'רחוב, מספר, עיר' }));
  }
  return out;
}

function toAppointments(base: WorkflowConfig, title: string, text: string, prompt: string, industry: Industry | null, items: PricedItem[], t: Tailoring): WorkflowConfig {
  const c = structuredClone(base);
  c.title = title;
  c.description = 'בחרו שירות, יום ושעה פנויה. הבקשה נשמרת עד שהעסק מאשר אותה.';
  c.branding = { ...c.branding, logoText: 'העסק שלי' };
  const first = c.steps[0]!;
  first.title = 'מתי נוח לכם?';
  const a = readAppointment(prompt);
  const named = ownerServices(prompt, items);
  const fallback = a.minutes ?? industry?.minutes ?? (/(אימון|מאמנ|פילאטיס|יוגה|עיסוי|טיפול פנים|פיזיותרפ|קליניק|ייעוץ)/.test(text) ? 60 : 30);
  let services: Service[];
  let single: Service | undefined;
  if (named.length >= 2) {
    services = named;
    t.adjustments.push(`השירותים שכתבתם: ${named.map((s) => s.name).join(', ')}`);
  } else if (named.length === 1 && GENERIC_SERVICE.test(named[0]!.name)) {
    single = named[0]!;
    services = [];
  } else {
    const samples = industry?.services ?? appointmentServices(text, prompt);
    services = [...named, ...samples.filter((s) => !named.some((n) => same(n.name, s))).map((name) => ({ name }))].slice(0, 6);
    t.notes.push('רשימת השירותים היא לדוגמה. עדכנו אותה לפני הפרסום.');
    if (named.length) t.adjustments.push(`השירות שכתבתם: ${named[0]!.name}`);
  }
  const serviceField = services.length
    ? field('service', industry?.itemsLabel ?? 'איזה שירות?', 'radio', {
        required: true,
        appearance: services.some((s) => s.price || s.minutes) ? 'tiles' : 'chips',
        options: services.map((s, i) => ({
          id: newId('opt'),
          label: s.name,
          value: `service_${i + 1}`,
          ...(s.price ? { price: s.price } : {}),
          ...(s.minutes ? { description: `${s.minutes} דק׳` } : {}),
        })),
      })
    : undefined;
  const groups = GROUPS.test(text);
  first.fields = first.fields
    .filter((f) => f.key !== 'seating' && (groups || f.key !== 'party_size'))
    .map((f) => {
      if (f.key === 'booking_notes') {
        // The promises strip already says "only free times" and "no payment"; this note says how a request works.
        return { ...f, items: [highlight('בקשה — לא תור סופי', 'העסק מאשר כל בקשה', 'calendar'), highlight('מועד אחר?', 'אפשר לכתוב בהערות לעסק', 'clock')] };
      }
      if (f.key === 'party_size') return { ...f, label: 'מספר משתתפים', max: 4 };
      if (f.key === 'booking_time') return { ...f, label: 'שעה פנויה', options: undefined, helpText: 'מוצגות רק שעות שעדיין פנויות' };
      return f;
    });
  first.fields.splice(1, 0, ...(serviceField ? [serviceField] : []), ...needsFields(industry));
  const durations = Object.fromEntries((serviceField?.options ?? []).map((o, i) => [o.value, services[i]?.minutes ?? fallback]));
  const lengths = Object.values(durations);
  const duration = single?.minutes ?? lengths[0] ?? fallback;
  const days = a.days ?? weekHours(readRules(prompt).weekdays ?? [0, 1, 2, 3, 4], '09:00', '18:00');
  c.booking = withSchedule({ ...c.booking!, capacityPerSlot: a.staff ?? 1 }, {
    days,
    step: [...lengths, duration].every((m) => m % 30 === 0) ? 30 : 15,
    duration,
    ...(serviceField ? { serviceKey: 'service', durations } : {}),
  });
  const date = first.fields.find((f) => f.key === 'booking_date');
  if (date) date.helpText = `פעילות בימים ${weekdayRange(c.booking.openWeekdays)}`;
  if (services.some((s) => s.price) || single?.price) {
    c.pricing = { ...c.pricing, enabled: true, totalLabel: 'מחיר' };
    if (single?.price) c.pricing.fees = [{ id: newId('fee'), label: `מחיר ל${single.name.replace(/^ל/, '')}`, amount: single.price }];
  }
  if (single) t.adjustments.push(`כל תור: ${duration} דק׳${single.price ? `, ${single.price} ₪` : ''}`);
  const second = c.steps[1]!;
  second.fields = second.fields.filter((f) => f.key !== 'occasion').map((f) => (f.key === 'requests' ? { ...f, label: 'הערות לעסק', placeholder: 'מה תרצו שנדע מראש?' } : f));
  c.consent = { required: true, text: 'ידוע לי שזו בקשה לתור ושהיא סופית רק לאחר אישור העסק.' };
  c.successMessage = 'הבקשה לתור נשלחה. זו עדיין בקשה — נעדכן ברגע שהעסק יאשר.';
  c.booking = { ...c.booking!, guestsKey: groups ? c.booking!.guestsKey : undefined, capacityUnit: 'bookings' };
  c.confirmation = { title: 'הבקשה לתור התקבלה', nextSteps: ['העסק בודק את הזמינות', 'תקבלו עדכון על אישור או מועד חלופי', 'התור סופי רק אחרי אישור'] };
  t.adjustments.unshift(groups ? 'הותאם לקביעת תור: בחירת שירות ושעות יום' : 'הותאם לקביעת תור אישי: בחירת שירות ושעות יום, לקוח אחד לכל תור');
  return c;
}

/** The ribbon and promises of an appointment form: what is true of it, in the business's own field. */
function appointmentExtras(text: string, industry: Industry | null): ThemeExtras {
  const badge = /(אימון|מאמנ|פילאטיס|יוגה|כושר)/.test(text) ? 'אימון אישי'
    : industry?.category === 'pets' ? 'באהבה'
    : industry?.id === 'garage' ? 'שירות לרכב'
    : /(קליניק|רופא|פיזיותרפ|מטפל|טיפול)/.test(text) ? 'טיפול מקצועי'
    : /(מספר|ספר |ברבר|תספורת)/.test(text) ? 'במספרה שלנו'
    : 'שירות אישי';
  return {
    ribbon: 'בוחרים שירות, יום ושעה מתוך מה שבאמת פנוי',
    badge,
    promises: [{ icon: 'calendar', text: 'רק שעות פנויות' }, { icon: 'clock', text: 'משך לפי השירות' }, { icon: 'shield', text: 'בלי תשלום מראש' }],
    pattern: 'dots',
  };
}

const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];
/** [0,1,2,3,4] → "א׳–ה׳"; gaps are listed ("א׳, ג׳, ה׳"). */
export const weekdayRange = (days: number[]) =>
  days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1) ? `${DAY_SHORT[days[0]!]}–${DAY_SHORT[days[days.length - 1]!]}` : days.map((d) => DAY_SHORT[d]).join(', ');

/** Puts the rules the owner wrote onto the booking (versioned) and the intake (live). */
function applyRules(config: WorkflowConfig, r: PromptRules): Intake | undefined {
  const b = config.booking?.enabled ? config.booking : undefined;
  // Appointment hours already carry the days and times (engine/schedule).
  if (b && !b.schedule) {
    if (r.weekdays) {
      b.openWeekdays = r.weekdays;
      const date = config.steps.flatMap((s) => s.fields).find((f) => f.key === b.dateKey);
      if (date) date.helpText = `פעילות בימים ${weekdayRange(r.weekdays)}`;
    }
    if (r.slots) {
      b.slots = r.slots;
      const time = config.steps.flatMap((s) => s.fields).find((f) => f.key === b.timeKey);
      if (time) time.options = r.slots.map((t) => ({ id: newId('opt'), label: t, value: t }));
    }
  }
  if (b) {
    if (r.noticeHours) b.minNoticeHours = r.noticeHours;
    if (r.daysAhead) b.maxDaysAhead = r.daysAhead;
    if (r.perDay) b.maxPerDay = r.perDay;
  }
  const intake: Intake = {
    paused: false,
    onePerContact: Boolean(r.onePerContact),
    maxPerDay: b ? undefined : r.perDay,
    maxPerWeek: r.perWeek,
    closesOn: r.closesOn,
  };
  return intake.onePerContact || intake.maxPerDay || intake.maxPerWeek || intake.closesOn ? intake : undefined;
}

/* ---------- how the form works for this business ---------- */

interface Plan {
  flow: 'appointment' | 'table' | 'survey' | 'registration' | 'order' | 'form';
  base?: string;
}

const APPROVE_REPAIRS = /(יאשר|לאשר|ידחה|לאישור|אישור תיקונים|תיקונים מומלצים|פירוט תיקונים|כל תיקון)/;
const ORDER_WORDS = /(משלוח|משלוחים|לאיסוף|הזמנה לאיסוף|הזמנת אוכל|טייק|מגש|מגשי|הזמנת עוגות|עוגות|מאפים)/;
const GROUP_CLASS = /(הרשמ|נרשמ|קבוצתי|קבוצה|קבוצות|משתתפים|משתתפ)/;

function planFor(industry: Industry, text: string): Plan {
  const quote = QUOTE.test(text);
  switch (industry.id) {
    case 'survey':
      return { flow: 'survey' };
    case 'restaurant':
    case 'cafe':
      if (ORDER_WORDS.test(text) && !/(שולחן|שולחנות)/.test(text)) return /(מגש|מגשי)/.test(text) ? { flow: 'order', base: 'friday_trays' } : { flow: 'order' };
      return { flow: 'table' };
    case 'garage':
      return APPROVE_REPAIRS.test(text) ? { flow: 'form', base: 'garage_repairs' } : { flow: 'appointment' };
    case 'yoga':
    case 'trainer':
      return GROUP_CLASS.test(text) ? { flow: 'registration' } : { flow: 'appointment' };
    case 'cosmetics':
      return /(כלה|כלות|חתונה)/.test(text) ? { flow: 'form', base: 'bridal_makeup' } : { flow: 'appointment' };
    case 'pet_care':
      return /(דוגווקר|הליכ|הוצאת כלבים|אילוף)/.test(text) ? { flow: 'appointment' } : { flow: 'form', base: 'dog_boarding' };
    case 'shop':
      return /(מארז|מתנ)/.test(text) ? { flow: 'form', base: 'gift_box' } : { flow: 'order' };
    case 'bakery':
      return /(מגש|עוגיות|חלות|לחם|מאפים|מארז)/.test(text) && !/(מעוצב|גודל|גדלים|טעם)/.test(text) ? { flow: 'order' } : { flow: 'form', base: 'custom_cake' };
    case 'accountant':
      return /(החזר מס|החזרי מס)/.test(text) ? { flow: 'form', base: 'tax_refund' } : { flow: 'form', base: 'document_collection' };
    case 'office':
      if (/(סוכנות|בריף|שיווק)/.test(text)) return { flow: 'form', base: 'agency_onboarding' };
      if (/ביטוח/.test(text) || quote) return { flow: 'form', base: 'quote_request' };
      return { flow: 'form', base: 'document_collection' };
    default:
      if (industry.flow === 'appointment' || industry.flow === 'table' || industry.flow === 'registration') return { flow: industry.flow };
      return { flow: 'form', base: (quote && industry.quoteBase) || industry.base || 'generic' };
  }
}

function buildBase(base: string): { config: WorkflowConfig; label: string; category?: string } {
  if (base in TEMPLATES) return { config: TEMPLATES[base as TemplateKey].build(), label: TEMPLATES[base as TemplateKey].label };
  const lib = templateById(base);
  if (lib) return { config: lib.build(), label: lib.title, category: lib.category };
  return { config: buildGeneric(), label: TEMPLATES.generic.label };
}

const REGISTRATION_SUBJECT = /(סדנת|סדנה|קורס|קורסי|חוג|חוגי|קייטנת|קייטנה|כנס|מרוץ|טורניר|תחרות|סיור|סיורי|שיעורי|וובינר|מיטאפ)\s+([^\s,.:;0-9]+(?:\s+[^\s,.:;0-9]+)?)/;
/** "סדנת קרמיקה" → "הרשמה לסדנת קרמיקה"; filler words after the noun are left out. */
function registrationTitle(prompt: string, industry: Industry): string {
  const m = prompt.replace(/[״"']/g, '').match(REGISTRATION_SUBJECT);
  if (m) {
    const words = m[2]!.split(/\s+/).filter((w, i) => !/^(ל|ב|עם|של|על|ה|ו|מ|בשבת|בשישי|לילדים|לנוער|לחובבים|למנהלי|למפתחים|לזוגות|לנשים|בגינה|בבית|אונליין|הרשמה|לגן|בזום)/.test(w) || (i === 0 && /^ל[א-ת]{3,}/.test(w) && false));
    const subject = [m[1], ...words.slice(0, 1)].join(' ');
    const title = `הרשמה ל${subject}`;
    if (title.length <= 30 && words.length) return title;
    return `הרשמה ל${m[1]}`;
  }
  return industry.title;
}

/** Registration prices and choices from the owner's words. */
function tailorRegistration(c: WorkflowConfig, prompt: string, intent: PromptIntent, items: PricedItem[], industry: Industry, t: Tailoring): Intake | undefined {
  const choice = allFields(c).find((f) => (f.type === 'radio' || f.type === 'select') && f.key.startsWith('track'));
  const named = items.filter((i) => i.name && !i.addon);
  const list = namedList(prompt);
  const capacity = typeof intent.capacity === 'number' ? intent.capacity : undefined;
  const nounLabel = industry.id === 'conference' ? 'סוג כרטיס' : industry.id === 'contest' ? 'בחירת מסלול' : industry.id === 'kids_class' ? 'בחירת חוג' : 'בחירת אפשרות';
  let priced = false;
  const firstStep = c.steps[0]!;
  const putChoice = (options: { label: string; price?: number }[], label: string) => {
    const opts = options.map((o, i) => ({ id: newId('opt'), value: `track_${i + 1}`, label: o.label, ...(o.price ? { price: o.price } : {}), ...(capacity ? { capacity } : {}) }));
    if (choice) {
      choice.options = opts;
      if (!choice.label.startsWith('בחירת') || industry.id === 'conference') choice.label = label;
    } else {
      const f = field('track', label, 'radio', { required: true, appearance: 'tiles', options: opts });
      const host = firstStep.fields.some((x) => x.type !== 'highlights') ? firstStep : firstStep;
      const at = host.fields.findIndex((x) => x.type !== 'highlights');
      host.fields.splice(at < 0 ? host.fields.length : at, 0, f);
    }
  };
  if (named.length >= 2) {
    putChoice(named.map((i) => ({ label: i.name, price: i.price })), nounLabel);
    priced = true;
    t.adjustments.push(`המחירים שכתבתם: ${named.map((i) => `${i.name} ${i.price} ₪`).join(', ')}`);
  } else if (list.items.length >= 2) {
    putChoice(list.items.map((label) => ({ label })), list.head ? `בחירת ${list.head}` : nounLabel);
    t.adjustments.push(`האפשרויות שכתבתם: ${list.items.join(', ')}`);
    t.notes.push('תיאורי האפשרויות לא נכתבו בתיאור. אפשר להוסיף אותם בסטודיו.');
  }
  const single = named.length === 1 ? named[0]! : items.length === 1 ? items[0]! : undefined;
  if (single && named.length < 2) {
    const target = allFields(c).find((f) => (f.type === 'radio' || f.type === 'select') && f.key.startsWith('track'));
    if (single.unit === 'person' && !target) {
      const g = guestsField(c) ?? field('participants', 'כמה משתתפים?', 'number', { required: true, min: 1, max: capacity ?? 10, appearance: 'stepper' });
      g.price = single.price;
      g.helpText = `${single.price} ₪ למשתתף`;
      if (!guestsField(c)) c.steps[0]!.fields.splice(c.steps[0]!.fields.findIndex((x) => x.type !== 'highlights') + 1 || 0, 0, g);
    } else if (target) {
      target.options?.forEach((o) => (o.price = single.price));
    } else {
      c.pricing.fees = [{ id: newId('fee'), label: 'דמי השתתפות', amount: single.price }];
    }
    priced = true;
    t.adjustments.push(`מחיר: ${single.price} ₪${single.unit === 'person' ? ' למשתתף' : ''}`);
  }
  if (priced) {
    // The composer's "no payment" line no longer holds once there is a price.
    t.adjustments.splice(0, t.adjustments.length, ...t.adjustments.filter((a) => !/^סיום:/.test(a)));
    c.pricing.enabled = true;
    c.pricing.totalLabel = 'דמי השתתפות';
    c.draftNotes = undefined;
    const p = intent.payment;
    if (p === 'none') c.completion = { mode: 'request' };
    else if (p === 'after_approval' || ((p === 'required' || p === null || p === 'optional') && intent.approval)) c.completion = { mode: 'pay_after_approval' };
    else if (p === 'required') c.completion = { mode: 'calculated' };
    else if (p !== 'deposit' && p !== 'quote') c.completion = { mode: 'calculated', allowPayLater: true };
  }
  // A limit without a choice to hold it is enforced on the whole form.
  const optionCaps = allFields(c).some((f) => f.options?.some((o) => o.capacity));
  const participants = allFields(c).find((f) => f.key === 'participants');
  if (capacity && !optionCaps && !participants) return { paused: false, onePerContact: false, maxTotal: capacity };
  return undefined;
}

/** Small adjustments a starting template needs for this kind of business. */
function adaptForIndustry(c: WorkflowConfig, industry: Industry, text: string, t: Tailoring) {
  const fs = allFields(c);
  const remove = (keys: string[]) => c.steps.forEach((s) => (s.fields = s.fields.filter((f) => !keys.includes(f.key))));
  const deposit = /מקדמ/.test(text);
  // Highlights state how the form works — never invented facts about the business.
  for (const f of fs.filter((x) => x.type === 'highlights')) {
    if (f.key === 'why_bloom') f.items = [highlight('בוחרים זר ותקציב', 'המחיר מתעדכן תוך כדי', 'leaf'), highlight('ברכה אישית', 'נכתבת על כרטיס', 'heart'), highlight('מועד משלוח', 'החנות מאשרת את המועד', 'truck')];
    if (f.key === 'event_why') f.items = [highlight('הערכת מחיר מיידית', 'לפי התפריט ומספר האורחים', 'star'), highlight('בלי חיוב בשליחה', 'הבקשה נבדקת קודם', 'shield'), ...(deposit ? [highlight('מקדמה רק אחרי אישור', undefined, 'check')] : [highlight('תאריך נשמר באישור', undefined, 'calendar')])];
    if (f.key === 'booking_notes' && !c.booking?.schedule) {
      const max = guestsField(c)?.max;
      f.items = [highlight('בקשה — לא הזמנה סופית', 'המסעדה מאשרת כל בקשה', 'calendar'), ...(max ? [highlight(`עד ${max} סועדים`, 'לקבוצות גדולות — צרו קשר', 'chef')] : []), highlight(deposit ? 'מקדמה בתיאום' : 'ללא תשלום מראש', deposit ? 'פרטי המקדמה נמסרים באישור' : 'לא נדרשים פרטי אשראי', 'shield')];
    }
  }
  if (industry.id === 'event_venue') {
    if (!/(תפריט|אוכל|מנה|מנות|קייטרינג)/.test(text)) remove(['menu', 'wine', 'dietary']);
    fs.filter((f) => f.key === 'extras').forEach((f) => (f.options = f.options?.filter((o) => o.value !== 'private_room')));
    c.title = industry.title;
    c.description = 'ספרו לנו על האירוע ונחזור עם זמינות והצעה מסודרת.';
    const step0 = c.steps[0];
    if (step0) step0.title = 'האירוע שלכם';
    const evt = fs.find((f) => f.key === 'event_type');
    if (evt) evt.options = [option('wedding', 'חתונה'), option('family', 'אירוע משפחתי'), option('business', 'אירוע עסקי'), option('other', 'אחר')];
    c.steps = c.steps.filter((s) => s.fields.length);
  }
  if (industry.id === 'wedding') {
    const g = fs.find((f) => f.key === 'guests');
    if (g && g.type === 'select') Object.assign(g, { type: 'number', options: undefined, min: 20, max: 1500, appearance: 'stepper', label: 'מספר אורחים משוער' });
  }
  // The sample appliance list only fits appliance repair; the owner's own list always stays.
  const device = fs.find((f) => f.key === 'device');
  if (industry.id === 'technician' && device?.options?.some((o) => o.value === 'ac') && !/(מזגן|מזגנים|דוד|כביסה|מקרר|תנור|מדיח)/.test(text)) remove(['device']);
  if (c.title === TEMPLATES.quote_request.build().title || fs.some((f) => f.key === 'service' && f.options?.some((o) => o.value === 'install'))) {
    const svc = fs.find((f) => f.key === 'service' && f.options?.some((o) => o.value === 'install'));
    if (svc) {
      if (industry.services?.length) {
        svc.options = industry.services.map((s, i) => option(`job_${i + 1}`, s));
        svc.label = industry.id === 'contractor' ? 'סוג העבודה' : 'במה מדובר?';
        t.notes.push(`האפשרויות ב"${svc.label}" הן לדוגמה. עדכנו אותן לשירותים שלכם.`);
      } else remove(['service']);
    }
  }
}

/** Choice lists that describe what the business sells (flavours, packages, menus) and came from a template, not the owner. */
const CATALOG_KEYS = /^(flavor|tier_flavor|menu|box|trays|product|unit|tour|device|areas|package|cohort|weeks|class|ticket|session|style|bouquet_style|topic|area|type|subject|services|goals|channels|property)$/;
function flagSampleChoices(c: WorkflowConfig, t: Tailoring) {
  const own = /^(item_|opt_|addon_|a\d|track_|service_|job_)/;
  const labels = allFields(c)
    .filter((f) => CATALOG_KEYS.test(f.key) && (f.options?.length ?? 0) >= 2 && !f.options!.some((o) => own.test(o.value)))
    .map((f) => `"${f.label.replace(/[?:]$/, '')}"`);
  if (labels.length) t.notes.push(`האפשרויות ב${labels.slice(0, 3).join(', ')} הן הצעה לדוגמה. התאימו אותן למה שאתם מציעים לפני הפרסום.`);
}

/* ---------- the generator ---------- */

function legacyGenerate(prompt: string, forcedTemplate: TemplateKey | undefined): GenerationResult {
  const text = normalizeHebrew(prompt);
  const detected = detectTemplate(prompt);
  const intent = analyzePrompt(prompt);
  const compose = !forcedTemplate && shouldCompose(intent);
  let key = forcedTemplate ?? (compose ? 'generic' : detected.key);
  if (!forcedTemplate && key === 'quote_request' && /אירוע/.test(text)) key = 'restaurant_event';
  const t: Tailoring = { adjustments: [], notes: [] };
  let config: WorkflowConfig;
  if (compose) {
    const composed = composeWorkflow(intent, titleFromPrompt(prompt));
    config = composed.config;
    t.adjustments.push(...composed.adjustments);
    t.notes.push(...composed.notes);
  } else {
    config = key === 'generic' ? buildGeneric(titleFromPrompt(prompt)) : TEMPLATES[key].build();
    if (key === 'generic') t.adjustments.push('לא זוהה תחום מוכר — נוצר טופס בסיסי לעריכה');
    config = applyModifiers(config, text, t.adjustments);
  }
  return finish({ prompt, intent, config, t, key, label: compose ? 'הורכב מאבני בניין' : TEMPLATES[key].label, composed: compose, industry: null, detected, forced: Boolean(forcedTemplate) });
}

export function generateWorkflowFromPrompt(prompt: string, forcedTemplate?: TemplateKey): GenerationResult {
  if (forcedTemplate) return legacyGenerate(prompt, forcedTemplate);
  const canon = canonical(prompt);
  const match = detectIndustry(canon);
  if (!match) return legacyGenerate(prompt, undefined);
  const industry = match.industry;
  const text = normalizeHebrew(prompt);
  const intent = analyzePrompt(prompt);
  const items = pricedItems(prompt);
  const plan = planFor(industry, canon);
  const t: Tailoring = { adjustments: [], notes: [] };
  let config: WorkflowConfig;
  let key: string;
  let label: string;
  let composed = false;
  let intake: Intake | undefined;

  if (plan.flow === 'survey' || plan.flow === 'registration') {
    const adjusted: PromptIntent = {
      ...intent,
      purpose: plan.flow === 'survey' ? 'survey' : 'registration',
      subject: intent.subject ?? (plan.flow === 'registration' ? industry.label : null),
      audience: { ...intent.audience, minors: intent.audience.minors || industry.id === 'kids_class' || industry.id === 'camp' },
    };
    const built = composeWorkflow(adjusted, industry.title);
    config = built.config;
    t.adjustments.push(...built.adjustments);
    t.notes.push(...built.notes);
    if (plan.flow === 'registration') {
      config.title = registrationTitle(prompt, industry);
      intake = tailorRegistration(config, prompt, adjusted, items, industry, t);
      if (items.length) t.notes.splice(0, t.notes.length, ...t.notes.filter((n) => !/לדוגמה. עדכנו אותם לפני הפרסום|התבקש תשלום/.test(n)));
      if (intake?.maxTotal) {
        t.notes.splice(0, t.notes.length, ...t.notes.filter((n) => !/אינה נאכפת/.test(n)));
        t.adjustments.push(`עד ${intake.maxTotal} נרשמים לטופס כולו`);
      }
    } else config.title = /משוב/.test(text) && !/שביעות/.test(text) ? 'משוב' : industry.title;
    key = 'generic';
    label = plan.flow === 'survey' ? 'סקר ומשוב' : `הרשמה · ${industry.label}`;
    composed = true;
    intent.purpose = adjusted.purpose;
  } else if (plan.flow === 'appointment') {
    config = toAppointments(TEMPLATES.table_booking.build(), industry.title, text, prompt, industry, items, t);
    key = 'table_booking';
    label = `קביעת תור · ${industry.label}`;
  } else if (plan.flow === 'table') {
    config = TEMPLATES.table_booking.build();
    config.title = industry.id === 'cafe' ? 'הזמנת מקום בבית הקפה' : industry.title;
    key = 'table_booking';
    label = `הזמנת שולחן · ${industry.label}`;
    const r = peopleRange(prompt);
    if (r.perPlace && config.booking) {
      config.booking.capacityPerSlot = r.perPlace;
      t.adjustments.push(`עד ${r.perPlace} סועדים בכל מועד`);
    }
  } else if (plan.flow === 'order') {
    if (plan.base) {
      const built = buildBase(plan.base);
      config = built.config;
      key = plan.base;
      label = built.label;
    } else {
      const titles: Partial<Record<IndustryId, string>> = { restaurant: /משלוח/.test(text) ? 'הזמנת משלוח' : 'הזמנה לאיסוף', cafe: 'הזמנה מבית הקפה', bakery: 'הזמנת מאפים ועוגות', shop: 'הזמנה מהחנות' };
      config = productOrder({ title: titles[industry.id] ?? industry.title, description: 'בוחרים, מוסיפים הערות — ונאשר את ההזמנה.', items, text, deliveryWords: /(משלוח|איסוף)/.test(text), itemsLabel: industry.itemsLabel });
      key = 'generic';
      label = `הזמנה · ${industry.label}`;
      const listed = items.filter((i) => i.name);
      if (listed.length) t.adjustments.push(`המחירים שכתבתם: ${listed.map((i) => `${i.name} ${i.price} ₪`).join(', ')}`);
    }
  } else {
    const built = buildBase(plan.base ?? 'generic');
    config = built.config;
    key = plan.base ?? 'generic';
    label = built.label;
    if (industry.title && plan.base !== 'garage_repairs' && plan.base !== 'generic') config.title = /הצעת מחיר|הצעה/.test(text) && plan.base === industry.quoteBase ? `הצעת מחיר · ${industry.label}`.slice(0, 30) : config.title;
    if (plan.base === 'generic') config.title = titleFromPrompt(prompt);
  }

  if (plan.flow !== 'survey') {
    if (plan.flow !== 'registration' && plan.flow !== 'appointment') {
      const catalog = plan.flow === 'order' && !plan.base;
      if (!catalog) applyItems(config, items, industry, t);
      applyNamedOptions(config, namedList(prompt), t);
    }
    if (plan.flow !== 'registration') config = applyModifiers(config, text, t.adjustments);
    adaptForIndustry(config, industry, text, t);
    if (plan.flow === 'form' && plan.base === 'restaurant_event' && QUOTE.test(text) && industry.id === 'restaurant_event') {
      config.title = 'בקשת הצעה לאירוע פרטי';
      config.pricing.totalLabel = 'הערכת מחיר';
      if (config.completion?.mode !== 'deposit') {
        config.completion = { mode: 'quote' };
        t.adjustments.push('סיום: הערכת מחיר — העסק שולח הצעה סופית');
      }
    }
    applyDelivery(config, prompt, t);
    applyPeople(config, prompt, t, { addIfMissing: (plan.flow === 'form' || (plan.flow === 'registration' && peopleRange(prompt).min !== undefined && peopleRange(prompt).max !== undefined)) && /(אורחים|סועדים|משתתפים|אנשים|איש|ילדים|מוזמנים)/.test(text) && !/עד \d+ (?:תורים|בקשות)/.test(text), label: /ילדים/.test(text) ? 'מספר ילדים' : /סועד/.test(text) ? 'מספר סועדים' : /משתתפ|אנשים/.test(text) ? 'מספר משתתפים' : 'מספר אורחים' });
    applyRequestedFields(config, text, t);
    applyDeposit(config, prompt, intent.approval, t);
    if (intent.payment === 'deposit' && /(אופציונל|רשות|לא חובה)/.test(text) && config.completion?.mode === 'deposit') {
      t.notes.push('מקדמה אופציונלית: המקדמה מתבקשת רק אחרי אישור העסק. אם לא תרצו לבקש אותה, שנו את "סיום ותשלום" ל"הצעת מחיר".');
    }
    if (intent.payment === 'deposit' && config.completion?.mode !== 'deposit' && !t.notes.some((n) => /מקדמה/.test(n))) {
      t.notes.push('התבקשה מקדמה, אבל בתהליך אין חישוב מחיר שממנו אפשר לגזור אותה. הוסיפו מחירים לאפשרויות כדי לבקש מקדמה.');
    }
  }
  return finish({ prompt, intent, config, t, key, label, composed, industry, detected: { matched: match.matched, score: match.score }, intake });
}

interface FinishInput {
  prompt: string;
  intent: PromptIntent;
  config: WorkflowConfig;
  t: Tailoring;
  key: string;
  label: string;
  composed: boolean;
  industry: Industry | null;
  detected: { matched: string[]; score: number };
  intake?: Intake;
  forced?: boolean;
}

function finish({ prompt, intent, config, t, key, label, composed, industry, detected, intake: extraIntake, forced }: FinishInput): GenerationResult {
  const text = normalizeHebrew(prompt);
  for (const u of intent.unsupported) t.notes.push(`${u.requirement}: ${u.reason}`);
  const rules = readRules(prompt);
  const ruleIntake = applyRules(config, rules);
  const intake = ruleIntake || extraIntake ? { ...(ruleIntake ?? { paused: false, onePerContact: false }), ...(extraIntake?.maxTotal ? { maxTotal: extraIntake.maxTotal } : {}) } : undefined;
  if (config.booking?.schedule) {
    // Say what was understood about hours, lengths and staff instead of the generic slot line.
    const a = readAppointment(prompt);
    rules.understood = [...a.understood, ...rules.understood.filter((u) => !/^שעות:/.test(u) && !(a.days && /^ימי פעילות:/.test(u)))];
  }
  if (industry) applyDateWindow(config, rules.noticeHours, rules.daysAhead);
  // A price on the form is either an estimate or a request for payment, never "no amount".
  if (industry && config.pricing.enabled && config.completion?.mode === 'request' && intent.payment !== 'none' && !/(ללא תשלום|בלי תשלום|חינם|ללא עלות)/.test(text)) config.completion = { mode: 'quote' };
  if (industry) {
    flagSamples(config, prompt, t);
    flagSampleChoices(config, t);
  }
  const notes = [...new Set(t.notes)];
  config.draftNotes = notes.length ? notes.slice(0, 12).map((n) => n.slice(0, 300)) : undefined;
  config.steps = config.steps.filter((s) => s.fields.length);

  // Appointment flows (salon, clinic…) take their look from the business, not from the restaurant template.
  const appointment = key === 'table_booking' && Boolean(config.booking?.schedule);
  let theme: WorkflowTheme;
  let recommendation: ThemeRecommendation;
  if (industry && industry.id !== 'lead') {
    theme = buildTheme(industry.preset, { source: 'auto' });
    recommendation = { presetId: industry.preset, confidence: detected.score >= 5 ? 'high' : 'medium', matched: detected.matched, reason: `נבחר "${PRESETS[industry.preset].meta.nameHe}" לפי סוג העסק: ${industry.label}.` };
    theme.extras = appointment ? appointmentExtras(text, industry) : starterExtras(industry.category);
  } else {
    ({ theme, recommendation } = recommendTheme({ templateKey: appointment ? undefined : key, prompt, title: config.title }));
    if (appointment) theme.extras = appointmentExtras(text, null);
  }
  const capabilityScore = describeIntent(intent).length;
  const confidence: GenerationResult['confidence'] = forced
    ? 'high'
    : industry && industry.id !== 'lead'
      ? detected.score >= 5 || capabilityScore >= 3 ? 'high' : 'medium'
      : composed ? (capabilityScore >= 3 ? 'high' : 'medium') : detected.score >= 3 ? 'high' : detected.score >= 1 ? 'medium' : 'low';
  const id: IndustryId = industry?.id ?? 'lead';
  return {
    templateKey: key,
    templateLabel: label,
    confidence,
    matchedKeywords: forced ? [] : detected.matched,
    adjustments: [...new Set(t.adjustments)],
    composed,
    intent,
    industry: id,
    industryLabel: industry?.label ?? 'פנייה',
    detected: [...(industry && industry.id !== 'lead' ? [`סוג העסק: ${industry.label}`] : []), ...describeIntent(intent)],
    reviewNotes: notes,
    // Parse guarantees the generator can never emit an invalid workflow.
    config: WorkflowConfigSchema.parse(config),
    intake,
    understood: rules.understood,
    completionMode: config.completion?.mode ?? (config.pricing.enabled ? 'quote' : 'request'),
    theme,
    themeRecommendation: recommendation,
  };
}

export const EXAMPLE_PROMPTS = [
  'אני חנות פרחים ורוצה שלקוחות יזמינו זר עם תקציב, צבעים, ברכה ומשלוח',
  'מוסך שרוצה שהלקוח יאשר או ידחה כל תיקון ברכב ויראה את הסכום',
  'מסעדה שמקבלת בקשות לאירועים פרטיים עם מספר אורחים, תפריט ומקדמה',
  'משרד רואה חשבון שצריך לאסוף מסמכים מלקוחות חדשים',
  'קבלן שיפוצים שרוצה לקבל בקשות להצעת מחיר עם תמונות',
  'מסעדה שרוצה לקבל בקשות להזמנת שולחן עם תאריך, שעה ומספר סועדים',
  'תהליך הרשמה לתחרות עם שלושה מסלולים, הגבלת משתתפים, אישור הורה לקטינים ותשלום אופציונלי',
];

/** Labelled reference scenarios for the creation screen (each maps to a working, tested flow). */
export const PROMPT_EXAMPLES: { label: string; prompt: string }[] = [
  { label: 'מסעדה · הזמנת שולחן', prompt: 'מסעדה שרוצה לקבל הזמנות שולחן עם תאריך, שעה ומספר סועדים, בלי תשלום' },
  { label: 'פרחים · זר בהתאמה', prompt: 'חנות פרחים שהלקוח מעצב זר, בוחר צבעים וכרטיס ברכה, עם מחיר משלוח' },
  { label: 'מוסך · אישור תיקונים', prompt: 'מוסך שהלקוח יאשר או ידחה כל תיקון ויראה את הסכום, בלי תשלום באתר' },
  { label: 'תחרות · הרשמה', prompt: 'תהליך הרשמה לתחרות עם שלושה מסלולים, הגבלת משתתפים, אישור הורה לקטינים ותשלום אופציונלי' },
  { label: 'מספרה · קביעת תור', prompt: 'מספרה שרוצה שלקוחות יקבעו תור לתספורת או צבע' },
  { label: 'משרד · קליטת לקוח', prompt: 'חברה שרוצה לקלוט לקוח עסקי חדש ולאסוף מסמכים וחתימה על הסכם' },
  { label: 'אירוע · הצעת מחיר', prompt: 'הצעת מחיר לאירוע פרטי עם מספר אורחים, תפריט ומקדמה אופציונלית' },
];

