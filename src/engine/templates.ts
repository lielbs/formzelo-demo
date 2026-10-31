/**
 * Real, schema-valid workflow templates. Every workflow in the product —
 * generated, seeded or hand-edited — is just data of this shape, rendered
 * by the single universal renderer.
 */
import type {
  Condition,
  FieldOption,
  WorkflowConfig,
  WorkflowField,
  WorkflowStep,
} from '../domain/schema';
import { newId } from '../lib/id';

export type TemplateKey = 'flower_order' | 'garage_repairs' | 'restaurant_event' | 'document_collection' | 'quote_request' | 'generic';

type FieldExtra = Partial<Omit<WorkflowField, 'id' | 'key' | 'label' | 'type'>>;

export const field = (key: string, label: string, type: WorkflowField['type'], extra: FieldExtra = {}): WorkflowField => ({
  id: newId('fld'),
  key,
  label,
  type,
  required: false,
  ...extra,
});

export const option = (value: string, label: string, extra: Partial<Omit<FieldOption, 'id' | 'value' | 'label'>> = {}): FieldOption => ({
  id: newId('opt'),
  value,
  label,
  ...extra,
});

export const step = (title: string, fields: WorkflowField[], extra: Partial<Omit<WorkflowStep, 'id' | 'title' | 'fields'>> = {}): WorkflowStep => ({
  id: newId('stp'),
  title,
  fields,
  ...extra,
});

const when = (fieldKey: string, operator: Condition['operator'], value?: string | number): Condition => ({ fieldKey, operator, value });

const DEMO_CONSENT_SUFFIX = 'זהו דמו מקומי — לא מתבצע תשלום ולא נשלחת הודעה אמיתית.';

function flowerOrder(): WorkflowConfig {
  return {
    title: 'הזמנת זר פרחים',
    description: 'בוחרים תקציב, צבעוניות ואירוע — ואנחנו מרכיבים זר שמתאים בדיוק.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('הזר שלכם', [
        field('budget', 'תקציב לזר', 'radio', {
          required: true,
          appearance: 'tiles',
          options: [
            option('150', 'זר קטן ומחמיא', { price: 150, description: '7–9 גבעולים', image: 'bouquet_s' }),
            option('250', 'זר בינוני', { price: 250, description: 'הבחירה הפופולרית', image: 'bouquet_m' }),
            option('350', 'זר שופע', { price: 350, description: 'כולל פרחי עונה מיוחדים', image: 'bouquet_l' }),
            option('500', 'זר פרימיום', { price: 500, description: 'עיצוב אישי של המעצבת', image: 'bouquet_xl' }),
          ],
        }),
        field('palette', 'צבעוניות', 'radio', {
          required: true,
          appearance: 'swatches',
          options: [
            option('pastel', 'פסטל רך', { swatch: '#F4C6D0' }),
            option('vivid', 'צבעוני ושמח', { swatch: '#E96B3D' }),
            option('white_green', 'לבן וירוק', { swatch: '#DDE8DA' }),
            option('seasonal', 'מה שיפה העונה', { swatch: '#C99A5B' }),
          ],
        }),
        field('occasion', 'לאיזה אירוע?', 'radio', {
          required: true,
          appearance: 'chips',
          options: [
            option('birthday', 'יום הולדת'),
            option('anniversary', 'יום נישואין'),
            option('thanks', 'תודה'),
            option('get_well', 'החלמה מהירה'),
            option('new_baby', 'הולדת תינוק/ת'),
            option('just_because', 'סתם כי בא לי'),
          ],
        }),
      ]),
      step('ברכה ואריזה', [
        field('greeting', 'ברכה לכרטיס', 'textarea', { placeholder: 'מזל טוב! מאחלים...', helpText: 'עד 200 תווים. נכתב בכתב יד על כרטיס.', max: 200, appearance: 'card_preview' }),
        field('sender', 'שם השולח/ת', 'text', { required: true, role: 'customer_name' }),
        field('sender_phone', 'טלפון השולח/ת', 'phone', { required: true, role: 'customer_phone', placeholder: '050-1234567' }),
        field('gift_wrap', 'אריזת מתנה מהודרת', 'checkbox', { price: 20, image: 'gift', helpText: 'נייר קראפט, סרט סאטן וכרטיס מעוצב' }),
      ]),
      step('משלוח', [
        field('recipient', 'שם המקבל/ת', 'text', { required: true }),
        field('recipient_phone', 'טלפון המקבל/ת', 'phone', { required: true, placeholder: '050-1234567' }),
        field('address', 'כתובת למשלוח', 'text', { required: true, placeholder: 'רחוב, מספר, עיר' }),
        field('delivery_date', 'תאריך משלוח מבוקש', 'date', { required: true, min: 1, max: 60, role: 'date' }),
        field('delivery_info', 'זמינות משלוח', 'info', {
          helpText: 'בדמו לא נבדקת זמינות משלוח בפועל. החנות תאשר את המועד לאחר בדיקת ההזמנה.',
        }),
      ]),
    ],
    pricing: {
      enabled: true,
      currency: 'ILS',
      fees: [{ id: newId('fee'), label: 'משלוח', amount: 30 }],
      depositPercent: 0,
      totalLabel: 'סה״כ להזמנה',
    },
    branding: { primaryColor: '#B84C6E', logoText: 'Bloom Studio' },
    consent: { required: true, text: `אני מאשר/ת שפרטי ההזמנה נכונים. ${DEMO_CONSENT_SUFFIX}` },
    successMessage: 'ההזמנה התקבלה! הסטודיו יבדוק את המועד ויאשר בהקדם.',
  };
}

function garageRepairs(): WorkflowConfig {
  return {
    title: 'אישור תיקונים לרכב',
    description: 'המוסך בדק את הרכב ומצא תיקונים מומלצים. אשרו או דחו כל תיקון בנפרד.',
    mode: 'case',
    caseFields: [
      field('customer_name', 'שם הלקוח/ה', 'text', { required: true, role: 'customer_name' }),
      field('customer_phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
      field('car_plate', 'מספר רישוי', 'text', { required: true, placeholder: '12-345-67' }),
      field('car_model', 'דגם הרכב', 'text', { required: true, placeholder: 'לדוגמה: טויוטה קורולה 2019' }),
      field('advisor', 'יועץ/ת שירות', 'text', { required: true }),
    ],
    steps: [
      step('תיקונים מומלצים', [
        field('repairs_intro', 'איך זה עובד', 'info', {
          helpText: 'לכל תיקון מופיעים תיאור ומחיר. רק תיקונים שתאשרו ייכללו בסכום.',
        }),
        field('brake_pads', 'רפידות בלם קדמיות', 'decision', {
          required: true,
          price: 650,
          image: 'brakes',
          priority: 'critical',
          helpText: 'הרפידות נשחקו לכ-3 מ״מ. מומלץ להחליף כדי לשמור על מרחק בלימה תקין.',
        }),
        field('cabin_filter', 'פילטר מזגן (תא נוסעים)', 'decision', {
          required: true,
          price: 180,
          image: 'filter',
          priority: 'optional',
          helpText: 'הפילטר סתום חלקית. החלפה משפרת את זרימת האוויר ואיכותו.',
        }),
        field('wipers', 'מגבים קדמיים', 'decision', {
          required: true,
          price: 140,
          image: 'wipers',
          priority: 'recommended',
          helpText: 'הגומיות סדוקות ומשאירות פסים על השמשה.',
        }),
      ]),
      step('הערות ואיסוף', [
        field('pickup_time', 'מתי נוח לאסוף?', 'radio', {
          options: [option('today', 'היום אחרי 16:00'), option('tomorrow', 'מחר בבוקר'), option('call', 'תתקשרו לתאם')],
        }),
        field('notes', 'הערות למוסך', 'textarea', { placeholder: 'שאלות, בקשות או הערות' }),
      ]),
    ],
    pricing: { enabled: true, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ לתיקונים שאושרו' },
    branding: { primaryColor: '#2F5D8A', logoText: 'AutoCare' },
    consent: {
      required: true,
      text: 'אני מאשר/ת את ביצוע התיקונים שסימנתי כמאושרים בלבד. אישור דמו מקומי — ללא חתימה אלקטרונית וללא תוקף משפטי.',
    },
    disclaimer:
      'החלטות הנוגעות לבטיחות הרכב מחייבות התייעצות עם איש מקצוע מוסמך. זהו דמו: האישורים נשמרים בדפדפן בלבד ואינם מהווים חתימה אלקטרונית או התחייבות משפטית.',
    successMessage: 'ההחלטות נשמרו. המוסך יבצע רק את מה שאישרתם ויעדכן כשהרכב מוכן.',
  };
}

function restaurantEvent(): WorkflowConfig {
  return {
    title: 'בקשה לאירוע פרטי',
    description: 'ספרו לנו על האירוע ונחזור עם הצעה מסודרת. ההערכה מחושבת מיד.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('פרטי האירוע', [
        field('event_date', 'תאריך האירוע', 'date', { required: true, min: 7, max: 365, role: 'date' }),
        field('guests', 'מספר אורחים', 'number', { required: true, min: 10, max: 80, helpText: 'בין 10 ל-80 אורחים', appearance: 'stepper' }),
        field('event_type', 'סוג האירוע', 'radio', {
          required: true,
          appearance: 'chips',
          options: [
            option('birthday', 'יום הולדת'),
            option('business', 'אירוע עסקי'),
            option('family', 'אירוע משפחתי'),
            option('other', 'אחר'),
          ],
        }),
        field('slot', 'מועד', 'radio', {
          required: true,
          appearance: 'list',
          options: [option('lunch', 'צהריים (12:00–16:00)'), option('dinner', 'ערב (19:00–23:00)')],
        }),
      ]),
      step('תפריט ותוספות', [
        field('menu', 'תפריט', 'radio', {
          required: true,
          multiplyByKey: 'guests',
          helpText: 'המחיר לסועד/ת',
          appearance: 'tiles',
          options: [
            option('classic', 'תפריט קלאסי', { price: 180, description: 'ראשונות לשולחן, עיקרית וקינוח', image: 'menu_classic' }),
            option('chef', 'תפריט שף', { price: 240, description: '6 מנות טעימה מתחלפות', image: 'menu_chef' }),
            option('vegan', 'תפריט טבעוני', { price: 190, description: 'מבוסס צמחים, עשיר ועונתי', image: 'menu_vegan' }),
          ],
        }),
        field('wine', 'התאמת יינות', 'checkbox', { price: 65, multiplyByKey: 'guests', image: 'wine', helpText: '65 ₪ לסועד/ת' }),
        field('extras', 'תוספות', 'multiselect', {
          appearance: 'tiles',
          options: [
            option('cake', 'עוגה מעוצבת', { price: 450, image: 'cake' }),
            option('decor', 'עיצוב שולחנות ופרחים', { price: 800, image: 'decor' }),
            option('dj', 'DJ לשלוש שעות', { price: 1500, image: 'dj' }),
            option('private_room', 'חדר פרטי', { price: 1200, image: 'private_room' }),
          ],
        }),
        field('dietary', 'רגישויות ובקשות תזונתיות', 'textarea', { placeholder: 'ללא גלוטן, אלרגיות, כשרות...' }),
      ]),
      step('פרטי קשר', [
        field('contact_name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('contact_phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('contact_email', 'אימייל', 'email', { required: true, role: 'customer_email' }),
        field('company', 'שם החברה (לחשבונית)', 'text', { required: true, condition: when('event_type', 'equals', 'business') }),
      ]),
    ],
    pricing: { enabled: true, currency: 'ILS', fees: [], depositPercent: 20, totalLabel: 'הערכת מחיר' },
    branding: { primaryColor: '#3A8A78', logoText: 'Urban Table' },
    consent: {
      required: true,
      text: `ידוע לי שזו הערכת מחיר ושהאירוע ייקבע רק לאחר אישור המסעדה ותשלום מקדמה. ${DEMO_CONSENT_SUFFIX}`,
    },
    disclaimer: 'מקדמה וסטטוס תשלום בדמו הם סימולציה בלבד. לא נגבה כסף אמיתי.',
    successMessage: 'הבקשה נשלחה! צוות האירועים יחזור אליכם עם אישור והצעה סופית.',
  };
}

function documentCollection(): WorkflowConfig {
  return {
    title: 'איסוף מסמכים מלקוח',
    description: 'כל המסמכים שאנחנו צריכים, במקום אחד ובסדר הנכון.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('פרטים', [
        field('full_name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('email', 'אימייל', 'email', { role: 'customer_email' }),
        field('client_type', 'סוג לקוח', 'radio', {
          required: true,
          appearance: 'list',
          options: [option('employee', 'שכיר/ה'), option('freelancer', 'עצמאי/ת'), option('company', 'חברה')],
        }),
      ]),
      step('מסמכים', [
        field('files_info', 'על העלאת קבצים בדמו', 'info', {
          helpText: 'בדמו נשמרים רק שם הקובץ וגודלו. הקובץ עצמו לא נשמר ולא נשלח לשום מקום.',
        }),
        field('bank_letter', 'אישור ניהול חשבון', 'file', { required: true }),
        field('form_106', 'טופס 106', 'file', { required: true, condition: when('client_type', 'equals', 'employee') }),
        field('pnl', 'דוח רווח והפסד', 'file', { required: true, condition: when('client_type', 'notEquals', 'employee') }),
        field('extra_docs', 'מסמכים נוספים', 'file'),
      ]),
      step('סיכום', [field('notes', 'הערות', 'textarea')]),
    ],
    pricing: { enabled: false, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ' },
    branding: { primaryColor: '#18212D', logoText: 'המשרד שלי' },
    consent: { required: true, text: 'אני מאשר/ת שהמסמכים שייכים לי ושהפרטים נכונים. אין להעלות מידע רגיש אמיתי לדמו.' },
    successMessage: 'המסמכים התקבלו. נעדכן אם חסר משהו.',
  };
}

function quoteRequest(): WorkflowConfig {
  return {
    title: 'בקשה להצעת מחיר',
    description: 'מתארים את העבודה, ומקבלים הצעת מחיר מסודרת.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('מה צריך?', [
        field('service', 'סוג השירות', 'select', {
          required: true,
          options: [option('install', 'התקנה'), option('repair', 'תיקון'), option('renovation', 'שיפוץ'), option('consult', 'ייעוץ')],
        }),
        field('details', 'תיאור העבודה', 'textarea', { required: true, placeholder: 'מה צריך לעשות, היקף, מידות...' }),
        field('urgency', 'דחיפות', 'radio', {
          required: true,
          options: [option('week', 'השבוע'), option('month', 'החודש'), option('flexible', 'גמיש')],
        }),
        field('budget_range', 'טווח תקציב משוער', 'select', {
          options: [option('lt2k', 'עד 2,000 ₪'), option('2k_10k', '2,000–10,000 ₪'), option('gt10k', 'מעל 10,000 ₪')],
        }),
        field('preferred_date', 'מועד מועדף לביקור', 'date', { min: 1, role: 'date' }),
      ]),
      step('פרטי קשר', [
        field('name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('city', 'עיר', 'text', { required: true }),
      ]),
    ],
    pricing: { enabled: false, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ' },
    branding: { primaryColor: '#E96B3D', logoText: 'העסק שלי' },
    consent: { required: false, text: 'אני מאשר/ת יצירת קשר בנוגע לבקשה.' },
    successMessage: 'הבקשה התקבלה! נחזור עם הצעת מחיר.',
  };
}

function generic(title = 'טופס פנייה'): WorkflowConfig {
  return {
    title,
    description: 'טופס בסיסי שאפשר לערוך: הוסיפו שלבים, שדות, מחירים ותנאים.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('פרטים', [
        field('name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('email', 'אימייל', 'email', { role: 'customer_email' }),
        field('request', 'במה נוכל לעזור?', 'textarea', { required: true }),
      ]),
    ],
    pricing: { enabled: false, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ' },
    branding: { primaryColor: '#E96B3D', logoText: 'העסק שלי' },
    consent: { required: false, text: 'אני מאשר/ת יצירת קשר בנוגע לפנייה.' },
    successMessage: 'הפנייה התקבלה. נחזור אליכם בהקדם.',
  };
}

export const TEMPLATES: Record<TemplateKey, { label: string; description: string; build: () => WorkflowConfig }> = {
  flower_order: { label: 'הזמנת פרחים', description: 'תקציב, צבעוניות, ברכה ומשלוח', build: flowerOrder },
  garage_repairs: { label: 'אישור תיקונים במוסך', description: 'תיק לרכב, אישור או דחייה לכל תיקון', build: garageRepairs },
  restaurant_event: { label: 'אירוע פרטי במסעדה', description: 'תאריך, אורחים, תפריט והערכת מחיר', build: restaurantEvent },
  document_collection: { label: 'איסוף מסמכים', description: 'פרטים, מסמכים לפי סוג לקוח', build: documentCollection },
  quote_request: { label: 'בקשה להצעת מחיר', description: 'תיאור עבודה, דחיפות ופרטי קשר', build: quoteRequest },
  generic: { label: 'טופס בסיסי', description: 'נקודת התחלה ריקה לעריכה', build: () => generic() },
};

export const buildGeneric = generic;
