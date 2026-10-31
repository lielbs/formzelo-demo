/**
 * Template library: ready-made, fully editable workflows by business topic.
 * Every entry is plain WorkflowConfig data (schema-valid, checked by the
 * logic checker in tests) paired with the design that suits it.
 */
import type { Condition, WorkflowConfig, WorkflowField, WorkflowStep } from '../domain/schema';
import type { ThemePresetId } from '../domain/theme';
import { newId } from '../lib/id';
import { field, highlight, option as opt, step, TEMPLATES } from './templates';

export const TEMPLATE_CATEGORIES = [
  { id: 'beauty', label: 'יופי וטיפוח' },
  { id: 'health', label: 'בריאות וכושר' },
  { id: 'food', label: 'אוכל ואירוח' },
  { id: 'events', label: 'אירועים' },
  { id: 'professional', label: 'שירותים מקצועיים' },
  { id: 'home', label: 'בית ושיפוצים' },
  { id: 'auto', label: 'רכב' },
  { id: 'education', label: 'חינוך וילדים' },
  { id: 'retail', label: 'מתנות וקמעונאות' },
  { id: 'pets', label: 'חיות מחמד' },
  { id: 'travel', label: 'תיירות ולינה' },
  { id: 'community', label: 'קהילה וארגונים' },
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['id'];

export interface LibraryTemplate {
  id: string;
  category: TemplateCategory;
  title: string;
  description: string;
  preset: ThemePresetId;
  /** Extra search words. */
  tags?: string;
  build: () => WorkflowConfig;
}

// ---------- helpers ----------

const when = (fieldKey: string, operator: Condition['operator'], value?: string | number): Condition => ({ fieldKey, operator, value });
const times = (...t: string[]) => t.map((x) => opt(x, x));
const contact = (title = 'פרטי קשר', extra: WorkflowField[] = [], email = true): WorkflowStep =>
  step(title, [
    field('full_name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
    field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
    ...(email ? [field('email', 'אימייל', 'email', { role: 'customer_email' })] : []),
    ...extra,
  ]);
const fee = (label: string, amount: number, condition?: Condition) => ({ id: newId('fee'), label, amount, ...(condition ? { condition } : {}) });

interface Flow {
  title: string;
  description: string;
  steps: WorkflowStep[];
  priced?: boolean;
  fees?: ReturnType<typeof fee>[];
  totalLabel?: string;
  completion?: NonNullable<WorkflowConfig['completion']>['mode'];
  consent?: string;
  disclaimer?: string;
  success: string;
  doneTitle?: string;
  nextSteps?: string[];
}

function flow(f: Flow): WorkflowConfig {
  return {
    title: f.title,
    description: f.description,
    mode: 'public',
    caseFields: [],
    steps: f.steps,
    pricing: { enabled: Boolean(f.priced), currency: 'ILS', fees: f.fees ?? [], depositPercent: 0, totalLabel: f.totalLabel ?? 'הערכת מחיר' },
    branding: { primaryColor: '#E96B3D', logoText: 'העסק שלי' },
    consent: { required: Boolean(f.consent), text: f.consent ?? 'אני מאשר/ת יצירת קשר בנוגע לפנייה.' },
    ...(f.disclaimer ? { disclaimer: f.disclaimer } : {}),
    successMessage: f.success,
    completion: { mode: f.completion ?? (f.priced ? 'quote' : 'request') },
    confirmation: { ...(f.doneTitle ? { title: f.doneTitle } : {}), ...(f.nextSteps ? { nextSteps: f.nextSteps } : {}) },
  };
}

const why = (label: string, items: [string, string | undefined, Parameters<typeof highlight>[2]][]) => field('why', label, 'highlights', { items: items.map(([t, x, i]) => highlight(t, x, i)) });

// ---------- the library ----------

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  // ----- beauty -----
  {
    id: 'hair_salon',
    category: 'beauty',
    title: 'תור למספרה',
    description: 'בחירת שירות עם מחיר, מעצב/ת, תאריך ושעה — בקשה עד אישור הסלון.',
    preset: 'beauty_glam',
    tags: 'תספורת צבע פן',
    build: () =>
      flow({
        title: 'קביעת תור למספרה',
        description: 'בחרו שירות ומועד שנוח לכם. נאשר את התור בהודעה.',
        priced: true,
        steps: [
          step('השירות', [
            field('service', 'איזה שירות?', 'radio', {
              required: true,
              options: [opt('women_cut', 'תספורת אישה', { price: 180, description: 'כולל חפיפה ופן' }), opt('men_cut', 'תספורת גבר', { price: 90 }), opt('color', 'צבע שורש', { price: 260 }), opt('blowout', 'פן / החלקה', { price: 120 })],
            }),
            field('stylist', 'אצל מי?', 'select', { options: [opt('any', 'ללא העדפה'), opt('noa', 'נועה'), opt('dan', 'דן')] }),
            field('extras', 'תוספות', 'multiselect', { options: [opt('treatment', 'טיפול לחות', { price: 70 }), opt('toner', 'טונר', { price: 90 })] }),
          ]),
          step('מתי?', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 0, max: 45 }),
            field('time', 'שעה', 'time', { required: true, options: times('09:00', '11:00', '13:00', '15:00', '17:00', '19:00') }),
          ]),
          contact('פרטים', [field('notes', 'משהו שכדאי לדעת?', 'textarea', { placeholder: 'למשל: אורך השיער, צבע קודם' })], false),
        ],
        success: 'בקשת התור התקבלה. נאשר בהודעה בהקדם.',
        doneTitle: 'הבקשה לתור התקבלה',
        nextSteps: ['נבדוק זמינות ונאשר את התור', 'אפשר לבטל עד 24 שעות מראש'],
      }),
  },
  {
    id: 'nails_studio',
    category: 'beauty',
    title: 'לק ג׳ל ומניקור',
    description: 'טיפול, קישוטים, הסרה ומועד — עם מחיר מתעדכן.',
    preset: 'floral_boutique',
    tags: 'ציפורניים מניקור פדיקור',
    build: () =>
      flow({
        title: 'הזמנת טיפול ציפורניים',
        description: 'בחרו טיפול ותוספות, ונשריין לכם מקום.',
        priced: true,
        steps: [
          step('הטיפול', [
            field('treatment', 'טיפול', 'radio', { required: true, appearance: 'tiles', options: [opt('manicure', 'מניקור', { price: 90 }), opt('gel', 'לק ג׳ל', { price: 140, description: 'הכי מבוקש' }), opt('build', 'בניית ציפורניים', { price: 220 })] }),
            field('extras', 'תוספות', 'multiselect', { options: [opt('art', 'קישוט / ציור', { price: 20 }), opt('removal', 'הסרת לק קודם', { price: 30 }), opt('pedicure', 'פדיקור', { price: 120 })] }),
            field('shade', 'גוון מועדף', 'radio', { appearance: 'swatches', options: [opt('nude', 'ניוד', { swatch: '#E8C4B0' }), opt('red', 'אדום', { swatch: '#B3263A' }), opt('pink', 'ורוד', { swatch: '#F2A7C3' }), opt('mocha', 'מוקה', { swatch: '#7A5240' })] }),
          ]),
          step('מועד', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 0, max: 30 }),
            field('time', 'שעה', 'time', { required: true, options: times('10:00', '12:00', '14:00', '16:00', '18:00') }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'הבקשה התקבלה. נאשר את המועד בהודעה.',
      }),
  },
  {
    id: 'spa_treatment',
    category: 'beauty',
    title: 'טיפול ספא ועיסוי',
    description: 'סוג עיסוי, משך, עוצמת לחץ והצהרת בריאות לפני הגעה.',
    preset: 'spa_serenity',
    tags: 'עיסוי ספא טיפול פנים',
    build: () =>
      flow({
        title: 'הזמנת טיפול',
        description: 'רגע לעצמכם. בחרו טיפול ומועד, ונחזור לאישור.',
        priced: true,
        steps: [
          step('הטיפול', [
            why('מה מחכה לכם', [
              ['חדר שקט ומחומם', undefined, 'leaf'],
              ['מטפלים מוסמכים', undefined, 'shield'],
              ['תה ומנוחה אחרי', undefined, 'heart'],
            ]),
            field('treatment', 'בחרו טיפול', 'radio', { required: true, options: [opt('swedish', 'עיסוי שוודי · 60 דק׳', { price: 320 }), opt('deep', 'רקמות עמוק · 60 דק׳', { price: 380 }), opt('facial', 'טיפול פנים', { price: 290 }), opt('couple', 'עיסוי זוגי · 60 דק׳', { price: 640 })] }),
            field('pressure', 'עוצמת לחץ', 'radio', { appearance: 'chips', options: [opt('soft', 'עדין'), opt('medium', 'בינוני'), opt('strong', 'חזק')] }),
          ]),
          step('מועד ובריאות', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 1, max: 60 }),
            field('time', 'שעה', 'time', { required: true, options: times('10:00', '12:30', '15:00', '17:30', '20:00') }),
            field('health', 'יש מצב רפואי, הריון או רגישות שכדאי שנדע?', 'radio', { required: true, appearance: 'chips', options: [opt('no', 'לא'), opt('yes', 'כן')] }),
            field('health_details', 'ספרו לנו בקצרה', 'textarea', { condition: when('health', 'equals', 'yes') }),
          ]),
          contact(),
        ],
        consent: 'אני מצהיר/ה שהמידע שמסרתי נכון.',
        success: 'הבקשה התקבלה. נחזור אליכם לאישור המועד.',
      }),
  },
  {
    id: 'bridal_makeup',
    category: 'beauty',
    title: 'איפור כלות',
    description: 'תאריך האירוע, מיקום, מלוות, איפור ניסיון והצעת מחיר.',
    preset: 'wedding_elegance',
    tags: 'כלה איפור שיער',
    build: () =>
      flow({
        title: 'איפור ושיער לכלה',
        description: 'ספרי לנו על היום הגדול ונבנה יחד את החבילה.',
        priced: true,
        steps: [
          step('האירוע', [
            field('event_date', 'תאריך האירוע', 'date', { required: true, role: 'date', min: 14, max: 540 }),
            field('location', 'איפה מתארגנים?', 'radio', { required: true, options: [opt('studio', 'בסטודיו'), opt('home', 'בבית / במלון', { price: 250, description: 'תוספת הגעה' })] }),
            field('address', 'כתובת להגעה', 'text', { required: true, condition: when('location', 'equals', 'home') }),
          ]),
          step('החבילה', [
            field('package', 'חבילה', 'radio', { required: true, appearance: 'tiles', options: [opt('makeup', 'איפור כלה', { price: 1400 }), opt('full', 'איפור + שיער', { price: 2200, description: 'הבחירה הנפוצה' })] }),
            field('companions', 'מלוות לאיפור', 'number', { appearance: 'stepper', min: 0, max: 8, price: 250, helpText: '250 ₪ לכל מלווה' }),
            field('trial', 'איפור ניסיון לפני', 'checkbox', { price: 350 }),
          ]),
          contact('פרטים', [field('notes', 'השראה או בקשות מיוחדות', 'textarea')]),
        ],
        success: 'תודה! נחזור אלייך עם הצעה ובדיקת זמינות לתאריך.',
      }),
  },

  // ----- health -----
  {
    id: 'personal_training',
    category: 'health',
    title: 'אימון אישי',
    description: 'מטרה, ניסיון, ימים מועדפים וחבילת אימונים עם מחיר.',
    preset: 'fitness_energy',
    tags: 'כושר מאמן',
    build: () =>
      flow({
        title: 'מתחילים להתאמן',
        description: 'כמה שאלות קצרות ונבנה לכם תוכנית.',
        priced: true,
        steps: [
          step('המטרה', [
            field('goal', 'מה המטרה?', 'radio', { required: true, appearance: 'chips', options: [opt('fit', 'כושר כללי'), opt('weight', 'ירידה במשקל'), opt('strength', 'כוח ומסה'), opt('rehab', 'חזרה מפציעה')] }),
            field('level', 'ניסיון באימונים', 'radio', { required: true, options: [opt('new', 'מתחיל/ה'), opt('some', 'מתאמן/ת לפעמים'), opt('pro', 'מתאמן/ת קבוע')] }),
            field('days', 'ימים נוחים', 'multiselect', { options: [opt('sun', 'ראשון'), opt('mon', 'שני'), opt('tue', 'שלישי'), opt('wed', 'רביעי'), opt('thu', 'חמישי'), opt('fri', 'שישי')] }),
          ]),
          step('החבילה', [
            field('package', 'חבילה', 'radio', { required: true, appearance: 'tiles', options: [opt('single', 'אימון בודד', { price: 200 }), opt('p8', '8 אימונים', { price: 1400, description: '175 ₪ לאימון' }), opt('p12', '12 אימונים', { price: 1950, description: '162 ₪ לאימון' })] }),
            field('health_ok', 'אני בריא/ה ולא ידועה לי מגבלה רפואית לפעילות גופנית', 'checkbox', { required: true }),
          ]),
          contact(),
        ],
        success: 'מעולה! נחזור אליכם לתיאום אימון ראשון.',
      }),
  },
  {
    id: 'yoga_class',
    category: 'health',
    title: 'שיעור יוגה / פילאטיס',
    description: 'בחירת שיעור עם מקומות מוגבלים, רמה ושיעור ניסיון.',
    preset: 'eco_nature',
    tags: 'יוגה פילאטיס סטודיו',
    build: () =>
      flow({
        title: 'הרשמה לשיעור',
        description: 'בחרו שיעור ושמרו מקום על המזרן.',
        priced: true,
        steps: [
          step('השיעור', [
            field('class', 'איזה שיעור?', 'radio', { required: true, options: [opt('morning_flow', 'ויניאסה · ראשון 07:00', { price: 70, capacity: 14 }), opt('pilates', 'פילאטיס מכשירים · שלישי 19:00', { price: 110, capacity: 8 }), opt('yin', 'יין יוגה · חמישי 20:00', { price: 70, capacity: 16 })] }),
            field('level', 'רמה', 'radio', { appearance: 'chips', options: [opt('beginner', 'מתחילים'), opt('mid', 'ממשיכים')] }),
            field('first', 'זה השיעור הראשון שלי בסטודיו', 'checkbox'),
            field('mat', 'אצטרך מזרן', 'checkbox', { price: 10 }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'נרשמתם! נשלח תזכורת לפני השיעור.',
      }),
  },
  {
    id: 'clinic_appointment',
    category: 'health',
    title: 'תור לקליניקה',
    description: 'סיבת הפנייה, ביקור ראשון או המשך, קופת חולים ומועד מועדף.',
    preset: 'medical_care',
    tags: 'רופא פיזיותרפיה שיניים מרפאה',
    build: () =>
      flow({
        title: 'בקשה לתור',
        description: 'מלאו את הפרטים ונחזור לתיאום.',
        disclaimer: 'הטופס אינו מיועד למצבי חירום. במקרה דחוף פנו למוקד חירום.',
        steps: [
          step('הפנייה', [
            field('reason', 'סיבת הפנייה', 'select', { required: true, options: [opt('checkup', 'בדיקה כללית'), opt('pain', 'כאב / פציעה'), opt('followup', 'ביקור המשך'), opt('other', 'אחר')] }),
            field('visit', 'ביקור ראשון אצלנו?', 'radio', { required: true, appearance: 'chips', options: [opt('first', 'כן'), opt('returning', 'לא, כבר הייתי')] }),
            field('hmo', 'קופת חולים', 'select', { options: [opt('clalit', 'כללית'), opt('maccabi', 'מכבי'), opt('meuhedet', 'מאוחדת'), opt('leumit', 'לאומית'), opt('private', 'פרטי')] }),
            field('details', 'תיאור קצר', 'textarea', { max: 600 }),
          ]),
          step('מועד מועדף', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 1, max: 30 }),
            field('window', 'חלון זמן', 'radio', { appearance: 'chips', options: [opt('morning', 'בוקר'), opt('noon', 'צהריים'), opt('evening', 'ערב')] }),
          ]),
          contact('פרטי המטופל/ת', [field('id_last4', 'ארבע ספרות אחרונות של ת״ז (לזיהוי)', 'text', { max: 4 })]),
        ],
        consent: 'אני מאשר/ת שהמרפאה תחזור אליי בנוגע לפנייה.',
        success: 'הבקשה התקבלה. נחזור אליכם לתיאום התור.',
      }),
  },
  {
    id: 'nutrition_intake',
    category: 'health',
    title: 'שאלון היכרות לתזונה',
    description: 'מטרות, הרגלים, רגישויות ופורמט פגישה — לפני פגישה ראשונה.',
    preset: 'spa_serenity',
    tags: 'תזונאית דיאטנית',
    build: () =>
      flow({
        title: 'שאלון היכרות',
        description: 'כמה דקות שיעזרו לנו להתכונן לפגישה הראשונה.',
        steps: [
          step('המטרות', [
            field('goals', 'מה חשוב לכם?', 'multiselect', { required: true, options: [opt('weight', 'ירידה במשקל'), opt('energy', 'יותר אנרגיה'), opt('health', 'איזון רפואי'), opt('sport', 'תזונת ספורט'), opt('family', 'תזונה למשפחה')] }),
            field('diet', 'סגנון תזונה', 'radio', { appearance: 'chips', options: [opt('all', 'הכול'), opt('veg', 'צמחוני'), opt('vegan', 'טבעוני'), opt('kosher', 'כשר')] }),
            field('allergies', 'רגישויות או אלרגיות', 'textarea'),
          ]),
          step('הפגישה', [
            field('format', 'איך נוח לכם להיפגש?', 'radio', { required: true, appearance: 'chips', options: [opt('clinic', 'בקליניקה'), opt('zoom', 'בזום')] }),
            field('age', 'גיל', 'number', { min: 12, max: 100 }),
          ]),
          contact(),
        ],
        success: 'תודה! נחזור אליכם לתיאום הפגישה.',
      }),
  },

  // ----- food -----
  {
    id: 'table_booking',
    category: 'food',
    title: 'הזמנת שולחן',
    description: 'תאריך, שעה ומספר סועדים — בקשה עד אישור המסעדה.',
    preset: 'hospitality_premium',
    build: TEMPLATES.table_booking.build,
  },
  {
    id: 'restaurant_event',
    category: 'food',
    title: 'אירוע פרטי במסעדה',
    description: 'אורחים, תפריט לאורח, תוספות והערכת מחיר.',
    preset: 'hospitality_premium',
    build: TEMPLATES.restaurant_event.build,
  },
  {
    id: 'catering_order',
    category: 'food',
    title: 'הזמנת קייטרינג',
    description: 'סוג אירוע, מספר אורחים, תפריט לאורח ומשלוח — עם הערכת מחיר.',
    preset: 'cafe_bistro',
    tags: 'קייטרינג אוכל אירוע',
    build: () =>
      flow({
        title: 'הזמנת קייטרינג',
        description: 'ספרו לנו על האירוע ונחזור עם הצעה מסודרת.',
        priced: true,
        fees: [fee('משלוח והגשה', 350)],
        steps: [
          step('האירוע', [
            field('event_type', 'סוג האירוע', 'radio', { required: true, appearance: 'chips', options: [opt('family', 'משפחתי'), opt('business', 'עסקי'), opt('brit', 'ברית / בריתה'), opt('other', 'אחר')] }),
            field('company', 'שם החברה', 'text', { condition: when('event_type', 'equals', 'business') }),
            field('guests', 'מספר אורחים', 'number', { required: true, appearance: 'stepper', min: 15, max: 300 }),
            field('event_date', 'תאריך', 'date', { required: true, role: 'date', min: 5, max: 180 }),
          ]),
          step('התפריט', [
            field('menu', 'תפריט לאורח', 'radio', { required: true, multiplyByKey: 'guests', options: [opt('light', 'קל · כריכים, סלטים ומאפים', { price: 75 }), opt('classic', 'קלאסי · עיקריות ותוספות', { price: 120 }), opt('premium', 'פרימיום · מנות שף', { price: 170 })] }),
            field('desserts', 'שולחן קינוחים', 'checkbox', { price: 25, multiplyByKey: 'guests', helpText: '25 ₪ לאורח' }),
            field('diet', 'צרכים מיוחדים', 'multiselect', { options: [opt('vegan', 'טבעוני'), opt('gluten', 'ללא גלוטן'), opt('kosher', 'כשר למהדרין')] }),
          ]),
          contact('פרטים', [field('address', 'כתובת האירוע', 'text', { required: true, placeholder: 'רחוב, מספר, עיר' })]),
        ],
        success: 'קיבלנו! נחזור אליכם עם הצעת מחיר סופית.',
      }),
  },
  {
    id: 'custom_cake',
    category: 'food',
    title: 'הזמנת עוגה מעוצבת',
    description: 'גודל, טעם, כיתוב, איסוף או משלוח — עם מחיר מתעדכן.',
    preset: 'bakery_sweet',
    tags: 'עוגה קונדיטוריה יום הולדת',
    build: () =>
      flow({
        title: 'עוגה מעוצבת',
        description: 'בחרו גודל וטעם, ונעצב לכם עוגה לחגוג איתה.',
        priced: true,
        fees: [fee('משלוח', 45, when('delivery', 'equals', 'delivery'))],
        steps: [
          step('העוגה', [
            field('occasion', 'לאיזה אירוע?', 'radio', { appearance: 'chips', options: [opt('birthday', 'יום הולדת'), opt('wedding', 'חתונה'), opt('corporate', 'אירוע חברה'), opt('other', 'אחר')] }),
            field('size', 'גודל', 'radio', { required: true, appearance: 'tiles', options: [opt('s', 'עד 12 סועדים', { price: 280 }), opt('m', 'עד 20 סועדים', { price: 420, description: 'הכי פופולרי' }), opt('l', 'עד 30 סועדים', { price: 590 })] }),
            field('flavor', 'טעם', 'radio', { required: true, appearance: 'chips', options: [opt('vanilla', 'וניל ופירות'), opt('chocolate', 'שוקולד'), opt('lotus', 'לוטוס'), opt('carrot', 'גזר ואגוזים')] }),
            field('inscription', 'כיתוב על העוגה', 'text', { max: 40, placeholder: 'מזל טוב נועה!' }),
          ]),
          step('מסירה', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 3, max: 90 }),
            field('delivery', 'איסוף או משלוח?', 'radio', { required: true, options: [opt('pickup', 'איסוף עצמי'), opt('delivery', 'משלוח', { description: '45 ₪' })] }),
            field('address', 'כתובת למשלוח', 'text', { required: true, condition: when('delivery', 'equals', 'delivery') }),
            field('allergies', 'אלרגיות', 'text'),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'ההזמנה התקבלה! נאשר את העיצוב והמחיר בהודעה.',
      }),
  },
  {
    id: 'friday_trays',
    category: 'food',
    title: 'מגשי אירוח לשישי',
    description: 'בחירת מגשים, כמות ושעת איסוף.',
    preset: 'cafe_bistro',
    tags: 'מגשים שישי אירוח',
    build: () =>
      flow({
        title: 'מגשי אירוח',
        description: 'מזמינים עד יום חמישי בצהריים, אוספים ביום שישי.',
        priced: true,
        steps: [
          step('המגשים', [
            field('trays', 'אילו מגשים?', 'multiselect', { required: true, options: [opt('pastries', 'מאפים מלוחים', { price: 160 }), opt('sandwiches', 'כריכונים', { price: 190 }), opt('salads', 'סלטים טריים', { price: 140 }), opt('sweets', 'מתוקים', { price: 150 })] }),
            field('people', 'לכמה אנשים?', 'number', { appearance: 'stepper', min: 6, max: 60, helpText: 'מגש מתאים ל-8–10 אנשים' }),
          ]),
          step('איסוף', [field('pickup', 'שעת איסוף ביום שישי', 'time', { required: true, options: times('08:00', '09:30', '11:00', '12:30') })]),
          contact('פרטים', [], false),
        ],
        success: 'קיבלנו! נאשר את ההזמנה עד יום חמישי.',
      }),
  },
  {
    id: 'cooking_workshop',
    category: 'food',
    title: 'סדנת בישול / אפייה',
    description: 'מועדים עם מקומות מוגבלים, משתתפים ומחיר למשתתף.',
    preset: 'bakery_sweet',
    tags: 'סדנה בישול אפייה',
    build: () =>
      flow({
        title: 'הרשמה לסדנה',
        description: 'בוחרים מועד, מגיעים עם חברים, הולכים הביתה עם מתכונים.',
        priced: true,
        steps: [
          step('הסדנה', [
            field('participants', 'כמה משתתפים?', 'number', { required: true, appearance: 'stepper', min: 1, max: 6 }),
            field('session', 'מועד', 'radio', { required: true, multiplyByKey: 'participants', options: [opt('pasta', 'פסטה טרייה · יום ג׳ 19:00', { price: 280, capacity: 12 }), opt('bread', 'לחמי מחמצת · יום ו׳ 10:00', { price: 260, capacity: 10 }), opt('asian', 'מטבח אסייתי · יום ה׳ 19:30', { price: 300, capacity: 12 })] }),
            field('diet', 'הערות תזונתיות', 'text'),
          ]),
          contact(),
        ],
        success: 'נרשמתם! פרטי ההגעה יישלחו לפני הסדנה.',
      }),
  },

  // ----- events -----
  {
    id: 'wedding_inquiry',
    category: 'events',
    title: 'פנייה להפקת חתונה',
    description: 'תאריך, אורחים, תקציב, שירותים וסגנון — לפני פגישת היכרות.',
    preset: 'wedding_elegance',
    tags: 'חתונה הפקה אולם',
    build: () =>
      flow({
        title: 'בואו נכיר',
        description: 'ספרו לנו על החתונה שאתם מדמיינים.',
        steps: [
          step('החתונה', [
            field('date_known', 'יש כבר תאריך?', 'radio', { required: true, appearance: 'chips', options: [opt('yes', 'כן'), opt('season', 'רק עונה'), opt('no', 'עוד לא')] }),
            field('wedding_date', 'התאריך', 'date', { required: true, role: 'date', min: 30, max: 900, condition: when('date_known', 'equals', 'yes') }),
            field('guests', 'מספר אורחים משוער', 'select', { required: true, options: [opt('100', 'עד 100'), opt('250', '100–250'), opt('400', '250–400'), opt('more', 'מעל 400')] }),
            field('venue', 'יש מקום?', 'radio', { appearance: 'chips', options: [opt('booked', 'סגרנו'), opt('looking', 'מחפשים')] }),
          ]),
          step('הסגנון', [
            field('services', 'במה נוכל לעזור?', 'multiselect', { required: true, options: [opt('planning', 'תכנון והפקה מלאה'), opt('design', 'עיצוב והפקת אווירה'), opt('day', 'ניהול היום עצמו'), opt('vendors', 'התאמת ספקים')] }),
            field('style', 'הסגנון שלכם', 'radio', { appearance: 'chips', options: [opt('classic', 'קלאסי'), opt('boho', 'בוהו'), opt('modern', 'מודרני'), opt('garden', 'גן פתוח')] }),
            field('budget', 'תקציב כולל משוער', 'select', { options: [opt('b1', 'עד 120 אלף'), opt('b2', '120–200 אלף'), opt('b3', 'מעל 200 אלף')] }),
          ]),
          contact('פרטים', [field('story', 'משהו שחשוב לכם שנדע?', 'textarea')]),
        ],
        success: 'איזה כיף! נחזור אליכם לתיאום פגישת היכרות.',
      }),
  },
  {
    id: 'photographer_quote',
    category: 'events',
    title: 'הצעת מחיר לצילום אירוע',
    description: 'סוג אירוע, שעות צילום, אלבום וצלם נוסף.',
    preset: 'creative_studio',
    tags: 'צלם צילום אירוע',
    build: () =>
      flow({
        title: 'צילום האירוע שלכם',
        description: 'בנו את החבילה וקבלו הערכת מחיר מיד.',
        priced: true,
        steps: [
          step('האירוע', [
            field('event_type', 'סוג אירוע', 'radio', { required: true, appearance: 'chips', options: [opt('wedding', 'חתונה'), opt('bar', 'בר/בת מצווה'), opt('corporate', 'אירוע חברה'), opt('family', 'צילומי משפחה')] }),
            field('event_date', 'תאריך', 'date', { required: true, role: 'date', min: 7, max: 540 }),
          ]),
          step('החבילה', [
            field('hours', 'שעות צילום', 'number', { required: true, appearance: 'stepper', min: 2, max: 12, price: 450, helpText: '450 ₪ לשעה' }),
            field('album', 'אלבום מודפס', 'checkbox', { price: 900 }),
            field('second', 'צלם/ת נוסף/ת', 'checkbox', { price: 1200 }),
            field('video', 'וידאו קצר לרשתות', 'checkbox', { price: 800 }),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נחזור עם הצעה ובדיקת זמינות.',
      }),
  },
  {
    id: 'kids_birthday',
    category: 'events',
    title: 'מסיבת יום הולדת לילדים',
    description: 'גיל, מספר ילדים, חבילה, נושא ותוספות.',
    preset: 'kids_play',
    tags: 'יום הולדת ילדים מסיבה',
    build: () =>
      flow({
        title: 'מסיבת יום הולדת',
        description: 'בוחרים חבילה ונושא — אנחנו דואגים לכל השאר.',
        priced: true,
        steps: [
          step('החוגג/ת', [
            field('child_name', 'שם הילד/ה', 'text', { required: true }),
            field('age', 'בן/בת כמה?', 'number', { required: true, min: 2, max: 14 }),
            field('kids', 'מספר ילדים', 'number', { required: true, appearance: 'stepper', min: 8, max: 40 }),
          ]),
          step('המסיבה', [
            field('package', 'חבילה', 'radio', { required: true, appearance: 'tiles', options: [opt('basic', 'בסיסית · שעתיים', { price: 1200 }), opt('fun', 'כיף מלא · 2.5 שעות', { price: 1700, description: 'כולל הפעלה ופינוק' }), opt('wow', 'וואו · 3 שעות', { price: 2300 })] }),
            field('theme', 'נושא', 'radio', { appearance: 'chips', options: [opt('space', 'חלל'), opt('princess', 'נסיכות'), opt('science', 'מדע'), opt('sport', 'ספורט')] }),
            field('extras', 'תוספות', 'multiselect', { options: [opt('cake', 'עוגה מעוצבת', { price: 280 }), opt('balloons', 'קשת בלונים', { price: 350 }), opt('photo', 'צלם/ת', { price: 600 })] }),
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 7, max: 120 }),
          ]),
          contact('פרטי ההורה', [], false),
        ],
        success: 'איזה כיף! נחזור אליכם לאישור התאריך.',
      }),
  },
  {
    id: 'rsvp',
    category: 'events',
    title: 'אישור הגעה לאירוע',
    description: 'מגיעים או לא, כמה אורחים, העדפת מנה וברכה.',
    preset: 'celebration_party',
    tags: 'אישור הגעה RSVP',
    build: () =>
      flow({
        title: 'אישור הגעה',
        description: 'נשמח לדעת אם תגיעו.',
        steps: [
          step('מגיעים?', [
            field('attending', 'תגיעו?', 'radio', { required: true, appearance: 'chips', options: [opt('yes', 'בטח, נגיע'), opt('no', 'לצערנו לא')] }),
            field('guests', 'כמה תהיו?', 'number', { appearance: 'stepper', min: 1, max: 8, required: true, condition: when('attending', 'equals', 'yes') }),
            field('meal', 'העדפת מנה', 'radio', { appearance: 'chips', condition: when('attending', 'equals', 'yes'), options: [opt('meat', 'בשרי'), opt('veg', 'צמחוני'), opt('vegan', 'טבעוני'), opt('kids', 'מנת ילדים')] }),
            field('blessing', 'ברכה לבעלי השמחה', 'textarea', { appearance: 'card_preview' }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'תודה! התשובה שלכם נשמרה.',
        doneTitle: 'תודה על העדכון',
      }),
  },
  {
    id: 'event_registration',
    category: 'events',
    title: 'הרשמה לכנס / אירוע',
    description: 'סוג כרטיס עם מקומות, פרטי חברה לכרטיס עסקי והעדפות.',
    preset: 'tech_startup',
    tags: 'כנס הרשמה כרטיס וובינר',
    build: () =>
      flow({
        title: 'הרשמה לכנס',
        description: 'שמרו את המקום שלכם — מספר הכרטיסים מוגבל.',
        priced: true,
        steps: [
          step('הכרטיס', [
            field('ticket', 'סוג כרטיס', 'radio', { required: true, appearance: 'tiles', options: [opt('student', 'סטודנט/ית', { price: 90, capacity: 60 }), opt('regular', 'רגיל', { price: 240, capacity: 200 }), opt('business', 'עסקי + סדנאות', { price: 480, capacity: 40 })] }),
            field('company', 'שם החברה', 'text', { required: true, condition: when('ticket', 'equals', 'business') }),
            field('role_title', 'תפקיד', 'text'),
            field('tracks', 'מסלולים שמעניינים אותך', 'multiselect', { options: [opt('product', 'מוצר'), opt('ai', 'טכנולוגיה'), opt('growth', 'צמיחה ושיווק')] }),
          ]),
          contact(),
        ],
        success: 'נרשמת! הכרטיס יישלח במייל לפני האירוע.',
      }),
  },
  {
    id: 'vip_guestlist',
    category: 'events',
    title: 'רשימת אורחים לאירוע לילה',
    description: 'תאריך, מספר חברים, שולחן ואישור גיל.',
    preset: 'nightlife_neon',
    tags: 'מועדון בר מסיבה ליין',
    build: () =>
      flow({
        title: 'על הרשימה',
        description: 'שריינו מקום לליין הקרוב.',
        priced: true,
        steps: [
          step('הערב', [
            field('night', 'איזה ערב?', 'radio', { required: true, appearance: 'chips', options: [opt('thu', 'חמישי'), opt('fri', 'שישי'), opt('sat', 'מוצ״ש')] }),
            field('friends', 'כמה חברים מגיעים איתך?', 'number', { appearance: 'stepper', min: 0, max: 9 }),
            field('table', 'שריון שולחן (כולל בקבוק)', 'checkbox', { price: 900 }),
            field('age_ok', 'כל המגיעים מעל גיל 21', 'checkbox', { required: true }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'אתם על הרשימה! נשלח אישור לפני הערב.',
      }),
  },

  // ----- professional -----
  { id: 'quote_request', category: 'professional', title: 'בקשה להצעת מחיר', description: 'תיאור עבודה, דחיפות ופרטי קשר.', preset: 'corporate_modern', build: TEMPLATES.quote_request.build },
  { id: 'document_collection', category: 'professional', title: 'איסוף מסמכים', description: 'פרטים ומסמכים לפי סוג לקוח.', preset: 'corporate_modern', build: TEMPLATES.document_collection.build },
  {
    id: 'consultation_booking',
    category: 'professional',
    title: 'תיאום פגישת ייעוץ',
    description: 'נושא, פורמט פגישה, מועדים מועדפים ותיאור קצר.',
    preset: 'finance_clarity',
    tags: 'ייעוץ פגישה יועץ',
    build: () =>
      flow({
        title: 'פגישת ייעוץ',
        description: 'ספרו בקצרה במה מדובר ונקבע פגישה.',
        steps: [
          step('הנושא', [
            field('topic', 'במה נעזור?', 'select', { required: true, options: [opt('business', 'ייעוץ עסקי'), opt('finance', 'תכנון פיננסי'), opt('mortgage', 'משכנתא'), opt('other', 'אחר')] }),
            field('format', 'איך להיפגש?', 'radio', { required: true, appearance: 'chips', options: [opt('office', 'במשרד'), opt('zoom', 'בזום'), opt('phone', 'שיחת טלפון')] }),
            field('summary', 'תיאור קצר', 'textarea', { max: 800 }),
          ]),
          step('מועד', [
            field('date', 'תאריך מועדף', 'date', { required: true, role: 'date', min: 1, max: 45 }),
            field('window', 'שעות', 'radio', { appearance: 'chips', options: [opt('morning', 'בוקר'), opt('afternoon', 'אחר הצהריים'), opt('evening', 'ערב')] }),
          ]),
          contact(),
        ],
        success: 'הבקשה התקבלה. נחזור אליכם לקביעת הפגישה.',
      }),
  },
  {
    id: 'legal_intake',
    category: 'professional',
    title: 'פנייה ראשונית לעורך דין',
    description: 'תחום, דחיפות, תיאור ומסמכים — לפני שיחת היכרות.',
    preset: 'legal_trust',
    tags: 'עורך דין משפטי תביעה',
    build: () =>
      flow({
        title: 'פנייה ראשונית',
        description: 'הפרטים נשמרים בסודיות ומשמשים לבדיקת הפנייה בלבד.',
        disclaimer: 'מילוי הטופס אינו יוצר יחסי עורך דין–לקוח ואינו מהווה ייעוץ משפטי.',
        steps: [
          step('הפנייה', [
            field('area', 'תחום', 'select', { required: true, options: [opt('realestate', 'נדל״ן'), opt('family', 'דיני משפחה'), opt('labor', 'דיני עבודה'), opt('contracts', 'חוזים'), opt('other', 'אחר')] }),
            field('urgency', 'דחיפות', 'radio', { required: true, appearance: 'chips', options: [opt('regular', 'רגיל'), opt('soon', 'בימים הקרובים'), opt('deadline', 'יש מועד קרוב')] }),
            field('deadline', 'מה המועד?', 'date', { required: true, condition: when('urgency', 'equals', 'deadline'), min: 0, max: 365 }),
            field('description', 'תיאור הפנייה', 'textarea', { required: true, max: 1500 }),
            field('docs', 'יש מסמכים רלוונטיים', 'checkbox'),
            field('doc_file', 'צירוף מסמך', 'file', { condition: when('docs', 'isTrue') }),
          ]),
          contact(),
        ],
        consent: 'אני מאשר/ת שהמשרד יחזור אליי בנוגע לפנייה.',
        success: 'הפנייה התקבלה. נחזור אליכם לשיחת היכרות.',
      }),
  },
  {
    id: 'tax_refund',
    category: 'professional',
    title: 'בדיקת זכאות להחזר מס',
    description: 'שנים, מצבים מזכים ומסמכים — לבדיקה ראשונית.',
    preset: 'finance_clarity',
    tags: 'החזר מס רואה חשבון',
    build: () =>
      flow({
        title: 'בדיקת החזר מס',
        description: 'שתי דקות של שאלות ונבדוק אם מגיע לכם החזר.',
        steps: [
          step('השנים', [
            field('employment', 'מצב תעסוקתי', 'radio', { required: true, appearance: 'chips', options: [opt('employee', 'שכיר/ה'), opt('self', 'עצמאי/ת'), opt('both', 'גם וגם')] }),
            field('years', 'אילו שנים לבדוק?', 'multiselect', { required: true, options: ['2020', '2021', '2022', '2023', '2024', '2025'].map((y) => opt(`y${y}`, y)) }),
          ]),
          step('מה קרה בשנים האלה?', [
            field('events', 'סמנו מה שרלוונטי', 'multiselect', { options: [opt('jobs', 'החלפת מקום עבודה'), opt('gap', 'חודשים בלי עבודה'), opt('donations', 'תרומות'), opt('kids', 'לידה של ילד/ה'), opt('degree', 'סיום תואר'), opt('pension', 'הפקדות לפנסיה עצמאית')] }),
            field('form106', 'טופסי 106', 'file'),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נחזור אליכם עם תוצאות הבדיקה הראשונית.',
      }),
  },
  {
    id: 'agency_onboarding',
    category: 'professional',
    title: 'קליטת לקוח לסוכנות',
    description: 'פרטי עסק, מטרות, ערוצים, תקציב וחומרי מותג.',
    preset: 'tech_startup',
    tags: 'שיווק סוכנות קליטה לקוח חדש',
    build: () =>
      flow({
        title: 'נעים להכיר',
        description: 'כמה פרטים כדי שנתחיל לעבוד מהר ונכון.',
        steps: [
          step('העסק', [
            field('business_name', 'שם העסק', 'text', { required: true }),
            field('website', 'אתר / עמוד עסקי', 'text', { placeholder: 'https://' }),
            field('goals', 'מה המטרות?', 'multiselect', { required: true, options: [opt('leads', 'יותר פניות'), opt('brand', 'מודעות למותג'), opt('sales', 'מכירות אונליין'), opt('launch', 'השקה')] }),
          ]),
          step('הערוצים', [
            field('channels', 'ערוצים', 'multiselect', { options: [opt('social', 'רשתות חברתיות'), opt('search', 'קידום בגוגל'), opt('content', 'תוכן'), opt('email', 'דיוור')] }),
            field('budget', 'תקציב חודשי', 'select', { options: [opt('b1', 'עד 5,000 ₪'), opt('b2', '5,000–15,000 ₪'), opt('b3', 'מעל 15,000 ₪')] }),
            field('deadline', 'מתי תרצו להתחיל?', 'date', { min: 0, max: 180 }),
            field('brand_file', 'קובץ מותג', 'file'),
          ]),
          contact('איש/אשת קשר'),
        ],
        success: 'מעולה! נקבע פגישת התנעה בימים הקרובים.',
      }),
  },
  {
    id: 'property_viewing',
    category: 'professional',
    title: 'תיאום צפייה בנכס',
    description: 'נכס, קנייה או שכירות, מועד ואישור משכנתא.',
    preset: 'luxury_noir',
    tags: 'נדלן נכס דירה צפייה',
    build: () =>
      flow({
        title: 'תיאום צפייה',
        description: 'בחרו נכס ומועד ונתאם את הביקור.',
        steps: [
          step('הנכס', [
            field('property', 'איזה נכס?', 'radio', { required: true, appearance: 'list', options: [opt('penthouse', 'פנטהאוז · 5 חדרים', { description: 'קומה 12, נוף לים' }), opt('garden', 'דירת גן · 4 חדרים', { description: 'גינה פרטית 80 מ״ר' }), opt('loft', 'לופט · 3 חדרים', { description: 'מרכז העיר' })] }),
            field('intent', 'מטרה', 'radio', { required: true, appearance: 'chips', options: [opt('buy', 'קנייה'), opt('rent', 'שכירות')] }),
            field('mortgage', 'יש אישור עקרוני למשכנתא', 'checkbox', { condition: when('intent', 'equals', 'buy') }),
          ]),
          step('מועד', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 1, max: 30 }),
            field('time', 'שעה', 'time', { required: true, options: times('10:00', '12:00', '16:00', '18:00') }),
          ]),
          contact(),
        ],
        success: 'הבקשה התקבלה. נאשר את מועד הצפייה.',
      }),
  },

  // ----- home -----
  {
    id: 'technician_visit',
    category: 'home',
    title: 'הזמנת טכנאי',
    description: 'סוג המכשיר, תיאור התקלה, דחיפות, כתובת וחלון זמן.',
    preset: 'home_services',
    tags: 'טכנאי מזגן דוד תיקון',
    build: () =>
      flow({
        title: 'הזמנת טכנאי',
        description: 'ספרו מה קרה ונשלח טכנאי בהקדם.',
        priced: true,
        totalLabel: 'דמי ביקור',
        steps: [
          step('התקלה', [
            field('device', 'מה צריך לתקן?', 'radio', { required: true, appearance: 'tiles', options: [opt('ac', 'מזגן', { price: 250 }), opt('boiler', 'דוד / מים חמים', { price: 220 }), opt('washer', 'מכונת כביסה', { price: 230 }), opt('fridge', 'מקרר', { price: 240 })] }),
            field('issue', 'מה קורה?', 'textarea', { required: true, placeholder: 'למשל: המזגן מטפטף ולא מקרר' }),
            field('urgency', 'דחיפות', 'radio', { required: true, appearance: 'chips', options: [opt('normal', 'רגיל'), opt('today', 'היום אם אפשר')] }),
            field('photo', 'תמונה של התקלה', 'file'),
          ]),
          step('איפה ומתי', [
            field('address', 'כתובת', 'text', { required: true, placeholder: 'רחוב, מספר, עיר' }),
            field('window', 'חלון זמן', 'radio', { required: true, appearance: 'chips', options: [opt('8_12', '08:00–12:00'), opt('12_16', '12:00–16:00'), opt('16_20', '16:00–20:00')] }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'הקריאה נפתחה. הטכנאי יתקשר לפני ההגעה.',
      }),
  },
  {
    id: 'renovation_quote',
    category: 'home',
    title: 'הצעת מחיר לשיפוץ',
    description: 'אזורים לשיפוץ, גודל, תזמון, תקציב ותמונות.',
    preset: 'home_services',
    tags: 'שיפוץ קבלן',
    build: () =>
      flow({
        title: 'הצעת מחיר לשיפוץ',
        description: 'כמה פרטים ונגיע למדידה ולהצעה מסודרת.',
        steps: [
          step('מה משפצים?', [
            field('areas', 'אזורים', 'multiselect', { required: true, options: [opt('kitchen', 'מטבח'), opt('bath', 'חדרי רחצה'), opt('floors', 'ריצוף'), opt('paint', 'צבע'), opt('full', 'שיפוץ כללי')] }),
            field('size', 'גודל הדירה (מ״ר)', 'number', { min: 20, max: 600 }),
            field('timing', 'מתי להתחיל?', 'select', { options: [opt('now', 'בחודש הקרוב'), opt('soon', 'בעוד 1–3 חודשים'), opt('later', 'עוד לא יודעים')] }),
            field('budget', 'תקציב משוער', 'select', { options: [opt('b1', 'עד 50 אלף'), opt('b2', '50–150 אלף'), opt('b3', 'מעל 150 אלף')] }),
            field('photos', 'תמונות', 'file'),
          ]),
          contact('פרטים', [field('city', 'עיר', 'text', { required: true })]),
        ],
        success: 'קיבלנו! נחזור לתיאום מדידה.',
      }),
  },
  {
    id: 'home_cleaning',
    category: 'home',
    title: 'הזמנת ניקיון',
    description: 'סוג ניקיון, חדרים, תוספות ותדירות — עם מחיר.',
    preset: 'modern_minimal',
    tags: 'ניקיון עוזרת בית',
    build: () =>
      flow({
        title: 'הזמנת ניקיון',
        description: 'בוחרים סוג ניקיון ומועד, ואנחנו מגיעים.',
        priced: true,
        steps: [
          step('הניקיון', [
            field('type', 'סוג ניקיון', 'radio', { required: true, appearance: 'tiles', options: [opt('regular', 'שוטף', { price: 250 }), opt('deep', 'יסודי', { price: 450 }), opt('post', 'אחרי שיפוץ', { price: 750 })] }),
            field('rooms', 'מספר חדרים', 'number', { appearance: 'stepper', min: 1, max: 8 }),
            field('addons', 'תוספות', 'multiselect', { options: [opt('windows', 'חלונות', { price: 120 }), opt('fridge', 'פנים המקרר', { price: 60 }), opt('oven', 'תנור', { price: 80 }), opt('balcony', 'מרפסת', { price: 70 })] }),
            field('frequency', 'תדירות', 'radio', { appearance: 'chips', options: [opt('once', 'חד-פעמי'), opt('weekly', 'כל שבוע'), opt('biweekly', 'כל שבועיים')] }),
          ]),
          step('מועד וכתובת', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 1, max: 30 }),
            field('address', 'כתובת', 'text', { required: true }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'ההזמנה התקבלה. נאשר את המועד בהודעה.',
      }),
  },
  {
    id: 'moving_quote',
    category: 'home',
    title: 'הצעת מחיר להובלה',
    description: 'מאיפה, לאן, מתי, כמה חדרים, מעלית ואריזה.',
    preset: 'home_services',
    tags: 'הובלה מעבר דירה',
    build: () =>
      flow({
        title: 'הובלת דירה',
        description: 'מלאו פרטים וקבלו הצעה בלי התחייבות.',
        steps: [
          step('ההובלה', [
            field('from', 'מאיפה?', 'text', { required: true, placeholder: 'עיר ורחוב' }),
            field('from_floor', 'קומה במוצא', 'number', { min: 0, max: 40 }),
            field('from_elevator', 'יש מעלית במוצא', 'checkbox'),
            field('to', 'לאן?', 'text', { required: true }),
            field('to_floor', 'קומה ביעד', 'number', { min: 0, max: 40 }),
            field('to_elevator', 'יש מעלית ביעד', 'checkbox'),
          ]),
          step('הפרטים', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 2, max: 120 }),
            field('rooms', 'מספר חדרים', 'select', { required: true, options: [opt('2', 'עד 2'), opt('3', '3'), opt('4', '4'), opt('5', '5 ומעלה')] }),
            field('packing', 'שירות אריזה', 'checkbox'),
            field('special', 'פריטים מיוחדים (פסנתר, כספת…)', 'text'),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נחזור עם הצעת מחיר.',
      }),
  },
  {
    id: 'garden_service',
    category: 'home',
    title: 'גינון ותחזוקת גינה',
    description: 'גודל הגינה, שירותים, תדירות ותמונה.',
    preset: 'eco_nature',
    tags: 'גינון גנן גינה',
    build: () =>
      flow({
        title: 'גינון',
        description: 'ספרו לנו על הגינה ונחזור עם הצעה.',
        steps: [
          step('הגינה', [
            field('size', 'גודל הגינה', 'radio', { required: true, appearance: 'chips', options: [opt('s', 'קטנה'), opt('m', 'בינונית'), opt('l', 'גדולה')] }),
            field('services', 'שירותים', 'multiselect', { required: true, options: [opt('maintenance', 'תחזוקה שוטפת'), opt('irrigation', 'מערכת השקיה'), opt('planting', 'שתילה ועיצוב'), opt('pruning', 'גיזום עצים')] }),
            field('frequency', 'תדירות', 'radio', { appearance: 'chips', options: [opt('once', 'חד-פעמי'), opt('monthly', 'פעם בחודש'), opt('biweekly', 'פעמיים בחודש')] }),
            field('photo', 'תמונה של הגינה', 'file'),
          ]),
          contact('פרטים', [field('address', 'כתובת', 'text', { required: true })]),
        ],
        success: 'קיבלנו! נתאם ביקור להערכה.',
      }),
  },

  // ----- auto -----
  { id: 'garage_repairs', category: 'auto', title: 'אישור תיקונים במוסך', description: 'תיק לרכב, הלקוח מאשר או דוחה כל תיקון.', preset: 'automotive_precision', build: TEMPLATES.garage_repairs.build },
  {
    id: 'car_service',
    category: 'auto',
    title: 'קביעת טיפול לרכב',
    description: 'מספר רישוי, ק״מ, סוג טיפול, איסוף והחזרה ומועד.',
    preset: 'automotive_precision',
    tags: 'טיפול רכב מוסך',
    build: () =>
      flow({
        title: 'קביעת טיפול',
        description: 'בחרו טיפול ומועד, ונכין את העמדה.',
        priced: true,
        steps: [
          step('הרכב', [
            field('plate', 'מספר רישוי', 'text', { required: true, max: 10 }),
            field('km', 'קילומטראז׳', 'number', { min: 0, max: 900000 }),
            field('service', 'סוג טיפול', 'radio', { required: true, appearance: 'tiles', options: [opt('small', 'טיפול קטן', { price: 590 }), opt('big', 'טיפול גדול', { price: 1190 }), opt('winter', 'בדיקת חורף', { price: 150 })] }),
            field('pickup', 'איסוף והחזרה מהבית', 'checkbox', { price: 120 }),
            field('pickup_address', 'כתובת לאיסוף', 'text', { required: true, condition: when('pickup', 'isTrue') }),
          ]),
          step('מועד', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 1, max: 30 }),
            field('time', 'שעת הגעה', 'time', { required: true, options: times('07:30', '08:30', '10:00', '12:00') }),
          ]),
          contact('פרטים', [], false),
        ],
        success: 'הטיפול נקבע בכפוף לאישור. נעדכן בהודעה.',
      }),
  },

  // ----- education -----
  { id: 'contest_registration', category: 'education', title: 'הרשמה לתחרות / מרוץ', description: 'מסלולים עם מכסה, אישור הורה ותשלום אופציונלי.', preset: 'creative_studio', build: TEMPLATES.contest_registration.build },
  {
    id: 'class_signup',
    category: 'education',
    title: 'הרשמה לחוג',
    description: 'פרטי הילד/ה, חוג עם מקומות מוגבלים, יום ופרטי הורה.',
    preset: 'kids_play',
    tags: 'חוג ילדים הרשמה',
    build: () =>
      flow({
        title: 'הרשמה לחוג',
        description: 'בוחרים חוג ויום — מספר המקומות מוגבל.',
        priced: true,
        totalLabel: 'מחיר חודשי',
        steps: [
          step('הילד/ה', [
            field('child_name', 'שם הילד/ה', 'text', { required: true }),
            field('grade', 'כיתה', 'select', { required: true, options: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'].map((g, i) => opt(`g${i + 1}`, `כיתה ${g}׳`)) }),
          ]),
          step('החוג', [
            field('class', 'חוג', 'radio', { required: true, options: [opt('robotics', 'רובוטיקה', { price: 290, capacity: 12 }), opt('art', 'אמנות', { price: 240, capacity: 14 }), opt('dance', 'מחול', { price: 260, capacity: 16 })] }),
            field('day', 'יום', 'radio', { required: true, appearance: 'chips', options: [opt('sun', 'ראשון'), opt('tue', 'שלישי'), opt('thu', 'חמישי')] }),
            field('allergies', 'רגישויות או הערות', 'text'),
          ]),
          contact('פרטי ההורה'),
        ],
        consent: 'אני ההורה/האפוטרופוס ומאשר/ת את ההרשמה.',
        success: 'ההרשמה התקבלה! נשלח את פרטי הפתיחה.',
      }),
  },
  {
    id: 'private_lessons',
    category: 'education',
    title: 'שיעורים פרטיים',
    description: 'מקצוע, כיתה, פורמט וחבילת שיעורים עם מחיר.',
    preset: 'academy_learn',
    tags: 'מורה פרטי שיעור בגרות',
    build: () =>
      flow({
        title: 'שיעורים פרטיים',
        description: 'נתאים מורה למקצוע ולרמה.',
        priced: true,
        steps: [
          step('הלימוד', [
            field('subject', 'מקצוע', 'select', { required: true, options: [opt('math', 'מתמטיקה'), opt('english', 'אנגלית'), opt('physics', 'פיזיקה'), opt('hebrew', 'לשון'), opt('cs', 'מדעי המחשב')] }),
            field('grade', 'שכבה', 'radio', { required: true, appearance: 'chips', options: [opt('elementary', 'יסודי'), opt('middle', 'חטיבה'), opt('high', 'תיכון'), opt('uni', 'אקדמיה')] }),
            field('format', 'פורמט', 'radio', { appearance: 'chips', options: [opt('home', 'בבית'), opt('online', 'אונליין')] }),
            field('package', 'חבילה', 'radio', { required: true, appearance: 'tiles', options: [opt('single', 'שיעור בודד', { price: 160 }), opt('p5', '5 שיעורים', { price: 750 }), opt('p10', '10 שיעורים', { price: 1400 })] }),
            field('goal', 'מטרה', 'text', { placeholder: 'למשל: בגרות 5 יח״ל בעוד חודשיים' }),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נחזור עם התאמת מורה ומועד.',
      }),
  },
  {
    id: 'summer_camp',
    category: 'education',
    title: 'הרשמה לקייטנה',
    description: 'שבועות לבחירה, גיל, רגישויות, הקדמת שעה ואישור הורה.',
    preset: 'kids_play',
    tags: 'קייטנה קיץ ילדים',
    build: () =>
      flow({
        title: 'קייטנת קיץ',
        description: 'בוחרים שבועות — המחיר מתעדכן מיד.',
        priced: true,
        steps: [
          step('הילד/ה', [
            field('child_name', 'שם הילד/ה', 'text', { required: true }),
            field('age', 'גיל', 'number', { required: true, min: 4, max: 13 }),
            field('allergies', 'אלרגיות ורגישויות', 'textarea'),
          ]),
          step('השבועות', [
            field('weeks', 'אילו שבועות?', 'multiselect', { required: true, options: [opt('w1', 'שבוע 1 · 1–5 ביולי', { price: 850 }), opt('w2', 'שבוע 2 · 8–12 ביולי', { price: 850 }), opt('w3', 'שבוע 3 · 15–19 ביולי', { price: 850 }), opt('w4', 'שבוע 4 · 22–26 ביולי', { price: 850 })] }),
            field('early', 'הקדמה ל-07:30', 'checkbox', { price: 150 }),
            field('pickup_name', 'מי אוסף/ת?', 'text'),
          ]),
          contact('פרטי ההורה'),
        ],
        consent: 'אני ההורה/האפוטרופוס ומאשר/ת את השתתפות הילד/ה.',
        success: 'ההרשמה התקבלה! פרטים נוספים יישלחו לקראת הפתיחה.',
      }),
  },
  {
    id: 'course_enrollment',
    category: 'education',
    title: 'הרשמה לקורס',
    description: 'מחזור עם מקומות מוגבלים, רקע ומטרות.',
    preset: 'academy_learn',
    tags: 'קורס מחזור לימודים',
    build: () =>
      flow({
        title: 'הרשמה לקורס',
        description: 'בחרו מחזור — מספר המקומות בכל מחזור מוגבל.',
        priced: true,
        steps: [
          step('המחזור', [
            field('cohort', 'מחזור', 'radio', { required: true, options: [opt('morning', 'מחזור בוקר · א׳+ג׳', { price: 3900, capacity: 20 }), opt('evening', 'מחזור ערב · ב׳+ד׳', { price: 3900, capacity: 24 }), opt('online', 'אונליין בקצב אישי', { price: 2400 })] }),
            field('background', 'רקע קודם בתחום', 'radio', { appearance: 'chips', options: [opt('none', 'אין'), opt('some', 'קצת'), opt('lots', 'הרבה')] }),
            field('motivation', 'למה הקורס הזה?', 'textarea'),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נחזור לשיחת התאמה קצרה.',
      }),
  },

  // ----- retail -----
  { id: 'flower_order', category: 'retail', title: 'הזמנת זר פרחים', description: 'תקציב, צבעוניות, ברכה ומשלוח.', preset: 'floral_boutique', build: TEMPLATES.flower_order.build },
  {
    id: 'gift_box',
    category: 'retail',
    title: 'מארז מתנה',
    description: 'בחירת מארז, ברכה בכרטיס, תאריך ומשלוח לנמען.',
    preset: 'luxury_noir',
    tags: 'מארז מתנה שי',
    build: () =>
      flow({
        title: 'מארז מתנה',
        description: 'מתנה מוכנה עם ברכה אישית, עד הדלת.',
        priced: true,
        fees: [fee('משלוח', 35)],
        steps: [
          step('המארז', [
            field('box', 'בחרו מארז', 'radio', { required: true, appearance: 'tiles', options: [opt('classic', 'מארז קלאסי', { price: 220, image: 'gift' }), opt('wine', 'יין ופינוקים', { price: 340, image: 'wine' }), opt('gold', 'מארז זהב', { price: 520, image: 'gift', description: 'הכי מפנק' })] }),
            field('wrap', 'אריזה', 'radio', { appearance: 'chips', options: [opt('black', 'שחור וזהב'), opt('kraft', 'קראפט טבעי'), opt('white', 'לבן')] }),
            field('card', 'ברכה לכרטיס', 'textarea', { appearance: 'card_preview', max: 240 }),
          ]),
          step('משלוח', [
            field('recipient', 'שם הנמען/ת', 'text', { required: true }),
            field('address', 'כתובת', 'text', { required: true }),
            field('date', 'תאריך מסירה', 'date', { required: true, role: 'date', min: 1, max: 60 }),
          ]),
          contact('פרטי המזמין/ה', [], false),
        ],
        success: 'ההזמנה התקבלה! נעדכן כשהמארז יוצא לדרך.',
      }),
  },
  {
    id: 'custom_print',
    category: 'retail',
    title: 'הדפסה אישית על מוצרים',
    description: 'מוצר, צבע, כמות, קובץ עיצוב וטקסט — עם מחיר ליחידה.',
    preset: 'creative_studio',
    tags: 'הדפסה חולצה ספל מיתוג',
    build: () =>
      flow({
        title: 'הדפסה אישית',
        description: 'בחרו מוצר וכמות, צרפו עיצוב ונכין הדמיה.',
        priced: true,
        steps: [
          step('המוצר', [
            field('qty', 'כמות', 'number', { required: true, appearance: 'stepper', min: 1, max: 200 }),
            field('product', 'מוצר', 'radio', { required: true, appearance: 'tiles', multiplyByKey: 'qty', options: [opt('tshirt', 'חולצה', { price: 55 }), opt('mug', 'ספל', { price: 38 }), opt('tote', 'תיק בד', { price: 42 })] }),
            field('color', 'צבע', 'radio', { appearance: 'swatches', options: [opt('white', 'לבן', { swatch: '#F5F5F5' }), opt('black', 'שחור', { swatch: '#1B1B1B' }), opt('navy', 'כחול', { swatch: '#1E3A5F' }), opt('sand', 'חול', { swatch: '#D8C3A5' })] }),
            field('design', 'קובץ עיצוב', 'file'),
            field('text_print', 'טקסט להדפסה', 'text', { max: 60 }),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נשלח הדמיה לאישור לפני ההדפסה.',
      }),
  },

  // ----- pets -----
  {
    id: 'dog_boarding',
    category: 'pets',
    title: 'פנסיון כלבים',
    description: 'פרטי הכלב, גודל, תאריכים, חיסונים וצרכים מיוחדים.',
    preset: 'pets_friendly',
    tags: 'פנסיון כלב חופשה',
    build: () =>
      flow({
        title: 'פנסיון לכלב',
        description: 'נדאג לו כמו בבית בזמן שאתם בחופשה.',
        priced: true,
        totalLabel: 'מחיר ללילה',
        steps: [
          step('הכלב', [
            field('dog_name', 'שם הכלב', 'text', { required: true }),
            field('size', 'גודל', 'radio', { required: true, appearance: 'tiles', options: [opt('s', 'קטן', { price: 110 }), opt('m', 'בינוני', { price: 130 }), opt('l', 'גדול', { price: 150 })] }),
            field('vaccines', 'החיסונים בתוקף', 'checkbox', { required: true }),
            field('needs', 'תרופות, תזונה או הרגלים', 'textarea'),
          ]),
          step('התאריכים', [
            field('checkin', 'הגעה', 'date', { required: true, role: 'date', min: 1, max: 180 }),
            field('checkout', 'איסוף', 'date', { required: true, min: 2, max: 200 }),
            field('walks', 'טיול נוסף ביום', 'checkbox', { price: 30 }),
          ]),
          contact('פרטי הבעלים', [], false),
        ],
        success: 'הבקשה התקבלה! נאשר זמינות לתאריכים.',
      }),
  },
  {
    id: 'pet_grooming',
    category: 'pets',
    title: 'מספרת כלבים',
    description: 'גודל, שירותים, תאריך ושעה — עם מחיר.',
    preset: 'pets_friendly',
    tags: 'מספרה כלבים טיפוח',
    build: () =>
      flow({
        title: 'טיפוח לכלב',
        description: 'בחרו טיפול ומועד, ונחזיר אותו מבריק.',
        priced: true,
        steps: [
          step('הטיפול', [
            field('size', 'גודל הכלב', 'radio', { required: true, appearance: 'chips', options: [opt('s', 'קטן', { price: 140 }), opt('m', 'בינוני', { price: 180 }), opt('l', 'גדול', { price: 230 })] }),
            field('services', 'שירותים נוספים', 'multiselect', { options: [opt('nails', 'גזירת ציפורניים', { price: 30 }), opt('teeth', 'ניקוי שיניים', { price: 40 }), opt('perfume', 'בושם עדין', { price: 15 })] }),
          ]),
          step('מועד', [
            field('date', 'תאריך', 'date', { required: true, role: 'date', min: 1, max: 30 }),
            field('time', 'שעה', 'time', { required: true, options: times('09:00', '11:00', '13:00', '15:00') }),
          ]),
          contact('פרטים', [field('dog_name', 'שם הכלב', 'text', { required: true })], false),
        ],
        success: 'התור נשמר בכפוף לאישור. נעדכן בהודעה.',
      }),
  },

  // ----- travel -----
  {
    id: 'cabin_booking',
    category: 'travel',
    title: 'הזמנת צימר',
    description: 'יחידה, מספר לילות, אורחים ותוספות — מחיר לפי לילה.',
    preset: 'travel_coastal',
    tags: 'צימר לינה נופש',
    build: () =>
      flow({
        title: 'בקשה להזמנת צימר',
        description: 'בדקו זמינות ונחזור לאישור.',
        priced: true,
        steps: [
          step('השהייה', [
            field('checkin', 'תאריך הגעה', 'date', { required: true, role: 'date', min: 2, max: 270 }),
            field('nights', 'מספר לילות', 'number', { required: true, appearance: 'stepper', min: 1, max: 7 }),
            field('unit', 'יחידה', 'radio', { required: true, appearance: 'tiles', multiplyByKey: 'nights', options: [opt('couple', 'סוויטה זוגית', { price: 950, description: 'ג׳קוזי ונוף' }), opt('family', 'בקתה משפחתית', { price: 1250, description: 'עד 5 אורחים' })] }),
            field('guests', 'מספר אורחים', 'number', { appearance: 'stepper', min: 1, max: 5 }),
            field('breakfast', 'ארוחת בוקר', 'checkbox', { price: 180, multiplyByKey: 'nights', helpText: '180 ₪ ללילה' }),
          ]),
          contact(),
        ],
        success: 'קיבלנו! נבדוק זמינות ונחזור אליכם.',
      }),
  },
  {
    id: 'guided_tour',
    category: 'travel',
    title: 'הרשמה לסיור מודרך',
    description: 'סיור עם מקומות מוגבלים, משתתפים ושפה.',
    preset: 'travel_coastal',
    tags: 'סיור טיול מדריך',
    build: () =>
      flow({
        title: 'הרשמה לסיור',
        description: 'בוחרים סיור ושומרים מקום בקבוצה.',
        priced: true,
        steps: [
          step('הסיור', [
            field('participants', 'משתתפים', 'number', { required: true, appearance: 'stepper', min: 1, max: 10 }),
            field('tour', 'איזה סיור?', 'radio', { required: true, multiplyByKey: 'participants', options: [opt('old_city', 'העיר העתיקה · 3 שעות', { price: 120, capacity: 25 }), opt('food', 'סיור קולינרי · 4 שעות', { price: 220, capacity: 14 }), opt('sunset', 'שקיעה בטיילת · שעתיים', { price: 90, capacity: 30 })] }),
            field('language', 'שפה', 'radio', { appearance: 'chips', options: [opt('he', 'עברית'), opt('en', 'English'), opt('ru', 'Русский')] }),
          ]),
          contact(),
        ],
        success: 'נרשמתם! נקודת המפגש תישלח לפני הסיור.',
      }),
  },

  // ----- community -----
  {
    id: 'volunteer_signup',
    category: 'community',
    title: 'הרשמה להתנדבות',
    description: 'תחומים, זמינות, כישורים ואישור.',
    preset: 'community_warm',
    tags: 'התנדבות עמותה',
    build: () =>
      flow({
        title: 'מצטרפים להתנדבות',
        description: 'ספרו לנו איפה תרצו לעזור ומתי נוח לכם.',
        steps: [
          step('ההתנדבות', [
            field('areas', 'תחומים', 'multiselect', { required: true, options: [opt('food', 'חלוקת מזון'), opt('kids', 'עזרה בשיעורים'), opt('elderly', 'ביקורי קשישים'), opt('events', 'אירועים')] }),
            field('availability', 'זמינות', 'multiselect', { options: [opt('mornings', 'בקרים'), opt('evenings', 'ערבים'), opt('weekend', 'סופי שבוע')] }),
            field('skills', 'כישורים שתרצו לתרום', 'textarea'),
            field('age', 'גיל', 'number', { min: 14, max: 100 }),
            field('parent_ok', 'אישור הורה להתנדבות', 'checkbox', { required: true, condition: when('age', 'lt', 18) }),
          ]),
          contact(),
        ],
        success: 'תודה שהצטרפתם! רכז/ת ההתנדבות יחזור אליכם.',
      }),
  },
  {
    id: 'donation_pledge',
    category: 'community',
    title: 'התחייבות לתרומה',
    description: 'סכום, תדירות והקדשה — העמותה חוזרת להשלמת התרומה.',
    preset: 'community_warm',
    tags: 'תרומה עמותה',
    build: () =>
      flow({
        title: 'התחייבות לתרומה',
        description: 'בחרו סכום ותדירות. נחזור אליכם להשלמת התרומה בערוץ מאובטח.',
        disclaimer: 'זו התחייבות בלבד — לא מתבצע תשלום בטופס הזה.',
        steps: [
          step('התרומה', [
            field('amount', 'סכום', 'radio', { required: true, appearance: 'chips', options: [opt('100', '100 ₪'), opt('180', '180 ₪'), opt('360', '360 ₪'), opt('other', 'סכום אחר')] }),
            field('other_amount', 'הסכום שלכם (₪)', 'number', { required: true, min: 10, max: 100000, condition: when('amount', 'equals', 'other') }),
            field('frequency', 'תדירות', 'radio', { required: true, appearance: 'chips', options: [opt('once', 'חד-פעמי'), opt('monthly', 'חודשי')] }),
            field('dedication', 'הקדשה (אופציונלי)', 'text', { max: 80 }),
          ]),
          contact(),
        ],
        success: 'תודה רבה! נחזור אליכם להשלמת התרומה.',
      }),
  },
  {
    id: 'satisfaction_survey',
    category: 'community',
    title: 'סקר שביעות רצון',
    description: 'דירוג, מה אהבו, המלצה ותגובה חופשית.',
    preset: 'modern_minimal',
    tags: 'סקר משוב',
    build: () =>
      flow({
        title: 'איך היה?',
        description: 'שתי דקות שיעזרו לנו להשתפר.',
        steps: [
          step('המשוב', [
            field('rating', 'הדירוג שלכם', 'radio', { required: true, appearance: 'chips', options: ['1', '2', '3', '4', '5'].map((n) => opt(`r${n}`, n)) }),
            field('liked', 'מה אהבתם?', 'multiselect', { options: [opt('service', 'השירות'), opt('speed', 'המהירות'), opt('quality', 'האיכות'), opt('price', 'המחיר')] }),
            field('recommend', 'הייתם ממליצים עלינו?', 'radio', { appearance: 'chips', options: [opt('yes', 'כן'), opt('maybe', 'אולי'), opt('no', 'לא')] }),
            field('comment', 'משהו נוסף?', 'textarea'),
            field('contact_ok', 'אפשר לחזור אליי בנוגע למשוב', 'checkbox'),
            field('contact_phone', 'טלפון', 'phone', { condition: when('contact_ok', 'isTrue') }),
          ]),
        ],
        success: 'תודה על המשוב!',
      }),
  },
];

export const templateById = (id: string) => TEMPLATE_LIBRARY.find((t) => t.id === id);

export function searchTemplates(q: string, category: TemplateCategory | 'all' = 'all'): LibraryTemplate[] {
  const s = q.trim().toLowerCase();
  return TEMPLATE_LIBRARY.filter((t) => (category === 'all' || t.category === category) && (!s || `${t.title} ${t.description} ${t.tags ?? ''}`.toLowerCase().includes(s)));
}
