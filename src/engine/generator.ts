/**
 * DEMO local generation — deterministic Hebrew keyword matching.
 * This is NOT an AI model. It first reads the description into a structured
 * intent (engine/compose). Registration and survey requests are composed from
 * reusable blocks; domain requests start from the closest real template and
 * are then adjusted. Unsupported requirements become owner-only review notes.
 * The output is an ordinary, editable WorkflowConfig validated against the Zod schema.
 */
import { WorkflowConfigSchema, type WorkflowConfig } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { recommendTheme, type ThemeRecommendation } from '../theme/resolver';
import { newId } from '../lib/id';
import { analyzePrompt, composeWorkflow, describeIntent, shouldCompose, type PromptIntent } from './compose';
import { normalizeHebrew, tokenMatches } from './hebrew';
import { buildGeneric, field, TEMPLATES, type TemplateKey } from './templates';

export { normalizeHebrew };

const KEYWORDS: Record<Exclude<TemplateKey, 'generic'>, string[]> = {
  flower_order: ['פרח', 'זר', 'זרים', 'פלורי', 'משלוח פרחים', 'חנות פרחים', 'ורד', 'סידורי'],
  garage_repairs: ['מוסך', 'רכב', 'בלמים', 'רפידות', 'מכונאי', 'צמיגים', 'טיפול שנתי', 'מגבים', 'פילטר'],
  restaurant_event: ['מסעדה', 'אירוע פרטי', 'אירועים פרטיים', 'אירוע', 'אורחים', 'תפריט', 'קייטרינג', 'שף', 'ארוחה', 'בר מצווה', 'בת מצווה', 'יום הולדת'],
  table_booking: ['הזמנת שולחן', 'הזמנות שולחן', 'שולחנות', 'שולחן', 'קביעת תור', 'תור', 'תורים', 'מספרה', 'מניקור', 'קוסמטיקאית', 'פגישה', 'יומן', 'שעות פנויות', 'הזמנת מקום'],
  // Registration prompts are composed from blocks (engine/compose), so this template is chosen explicitly, not by keywords.
  contest_registration: [],
  document_collection: ['מסמכים', 'מסמך', 'טופס 106', 'רואה חשבון', 'הנהלת חשבונות', 'קליטת לקוח', 'אישורים', 'צילום', 'להעלות', 'העלאת'],
  quote_request: ['הצעת מחיר', 'הצעה', 'שיפוץ', 'התקנה', 'קבלן', 'אינסטלטור', 'חשמלאי', 'הערכת עלות', 'ביקור', 'עבודה'],
};

export interface GenerationResult {
  templateKey: TemplateKey;
  templateLabel: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  /** Human-readable list of what the local engine changed based on the prompt. */
  adjustments: string[];
  /** True when the workflow was assembled from blocks rather than a single template. */
  composed: boolean;
  intent: PromptIntent;
  /** Capability chips detected in the prompt. */
  detected: string[];
  /** Requirements that need the owner's review or are not supported in the demo (also stored as config.draftNotes). */
  reviewNotes: string[];
  config: WorkflowConfig;
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
  const firstSentence = clean.split(/[.!?\n]/)[0] ?? clean;
  return firstSentence.length > 42 ? `${firstSentence.slice(0, 40).trim()}…` : firstSentence || 'טופס חדש';
}

function applyModifiers(config: WorkflowConfig, text: string, adjustments: string[]): WorkflowConfig {
  const next = structuredClone(config);
  const lastStep = next.steps[next.steps.length - 1]!;
  const hasKey = (k: string) => next.steps.some((s) => s.fields.some((f) => f.key === k));

  if (/תמונ|צילומ/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'file'))) {
    lastStep.fields.push(field('photos', 'תמונות', 'file', { helpText: 'בדמו נשמר שם הקובץ בלבד' }));
    adjustments.push('נוסף שדה להעלאת תמונות (נשמר שם הקובץ בלבד)');
  }
  if (/מקדמ/.test(text) && next.pricing.enabled) {
    if (!next.pricing.depositPercent) next.pricing.depositPercent = 20;
    if (next.completion?.mode !== 'deposit') {
      next.completion = { mode: 'deposit', depositPercent: next.pricing.depositPercent, depositTiming: 'after_approval' };
      adjustments.push('סיום: מקדמה מדומה של 20% אחרי אישור העסק');
    }
  } else if (/ללא תשלום|בלי תשלום|חינם/.test(text)) {
    next.completion = { mode: 'request' };
    adjustments.push('סיום: בקשה בלבד, ללא תשלום');
  } else if (/הצעת מחיר|הצעה/.test(text) && next.completion?.mode !== 'quote') {
    next.completion = { mode: 'quote' };
    adjustments.push('סיום: הצעת מחיר — ללא גביית כסף');
  } else if (/תשלום|לשלם|ישלמו|תשלם/.test(text) && next.pricing.enabled) {
    next.completion = /אחרי אישור|לאחר אישור/.test(text) ? { mode: 'pay_after_approval' } : { mode: 'calculated', allowPayLater: true };
    adjustments.push(next.completion.mode === 'pay_after_approval' ? 'סיום: תשלום מדומה רק אחרי אישור' : 'סיום: תשלום מדומה של הסכום המחושב');
  }
  if (/משלוח/.test(text) && next.pricing.enabled && !next.pricing.fees.some((f) => f.label.includes('משלוח'))) {
    next.pricing.fees.push({ id: newId('fee'), label: 'משלוח', amount: 30 });
    adjustments.push('נוספה עלות משלוח של 30 ₪');
  }
  if (/אימייל|מייל/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'email'))) {
    lastStep.fields.push(field('email', 'אימייל', 'email', { role: 'customer_email' }));
    adjustments.push('נוסף שדה אימייל');
  }
  if (/כתובת/.test(text) && !hasKey('address')) {
    lastStep.fields.push(field('address', 'כתובת', 'text'));
    adjustments.push('נוסף שדה כתובת');
  }
  if (/תאריך|מועד/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'date'))) {
    lastStep.fields.push(field('requested_date', 'תאריך מבוקש', 'date', { min: 0, role: 'date' }));
    adjustments.push('נוסף שדה תאריך מבוקש');
  }
  return next;
}

const DAY_SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

/** Booking template re-worded for appointments (salon, clinic, studio…) instead of a restaurant table. */
/** Sample services per kind of appointment business; always flagged as placeholders. */
const SERVICES: [RegExp, string[]][] = [
  [/(מספר|ספר |תספורת|שיער)/, ['תספורת', 'צבע', 'פן ועיצוב']],
  [/(מניקור|פדיקור|ציפורנ|לק)/, ['מניקור', 'פדיקור', 'לק ג׳ל']],
  [/(קוסמטיק|טיפול פנים|איפור|ספא)/, ['טיפול פנים', 'איפור', 'הסרת שיער']],
  [/(קליניק|מרפא|רופא|פיזיותרפ|טיפול)/, ['פגישת היכרות', 'טיפול', 'ביקורת']],
  [/(יוע|עורך דין|רואה חשבון|משרד)/, ['פגישת ייעוץ', 'פגישת המשך']],
];

export function appointmentServices(text: string): string[] {
  return SERVICES.find(([re]) => re.test(text))?.[1] ?? ['פגישה ראשונה', 'פגישת המשך'];
}

function toAppointments(base: WorkflowConfig, title: string, text = ''): WorkflowConfig {
  const c = structuredClone(base);
  // Echoing the request ("מספרה שרוצה…") reads badly to customers; owners rename it in the studio.
  c.title = title.length <= 24 ? title || 'קביעת תור' : 'קביעת תור';
  c.description = 'בחרו יום ושעה. הבקשה נשמרת עד שהעסק מאשר אותה.';
  c.branding = { ...c.branding, logoText: 'העסק שלי' };
  const first = c.steps[0]!;
  first.title = 'מתי נוח לכם?';
  first.fields.splice(1, 0, field('service', 'איזה שירות?', 'radio', {
    required: true,
    appearance: 'chips',
    options: appointmentServices(text).map((label, i) => ({ id: newId('opt'), label, value: `service_${i + 1}` })),
  }));
  first.fields = first.fields
    .filter((f) => f.key !== 'seating')
    .map((f) => {
      if (f.key === 'booking_notes') {
        return { ...f, items: [{ id: newId('hl'), title: 'בקשה — לא תור סופי', text: 'העסק מאשר כל בקשה', icon: 'calendar' as const }, { id: newId('hl'), title: 'ללא תשלום מראש', text: 'לא נדרשים פרטי אשראי', icon: 'shield' as const }] };
      }
      if (f.key === 'booking_date') return { ...f, helpText: 'פעילות בימים א׳–ה׳' };
      if (f.key === 'booking_time') return { ...f, options: DAY_SLOTS.map((t) => ({ id: newId('opt'), label: t, value: t })) };
      if (f.key === 'party_size') return { ...f, label: 'מספר משתתפים', max: 4 };
      return f;
    });
  const second = c.steps[1]!;
  second.fields = second.fields.filter((f) => f.key !== 'occasion').map((f) => (f.key === 'requests' ? { ...f, label: 'הערות לעסק', placeholder: 'מה תרצו שנדע מראש?' } : f));
  c.consent = { required: true, text: 'ידוע לי שזו בקשה לתור ושהיא סופית רק לאחר אישור העסק. זהו דמו מקומי — לא מתבצע תשלום ולא נשלחת הודעה אמיתית.' };
  c.successMessage = 'הבקשה לתור נשלחה. זו עדיין בקשה — נעדכן ברגע שהעסק יאשר.';
  c.booking = { ...c.booking!, openWeekdays: [0, 1, 2, 3, 4], slots: DAY_SLOTS, capacityPerSlot: 1, capacityUnit: 'bookings' };
  c.confirmation = { title: 'הבקשה לתור התקבלה', nextSteps: ['העסק בודק את הזמינות', 'תקבלו עדכון על אישור או מועד חלופי (בדמו: הודעה מדומה)', 'התור סופי רק אחרי אישור'] };
  return c;
}

export function generateWorkflowFromPrompt(prompt: string, forcedTemplate?: TemplateKey): GenerationResult {
  const text = normalizeHebrew(prompt);
  const detected = detectTemplate(prompt);
  const intent = analyzePrompt(prompt);
  const compose = !forcedTemplate && shouldCompose(intent);
  let key = forcedTemplate ?? (compose ? 'generic' : detected.key);
  // "Quote for a private event" is an event request with a price estimate, not a generic contractor quote.
  if (!forcedTemplate && key === 'quote_request' && /אירוע/.test(text)) key = 'restaurant_event';
  const adjustments: string[] = [];
  const notes: string[] = [];

  let config: WorkflowConfig;
  if (compose) {
    const composed = composeWorkflow(intent, titleFromPrompt(prompt));
    config = composed.config;
    adjustments.push(...composed.adjustments);
    notes.push(...composed.notes);
  } else {
    config = key === 'generic' ? buildGeneric(titleFromPrompt(prompt)) : TEMPLATES[key].build();
    if (key === 'table_booking' && !/מסעד|שולחן|ארוח|קפה|בר /.test(text)) {
      config = toAppointments(config, titleFromPrompt(prompt), text);
      adjustments.push('הותאם לקביעת תור (לא מסעדה): בחירת שירות, שעות יום, ללא העדפת ישיבה');
      notes.push('רשימת השירותים היא לדוגמה. עדכנו אותה בסטודיו לפני הפרסום.');
    }
    if (key === 'generic') adjustments.push('לא זוהה תחום מוכר — נוצר טופס בסיסי לעריכה');
    config = applyModifiers(config, text, adjustments);
    if (key === 'restaurant_event' && /(הצעת מחיר|הצעה)/.test(text)) {
      config.title = 'בקשת הצעה לאירוע פרטי';
      config.pricing.totalLabel = 'הערכת מחיר';
      if (config.completion?.mode !== 'deposit') {
        config.completion = { mode: 'quote' };
        adjustments.push('סיום: הערכת מחיר — העסק שולח הצעה סופית');
      }
    }
    if (intent.payment === 'deposit' && /(אופציונל|רשות|לא חובה)/.test(text) && config.completion?.mode === 'deposit') {
      notes.push('מקדמה אופציונלית: בדמו המקדמה מתבקשת רק אחרי אישור העסק. אם לא תרצו לבקש אותה, שנו את "סיום ותשלום" ל"הצעת מחיר".');
    }
    if (intent.payment === 'deposit' && config.completion?.mode !== 'deposit') {
      notes.push('התבקשה מקדמה, אבל בתהליך אין חישוב מחיר שממנו אפשר לגזור אותה. הוסיפו מחירים לאפשרויות כדי להפעיל מקדמה מדומה.');
    }
  }
  for (const u of intent.unsupported) notes.push(`${u.requirement}: ${u.reason}`);
  config.draftNotes = notes.length ? notes.slice(0, 12) : undefined;

  // Appointment flows (salon, clinic…) take their look from the prompt, not from the restaurant template.
  const appointment = key === 'table_booking' && !/מסעד|שולחן|ארוח|קפה|בר /.test(text);
  const { theme, recommendation } = recommendTheme({ templateKey: appointment ? undefined : key, prompt, title: config.title });
  const capabilityScore = describeIntent(intent).length;
  const confidence = forcedTemplate ? 'high' : compose ? (capabilityScore >= 3 ? 'high' : 'medium') : detected.score >= 3 ? 'high' : detected.score >= 1 ? 'medium' : 'low';
  return {
    templateKey: key,
    templateLabel: compose ? 'הורכב מאבני בניין' : TEMPLATES[key].label,
    confidence,
    matchedKeywords: forcedTemplate ? [] : detected.matched,
    adjustments,
    composed: compose,
    intent,
    detected: describeIntent(intent),
    reviewNotes: notes,
    // Parse guarantees the generator can never emit an invalid workflow.
    config: WorkflowConfigSchema.parse(config),
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
