/**
 * The fictional demo businesses' own touches (announcement, sticker, owner note, promises,
 * sign-off), keyed by workflow slug. Used by the seed and by the v5 → v6 migration, which applies
 * them to demo workspaces only. People and promises here belong to invented businesses.
 * Slugs are written out (not imported from seed.ts) to keep the module graph acyclic.
 */
import type { ThemeExtras } from '../domain/theme';

const URBAN_RIBBON = 'ערבי שישי בתפריט טעימות · מספר המקומות מוגבל';

export const DEMO_EXTRAS: Record<string, ThemeExtras> = {
  'bloom-flowers': {
    ribbon: 'הזמנה עד 13:00 יוצאת למשלוח עוד היום',
    badge: 'עבודת יד',
    welcome: { name: 'נועה', role: 'מעצבת הפרחים של הסטודיו (דמו)', message: 'כל זר נבנה ביד מהפרחים שהגיעו הבוקר. ספרו לי למי הוא מיועד ומה האירוע, ואני אדאג לשאר.' },
    promises: [
      { icon: 'star', text: 'עיצוב אישי לכל זר' },
      { icon: 'clock', text: 'אישור הזמנה תוך שעה' },
    ],
    signoff: { message: 'תודה שבחרתם בנו. אחזור אליכם לאישור הזר והמשלוח.', name: 'נועה, Bloom Studio' },
  },
  'autocare-repairs': {
    ribbon: 'פתוח א׳–ה׳ 07:30–18:00 · שירות לכל סוגי הרכבים',
    badge: 'מוסך מורשה',
    welcome: { name: 'אבי', role: 'יועץ השירות שלך (דמו)', message: 'בדקתי את הרכב ופירטתי כאן כל ממצא עם מחיר. אשרו רק את מה שמתאים לכם. אם יש שאלה, אני זמין בטלפון.' },
    promises: [
      { icon: 'wrench', text: 'רק מה שאישרתם' },
      { icon: 'shield', text: 'אחריות על העבודה' },
      { icon: 'clock', text: 'עדכון כשהרכב מוכן' },
    ],
    pattern: 'grid',
    signoff: { message: 'קיבלנו את ההחלטות שלך. נבצע רק את מה שאישרת ונעדכן כשהרכב מוכן.', name: 'אבי, AutoCare' },
  },
  'urban-table-events': {
    ribbon: URBAN_RIBBON,
    badge: 'שף בית',
    welcome: { name: 'עידו', role: 'מנהל האירועים (דמו)', message: 'ספרו לנו על האירוע ונחזור עם הצעה מסודרת: תפריט, שעות ומחיר. שום דבר לא סופי עד שתאשרו.' },
    promises: [
      { icon: 'chef', text: 'תפריט שף מותאם' },
      { icon: 'calendar', text: 'מענה תוך יום עסקים' },
      { icon: 'star', text: 'חדר פרטי עד 80 סועדים' },
    ],
    signoff: { message: 'נחזור אליכם עם הצעה מלאה. נתראה בקרוב, ובתיאבון.', name: 'עידו וצוות Urban Table' },
  },
  'urban-table-booking': {
    ribbon: URBAN_RIBBON,
    promises: [
      { icon: 'calendar', text: 'אישור הזמנה מהמסעדה' },
      { icon: 'heart', text: 'מקומות לילדים ולעגלות' },
    ],
    signoff: { message: 'שמרנו את הבקשה. נאשר את השולחן בהקדם.', name: 'צוות Urban Table' },
  },
  'valley-run': {
    ribbon: 'ההרשמה פתוחה · מספר המקומות בכל מסלול מוגבל',
    badge: 'מרוץ קהילתי',
    promises: [
      { icon: 'heart', text: 'מסלול למשפחות' },
      { icon: 'shield', text: 'צוות עזרה ראשונה' },
      { icon: 'star', text: 'מדליה לכל מסיים' },
    ],
    signoff: { message: 'נתראה בקו הזינוק!', name: 'צוות Valley Run' },
  },
};
