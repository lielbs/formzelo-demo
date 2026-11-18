/**
 * Kinds of business the local engine recognises, with the words owners use for them and what a
 * finished form for that business starts from: its flow, design, sample services and wording.
 * Deterministic keyword weights over the canonical text (engine/understand), not a model.
 * Samples are only ever starting points and are always flagged for the owner's review.
 */
import type { ThemePresetId } from '../domain/theme';
import { tokenMatches } from './hebrew';
import type { TemplateCategory } from './library';
import type { TemplateKey } from './templates';

export type IndustryId =
  | 'restaurant' | 'restaurant_event' | 'cafe' | 'catering' | 'bakery' | 'florist' | 'garage'
  | 'hair_salon' | 'nails' | 'cosmetics' | 'spa' | 'clinic' | 'dental' | 'physio' | 'nutrition' | 'vet'
  | 'trainer' | 'yoga' | 'tutor' | 'course' | 'kids_class' | 'camp' | 'workshop' | 'conference' | 'contest'
  | 'photographer' | 'event_venue' | 'wedding' | 'kids_party' | 'rsvp' | 'event_services'
  | 'cleaning' | 'contractor' | 'technician' | 'moving' | 'garden'
  | 'shop' | 'print' | 'volunteer' | 'donation' | 'survey'
  | 'accountant' | 'lawyer' | 'office' | 'consultant' | 'real_estate'
  | 'pet_care' | 'pet_grooming' | 'cabin' | 'tour' | 'lead';

/**
 * How the form works:
 *  appointment  – service, day and a free time from opening hours (engine/schedule)
 *  table        – restaurant table: date, slot and party size
 *  registration – places in a class, course, camp or event (engine/compose)
 *  form         – a ready business form (a core template or a library template)
 */
export type Flow = 'appointment' | 'table' | 'registration' | 'form';

export interface Industry {
  id: IndustryId;
  /** Hebrew name, for chips and notes. */
  label: string;
  /** Stem or phrase → weight. Phrases match as substrings, single words at a token start (after prefixes). */
  words: Record<string, number>;
  preset: ThemePresetId;
  category: TemplateCategory;
  flow: Flow;
  /** Template to start from for a `form` flow (TemplateKey or library id). */
  base?: TemplateKey | string;
  /** Used instead of `base` when the owner asks for a quote. */
  quoteBase?: TemplateKey | string;
  /** Sample services for appointments, or job types for a quote. */
  services?: string[];
  /** Usual length of one appointment, minutes. */
  minutes?: number;
  /** A finished title for the form. */
  title: string;
  /** Label of the question that holds the owner's priced items. */
  itemsLabel?: string;
  /** Customer questions this business always needs (appointment flows). */
  needs?: ('car' | 'pet' | 'address' | 'child' | 'issue')[];
}

export const INDUSTRIES: Industry[] = [
  // Food
  { id: 'restaurant_event', label: 'אירועים במסעדה', words: { 'אירוע פרטי': 5, 'אירועים פרטיים': 5, 'אירועים סגורים': 5, 'אירוע סגור': 5, 'חדר פרטי': 4, 'לאירוע פרטי': 5 }, preset: 'hospitality_premium', category: 'events', flow: 'form', base: 'restaurant_event', title: 'בקשה לאירוע פרטי', itemsLabel: 'תפריט' },
  { id: 'restaurant', label: 'מסעדה', words: { מסעד: 4, פיצרי: 4, ביסטרו: 3, 'בר מסעדה': 2, המבורגר: 3, סושי: 3, שווארמ: 3, פלאפל: 3, 'הזמנת שולחן': 3, 'הזמנות שולחן': 3, שולחנות: 2, שולחן: 1, סועדים: 1 }, preset: 'hospitality_premium', category: 'food', flow: 'table', title: 'הזמנת שולחן', itemsLabel: 'מה תרצו להזמין?' },
  { id: 'cafe', label: 'בית קפה', words: { 'בית קפה': 5, קפה: 4, גלידרי: 5, בראנץ: 3, 'ארוחת בוקר': 2, 'מגשי אירוח': 2 }, preset: 'cafe_bistro', category: 'food', flow: 'table', title: 'הזמנה מבית הקפה', itemsLabel: 'מה תרצו להזמין?' },
  { id: 'catering', label: 'קייטרינג', words: { קייטרינג: 6, 'שף פרטי': 5, 'אוכל ביתי': 2, מנות: 1, 'מגשי אירוח': 2 }, preset: 'cafe_bistro', category: 'food', flow: 'form', base: 'catering_order', title: 'הזמנת קייטרינג', itemsLabel: 'תפריט' },
  { id: 'bakery', label: 'קונדיטוריה', words: { קונדיטור: 5, מאפייה: 5, מאפיית: 5, אופה: 4, עוגה: 3, עוגות: 3, עוגיות: 3, חלות: 3, 'בצק סוכר': 3, קאפקייק: 3, מתוקים: 1, מאפים: 1 }, preset: 'bakery_sweet', category: 'food', flow: 'form', base: 'custom_cake', title: 'הזמנת עוגה', itemsLabel: 'מה תרצו להזמין?' },
  // Flowers & cars
  { id: 'florist', label: 'חנות פרחים', words: { פרח: 4, פרחים: 4, זר: 3, זרים: 3, פלוריסט: 6, ורד: 2, 'סידורי פרחים': 3 }, preset: 'floral_boutique', category: 'retail', flow: 'form', base: 'flower_order', quoteBase: 'quote_request', services: ['עיצוב פרחים לחתונה', 'סידורי שולחן', 'זר כלה', 'עיצוב לאירוע עסקי'], title: 'הזמנת זר פרחים', itemsLabel: 'בחרו זר' },
  { id: 'garage', label: 'מוסך', words: { מוסך: 6, מכונאי: 5, צמיג: 4, צמיגים: 4, פנצ: 4, פנצריי: 5, רכב: 2, 'טיפול שנתי': 3, 'טיפול לרכב': 4, בלמים: 2, רפידות: 2, פחחות: 4, 'החלפת שמן': 3 }, preset: 'automotive_precision', category: 'auto', flow: 'form', base: 'garage_repairs', services: ['טיפול תקופתי', 'אבחון תקלה', 'החלפת צמיגים', 'בדיקה לפני טסט'], minutes: 60, title: 'קביעת טיפול לרכב', itemsLabel: 'סוג השירות', needs: ['car'] },
  // Beauty
  { id: 'hair_salon', label: 'מספרה', words: { מספרה: 5, מספרת: 5, מספרות: 5, ברבר: 5, תספורת: 3, תספורות: 3, שיער: 2, 'פן ': 1, גוונים: 2, החלקה: 2, תסרוקת: 2, 'מכון יופי': 1 }, preset: 'floral_boutique', category: 'beauty', flow: 'appointment', services: ['תספורת', 'צבע', 'פן ועיצוב'], minutes: 30, title: 'קביעת תור למספרה', itemsLabel: 'איזה שירות?' },
  { id: 'nails', label: 'סטודיו לציפורניים', words: { ציפורנ: 4, ציפורניים: 4, מניקור: 4, מניקוריסט: 5, פדיקור: 3, 'לק גל': 3, 'לק ג': 3, 'בניית ציפורניים': 4 }, preset: 'beauty_glam', category: 'beauty', flow: 'appointment', services: ['מניקור', 'לק ג׳ל', 'פדיקור'], minutes: 60, title: 'קביעת תור לציפורניים', itemsLabel: 'איזה טיפול?' },
  { id: 'cosmetics', label: 'קוסמטיקה', words: { קוסמטיק: 5, 'טיפול פנים': 3, 'טיפולי פנים': 3, ריסים: 4, גבות: 3, איפור: 4, מאפרת: 5, מאפר: 5, 'הסרת שיער': 3, שעווה: 2, 'מכון יופי': 2, אסתטיק: 3 }, preset: 'beauty_glam', category: 'beauty', flow: 'appointment', services: ['טיפול פנים', 'עיצוב גבות', 'הסרת שיער'], minutes: 45, title: 'קביעת תור לטיפול', itemsLabel: 'איזה טיפול?' },
  { id: 'spa', label: 'ספא ועיסוי', words: { ספא: 5, עיסוי: 4, עיסויים: 4, מעסה: 5, מעסים: 5, רפלקסולוג: 4, שיאצו: 4, 'טיפולי גוף': 3 }, preset: 'spa_serenity', category: 'beauty', flow: 'appointment', services: ['עיסוי שוודי', 'עיסוי רקמות עמוק', 'רפלקסולוגיה'], minutes: 60, title: 'קביעת טיפול', itemsLabel: 'איזה טיפול?' },
  // Health
  { id: 'vet', label: 'וטרינר', words: { וטרינר: 7, וטרינרית: 7, וטרינרי: 7 }, preset: 'pets_friendly', category: 'pets', flow: 'appointment', services: ['בדיקה כללית', 'חיסון', 'ביקורת'], minutes: 30, title: 'קביעת תור לווטרינר', itemsLabel: 'סוג הביקור', needs: ['pet'] },
  { id: 'dental', label: 'מרפאת שיניים', words: { שיניים: 6, שיננית: 6, אבנית: 3, 'יישור שיניים': 3, אורתודונט: 5 }, preset: 'medical_care', category: 'health', flow: 'appointment', services: ['בדיקה וניקוי', 'טיפול', 'הלבנה'], minutes: 30, title: 'קביעת תור למרפאה', itemsLabel: 'סוג הביקור' },
  { id: 'physio', label: 'פיזיותרפיה', words: { פיזיו: 6, פיזיותרפ: 6, כירופרקט: 6, שיקום: 2, 'הידרותרפיה': 4, אוסטאופת: 5 }, preset: 'medical_care', category: 'health', flow: 'appointment', services: ['טיפול ראשון', 'טיפול המשך'], minutes: 45, title: 'קביעת טיפול', itemsLabel: 'סוג הטיפול' },
  { id: 'nutrition', label: 'תזונה', words: { דיאטנ: 6, תזונאי: 6, תזונאית: 6, תזונה: 4, נטורופת: 4 }, preset: 'spa_serenity', category: 'health', flow: 'appointment', services: ['פגישת היכרות', 'פגישת מעקב'], minutes: 45, title: 'קביעת פגישת ייעוץ', itemsLabel: 'סוג הפגישה' },
  { id: 'clinic', label: 'קליניקה', words: { קליניק: 4, מרפאה: 3, מרפאת: 3, רופא: 3, רופאה: 3, רופאת: 3, 'רופא משפחה': 4, פסיכו: 4, פסיכולוג: 5, פסיכותרפ: 5, קלינאי: 5, קלינאית: 5, שמיעה: 4, 'ריפוי בעיסוק': 5, מטפל: 1, מטפלת: 1, אבחון: 1 }, preset: 'medical_care', category: 'health', flow: 'appointment', services: ['פגישה ראשונה', 'פגישת המשך'], minutes: 45, title: 'קביעת תור', itemsLabel: 'סוג הביקור' },
  // Fitness
  { id: 'yoga', label: 'יוגה ופילאטיס', words: { יוגה: 6, פילאטיס: 6, מדיטציה: 3 }, preset: 'eco_nature', category: 'health', flow: 'appointment', services: ['שיעור ניסיון', 'שיעור פרטי'], minutes: 60, title: 'קביעת שיעור', itemsLabel: 'איזה שיעור?' },
  { id: 'trainer', label: 'מאמן כושר', words: { 'מאמן כושר': 6, 'מאמנת כושר': 6, 'מאמן אישי': 5, 'מאמנת אישית': 4, מאמן: 3, מאמנת: 3, כושר: 4, קרוספיט: 6, אימון: 2, אימונים: 2, 'מאמנת ריצה': 5, ריצה: 1, 'חדר כושר': 5 }, preset: 'fitness_energy', category: 'health', flow: 'appointment', services: ['אימון ניסיון', 'אימון אישי'], minutes: 60, title: 'קביעת אימון', itemsLabel: 'איזה אימון?' },
  // Education
  { id: 'camp', label: 'קייטנה', words: { קייטנ: 7, 'מחנה קיץ': 6 }, preset: 'kids_play', category: 'education', flow: 'registration', title: 'הרשמה לקייטנה' },
  { id: 'kids_class', label: 'חוג', words: { חוג: 6, חוגי: 6, חוגים: 6 }, preset: 'kids_play', category: 'education', flow: 'registration', title: 'הרשמה לחוג' },
  { id: 'course', label: 'קורס', words: { קורס: 6, קורסים: 6, 'תוכנית לימודים': 4, הכשרה: 3, מחזור: 1 }, preset: 'academy_learn', category: 'education', flow: 'registration', title: 'הרשמה לקורס' },
  { id: 'workshop', label: 'סדנה', words: { סדנ: 6, סדנא: 6, סדנאות: 6 }, preset: 'creative_studio', category: 'events', flow: 'registration', title: 'הרשמה לסדנה' },
  { id: 'conference', label: 'כנס', words: { כנס: 6, וובינר: 6, מיטאפ: 6, הרצאה: 4, הרצאות: 4 }, preset: 'tech_startup', category: 'events', flow: 'registration', title: 'הרשמה לכנס' },
  { id: 'contest', label: 'תחרות', words: { תחרו: 6, מרוץ: 6, טורניר: 6, מרתון: 6, 'ליגה': 3 }, preset: 'creative_studio', category: 'community', flow: 'registration', title: 'הרשמה לתחרות' },
  { id: 'tutor', label: 'שיעורים פרטיים', words: { מורה: 4, 'שיעורים פרטיים': 6, 'שיעור פרטי': 4, שיעורי: 3, 'שיעורי עזר': 5, בגרות: 3, נהיגה: 3, 'הכנה למבחן': 3 }, preset: 'academy_learn', category: 'education', flow: 'appointment', services: ['שיעור ניסיון', 'שיעור רגיל'], minutes: 45, title: 'קביעת שיעור', itemsLabel: 'איזה שיעור?' },
  // Events
  { id: 'rsvp', label: 'אישור הגעה', words: { 'אישור הגעה': 8, 'אישורי הגעה': 8 }, preset: 'celebration_party', category: 'events', flow: 'form', base: 'rsvp', title: 'אישור הגעה', itemsLabel: 'בחירת מנה' },
  { id: 'photographer', label: 'צילום', words: { צלם: 6, צלמת: 6, צלמים: 6, צילומי: 3, צילום: 2, 'סטודיו לצילום': 6, סשן: 2, 'ניו בורן': 3 }, preset: 'creative_studio', category: 'events', flow: 'form', base: 'photographer_quote', title: 'הצעת מחיר לצילום', itemsLabel: 'בחרו חבילה' },
  { id: 'event_venue', label: 'מקום לאירועים', words: { 'גן אירועים': 6, אולם: 6, אולמות: 6, לופט: 4, 'מתחם אירועים': 6, 'להשכרה לאירועים': 4, 'מקום לאירועים': 5 }, preset: 'wedding_elegance', category: 'events', flow: 'form', base: 'restaurant_event', title: 'בדיקת תאריך לאירוע', itemsLabel: 'חבילה' },
  { id: 'wedding', label: 'הפקת חתונות', words: { חתונה: 2, חתונות: 2, חופה: 2, חופות: 2, מפיק: 4, מפיקת: 4, 'הפקת אירועים': 4, 'הפקת חתונות': 6 }, preset: 'wedding_elegance', category: 'events', flow: 'form', base: 'wedding_inquiry', title: 'פנייה להפקת חתונה' },
  { id: 'kids_party', label: 'ימי הולדת לילדים', words: { 'יום הולדת לילדים': 6, 'ימי הולדת לילדים': 6, מפעיל: 5, מפעילה: 5, הפעלה: 3, הפעלות: 3, 'מסיבת ילדים': 6 }, preset: 'kids_play', category: 'events', flow: 'form', base: 'kids_birthday', title: 'הזמנת יום הולדת', itemsLabel: 'בחרו חבילה' },
  { id: 'event_services', label: 'שירותי אירועים', words: { דיגיי: 6, תקליטן: 6, קוסם: 6, להקה: 5, הגברה: 4, 'עיצוב בלונים': 6, בלונים: 2, 'קשת בלונים': 3, 'עמדת צילום': 4, 'מגנטים': 2 }, preset: 'celebration_party', category: 'events', flow: 'form', base: 'quote_request', services: ['אירוע פרטי', 'אירוע עסקי', 'יום הולדת', 'חתונה'], title: 'הזמנה לאירוע', itemsLabel: 'מה תרצו להזמין?' },
  // Home
  { id: 'cleaning', label: 'ניקיון', words: { ניקיון: 6, ניקוי: 3, 'עוזרת בית': 6, ספות: 2, שטיחים: 2 }, preset: 'modern_minimal', category: 'home', flow: 'form', base: 'home_cleaning', quoteBase: 'quote_request', services: ['ניקיון משרדים', 'ניקיון שוטף', 'ניקיון יסודי'], title: 'הזמנת ניקיון', itemsLabel: 'סוג הניקיון' },
  { id: 'technician', label: 'טכנאי', words: { טכנאי: 6, מזגן: 4, מזגנים: 4, חשמלאי: 6, אינסטלטור: 6, 'מכונות כביסה': 4, 'מכונת כביסה': 4, מקרר: 2, מקררים: 2, סתימות: 3, נזילה: 3, 'דוד שמש': 3, 'קריאת שירות': 4 }, preset: 'home_services', category: 'home', flow: 'form', base: 'technician_visit', title: 'הזמנת טכנאי', itemsLabel: 'מה צריך?' },
  { id: 'contractor', label: 'שיפוצים', words: { שיפוץ: 4, שיפוצים: 4, קבלן: 5, רצף: 5, צביעת: 4, צבעי: 1, גבס: 3, 'עבודות בנייה': 4, נגר: 4, נגרות: 4, מטבחים: 2, איטום: 3 }, preset: 'home_services', category: 'home', flow: 'form', base: 'quote_request', services: ['שיפוץ כללי', 'מטבח', 'חדרי רחצה', 'צבע', 'ריצוף'], title: 'בקשה להצעת מחיר', itemsLabel: 'מה צריך?' },
  { id: 'moving', label: 'הובלות', words: { הובל: 6, הובלות: 6, מוביל: 5 }, preset: 'home_services', category: 'home', flow: 'form', base: 'moving_quote', title: 'הצעת מחיר להובלה', itemsLabel: 'סוג ההובלה' },
  { id: 'garden', label: 'גינון', words: { גנן: 6, גננית: 6, גינון: 6, השקיה: 4, דשא: 4, גיזום: 3, גינה: 2 }, preset: 'eco_nature', category: 'home', flow: 'form', base: 'garden_service', title: 'שירותי גינון', itemsLabel: 'שירותים' },
  // Retail
  { id: 'print', label: 'הדפסה', words: { הדפס: 6, הדפסה: 6, דפוס: 6, 'בית דפוס': 6 }, preset: 'creative_studio', category: 'retail', flow: 'form', base: 'custom_print', title: 'הזמנת הדפסה', itemsLabel: 'מוצר' },
  { id: 'shop', label: 'חנות', words: { חנות: 2, מארז: 3, מארזים: 3, מתנה: 2, מתנות: 3, בגדים: 4, תכשיט: 4, תכשיטים: 4, נרות: 4, 'עבודת יד': 3, חריטה: 3, אונליין: 1 }, preset: 'luxury_noir', category: 'retail', flow: 'form', base: 'gift_box', title: 'הזמנה מהחנות', itemsLabel: 'מה תרצו להזמין?' },
  // Community
  { id: 'survey', label: 'סקר ומשוב', words: { סקר: 8, משוב: 8, 'שביעות רצון': 8, 'חוות דעת': 6 }, preset: 'modern_minimal', category: 'community', flow: 'registration', title: 'משוב לקוחות' },
  { id: 'volunteer', label: 'התנדבות', words: { מתנדב: 6, מתנדבים: 6, התנדב: 6, התנדבות: 6 }, preset: 'community_warm', category: 'community', flow: 'form', base: 'volunteer_signup', title: 'הרשמה להתנדבות', itemsLabel: 'תחום התנדבות' },
  { id: 'donation', label: 'תרומות', words: { תרומ: 6, תרומה: 6, תרומות: 6, 'קרן מלגות': 4 }, preset: 'community_warm', category: 'community', flow: 'form', base: 'donation_pledge', title: 'תרומה', itemsLabel: 'סכום' },
  // Professional
  { id: 'lawyer', label: 'משרד עורכי דין', words: { 'עורך דין': 7, 'עורכת דין': 7, 'עורכי דין': 7, משפטי: 3, 'דיני משפחה': 4, 'ייצוג': 3, נוטריון: 6 }, preset: 'legal_trust', category: 'professional', flow: 'form', base: 'legal_intake', title: 'פנייה ראשונית', itemsLabel: 'סוג השירות' },
  { id: 'accountant', label: 'הנהלת חשבונות', words: { 'רואה חשבון': 7, 'רואת חשבון': 7, 'הנהלת חשבונות': 7, 'החזר מס': 6, 'החזרי מס': 6, 'טופס 106': 4, 'דוח שנתי': 4, 'יועץ מס': 6 }, preset: 'corporate_modern', category: 'professional', flow: 'form', base: 'document_collection', title: 'איסוף מסמכים' },
  { id: 'real_estate', label: 'נדל״ן', words: { נדלן: 4, מתווך: 6, מתווכת: 6, תיווך: 6, שמאי: 6, שמאית: 6, 'צפייה בדירה': 5, נכס: 3, נכסים: 3 }, preset: 'luxury_noir', category: 'professional', flow: 'appointment', services: ['צפייה בנכס', 'פגישת היכרות'], minutes: 30, title: 'תיאום צפייה', itemsLabel: 'סוג הפגישה', needs: ['address'] },
  { id: 'consultant', label: 'ייעוץ', words: { יועץ: 5, יועצת: 5, קואצ: 7, קאוצ: 7, משכנתא: 4, משכנתאות: 4, 'ייעוץ עסקי': 6, מנטור: 5 }, preset: 'finance_clarity', category: 'professional', flow: 'appointment', services: ['שיחת היכרות', 'פגישת ייעוץ'], minutes: 60, title: 'תיאום פגישת ייעוץ', itemsLabel: 'סוג הפגישה' },
  { id: 'office', label: 'משרד', words: { 'קליטת לקוח': 4, 'לקלוט לקוח': 4, 'לקוח עסקי': 3, סוכנות: 4, בריף: 5, ביטוח: 6, 'סוכן ביטוח': 7, 'שיווק דיגיטלי': 4, חברה: 1, משרד: 1 }, preset: 'corporate_modern', category: 'professional', flow: 'form', base: 'document_collection', title: 'קליטת לקוח חדש' },
  // Pets
  { id: 'pet_grooming', label: 'טיפוח לחיות מחמד', words: { 'מספרת כלבים': 9, 'מספרה לכלבים': 9, טיפוח: 3, רחצה: 2, 'גזיזת ציפורניים': 3, כלב: 1, כלבים: 1, חתול: 1, חתולים: 1 }, preset: 'pets_friendly', category: 'pets', flow: 'appointment', services: ['רחצה וייבוש', 'תספורת', 'גזיזת ציפורניים'], minutes: 60, title: 'קביעת תור לטיפוח', itemsLabel: 'איזה טיפול?', needs: ['pet'] },
  { id: 'pet_care', label: 'פנסיון וטיולים לכלבים', words: { פנסיון: 6, דוגווקר: 7, 'הוצאת כלבים': 6, 'אילוף': 5, כלב: 1, כלבים: 1, חתול: 1, 'בעלי חיים': 1 }, preset: 'pets_friendly', category: 'pets', flow: 'form', base: 'dog_boarding', title: 'הזמנה לפנסיון', itemsLabel: 'גודל הכלב' },
  // Travel
  { id: 'cabin', label: 'צימר ונופש', words: { צימר: 7, בקתות: 5, בקתת: 5, צימרים: 7, וילה: 5, נופש: 3, לינה: 3, 'סוויטה': 3, 'בקתה': 4 }, preset: 'travel_coastal', category: 'travel', flow: 'form', base: 'cabin_booking', title: 'הזמנת לינה', itemsLabel: 'יחידה' },
  { id: 'tour', label: 'סיורים וטיולים', words: { סיור: 6, סיורי: 6, סיורים: 6, טיול: 4, טיולי: 4, טיולים: 4, גיפים: 3, 'מדריך טיולים': 6 }, preset: 'travel_coastal', category: 'travel', flow: 'registration', title: 'הרשמה לסיור' },
  // Fallback
  { id: 'lead', label: 'פנייה', words: { 'צור קשר': 3, פנייה: 1, פניות: 1 }, preset: 'modern_minimal', category: 'professional', flow: 'form', base: 'generic', title: 'צרו קשר' },
];

export const industryById = (id: IndustryId) => INDUSTRIES.find((i) => i.id === id)!;

export interface IndustryMatch {
  industry: Industry;
  score: number;
  matched: string[];
}

/** The best-matching business type for a canonical description, or null when nothing matches. */
export function detectIndustry(text: string): IndustryMatch | null {
  const tokens = text.split(' ').filter(Boolean);
  let best: IndustryMatch | null = null;
  for (const industry of INDUSTRIES) {
    const matched = Object.keys(industry.words).filter((w) => tokenMatches(text, tokens, w.trim()));
    // A phrase covers its own words ("מאמן כושר" is not also "מאמן" + "כושר").
    // A phrase covers its words, and a stem covers its longer forms ("מארז" + "מארזים" count once).
    const kept = matched.filter((w) => !matched.some((o) => o !== w && ((o.includes(' ') && o.includes(w.trim())) || (!w.includes(' ') && !o.includes(' ') && w.startsWith(o.trim())))));
    const score = kept.reduce((s, w) => s + industry.words[w]!, 0);
    if (score > (best?.score ?? 0)) best = { industry, score, matched: kept };
  }
  return best;
}
