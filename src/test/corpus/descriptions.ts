/**
 * How business owners actually describe what they need — short and long, with slang, typos,
 * English words, numbers as digits or words, ranges, hours and prices — and what each one
 * must produce. Expectations are only what the owner said (plus the kind of business).
 */
import type { CorpusCase } from './score';

export const CORPUS: CorpusCase[] = [
  // ---------- restaurants ----------
  { id: 'rest-1', text: 'מסעדה איטלקית, רוצים שלקוחות יזמינו שולחן. פתוחים א׳-ה׳ 18:00-23:00, בין 2 ל-8 סועדים, בלי תשלום', industry: 'restaurant', has: ['date', 'time', 'guests'], days: [0, 1, 2, 3, 4], hours: ['18:00', '23:00'], guests: [2, 8], completion: 'request' },
  { id: 'rest-2', text: 'הזמנות שולחן לביסטרו שלנו כל יום חוץ משבת, משעה 12 עד 22', industry: 'restaurant', has: ['date', 'time'], days: [0, 1, 2, 3, 4, 5], hours: ['12:00', '22:00'] },
  { id: 'rest-3', text: 'אנחנו מסעדת שף קטנה. רוצה טופס להזמנת מקום, עד 6 אנשים בשולחן, לפחות 3 שעות מראש', industry: 'restaurant', has: ['date', 'time', 'guests'], guests: [null, 6], notice: 3 },
  { id: 'rest-4', text: 'restaurant booking - שולחנות לערב, 19:00 עד 23:30, עד 40 סועדים בכל חצי שעה', industry: 'restaurant', has: ['date', 'time'], hours: ['19:00', '23:30'], capacity: 40 },
  { id: 'rest-5', text: 'בר מסעדה בתל אביב, הזמנת שולחן רק בחמישי ושישי משמונה בערב עד חצות', industry: 'restaurant', has: ['date', 'time'], days: [4, 5], hours: ['20:00', '24:00'] },
  { id: 'rest-6', text: 'מסעדה כשרה, הזמנות שולחן עם מקדמה של 50 ש"ח לסועד', industry: 'restaurant', has: ['date', 'time', 'guests'], notes: ['מקדמה'] },
  { id: 'rest-7', text: 'מסעדה - משלוחים: הזמנת אוכל מהתפריט עם משלוח 15 ש"ח', industry: 'restaurant', fee: ['משלוח', 15], has: ['address'] },
  { id: 'rest-8', text: 'פיצריה, הזמנה לאיסוף: פיצה משפחתית 60, פיצה אישית 35, תוספת 8 ש"ח', industry: 'restaurant', prices: [['פיצה משפחתית', 60], ['פיצה אישית', 35], ['תוספת', 8]] },
  { id: 'rest-9', text: 'מסעדה שרוצה לקבל הזמנות שולחן עם תאריך, שעה ומספר סועדים', industry: 'restaurant', has: ['date', 'time', 'guests'] },
  { id: 'rest-10', text: 'מסעדת דגים בנמל, שולחנות בצהריים 12:00-16:00 ובערב 19:00-23:00, סגור בראשון', industry: 'restaurant', has: ['date', 'time'], days: [1, 2, 3, 4, 5, 6] },

  // ---------- private events at a restaurant ----------
  { id: 'revent-1', text: 'מסעדה שמקבלת בקשות לאירועים פרטיים עם מספר אורחים, תפריט ומקדמה', industry: 'restaurant_event', has: ['date', 'guests'], completion: 'deposit' },
  { id: 'revent-2', text: 'אירועים סגורים במסעדה: 20 עד 80 אורחים, תפריט בשרי 220 ₪ לאורח או חלבי 160 ₪ לאורח, מקדמה 30%', industry: 'restaurant_event', guests: [20, 80], prices: [['בשרי', 220], ['חלבי', 160]], deposit: 30 },
  { id: 'revent-3', text: 'חדר פרטי במסעדה לאירועים עד 40 איש, מקדמה של 25 אחוז אחרי אישור', industry: 'restaurant_event', guests: [null, 40], deposit: 25, approval: true },
  { id: 'revent-4', text: 'בקשת הצעת מחיר לאירוע פרטי במסעדה', industry: 'restaurant_event', completion: 'quote' },
  { id: 'revent-5', text: 'הצעת מחיר לאירוע פרטי עם מספר אורחים, תפריט ומקדמה אופציונלית', industry: 'restaurant_event', has: ['guests'], notes: ['מקדמה אופציונלית'] },

  // ---------- cafés ----------
  { id: 'cafe-1', text: 'בית קפה שכונתי, רוצים לקבל הזמנות שולחן לארוחת בוקר בשישי, 8:00-12:00', industry: 'cafe', has: ['date', 'time'], days: [5], hours: ['08:00', '12:00'] },
  { id: 'cafe-2', text: 'קפה עם הזמנת מגשי אירוח: מגש כריכים 180 ש"ח, מגש מאפים 150, מגש פירות 200, איסוף עצמי או משלוח 40 ש"ח', industry: 'cafe', prices: [['כריכים', 180], ['מאפים', 150], ['פירות', 200]], fee: ['משלוח', 40] },
  { id: 'cafe-3', text: 'coffee shop - הזמנת עוגות ומאפים לחגים מראש, לפחות יומיים לפני', industry: 'cafe', has: ['date'], notice: 48 },
  { id: 'cafe-4', text: 'בית קפה רוצה לקבל הזמנות שולחן לקבוצות, בין 6 ל-20 איש', industry: 'cafe', has: ['date', 'guests'], guests: [6, 20] },
  { id: 'cafe-5', text: "בית קפה, הזמנת שולחן לבראנץ' בשבת מ-9 בבוקר עד 1 בצהריים", industry: 'cafe', has: ['date', 'time'], days: [6], hours: ['09:00', '13:00'] },
  { id: 'cafe-6', text: 'גלידריה, הזמנת מגשי גלידה לאירועים עם מספר אורחים ותאריך', industry: 'cafe', has: ['date', 'guests'] },

  // ---------- catering ----------
  { id: 'cater-1', text: 'קייטרינג בשרי לאירועים, מינימום 30 מנות, תפריט קלאסי 120 ש"ח למנה, פרימיום 170', industry: 'catering', guests: [30, null], prices: [['קלאסי', 120], ['פרימיום', 170]] },
  { id: 'cater-2', text: 'קייטרינג חלבי לבריתות ואירועי חברה, צריך לדעת כמה אורחים, תאריך, כתובת ומקדמה 20%', industry: 'catering', has: ['guests', 'date', 'address'], deposit: 20 },
  { id: 'cater-3', text: 'אני עושה קיטרינג ביתי, רוצה שיזמינו אוכל לשבת עם תאריך ומספר מנות', industry: 'catering', has: ['date', 'guests'] },
  { id: 'cater-4', text: 'Catering לאירועים עסקיים, הצעת מחיר בלבד, בין 50 ל-500 משתתפים', industry: 'catering', completion: 'quote', guests: [50, 500] },
  { id: 'cater-5', text: 'שף פרטי לארוחות בבית, תפריט טעימות 350 לסועד, מינימום 6 סועדים', industry: 'catering', guests: [6, null], priceValues: [350] },

  // ---------- bakeries ----------
  { id: 'bake-1', text: 'קונדטוריה - עוגות מעוצבות ליום הולדת, גדלים: קטנה 250, בינונית 380, גדולה 520 ש"ח, איסוף או משלוח 45 ש"ח', industry: 'bakery', prices: [['קטנה', 250], ['בינונית', 380], ['גדולה', 520]], fee: ['משלוח', 45] },
  { id: 'bake-2', text: 'מאפייה: הזמנות לחלות ועוגות לשבת, איסוף בשישי בין 7 בבוקר ל-1 בצהריים', industry: 'bakery', has: ['date'] },
  { id: 'bake-3', text: 'אני אופה עוגות בבית, רוצה טופס הזמנה עם טעם, גודל, כיתוב על העוגה ותאריך איסוף, 3 ימים מראש לפחות', industry: 'bakery', has: ['date'], labels: ['טעם', 'גודל', 'כיתוב'], notice: 72 },
  { id: 'bake-4', text: 'מגשי עוגיות ומארזים מתוקים לחגים, משלוח חינם מעל 300 ש"ח', industry: 'bakery', notes: ['משלוח'] },
  { id: 'bake-5', text: 'עוגות בצק סוכר לבר מצווה ובת מצווה, הצעת מחיר לפי עיצוב', industry: 'bakery', completion: 'quote' },

  // ---------- florists ----------
  { id: 'flor-1', text: 'אני חנות פרחים ורוצה שלקוחות יזמינו זר עם תקציב, צבעים, ברכה ומשלוח', industry: 'florist', labels: ['תקציב', 'צבע'], has: ['greeting', 'address'] },
  { id: 'flor-2', text: 'משלוחי פרחים: זר קטן 120 ש"ח, זר בינוני 200, זר גדול 300, משלוח 35 ש"ח בתוך העיר', industry: 'florist', prices: [['זר קטן', 120], ['זר בינוני', 200], ['זר גדול', 300]], fee: ['משלוח', 35] },
  { id: 'flor-3', text: 'פלוריסטית לאירועים וחתונות, רוצה לקבל פניות להצעת מחיר על עיצוב פרחים', industry: 'florist', completion: 'quote', has: ['date'] },
  { id: 'flor-4', text: 'חנות פרחים, הזמנה עד 12 בצהריים למשלוח באותו יום, כרטיס ברכה בחינם', industry: 'florist', has: ['greeting', 'date'] },
  { id: 'flor-5', text: 'flowers shop - זרים לוולנטיינז עם אפשרות להוסיף בלונים 40 ש"ח ושוקולד 60 ש"ח', industry: 'florist', prices: [['בלונים', 40], ['שוקולד', 60]] },
  { id: 'flor-6', text: 'חנות פרחים שהלקוח מעצב זר, בוחר צבעים וכרטיס ברכה, עם מחיר משלוח', industry: 'florist', has: ['greeting'], labels: ['צבע'] },

  // ---------- garages ----------
  { id: 'gar-1', text: 'מוסך שרוצה שהלקוח יאשר או ידחה כל תיקון ברכב ויראה את הסכום', industry: 'garage', approval: false },
  { id: 'gar-2', text: 'מוסך - קביעת תור לטיפול שנתי, א-ה 7:30 עד 16:00, שישי 8-12', industry: 'garage', has: ['date', 'time'], days: [0, 1, 2, 3, 4, 5], hours: ['07:30', '16:00'] },
  { id: 'gar-3', text: "פנצ'רייה וצמיגים, רוצים שיזמינו החלפת צמיגים מראש עם מספר רכב", industry: 'garage', labels: ['רישוי'], has: ['date'] },
  { id: 'gar-4', text: 'מכונאי רכב עצמאי, אבחון תקלה 150 ש"ח, החלפת שמן 250 ש"ח', industry: 'garage', prices: [['אבחון תקלה', 150], ['החלפת שמן', 250]] },
  { id: 'gar-5', text: 'מוסך שולח ללקוח פירוט תיקונים לאישור עם מחירים, בלי תשלום באתר', industry: 'garage', completion: 'request' },
  { id: 'gar-6', text: 'מוסך שרוצה שהלקוח יאשר תיקונים, יחתום חתימה דיגיטלית ויקבל SMS וחשבונית', industry: 'garage', notes: ['חתימה', 'SMS', 'חשבונית'] },

  // ---------- hair ----------
  { id: 'hair-1', text: 'מספרה שרוצה שלקוחות יקבעו תור לתספורת או צבע', industry: 'hair_salon', options: ['תספורת', 'צבע'], has: ['date', 'time'] },
  { id: 'hair-2', text: 'ברבר שופ: תספורת 30 דק׳ 70 ש"ח, תספורת וזקן 45 דקות 100 ש"ח, 2 ספרים, א-ה 10-20, ו 9-14', industry: 'hair_salon', durations: [['תספורת וזקן', 45]], prices: [['תספורת וזקן', 100]], staff: 2, days: [0, 1, 2, 3, 4, 5], hours: ['10:00', '20:00'] },
  { id: 'hair-3', text: 'מיספרת נשים, תספורת, פן, צבע וגוונים. פתוח ב׳-ו׳', industry: 'hair_salon', options: ['תספורת', 'פן', 'צבע', 'גוונים'], days: [1, 2, 3, 4, 5] },
  { id: 'hair-4', text: 'salon שיער, תספורת גברים 60 שקל, תספורת נשים 150 שקל, תור לפחות שעתיים מראש', industry: 'hair_salon', prices: [['תספורת גברים', 60], ['תספורת נשים', 150]], notice: 2 },
  { id: 'hair-5', text: 'מספרה לילדים, כל תור חצי שעה, ראשון עד חמישי בין 9 ל-19', industry: 'hair_salon', days: [0, 1, 2, 3, 4], hours: ['09:00', '19:00'], durations: [['*', 30]] },
  { id: 'hair-6', text: 'Hi, I need a booking form for my barbershop', industry: 'hair_salon', has: ['date', 'time'] },
  { id: 'hair-7', text: 'מספרה לגברים. תספורת 30 דקות, תספורת וזקן 45 דקות. עובדים בימים א-ה 9 עד 19 ובשישי 8 עד 14. שני ספרים.', industry: 'hair_salon', durations: [['תספורת', 30], ['תספורת וזקן', 45]], staff: 2, days: [0, 1, 2, 3, 4, 5], hours: ['09:00', '19:00'] },
  { id: 'hair-8', text: 'מספרה ומכון יופי - תספורת, מניקור וטיפול פנים', industry: 'hair_salon', options: ['תספורת', 'מניקור', 'טיפול פנים'] },

  // ---------- nails ----------
  { id: 'nail-1', text: 'סטודיו לציפורניים: לק ג׳ל 120, בניית ציפורניים 220, פדיקור 150. בנייה לוקחת שעה וחצי', industry: 'nails', prices: [['לק ג׳ל', 120], ['בניית ציפורניים', 220], ['פדיקור', 150]] },
  { id: 'nail-2', text: 'מניקוריסטית מהבית, רק בימים א׳ ג׳ ה׳', industry: 'nails', days: [0, 2, 4], has: ['date', 'time'] },
  { id: 'nail-3', text: 'nails studio, לק גל ומניקור, בלי תשלום מראש', industry: 'nails', options: ['לק', 'מניקור'], completion: 'request' },
  { id: 'nail-4', text: 'ציפרניים בעיצוב אישי, תור של שעה, עד 5 תורים ביום', industry: 'nails', durations: [['*', 60]], perDay: 5 },

  // ---------- cosmetics ----------
  { id: 'cos-1', text: 'קוסמטיקאית - טיפול פנים 250 ש"ח שעה, הסרת שיער בשעווה 30 דקות 80 ש"ח', industry: 'cosmetics', prices: [['טיפול פנים', 250], ['הסרת שיער', 80]], durations: [['טיפול פנים', 60], ['הסרת שיער', 30]] },
  { id: 'cos-2', text: 'הרמת ריסים ועיצוב גבות, כל טיפול 45 דקות, א-ה 9-18', industry: 'cosmetics', options: ['ריסים', 'גבות'], durations: [['*', 45]], days: [0, 1, 2, 3, 4], hours: ['09:00', '18:00'] },
  { id: 'cos-3', text: 'מאפרת כלות, רוצה פניות לאיפור ליום החתונה עם מקדמה 30%', industry: 'cosmetics', has: ['date'], deposit: 30 },
  { id: 'cos-4', text: 'איפור ערב 300 ש"ח, איפור כלה 1200 ש"ח כולל ניסיון', industry: 'cosmetics', prices: [['איפור ערב', 300], ['איפור כלה', 1200]] },
  { id: 'cos-5', text: 'קוסמטיקאית, טיפול פנים ואיפור, בימים א-ה בין 10 ל-19, עד 8 תורים ביום, לפחות 12 שעות מראש', industry: 'cosmetics', options: ['טיפול פנים', 'איפור'], days: [0, 1, 2, 3, 4], hours: ['10:00', '19:00'], perDay: 8, notice: 12 },

  // ---------- spa & massage ----------
  { id: 'spa-1', text: 'ספא זוגי, עיסוי שוודי 60 דק׳ 350, עיסוי רקמות עמוק 90 דק׳ 450, שישי ושבת סגור', industry: 'spa', prices: [['עיסוי שוודי', 350], ['עיסוי רקמות עמוק', 450]], durations: [['עיסוי שוודי', 60], ['עיסוי רקמות עמוק', 90]], days: [0, 1, 2, 3, 4] },
  { id: 'spa-2', text: 'מטפלת בעיסוי רפואי, מגיעה עד הבית, צריך כתובת', industry: 'spa', has: ['address', 'date'] },
  { id: 'spa-3', text: 'רפלקסולוגיה ושיאצו, טיפול של שעה, אפשר לקבוע עד שבועיים קדימה', industry: 'spa', options: ['רפלקסולוגיה', 'שיאצו'], durations: [['*', 60]], ahead: 14 },
  { id: 'spa-4', text: 'מעסה עם 3 חדרי טיפול, עיסוי 50 דקות', industry: 'spa', staff: 3, durations: [['עיסוי', 50]] },

  // ---------- clinics ----------
  { id: 'clin-1', text: 'מרפאה כללית, קביעת תור לרופא משפחה, תור כל 15 דקות, 8:00-13:00 ו-16:00-19:00', industry: 'clinic', has: ['date', 'time'], hours: ['08:00', '19:00'], durations: [['*', 15]] },
  { id: 'clin-2', text: 'קליניקה לפסיכותרפיה, פגישת היכרות 50 דקות, פגישה רגילה 50 דקות 400 ש"ח', industry: 'clinic', durations: [['פגישת היכרות', 50], ['פגישה רגילה', 50]], prices: [['פגישה רגילה', 400]] },
  { id: 'clin-3', text: 'רופאת עור פרטית, ביקור 600 ש"ח, ביקורת 300 ש"ח, אישור ידני של כל תור', industry: 'clinic', prices: [['ביקור', 600], ['ביקורת', 300]], approval: true },
  { id: 'clin-4', text: 'מכון לבדיקות שמיעה, תור לבדיקה, 3 עמדות במקביל', industry: 'clinic', staff: 3, has: ['date', 'time'] },
  { id: 'clin-5', text: 'קלינאית תקשורת לילדים, אבחון ראשוני וטיפול שבועי', industry: 'clinic', options: ['אבחון', 'טיפול'] },

  // ---------- dental ----------
  { id: 'dent-1', text: 'מרפאת שיניים: בדיקה וניקוי 45 דקות, הלבנה שעה. ימים א-ה', industry: 'dental', durations: [['בדיקה וניקוי', 45], ['הלבנה', 60]], days: [0, 1, 2, 3, 4] },
  { id: 'dent-2', text: 'שיננית, ניקוי אבנית 250 ש"ח, תורים בימי שני ורביעי 14:00-19:00', industry: 'dental', prices: [['ניקוי אבנית', 250]], days: [1, 3], hours: ['14:00', '19:00'] },
  { id: 'dent-3', text: 'רופא שיניים לילדים, תור ראשון חינם', industry: 'dental', has: ['date', 'time'] },

  // ---------- physio ----------
  { id: 'phys-1', text: 'פיזיוטרפיה ספורט, טיפול 45 דק׳, 2 מטפלים, עד חודש קדימה', industry: 'physio', durations: [['*', 45]], staff: 2, ahead: 30 },
  { id: 'phys-2', text: 'פיזיותרפיסטית עד הבית לגיל השלישי, צריך כתובת ותיאור הבעיה', industry: 'physio', has: ['address'] },
  { id: 'phys-3', text: 'כירופרקט, טיפול ראשון 400 ש"ח, טיפול המשך 300 ש"ח', industry: 'physio', prices: [['טיפול ראשון', 400], ['טיפול המשך', 300]] },

  // ---------- nutrition ----------
  { id: 'nutr-1', text: 'דיאטנית קלינית, פגישת ייעוץ ראשונה 350 ש"ח שעה, פגישת מעקב 200 ש"ח חצי שעה', industry: 'nutrition', prices: [['ייעוץ ראשונה', 350], ['מעקב', 200]], durations: [['ייעוץ ראשונה', 60], ['מעקב', 30]] },
  { id: 'nutr-2', text: 'תזונאית ספורט, רוצה טופס היכרות עם משקל, גובה ומטרות', industry: 'nutrition', labels: ['משקל', 'גובה', 'מטר'] },

  // ---------- trainers ----------
  { id: 'fit-1', text: 'מאמן כושר אישי, אימון של שעה 200 ש"ח, כרטיסייה של 10 אימונים 1800 ש"ח', industry: 'trainer', priceValues: [200, 1800] },
  { id: 'fit-2', text: 'personal trainer בפארק, אימונים בבוקר 6-9 בימים א׳-ה׳', industry: 'trainer', days: [0, 1, 2, 3, 4], hours: ['06:00', '09:00'] },
  { id: 'fit-3', text: 'מאמנת ריצה, אימון קבוצתי עד 12 משתתפים, 60 ש"ח לאימון', industry: 'trainer', capacity: 12, priceValues: [60] },
  { id: 'fit-4', text: 'סטודיו קרוספיט, שיעור ניסיון בחינם', industry: 'trainer', completion: 'request', options: ['שיעור ניסיון'] },
  { id: 'fit-5', text: 'מאמן אישי, אימונים בבית הלקוח, 3 אימונים בשבוע מקסימום', industry: 'trainer', has: ['date', 'address'] },

  // ---------- yoga & pilates ----------
  { id: 'yoga-1', text: 'סטודיו ליוגה, רוצה טופס הרשמה עם תאריך ואימייל', industry: 'yoga', has: ['date', 'email'] },
  { id: 'yoga-2', text: 'פילאטיס מכשירים, שיעור פרטי 220, שיעור זוגי 150, 4 מכשירים', industry: 'yoga', prices: [['שיעור פרטי', 220], ['שיעור זוגי', 150]], staff: 4 },
  { id: 'yoga-3', text: 'שיעורי יוגה בגינה בשבת בבוקר, 50 ש"ח לשיעור, עד 15 משתתפים', industry: 'yoga', capacity: 15, priceValues: [50] },
  { id: 'yoga-4', text: 'פילאטיס לנשים אחרי לידה, שיעור של 55 דקות, ב׳ ד׳ 9:00-12:00', industry: 'yoga', durations: [['*', 55]], days: [1, 3], hours: ['09:00', '12:00'] },

  // ---------- tutors ----------
  { id: 'tut-1', text: 'מורה פרטי למתמטיקה, שיעור 45 דקות 150 ש"ח, הכנה לבגרות', industry: 'tutor', durations: [['*', 45]], priceValues: [150] },
  { id: 'tut-2', text: 'שיעורי אנגלית בזום לילדים, כל שיעור חצי שעה, בימים ב׳ וד׳', industry: 'tutor', durations: [['*', 30]], days: [1, 3] },
  { id: 'tut-3', text: 'מורה לפסנתר, שיעור ניסיון חינם ואחר כך 180 ש"ח לשיעור', industry: 'tutor', options: ['שיעור ניסיון'], priceValues: [180] },
  { id: 'tut-4', text: 'tutoring לתלמידי תיכון - פיזיקה, מתמטיקה, כימיה', industry: 'tutor', options: ['פיזיקה', 'מתמטיקה', 'כימיה'] },
  { id: 'tut-5', text: 'מורה לנהיגה, שיעור 40 דקות 160 ש"ח, טסט פנימי 250', industry: 'tutor', durations: [['*', 40]], priceValues: [160, 250] },

  // ---------- courses ----------
  { id: 'crs-1', text: 'הרשמה לקורס צילום, 3 מחזורים, 1200 ש"ח, עד 15 משתתפים בכל מחזור', industry: 'course', capacity: 15, priceValues: [1200] },
  { id: 'crs-2', text: 'קורס דיגיטלי אונליין, תשלום מלא בהרשמה 490 ש"ח', industry: 'course', priceValues: [490], has: ['email'] },
  { id: 'crs-3', text: 'קורס בישול איטלקי 4 מפגשים, 850 ש"ח, באישור ידני', industry: 'course', approval: true, priceValues: [850] },
  { id: 'crs-4', text: 'קורס עזרה ראשונה לחברות, הרשמה לקבוצות, תאריך לבחירה', industry: 'course', has: ['date'] },

  // ---------- kids classes ----------
  { id: 'kid-1', text: 'חוג כדורגל לילדים בגילאי 6-10, הרשמה עם אישור הורים', industry: 'kids_class', has: ['age', 'parent'] },
  { id: 'kid-2', text: 'חוגי אמנות: ציור, פיסול וקרמיקה, 180 ש"ח לחודש, עד 10 ילדים בקבוצה', industry: 'kids_class', options: ['ציור', 'פיסול', 'קרמיקה'], capacity: 10, priceValues: [180] },
  { id: 'kid-3', text: "חוג ג'ודו לגן ולכיתות א-ב, הרשמה לשנה", industry: 'kids_class', has: ['age'] },
  { id: 'kid-4', text: 'חוג רובוטיקה לנוער, 2 קבוצות גיל, 220 ש"ח לחודש', industry: 'kids_class', priceValues: [220] },

  // ---------- camps ----------
  { id: 'camp-1', text: 'קייטנת קיץ לילדים, 3 מחזורים, 950 ש"ח למחזור, אישור הורה, תשלום אחרי אישור', industry: 'camp', has: ['parent'], priceValues: [950], completion: 'pay_after_approval' },
  { id: 'camp-2', text: 'קייטנת פסח, בין 7:30 ל-13:00, גילאי 5-9, עד 25 ילדים', industry: 'camp', capacity: 25, has: ['age'] },
  { id: 'camp-3', text: 'קייטנה ספורטיבית, הרשמה נסגרת ב-30.6, אישור הורה', industry: 'camp', closes: '06-30', has: ['parent'] },

  // ---------- workshops ----------
  { id: 'ws-1', text: 'סדנת קרמיקה, 2 מועדים, עד 8 משתתפים, 280 ש"ח', industry: 'workshop', capacity: 8, priceValues: [280] },
  { id: 'ws-2', text: 'סדנה לאפיית לחם מחמצת בשישי בבוקר, 350 ש"ח, באישור ידני', industry: 'workshop', approval: true, priceValues: [350] },
  { id: 'ws-3', text: 'הרשמה לסדנה עם 2 מועדים, עד 12 משתתפים, באישור ידני, ללא תשלום', industry: 'workshop', capacity: 12, approval: true, completion: 'request' },
  { id: 'ws-4', text: 'סדנת קוקטיילים לזוגות, 2 משתתפים בהרשמה, 400 ש"ח לזוג', industry: 'workshop', priceValues: [400] },
  { id: 'ws-5', text: 'הרשמה לסדנת קרמיקה, ההרשמה נסגרת ב-20.12, הרשמה אחת לכל משתתף', industry: 'workshop', closes: '12-20' },

  // ---------- conferences ----------
  { id: 'conf-1', text: 'כנס מקצועי למנהלי שיווק, כרטיס רגיל 450 ש"ח, VIP 900 ש"ח, הרשמה עד 30.11', industry: 'conference', prices: [['רגיל', 450], ['VIP', 900]], closes: '11-30' },
  { id: 'conf-2', text: 'וובינר חינמי על השקעות, רק שם ואימייל', industry: 'conference', completion: 'request', has: ['email'] },
  { id: 'conf-3', text: 'מיטאפ למפתחים, עד 120 משתתפים, הרשמה עם אישור ידני', industry: 'conference', capacity: 120, approval: true },

  // ---------- contests ----------
  { id: 'cont-1', text: 'תהליך הרשמה לתחרות עם שלושה מסלולים, הגבלת משתתפים, אישור הורה לקטינים ותשלום אופציונלי', industry: 'contest', has: ['parent'] },
  { id: 'cont-2', text: 'מרוץ 5 ו-10 ק"מ, 5 ק"מ 80 ש"ח, 10 ק"מ 120 ש"ח, מגיל 12 עם אישור הורה', industry: 'contest', prices: [['5 קמ', 80], ['10 קמ', 120]], has: ['parent'] },
  { id: 'cont-3', text: 'טורניר שש-בש, דמי השתתפות 50 שקל, עד 64 משתתפים', industry: 'contest', capacity: 64, priceValues: [50] },
  { id: 'cont-4', text: 'תחרות צילום לחובבים, להעלות עד 3 תמונות, פרס למקום ראשון', industry: 'contest', has: ['file'] },

  // ---------- photographers ----------
  { id: 'photo-1', text: 'צלם אירועים, הצעת מחיר לחתונות ובר מצוות', industry: 'photographer', completion: 'quote', has: ['date'] },
  { id: 'photo-2', text: 'צלמת משפחה וניו בורן, סשן חוץ 800 ש"ח, סשן סטודיו 1100 ש"ח, מקדמה 300 ש"ח', industry: 'photographer', prices: [['סשן חוץ', 800], ['סשן סטודיו', 1100]], notes: ['מקדמה'] },
  { id: 'photo-3', text: 'צילומי תדמית לעסקים, חבילה בסיסית 650 ופרימיום 1200, כולל עריכה', industry: 'photographer', prices: [['בסיסית', 650], ['פרימיום', 1200]] },
  { id: 'photo-4', text: 'photographer לבת מצווה, 4 שעות צילום, אלבום אופציונלי', industry: 'photographer', labels: ['אלבום'], has: ['date'] },
  { id: 'photo-5', text: 'סטודיו לצילום שרוצה טופס פנייה', industry: 'photographer', has: ['phone'] },

  // ---------- venues ----------
  { id: 'venue-1', text: 'גן אירועים, בקשה לבדיקת תאריך פנוי לחתונה, 150 עד 600 אורחים', industry: 'event_venue', has: ['date'], guests: [150, 600] },
  { id: 'venue-2', text: 'אולם קטן לאירועים משפחתיים עד 120 איש, מקדמה 10% אחרי אישור', industry: 'event_venue', guests: [null, 120], deposit: 10, approval: true },
  { id: 'venue-3', text: 'לופט להשכרה לאירועים ופוטושוטים, 400 ש"ח לשעה, מינימום 3 שעות', industry: 'event_venue', priceValues: [400], has: ['date'] },

  // ---------- weddings ----------
  { id: 'wed-1', text: 'מפיקת חתונות, פנייה ראשונית עם תאריך, מספר מוזמנים ותקציב', industry: 'wedding', has: ['date', 'guests'], labels: ['תקציב'] },
  { id: 'wed-2', text: 'עיצוב חתונות וחופות, הצעת מחיר לפי מספר אורחים', industry: 'wedding', completion: 'quote', has: ['guests'] },

  // ---------- kids parties ----------
  { id: 'kparty-1', text: 'מפעיל ימי הולדת לילדים, חבילה בסיסית 900, חבילת פרימיום 1400, משחקים ובועות סבון', industry: 'kids_party', prices: [['בסיסית', 900], ['פרימיום', 1400]] },
  { id: 'kparty-2', text: 'יום הולדת לילדים בבית, גילאי 3-8, עד 25 ילדים, מקדמה 200 ש"ח', industry: 'kids_party', guests: [null, 25], notes: ['מקדמה'] },

  // ---------- RSVP ----------
  { id: 'rsvp-1', text: 'אישור הגעה לחתונה של דנה ויוסי, כמה מגיעים ובחירת מנה: בשר, דג או צמחוני', industry: 'rsvp', options: ['בשר', 'דג', 'צמחוני'], has: ['guests'] },
  { id: 'rsvp-2', text: 'RSVP לבר מצווה, עד 4 מוזמנים לכל הזמנה', industry: 'rsvp', guests: [null, 4] },
  { id: 'rsvp-3', text: 'אישורי הגעה לאירוע חברה עם הסעה', industry: 'rsvp', labels: ['הסעה'] },

  // ---------- event services ----------
  { id: 'evs-1', text: 'DJ לאירועים, הצעת מחיר לפי שעות ותאריך', industry: 'event_services', completion: 'quote', has: ['date'] },
  { id: 'evs-2', text: 'עיצוב בלונים לאירועים, קשת בלונים 450 ש"ח, עמוד בלונים 180', industry: 'event_services', prices: [['קשת בלונים', 450], ['עמוד בלונים', 180]] },
  { id: 'evs-3', text: 'קוסם לימי הולדת, מופע 45 דקות 1200 ש"ח', industry: 'event_services', priceValues: [1200], has: ['date'] },

  // ---------- cleaning ----------
  { id: 'clean-1', text: 'חברת ניקיון: ניקיון שוטף 250 ש"ח, ניקיון יסודי 450, אחרי שיפוץ 800', industry: 'cleaning', prices: [['שוטף', 250], ['יסודי', 450], ['אחרי שיפוץ', 800]] },
  { id: 'clean-2', text: 'עוזרת בית לפי שעה, 60 ש"ח לשעה, מינימום 3 שעות, א-ו', industry: 'cleaning', priceValues: [60], minNumber: 3 },
  { id: 'clean-3', text: 'ניקוי ספות ושטיחים, ספה 3 מושבים 300 ש"ח, שטיח 150 ש"ח, להעלות תמונה', industry: 'cleaning', prices: [['ספה', 300], ['שטיח', 150]], has: ['file'] },
  { id: 'clean-4', text: 'שירותי ניקיון למשרדים, הצעת מחיר לפי שטח במ"ר', industry: 'cleaning', completion: 'quote', labels: ['שטח'] },

  // ---------- contractors ----------
  { id: 'build-1', text: 'קבלן שיפוצים שרוצה לקבל בקשות להצעת מחיר עם תמונות', industry: 'contractor', has: ['file'], completion: 'quote' },
  { id: 'build-2', text: 'שיפוץ מטבחים ואמבטיות, ביקור בבית לפני הצעה, צריך כתובת וטלפון', industry: 'contractor', has: ['address', 'phone'] },
  { id: 'build-3', text: 'רצף ושיפוצים כלליים, רוצה שהלקוח יתאר את העבודה, ישלח תמונות ויבחר דחיפות', industry: 'contractor', has: ['file'], labels: ['דחיפות'] },
  { id: 'build-4', text: 'צביעת דירות: 3 חדרים 2500, 4 חדרים 3200, 5 חדרים 3900', industry: 'contractor', prices: [['3 חדרים', 2500], ['4 חדרים', 3200], ['5 חדרים', 3900]] },

  // ---------- technicians ----------
  { id: 'tech-1', text: 'טכנאי מזגנים: ניקוי מזגן 200 ש"ח, התקנה 450 ש"ח, ביקור טכנאי 150', industry: 'technician', prices: [['ניקוי מזגן', 200], ['התקנה', 450], ['ביקור טכנאי', 150]] },
  { id: 'tech-2', text: 'חשמלאי מוסמך, קריאת שירות, דחוף או רגיל', industry: 'technician', labels: ['דחיפות'], has: ['address'] },
  { id: 'tech-3', text: 'אינסטלאטור 24/7, פתיחת סתימות 250 ש"ח, תיקון נזילה 300', industry: 'technician', prices: [['פתיחת סתימות', 250], ['תיקון נזילה', 300]] },
  { id: 'tech-4', text: 'תיקון מכונות כביסה ומקררים, ביקור 180 ש"ח שמקוזז מהתיקון', industry: 'technician', priceValues: [180] },

  // ---------- moving ----------
  { id: 'move-1', text: 'הובלות דירות, צריך כתובת מוצא, כתובת יעד, קומה ומעלית', industry: 'moving', labels: ['מוצא', 'יעד', 'קומה', 'מעלית'] },
  { id: 'move-2', text: 'הובלות קטנות ומשלוחים, הצעת מחיר תוך שעה', industry: 'moving', completion: 'quote' },

  // ---------- gardening ----------
  { id: 'gard-1', text: 'גנן - תחזוקת גינה חודשית 400 ש"ח, גיזום עצים בהצעת מחיר', industry: 'garden', prices: [['תחזוקת גינה', 400]] },
  { id: 'gard-2', text: 'השקיה ודשא סינתטי, הצעת מחיר לפי מ"ר עם תמונות', industry: 'garden', completion: 'quote', has: ['file'] },

  // ---------- shops ----------
  { id: 'shop-1', text: 'חנות מתנות, מארזים: מארז קטן 150, מארז יין 280, מארז פינוק 390, ברכה אישית ומשלוח 30 ש"ח', industry: 'shop', prices: [['מארז קטן', 150], ['מארז יין', 280], ['מארז פינוק', 390]], fee: ['משלוח', 30], has: ['greeting'] },
  { id: 'shop-2', text: 'חנות בגדים אונליין - הזמנה עם מידה S M L XL וצבע', industry: 'shop', options: ['S', 'M', 'L', 'XL'], labels: ['צבע'] },
  { id: 'shop-3', text: 'סטודיו לנרות בעבודת יד, הזמנה מותאמת אישית עם ריח וצבע', industry: 'shop', labels: ['ריח', 'צבע'] },
  { id: 'shop-4', text: 'חנות תכשיטים, חריטה אישית על שרשרת בתוספת 50 ש"ח', industry: 'shop', prices: [['חריטה', 50]] },

  // ---------- printing ----------
  { id: 'print-1', text: 'הדפסה על חולצות לאירועים, מינימום 10 חולצות, 45 ש"ח לחולצה, להעלות לוגו', industry: 'print', priceValues: [45], has: ['file'], minNumber: 10 },
  { id: 'print-2', text: 'בית דפוס - הזמנות לחתונה ומגנטים, הצעת מחיר', industry: 'print', completion: 'quote' },

  // ---------- community ----------
  { id: 'vol-1', text: 'עמותה שמחפשת מתנדבים לחלוקת מזון בימי שישי', industry: 'volunteer', has: ['phone'] },
  { id: 'vol-2', text: 'הרשמה להתנדבות בבית אבות, בחירת תחום: מוזיקה, שיחה, עזרה בארוחות', industry: 'volunteer', options: ['מוזיקה', 'שיחה', 'עזרה בארוחות'] },
  { id: 'don-1', text: 'עמותה לבעלי חיים, טופס תרומה עם סכומים 50, 100, 180 ש"ח', industry: 'donation', priceValues: [50, 100, 180] },
  { id: 'don-2', text: 'קרן מלגות, התחייבות לתרומה חודשית עם קבלה לפי סעיף 46', industry: 'donation', notes: ['קבלה'] },
  { id: 'surv-1', text: 'סקר שביעות רצון ללקוחות אחרי טיפול', industry: 'survey' },
  { id: 'surv-2', text: 'משוב אחרי סדנה, דירוג 1-5 ומה אפשר לשפר', industry: 'survey' },
  { id: 'surv-3', text: 'סקר שביעות רצון ללקוחות אחרי טיפול, עם דירוג והערות', industry: 'survey' },

  // ---------- professional ----------
  { id: 'acc-1', text: 'משרד רואה חשבון שצריך לאסוף מסמכים מלקוחות חדשים', industry: 'accountant', has: ['file'] },
  { id: 'acc-2', text: 'הנהלת חשבונות לעסקים קטנים, קליטת לקוח עם תעודת עוסק, אישור ניהול חשבון ודוחות', industry: 'accountant', has: ['file'] },
  { id: 'acc-3', text: 'החזרי מס לשכירים, בדיקת זכאות חינם, צריך טופס 106', industry: 'accountant', has: ['file'], completion: 'request' },
  { id: 'law-1', text: 'עורכת דין לדיני משפחה, פנייה ראשונית חסויה עם תיאור המקרה', industry: 'lawyer', labels: ['תיאור'] },
  { id: 'law-2', text: 'משרד עורכי דין נדל"ן, פגישת ייעוץ ראשונה 500 ש"ח', industry: 'lawyer', priceValues: [500] },
  { id: 'off-1', text: 'חברה שרוצה לקלוט לקוח עסקי חדש ולאסוף מסמכים וחתימה על הסכם', industry: 'office', has: ['file'], notes: ['חתימה'] },
  { id: 'off-2', text: 'סוכנות דיגיטל, טופס בריף ללקוח חדש: מטרות, קהל יעד, תקציב חודשי', industry: 'office', labels: ['מטרות', 'קהל יעד', 'תקציב'] },
  { id: 'off-3', text: 'סוכן ביטוח, בקשה להצעת ביטוח רכב עם מספר רכב', industry: 'office', labels: ['רכב'], completion: 'quote' },
  { id: 'cons-1', text: 'יועץ עסקי, תיאום שיחת ייעוץ של 30 דקות בחינם', industry: 'consultant', durations: [['*', 30]], has: ['date', 'time'] },
  { id: 'cons-2', text: "מאמנת אישית (קואצ'ינג), פגישה של שעה 350 ש\"ח", industry: 'consultant', durations: [['*', 60]], priceValues: [350] },
  { id: 'cons-3', text: 'יועצת משכנתאות, פגישה ראשונה ללא עלות, א-ה 9-17', industry: 'consultant', days: [0, 1, 2, 3, 4], hours: ['09:00', '17:00'] },
  { id: 're-1', text: 'מתווך נדל"ן, תיאום צפייה בדירה, בחירת מועד', industry: 'real_estate', has: ['date'] },
  { id: 're-2', text: 'שמאי מקרקעין, הזמנת שומה לדירה עם כתובת וגודל במ"ר', industry: 'real_estate', has: ['address'], labels: ['גודל'] },

  // ---------- pets ----------
  { id: 'pet-1', text: 'פנסיון כלבים, 120 ש"ח ללילה, צריך תאריך הגעה ועזיבה וחיסונים', industry: 'pet_care', priceValues: [120], labels: ['חיסון'], has: ['date'] },
  { id: 'pet-2', text: 'דוגווקר בשכונה, הליכה של חצי שעה ארבעים שקל', industry: 'pet_care', priceValues: [40] },
  { id: 'pet-3', text: 'מספרת כלבים: כלב קטן 150, בינוני 200, גדול 280', industry: 'pet_grooming', prices: [['קטן', 150], ['בינוני', 200], ['גדול', 280]] },
  { id: 'pet-4', text: 'טיפוח לחתולים וכלבים, רחצה וגזיזת ציפורניים', industry: 'pet_grooming', options: ['רחצה', 'גזיזת ציפורניים'] },
  { id: 'vet-1', text: 'מרפאה וטרינרית, תור לחיסון 15 דקות, בדיקה כללית 30 דקות', industry: 'vet', durations: [['חיסון', 15], ['בדיקה כללית', 30]] },
  { id: 'vet-2', text: 'ווטרינרית שמגיעה הביתה, ביקור בית 350 ש"ח', industry: 'vet', priceValues: [350], has: ['address'] },

  // ---------- travel ----------
  { id: 'cab-1', text: 'צימר בגליל, 2 יחידות, 750 ש"ח ללילה באמצע שבוע ו-950 בסופ"ש, מינימום 2 לילות', industry: 'cabin', priceValues: [750, 950] },
  { id: 'cab-2', text: 'וילה להשכרה לנופש עד 20 אורחים, מקדמה 30%', industry: 'cabin', guests: [null, 20], deposit: 30 },
  { id: 'tour-1', text: 'סיורי אוכל בשוק הכרמל, 180 ש"ח למשתתף, עד עשרים בסיור', industry: 'tour', capacity: 20, priceValues: [180] },
  { id: 'tour-2', text: "מדריך טיולי ג'יפים בנגב, הזמנה לקבוצות בין 4 ל-12 אנשים", industry: 'tour', guests: [4, 12] },

  // ---------- general ----------
  { id: 'lead-1', text: 'צריך טופס פנייה כללי עם תאריך ואימייל', industry: 'lead', has: ['date', 'email'] },
  { id: 'lead-2', text: 'טופס צור קשר לאתר', industry: 'lead', has: ['phone'] },
];
