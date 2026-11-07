/**
 * Real, schema-valid workflow templates. Every workflow in the product —
 * generated, seeded or hand-edited — is just data of this shape, rendered
 * by the single universal renderer.
 */
import type {
  Condition,
  FieldOption,
  HighlightItem,
  WorkflowConfig,
  WorkflowField,
  WorkflowStep,
} from '../domain/schema';
import { newId } from '../lib/id';

export type TemplateKey = 'flower_order' | 'garage_repairs' | 'restaurant_event' | 'table_booking' | 'contest_registration' | 'document_collection' | 'quote_request' | 'generic';

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

export const highlight = (title: string, text?: string, icon?: HighlightItem['icon']): HighlightItem => ({ id: newId('hl'), title, text, icon });

const when = (fieldKey: string, operator: Condition['operator'], value?: string | number): Condition => ({ fieldKey, operator, value });


function flowerOrder(): WorkflowConfig {
  return {
    title: 'הזמנת זר פרחים',
    description: 'בוחרים תקציב, צבעוניות ואירוע — ואנחנו מרכיבים זר שמתאים בדיוק.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('הזר שלכם', [
        field('why_bloom', 'למה אצלנו', 'highlights', {
          items: [
            highlight('פרחים טריים מהשוק', 'נבחרים בכל בוקר', 'leaf'),
            highlight('משלוח באותו יום', 'בהזמנה עד 12:00, בתוך העיר', 'truck'),
            highlight('כרטיס בכתב יד', 'הברכה שלכם, בכתב יד', 'heart'),
          ],
        }),
        field('bouquet_style', 'סגנון הזר', 'radio', {
          appearance: 'tiles',
          helpText: 'אופציונלי — אם לא תבחרו, המעצבת תחליט לפי האירוע',
          options: [
            option('round', 'קלאסי עגול', { description: 'מהודק, אלגנטי ומסודר', image: 'bouquet_m' }),
            option('garden', 'גינה פראית', { description: 'חופשי, עם ירק ועשבי תיבול', image: 'bouquet_l' }),
            option('tall', 'גבוה לאגרטל', { description: 'גבעולים ארוכים ודרמטיים', image: 'bouquet_xl' }),
          ],
        }),
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
          helpText: 'החנות תאשר את מועד המשלוח לאחר בדיקת ההזמנה.',
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
    consent: { required: true, text: 'אני מאשר/ת שפרטי ההזמנה נכונים.' },
    successMessage: 'ההזמנה התקבלה! הסטודיו יבדוק את המועד ויאשר בהקדם.',
    completion: { mode: 'calculated', allowPayLater: true },
    confirmation: {
      title: 'הזר בדרך לתכנון',
      nextSteps: ['המעצבת בודקת זמינות פרחים ומועד משלוח', 'תקבלו אישור עם שעת משלוח משוערת', 'ביום המשלוח — הזר יוצא אל המקבל/ת'],
    },
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
      text: 'אני מאשר/ת את ביצוע התיקונים שסימנתי כמאושרים בלבד.',
    },
    disclaimer:
      'החלטות הנוגעות לבטיחות הרכב מחייבות התייעצות עם איש מקצוע מוסמך. האישור כאן אינו חתימה אלקטרונית.',
    successMessage: 'ההחלטות נשמרו. המוסך יבצע רק את מה שאישרתם ויעדכן כשהרכב מוכן.',
    completion: { mode: 'request' },
    confirmation: {
      title: 'ההחלטות נרשמו',
      nextSteps: ['המוסך מבצע רק את התיקונים שאישרתם', 'תיקון שנדחה לא יבוצע ולא יחויב', 'נעדכן כשהרכב מוכן לאיסוף'],
    },
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
        field('event_why', 'אירוע אצלנו', 'highlights', {
          items: [
            highlight('חדר פרטי עד 80 סועדים', undefined, 'star'),
            highlight('שף מלווה לאירוע', undefined, 'chef'),
            highlight('מקדמה רק אחרי אישור', 'אין חיוב בשליחת הבקשה', 'shield'),
          ],
        }),
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
      text: 'ידוע לי שזו הערכת מחיר ושהאירוע ייקבע רק לאחר אישור המסעדה ותשלום מקדמה.',
    },
    disclaimer: 'המקדמה מתואמת מול המסעדה לאחר האישור. לא נגבה תשלום בטופס.',
    successMessage: 'הבקשה נשלחה! צוות האירועים יחזור אליכם עם אישור והצעה סופית.',
    completion: { mode: 'deposit', depositPercent: 20, depositTiming: 'after_approval' },
    confirmation: {
      title: 'בקשת האירוע התקבלה',
      nextSteps: ['צוות האירועים בודק זמינות ותפריט', 'תקבלו הצעה סופית ואישור', 'רק אחרי אישור תתבקש מקדמה של 20%'],
    },
  };
}

const BOOKING_SLOTS = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

function tableBooking(): WorkflowConfig {
  return {
    title: 'הזמנת שולחן',
    description: 'בחרו ערב, שעה ומספר סועדים. הבקשה נשמרת עד שהמסעדה מאשרת אותה.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('מתי מגיעים?', [
        field('booking_notes', 'לפני שמתחילים', 'highlights', {
          items: [
            highlight('בקשה — לא הזמנה סופית', 'המסעדה מאשרת כל בקשה', 'calendar'),
            highlight('עד 10 סועדים', 'לקבוצות גדולות — אירוע פרטי', 'chef'),
            highlight('ללא תשלום מראש', 'לא נדרשים פרטי אשראי', 'shield'),
          ],
        }),
        field('booking_date', 'תאריך', 'date', { required: true, min: 0, max: 60, role: 'date', helpText: 'סגור בימי ראשון' }),
        field('booking_time', 'שעה', 'time', { required: true, options: BOOKING_SLOTS.map((t) => option(t, t)) }),
        field('party_size', 'מספר סועדים', 'number', { required: true, min: 1, max: 10, appearance: 'stepper' }),
        field('seating', 'העדפת ישיבה', 'radio', {
          appearance: 'chips',
          options: [option('inside', 'בפנים'), option('bar', 'ליד הבר'), option('terrace', 'מרפסת'), option('any', 'לא משנה')],
        }),
      ]),
      step('פרטי ההזמנה', [
        field('guest_name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('guest_phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('occasion', 'אירוע מיוחד?', 'radio', {
          appearance: 'chips',
          options: [option('none', 'סתם ערב טוב'), option('birthday', 'יום הולדת'), option('date', 'ערב זוגי'), option('business', 'ארוחה עסקית')],
        }),
        field('requests', 'בקשות מיוחדות', 'textarea', { placeholder: 'כיסא תינוק, נגישות, אלרגיות…', max: 300 }),
      ]),
    ],
    pricing: { enabled: false, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ' },
    branding: { primaryColor: '#A9502F', logoText: 'Urban Table' },
    consent: { required: true, text: 'ידוע לי שזו בקשה להזמנה ושהיא סופית רק לאחר אישור המסעדה.' },
    successMessage: 'בקשת ההזמנה נשלחה. זו עדיין בקשה — נעדכן ברגע שהמסעדה תאשר.',
    completion: { mode: 'request' },
    booking: {
      enabled: true,
      dateKey: 'booking_date',
      timeKey: 'booking_time',
      guestsKey: 'party_size',
      openWeekdays: [1, 2, 3, 4, 5, 6],
      slots: BOOKING_SLOTS,
      capacityPerSlot: 16,
      capacityUnit: 'guests',
    },
    confirmation: {
      title: 'בקשת ההזמנה התקבלה',
      nextSteps: ['המסעדה בודקת את הזמינות בשעה שבחרתם', 'תקבלו עדכון כשהבקשה תאושר או תידחה', 'השולחן שמור רק לאחר אישור'],
    },
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
        field('files_info', 'איך שולחים מסמכים', 'info', {
          helpText: 'רשמו כאן את שמות המסמכים או קישור לתיקייה משותפת. את הקבצים עצמם תשלחו לעסק בערוץ מאובטח לאחר שליחת הבקשה.',
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
    consent: { required: true, text: 'אני מאשר/ת שהמסמכים שייכים לי ושהפרטים נכונים.' },
    successMessage: 'המסמכים התקבלו. נעדכן אם חסר משהו.',
    completion: { mode: 'request' },
  };
}

/** Community race registration: tracks with limited places, age-based parental consent, optional simulated payment. */
function contestRegistration(): WorkflowConfig {
  return {
    title: 'הרשמה למרוץ העמק',
    description: 'שלושה מסלולים לכל הגילים. בוחרים מסלול, ממלאים פרטים — ומשתתפים מתחת לגיל 18 מצרפים אישור הורה.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('בחרו מסלול', [
        field('race_facts', 'על המרוץ', 'highlights', {
          items: [
            highlight('שישי בבוקר', 'זינוק ראשון 07:00', 'clock'),
            highlight('מקומות מוגבלים', 'לכל מסלול מכסה משלו', 'star'),
            highlight('חולצה ומדליה', 'לכל משתתף שמסיים', 'heart'),
          ],
        }),
        field('track', 'המסלול שלכם', 'radio', {
          required: true,
          appearance: 'tiles',
          options: [
            option('family_3k', 'ריצת משפחות · 3 ק״מ', { price: 40, capacity: 60, description: 'קצב חופשי, מתאים לילדים מגיל 6' }),
            option('classic_10k', 'קלאסי · 10 ק״מ', { price: 90, capacity: 40, description: 'מסלול נוף מסביב לאגם' }),
            option('half_21k', 'חצי מרתון · 21.1 ק״מ', { price: 150, capacity: 10, description: 'לרצים מנוסים, מגיל 16' }),
          ],
        }),
        field('shirt', 'מידת חולצה', 'radio', {
          appearance: 'chips',
          options: ['XS', 'S', 'M', 'L', 'XL'].map((v) => option(v.toLowerCase(), v)),
        }),
      ]),
      step('פרטי הרץ/ה', [
        field('name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('age', 'גיל ביום המרוץ', 'number', { required: true, min: 6, max: 99, helpText: 'מתחת לגיל 18 יתווסף שלב אישור הורה' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('email', 'אימייל', 'email', { role: 'customer_email' }),
        field('emergency', 'איש קשר לחירום', 'text', { placeholder: 'שם וטלפון' }),
        field('health', 'אני מצהיר/ה שמצבי הבריאותי מאפשר השתתפות במרוץ', 'checkbox', { required: true }),
      ]),
      step(
        'אישור הורה',
        [
          field('parent_info', 'למה השלב הזה מופיע', 'info', { content: 'המשתתף/ת מתחת לגיל 18, ולכן נדרש אישור של הורה או אפוטרופוס.' }),
          field('parent_name', 'שם ההורה / האפוטרופוס', 'text', { required: true }),
          field('parent_phone', 'טלפון ההורה', 'phone', { required: true }),
          field('parent_consent', 'אני ההורה או האפוטרופוס ומאשר/ת את ההשתתפות', 'checkbox', { required: true }),
        ],
        { condition: when('age', 'lt', 18), description: 'מוצג רק למשתתפים מתחת לגיל 18.' },
      ),
    ],
    pricing: { enabled: true, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'דמי הרשמה' },
    branding: { primaryColor: '#3D3BF3', logoText: 'Valley Run' },
    consent: { required: true, text: 'קראתי את תקנון המרוץ ואני מאשר/ת יצירת קשר.' },
    successMessage: 'נרשמתם! מספר ההרשמה שמור כאן.',
    completion: { mode: 'calculated', allowPayLater: true },
    confirmation: { title: 'ההרשמה התקבלה', nextSteps: ['אישור ההרשמה יופיע כאן', 'ערכת המשתתף נאספת ביום שלפני המרוץ'] },
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
    completion: { mode: 'quote' },
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
    completion: { mode: 'request' },
  };
}

export const TEMPLATES: Record<TemplateKey, { label: string; description: string; build: () => WorkflowConfig }> = {
  flower_order: { label: 'הזמנת פרחים', description: 'תקציב, צבעוניות, ברכה ומשלוח', build: flowerOrder },
  garage_repairs: { label: 'אישור תיקונים במוסך', description: 'תיק לרכב, אישור או דחייה לכל תיקון', build: garageRepairs },
  restaurant_event: { label: 'אירוע פרטי במסעדה', description: 'תאריך, אורחים, תפריט והערכת מחיר', build: restaurantEvent },
  table_booking: { label: 'הזמנת שולחן / תור', description: 'תאריך, שעה, משתתפים — בקשה עד אישור', build: tableBooking },
  contest_registration: { label: 'הרשמה לתחרות', description: 'מסלולים עם מכסה, אישור הורה ותשלום אופציונלי', build: contestRegistration },
  document_collection: { label: 'איסוף מסמכים', description: 'פרטים, מסמכים לפי סוג לקוח', build: documentCollection },
  quote_request: { label: 'בקשה להצעת מחיר', description: 'תיאור עבודה, דחיפות ופרטי קשר', build: quoteRequest },
  generic: { label: 'טופס בסיסי', description: 'נקודת התחלה ריקה לעריכה', build: () => generic() },
};

export const buildGeneric = generic;
