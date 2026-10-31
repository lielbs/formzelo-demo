/**
 * DEMO local composition — deterministic, NOT an AI model.
 *
 * `analyzePrompt` reads a Hebrew description into a structured intent
 * (purpose, audience, choice groups, capacity, approvals, payment, booking…).
 * `composeWorkflow` then assembles a workflow from small reusable blocks
 * instead of picking a single canned template. Requirements the demo cannot
 * implement safely are returned as review notes — never silently faked.
 */
import type { CompletionMode, WorkflowConfig, WorkflowField, WorkflowStep } from '../domain/schema';
import { normalizeHebrew, tokenStems } from './hebrew';
import { field, highlight, option, step } from './templates';

export type Purpose = 'registration' | 'survey' | 'order' | 'booking' | 'quote' | 'documents' | 'approval' | 'lead';
export type PaymentPreference = 'none' | 'optional' | 'required' | 'deposit' | 'after_approval' | 'quote';

export interface ChoiceGroup {
  /** Singular noun, e.g. "מסלול". */
  noun: string;
  count: number;
}

export interface PromptIntent {
  purpose: Purpose | null;
  /** Free-text subject (e.g. "תחרות"), used in titles. */
  subject: string | null;
  audience: { minors: boolean; businesses: boolean };
  choices: ChoiceGroup[];
  /** Participant limit: a number, or true when a limit is requested without a number. */
  capacity: number | true | null;
  parentalConsent: boolean;
  approval: boolean;
  payment: PaymentPreference | null;
  booking: { date: boolean; time: boolean };
  wantsFiles: boolean;
  wantsEmail: boolean;
  wantsAddress: boolean;
  /** Requirements the demo cannot implement safely or truthfully. */
  unsupported: { requirement: string; reason: string }[];
}

const NUMBER_WORDS: Record<string, number> = {
  שני: 2, שתי: 2, שניים: 2, שתיים: 2, זוג: 2,
  שלוש: 3, שלושה: 3,
  ארבע: 4, ארבעה: 4,
  חמש: 5, חמישה: 5,
  שש: 6, שישה: 6,
  שבע: 7, שבעה: 7,
  שמונה: 8,
};

/** Plural noun stem → singular label for the generated choice field. */
const CHOICE_NOUNS: [RegExp, string][] = [
  [/^מסלול/, 'מסלול'],
  [/^חביל/, 'חבילה'],
  [/^קטגורי/, 'קטגוריה'],
  [/^מקצ/, 'מקצה'],
  [/^(מועד|תאריכ)/, 'מועד'],
  [/^רמ(ות|ה)$/, 'רמה'],
  [/^סוג/, 'סוג'],
  [/^(אפשרו|אופצי)/, 'אפשרות'],
  [/^(סדנא|סדנאות)/, 'סדנה'],
  [/^קורס/, 'קורס'],
  [/^(כרטיס)/, 'כרטיס'],
  [/^(קבוצ|קבוצות)/, 'קבוצה'],
  [/^(שכב|גיל)/, 'קבוצת גיל'],
];

const HEBREW_ORDINALS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳'];

const PLURALS: Record<string, string> = {
  מסלול: 'מסלולים',
  חבילה: 'חבילות',
  קטגוריה: 'קטגוריות',
  מקצה: 'מקצים',
  מועד: 'מועדים',
  רמה: 'רמות',
  סוג: 'סוגים',
  אפשרות: 'אפשרויות',
  סדנה: 'סדנאות',
  קורס: 'קורסים',
  כרטיס: 'כרטיסים',
  קבוצה: 'קבוצות',
  'קבוצת גיל': 'קבוצות גיל',
};
export const pluralOf = (noun: string) => PLURALS[noun] ?? noun;

/** Neutral level descriptions for tiered choices; other nouns get none. */
const LEVELS = ['מתאים למתחילים ולמשפחות', 'למשתתפים עם ניסיון', 'לתחרותיים ולמקצוענים', 'רמה מתקדמת במיוחד'];
const TIERED = ['מסלול', 'רמה', 'קטגוריה', 'מקצה', 'קבוצה'];

const PURPOSES: [Purpose, RegExp][] = [
  ['registration', /(הרשמ|רישום|להירשם|נרשמ|תחרות|מרתון|טורניר|סדנ|קורס|כנס|חוג|מחנה|קייטנ|הרצא|וובינר|השתתפות|משתתפ)/],
  ['survey', /(סקר|משוב|חוות דעת|שביעות רצון)/],
  ['documents', /(מסמכ|טופס 106|העלאת קבצ)/],
  ['booking', /(הזמנת שולחן|קביעת תור|תורים|(^| )תור( |$)|שעות פנויות)/],
  ['quote', /(הצעת מחיר|הערכת עלות)/],
  ['order', /(הזמנ|לקנות|רכיש|משלוח)/],
  ['approval', /(לאשר|אישור|יאשר)/],
];

/** Stem (matched at a token start, after up to two prefix letters) → display noun. */
const SUBJECTS: [string, string][] = [
  ['תחרו', 'תחרות'],
  ['מרתון', 'מרתון'],
  ['טורניר', 'טורניר'],
  ['סדנ', 'סדנה'],
  ['קורס', 'קורס'],
  ['כנס', 'כנס'],
  ['חוג', 'חוג'],
  ['קייטנ', 'קייטנה'],
  ['הרצא', 'הרצאה'],
  ['וובינר', 'וובינר'],
  ['מחנה', 'מחנה'],
];

const UNSUPPORTED: [RegExp, string, string][] = [
  [/(sms|סמס|וואטסאפ|ווטסאפ|whatsapp|הודעה אוטומטית|הודעות אוטומטיות)/, 'שליחת SMS / WhatsApp אמיתית', 'בדמו ההודעות הן תצוגה מדומה בלבד. שליחה אמיתית דורשת ספק הודעות בצד שרת.'],
  [/(חתימה דיגיטלית|חתימה אלקטרונית|לחתום|חתימת)/, 'חתימה דיגיטלית מחייבת', 'נוסף אישור בתיבת סימון. חתימה מאומתת משפטית דורשת שירות חתימה חיצוני.'],
  [/(חשבונית|קבלה|קבלות)/, 'הפקת חשבונית או קבלה', 'הדמו אינו מפיק מסמכים חשבונאיים. חיבור למערכת כמו iCount או Morning מופיע כעתידי בלבד.'],
  [/(כרטיס אשראי|אשראי|סליקה|לסלוק|ביט |paybox|פייבוקס)/, 'גביית כסף אמיתית', 'כל התשלומים בדמו מדומים ואין שדות כרטיס. ספקי הסליקה מופיעים כקטלוג עתידי שאינו מחובר.'],
  [/(יומן גוגל|google calendar|סנכרון יומן|outlook|אאוטלוק)/, 'סנכרון ליומן חיצוני', 'הזמינות מחושבת מבקשות שנשמרו בדפדפן זה בלבד ואינה מסונכרנת ליומן.'],
  [/(תזכורת|תזכורות)/, 'תזכורות אוטומטיות', 'אין שליחת תזכורות בדמו; אפשר לראות הודעות מדומות בבקשה.'],
  [/(אזור אישי|התחברות|סיסמה|חשבון לקוח|משתמש וסיסמה)/, 'אזור אישי ללקוחות עם התחברות', 'הלקוח פועל דרך קישור אישי, בלי חשבון וסיסמה.'],
  [/(תעודת זהות|ת ז|מספר זהות)/, 'איסוף מספר תעודת זהות', 'לא נוסף שדה כזה: מידע מזהה רגיש דורש אחסון מאובטח בשרת. הוסיפו רק אם באמת נדרש.'],
  [/(בדיקת גיל|אימות גיל|אימות זהות)/, 'אימות גיל או זהות', 'הגיל מוצהר על ידי הממלא ולא מאומת.'],
];

function parseNumberToken(t: string): number | null {
  if (/^\d{1,4}$/.test(t)) return Number(t);
  const bare = t.replace(/^[ו]/, '');
  return NUMBER_WORDS[bare] ?? NUMBER_WORDS[t] ?? null;
}

function detectChoices(tokens: string[]): ChoiceGroup[] {
  const out: ChoiceGroup[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const n = parseNumberToken(tokens[i]!);
    if (!n || n < 2 || n > 8) continue;
    const noun = tokens[i + 1]!.replace(/^[ו]/, '');
    const match = CHOICE_NOUNS.find(([re]) => re.test(noun));
    if (match && !out.some((c) => c.noun === match[1])) out.push({ noun: match[1], count: n });
  }
  return out;
}

function detectCapacity(text: string): number | true | null {
  const n = text.match(/עד (\d{1,4}) (משתתפ|נרשמ|מקומות|איש|אנשים|ילדים|רוכבים|רצים)/) ?? text.match(/(\d{1,4}) (מקומות|משתתפים לכל|משתתפים בכל)/);
  if (n) return Number(n[1]);
  if (/(הגבלת משתתפ|הגבלת מקומות|מספר מקומות מוגבל|מכסת|מכסה|מקומות מוגבלים|הגבלה של משתתפ)/.test(text)) return true;
  return null;
}

function detectPayment(text: string): PaymentPreference | null {
  if (/(ללא תשלום|בלי תשלום|חינם|ללא עלות)/.test(text)) return 'none';
  if (/(תשלום אופציונלי|תשלום רשות|אפשרות לשלם|תשלום לא חובה|לשלם אם|אופציה לשלם)/.test(text)) return 'optional';
  if (/מקדמ/.test(text)) return 'deposit';
  if (/(הצעת מחיר|הערכת עלות)/.test(text)) return 'quote';
  if (/(תשלום|לשלם|ישלמו|דמי השתתפות|דמי הרשמה|עלות)/.test(text)) return /(אחרי אישור|לאחר אישור|אחרי שנאשר)/.test(text) ? 'after_approval' : 'required';
  return null;
}

export function analyzePrompt(prompt: string): PromptIntent {
  const text = normalizeHebrew(prompt);
  const tokens = text.split(' ').filter(Boolean);
  const purpose = PURPOSES.find(([, re]) => re.test(text))?.[0] ?? null;
  const subject = SUBJECTS.find(([stem]) => tokens.some((t) => tokenStems(t).some((x) => x.startsWith(stem))))?.[1] ?? null;
  const minors = /(קטינ|ילדים|ילד |נוער|בני נוער|תלמיד|גיל 1\d|מתחת לגיל 18|הורים|הורה)/.test(text);
  const parentalConsent = /(אישור הורה|אישור הורים|הסכמת הורה|הסכמת הורים|חתימת הורה|באישור הורה)/.test(text) || (minors && /(קטינ)/.test(text));
  // "אישור הורה" is a customer-side consent, not a business approval step.
  const approvalText = text.replace(/(אישור|הסכמת|חתימת) הור(ה|ים)/g, ' ');
  const approval = /(באישור|אישור העסק|אישור ידני|נאשר|לאשר|יאשר|ממתין לאישור|אחרי אישור|לאחר אישור|מאושר)/.test(approvalText);
  const unsupported = UNSUPPORTED.filter(([re]) => re.test(text)).map(([, requirement, reason]) => ({ requirement, reason }));
  return {
    purpose,
    subject,
    audience: { minors, businesses: /(חברות|עסקים|ארגונים|לקוחות עסקיים)/.test(text) },
    choices: detectChoices(tokens),
    capacity: detectCapacity(text),
    parentalConsent,
    approval,
    payment: detectPayment(text),
    booking: { date: /(תאריך|מועד|יום )/.test(text), time: /(שעה|שעות|תור)/.test(text) },
    wantsFiles: /(תמונ|צילומ|קובץ|קבצים|מסמכ|להעלות)/.test(text),
    wantsEmail: /(אימייל|מייל)/.test(text),
    wantsAddress: /כתובת/.test(text),
    unsupported,
  };
}

/** Prompts with a registration or survey purpose are composed from blocks rather than a domain template. */
export function shouldCompose(intent: PromptIntent): boolean {
  return intent.purpose === 'registration' || intent.purpose === 'survey';
}

/** Human-readable capability chips for the creation screen. */
export function describeIntent(intent: PromptIntent): string[] {
  const out: string[] = [];
  const purposeLabels: Record<Purpose, string> = {
    registration: 'הרשמה',
    survey: 'סקר / משוב',
    order: 'הזמנה',
    booking: 'הזמנת מקום / תור',
    quote: 'בקשה להצעת מחיר',
    documents: 'איסוף מסמכים',
    approval: 'אישור',
    lead: 'פנייה',
  };
  if (intent.purpose) out.push(`מטרה: ${purposeLabels[intent.purpose]}${intent.subject ? ` ל${intent.subject}` : ''}`);
  if (intent.audience.minors) out.push('קהל: כולל קטינים');
  if (intent.audience.businesses) out.push('קהל: עסקים');
  intent.choices.forEach((c) => out.push(`${c.count} ${pluralOf(c.noun)}`));
  if (intent.capacity) out.push(intent.capacity === true ? 'הגבלת משתתפים' : `עד ${intent.capacity} משתתפים`);
  if (intent.parentalConsent) out.push('אישור הורה לקטינים');
  if (intent.approval) out.push('אישור העסק לפני סיום');
  if (intent.booking.date) out.push('בחירת תאריך');
  if (intent.wantsFiles) out.push('העלאת קבצים');
  const pay: Record<PaymentPreference, string> = {
    none: 'ללא תשלום',
    optional: 'תשלום אופציונלי',
    required: 'תשלום',
    deposit: 'מקדמה',
    after_approval: 'תשלום אחרי אישור',
    quote: 'הצעת מחיר',
  };
  if (intent.payment) out.push(pay[intent.payment]);
  return out;
}

const SAMPLE_PRICES = [120, 180, 240, 300, 360, 420, 480, 540];

function choiceField(group: ChoiceGroup, index: number, priced: boolean, capacity: number | null): WorkflowField {
  const key = index === 0 ? 'track' : `choice_${index + 1}`;
  return field(key, group.noun === 'מסלול' ? 'בחירת מסלול' : `בחירת ${group.noun}`, 'radio', {
    required: true,
    appearance: 'tiles',
    options: Array.from({ length: group.count }, (_, i) =>
      option(`${key}_${i + 1}`, `${group.noun} ${HEBREW_ORDINALS[i]}`, {
        description: TIERED.includes(group.noun) && group.count <= LEVELS.length ? LEVELS[i] : undefined,
        ...(priced && index === 0 ? { price: SAMPLE_PRICES[i] } : {}),
        ...(capacity && index === 0 ? { capacity } : {}),
      }),
    ),
  });
}

function completionFor(payment: PaymentPreference | null, approval: boolean, priced: boolean): { mode: CompletionMode; extra?: object } {
  if (!priced) return { mode: 'request' };
  switch (payment) {
    case 'optional':
      return approval ? { mode: 'pay_after_approval' } : { mode: 'calculated', extra: { allowPayLater: true } };
    case 'deposit':
      return { mode: 'deposit', extra: { depositPercent: 20, depositTiming: approval ? 'after_approval' : 'on_submit' } };
    case 'after_approval':
      return { mode: 'pay_after_approval' };
    case 'required':
      return approval ? { mode: 'pay_after_approval' } : { mode: 'calculated' };
    case 'quote':
      return { mode: 'quote' };
    default:
      return { mode: 'request' };
  }
}

/** Assemble a registration / survey workflow from reusable blocks. */
export function composeWorkflow(intent: PromptIntent, title: string): { config: WorkflowConfig; adjustments: string[]; notes: string[] } {
  const adjustments: string[] = [];
  const notes: string[] = [];
  const isSurvey = intent.purpose === 'survey';
  const priced = !isSurvey && intent.payment !== null && intent.payment !== 'none' && intent.choices.length > 0;
  const capacity = typeof intent.capacity === 'number' ? intent.capacity : intent.capacity === true ? 30 : null;
  const subject = intent.subject ?? (isSurvey ? 'משוב' : 'הרשמה');
  const steps: WorkflowStep[] = [];

  if (isSurvey) {
    steps.push(
      step('איך היה?', [
        field('rating', 'דירוג כללי', 'radio', {
          required: true,
          appearance: 'chips',
          options: ['1', '2', '3', '4', '5'].map((v) => option(v, v)),
        }),
        field('liked', 'מה אהבתם במיוחד?', 'textarea'),
        field('improve', 'מה אפשר לשפר?', 'textarea'),
      ]),
    );
    adjustments.push('נבנה שלב דירוג ומשוב חופשי');
  } else {
    const intro: WorkflowField[] = [
      field('about', 'מה חשוב לדעת', 'highlights', {
        items: [
          highlight(`הרשמה ל${subject}`, 'כמה דקות, מכל מכשיר', 'sparkles'),
          ...(capacity ? [highlight('מספר המקומות מוגבל', `עד ${capacity} משתתפים לכל אפשרות`, 'clock')] : []),
          ...(intent.approval ? [highlight('אישור ידני', 'ההרשמה סופית אחרי אישור', 'check')] : []),
        ].slice(0, 3),
      }),
    ];
    intent.choices.forEach((g, i) => intro.push(choiceField(g, i, priced, capacity)));
    if (intent.choices.length) notes.push(`שמות ה${pluralOf(intent.choices[0]!.noun)} ותיאוריהם הם לדוגמה. עדכנו אותם בסטודיו.`);
    if (intent.choices.length) adjustments.push(`נוצר שדה בחירה עם ${intent.choices.map((c) => `${c.count} ${pluralOf(c.noun)}`).join(' ו-')}`);
    if (intent.booking.date) intro.push(field('preferred_date', 'תאריך מועדף', 'date', { min: 0, role: 'date' }));
    steps.push(step(intent.choices.length ? 'בחירת מסלול' : `פרטי ה${subject}`, intro, { description: priced ? 'המחיר מתעדכן לפי הבחירה.' : undefined }));
  }

  const participant: WorkflowField[] = [
    field('name', isSurvey ? 'שם (לא חובה)' : 'שם המשתתף/ת', 'text', { required: !isSurvey, role: 'customer_name' }),
  ];
  if (!isSurvey && (intent.audience.minors || intent.parentalConsent)) {
    participant.push(field('age', 'גיל המשתתף/ת', 'number', { required: true, min: 3, max: 99, helpText: 'מתחת לגיל 18 יתווסף שלב אישור הורה' }));
  }
  participant.push(field('phone', 'טלפון', 'phone', { required: !isSurvey, role: 'customer_phone' }));
  if (intent.wantsEmail || !isSurvey) participant.push(field('email', 'אימייל', 'email', { role: 'customer_email' }));
  if (intent.wantsAddress) participant.push(field('address', 'כתובת', 'text'));
  if (intent.wantsFiles) participant.push(field('attachments', 'קבצים מצורפים', 'file', { helpText: 'בדמו נשמר שם הקובץ בלבד' }));
  if (!isSurvey) participant.push(field('notes', 'הערות', 'textarea', { placeholder: 'משהו שחשוב שנדע?' }));
  steps.push(step(isSurvey ? 'פרטים (לא חובה)' : 'פרטי המשתתף/ת', participant));

  if (!isSurvey && (intent.audience.minors || intent.parentalConsent)) {
    steps.push(
      step(
        'אישור הורה',
        [
          field('parent_info', 'למה השלב הזה מופיע', 'info', { content: 'המשתתף/ת מתחת לגיל 18, ולכן נדרש אישור של הורה או אפוטרופוס.' }),
          field('parent_name', 'שם ההורה / האפוטרופוס', 'text', { required: true }),
          field('parent_phone', 'טלפון ההורה', 'phone', { required: true }),
          field('parent_consent', 'אני ההורה או האפוטרופוס ומאשר/ת את ההשתתפות', 'checkbox', { required: true }),
        ],
        { condition: { fieldKey: 'age', operator: 'lt', value: 18 }, description: 'מוצג רק למשתתפים מתחת לגיל 18.' },
      ),
    );
    adjustments.push('נוסף שלב "אישור הורה" שמופיע רק כשהגיל מתחת ל-18');
    notes.push('אישור ההורה מוצהר בתיבת סימון ואינו מאומת. לחתימה מחייבת דרוש שירות חתימה חיצוני.');
  }

  if (capacity) {
    if (intent.choices.length) {
      adjustments.push(`הוגבל מספר המשתתפים ל-${capacity} לכל ${intent.choices[0]!.noun}`);
      notes.push('מכסת המקומות נספרת מהרשמות שנשמרו בדפדפן זה בלבד. אין הבטחה מפני הרשמה כפולה ממכשירים שונים.');
    } else {
      notes.push(`הגבלת ${capacity} משתתפים מוצגת ללקוח אבל אינה נאכפת: אין שדה בחירה שאפשר להגביל. הוסיפו שדה בחירה עם מכסה בסטודיו.`);
    }
    if (intent.capacity === true) notes.push('לא צוין מספר מקומות — נקבעו 30 לכל אפשרות. עדכנו בסטודיו.');
  }
  if (priced) notes.push('המחירים במסלולים הם לדוגמה. עדכנו אותם לפני הפרסום.');
  if (!priced && intent.payment && intent.payment !== 'none' && !isSurvey) {
    notes.push('התבקש תשלום אבל לא זוהה על מה מחשבים מחיר. הוגדרה בקשה ללא תשלום — הוסיפו מחירים לשדה בחירה כדי להפעיל תשלום מדומה.');
  }

  const completion = completionFor(intent.payment, intent.approval, priced);
  if (completion.mode !== 'request') {
    const map: Partial<Record<CompletionMode, string>> = {
      calculated: 'סיום: תשלום מדומה של הסכום, עם אפשרות "לשלם אחר כך"',
      pay_after_approval: 'סיום: תשלום מדומה רק אחרי אישור העסק',
      deposit: 'סיום: מקדמה מדומה של 20%',
      quote: 'סיום: הערכת מחיר בלבד',
    };
    if (map[completion.mode]) adjustments.push(map[completion.mode]!);
  } else {
    adjustments.push(isSurvey ? 'סיום: שליחת משוב, ללא תשלום' : 'סיום: הרשמה כבקשה, ללא תשלום');
  }

  const config: WorkflowConfig = {
    // A clean product title beats echoing the request ("תיצור לי…").
    title: isSurvey ? title || 'משוב לקוחות' : intent.subject ? `הרשמה ל${subject}` : title || 'טופס הרשמה',
    description: isSurvey
      ? 'כמה שאלות קצרות. התשובות עוזרות לנו להשתפר.'
      : `${intent.choices.length ? `בוחרים ${intent.choices[0]!.noun}, ממלאים` : 'ממלאים'} פרטים${intent.audience.minors || intent.parentalConsent ? ' ומצרפים אישור הורה כשצריך' : ''}. ${intent.approval ? 'ההרשמה סופית לאחר אישור.' : 'כמה דקות, מכל מכשיר.'}`,
    mode: 'public',
    caseFields: [],
    steps,
    pricing: { enabled: priced, currency: 'ILS', fees: [], depositPercent: completion.mode === 'deposit' ? 20 : 0, totalLabel: 'דמי השתתפות' },
    branding: { primaryColor: '#E96B3D', logoText: 'העסק שלי' },
    consent: {
      required: !isSurvey,
      text: isSurvey ? 'אני מאשר/ת שימוש במשוב לשיפור השירות.' : 'קראתי את פרטי ההרשמה ואני מאשר/ת יצירת קשר. זהו דמו מקומי — לא מתבצע תשלום ולא נשלחת הודעה אמיתית.',
    },
    successMessage: isSurvey ? 'תודה! המשוב התקבל.' : intent.approval ? 'ההרשמה התקבלה וממתינה לאישור.' : 'ההרשמה התקבלה.',
    completion: { mode: completion.mode, ...(completion.extra ?? {}) },
    confirmation: isSurvey
      ? { title: 'תודה על המשוב' }
      : {
          title: intent.approval ? 'ההרשמה התקבלה — ממתינה לאישור' : 'נרשמתם בהצלחה',
          nextSteps: [
            intent.approval ? 'נבדוק את ההרשמה ונעדכן על אישור' : 'שמרו את מספר ההרשמה',
            ...(intent.parentalConsent || intent.audience.minors ? ['אם המשתתף/ת קטין/ה, ייתכן שניצור קשר עם ההורה'] : []),
            'בדמו ההודעות מדומות בלבד',
          ],
        },
    draftNotes: notes.length ? notes : undefined,
  };
  return { config, adjustments, notes };
}
