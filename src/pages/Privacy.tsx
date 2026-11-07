/**
 * Privacy and terms for the sales demo. States only what this build actually does; facts the
 * owner must supply (legal entity details) are marked as pending rather than invented.
 * Checklist for the owner: docs/LEGAL_PLACEHOLDERS.md.
 */
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { CONTACT_EMAIL, salesMailto } from '../lib/links';
import { runtimeConfiguration } from '../production/runtime';

/** Version of the production notice an account accepts when it is created. */
export const PRIVACY_VERSION = '2026-11-08';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-cloud-200 py-6 first:border-0 first:pt-0">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export function Privacy() {
  if (runtimeConfiguration.mode === 'production') return <ProductionPrivacy />;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-orange-700">פרטיות ותנאי שימוש</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">מה קורה עם המידע באתר הדמו</h1>
        <p className="mt-3 text-ink-muted">האתר הזה הוא הדגמה של Formangle מבית RockStack Digital Solutions. הוא נועד להציג את המוצר, ולא לנהל לקוחות אמיתיים.</p>

        <div className="mt-8">
          <Section title="המידע נשמר בדפדפן שלכם בלבד">
            <p>תהליכים, בקשות, פעולות ללקוח, הגדרות מותג ותמונות שאתם מעלים נשמרים באחסון המקומי של הדפדפן (localStorage) במכשיר שבו עבדתם. הם לא נשלחים לשרת של RockStack, ואין לנו גישה אליהם.</p>
            <p>האתר לא משתמש בעוגיות מעקב ולא בכלי אנליטיקה של צד שלישי. המספרים במסך „אנליטיקה” מחושבים במכשיר שלכם מתוך הנתונים המקומיים.</p>
            <p>האתר מאוחסן ב-GitHub Pages. ספק האחסון עשוי לרשום נתוני גישה טכניים, כמו כתובת IP, לפי המדיניות שלו.</p>
          </Section>
          <Section title="אל תזינו מידע אמיתי של לקוחות">
            <p>הדמו לא כולל שרת, הזדהות, הצפנה בצד שרת או הפרדה בין עסקים. השתמשו בפרטים לדוגמה בלבד. בגרסה שתוקם לעסק, המידע יישמר בתשתית מאובטחת שתוגדר בהסכם.</p>
          </Section>
          <Section title="מה מדומה">
            <p>תשלומים, הודעות SMS, אימייל ו-WhatsApp, ושיתוף בקשות בין מכשירים — כולם מדומים ומסומנים ככאלה. לחיצה על „תשלום” לא מחייבת אף אחד, ושום הודעה לא יוצאת מהדפדפן.</p>
            <p>אישורים ובחירות של לקוח בדמו נשמרים לצורך הדגמה בלבד, ואינם חתימה אלקטרונית או הסכמה מחייבת.</p>
            <p>קישור לעמוד תשלום חיצוני מוביל לאתר של העסק. Formangle לא מעבד את התשלום ולא שומר פרטי כרטיס.</p>
          </Section>
          <Section title="מחיקת הנתונים">
            <p>בכל רגע: „הגדרות” ← „איפוס נתוני הדמו”, או ניקוי נתוני האתר בהגדרות הדפדפן. אין עותק של הנתונים במקום אחר.</p>
          </Section>
          <Section title="יצירת קשר">
            <p>
              כפתורי „יצירת קשר” פותחים את תוכנת הדואר שלכם עם הודעה מוכנה אל{' '}
              <a className="font-medium text-orange-700 underline" href={salesMailto('שאלה על פרטיות באתר Formangle', '')}>
                <bdi>{CONTACT_EMAIL}</bdi>
              </a>
              . רק מה שתבחרו לשלוח יגיע אלינו, ויטופל כהתכתבות עסקית רגילה.
            </p>
          </Section>
          <Section title="תנאי שימוש בדמו">
            <p>הדמו ניתן כמות שהוא, להתרשמות בלבד. המחירים באתר הם הצעה כללית; ההתקשרות בפועל, היקף ההקמה ומחירה נקבעים בהצעה ובהסכם בכתב.</p>
            <p>העסקים, השמות והנתונים בסביבות הדמו בדיוניים.</p>
          </Section>
          <Section title="פרטי החברה">
            <p className="rounded-xl border border-dashed border-cloud-300 p-3 text-sm">פרטי הרישום המלאים של RockStack Digital Solutions (שם משפטי, מספר רישום וכתובת) יפורסמו כאן לאחר אימות. עד אז אפשר לפנות בכתובת שלמעלה.</p>
          </Section>
        </div>
        <p className="mt-6 text-xs text-ink-soft">עודכן לגרסת RC 1.0 של הדמו.</p>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * The production notice: what the operated service actually does. Facts that need the legal
 * entity (registration number, address) stay pending in docs/LEGAL_PLACEHOLDERS.md.
 */
function ProductionPrivacy() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-orange-700">פרטיות ותנאי שימוש</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">איך Formangle שומר על המידע</h1>
        <p className="mt-3 text-ink-muted">Formangle הוא שירות של RockStack Digital Solutions שעסקים משתמשים בו כדי לקבל בקשות, לשלוח הצעות מחיר ולעדכן את הלקוחות שלהם. גרסה {PRIVACY_VERSION}.</p>
        <div className="mt-8">
          <Section title="מי אחראי למידע">
            <p>כל עסק אחראי למידע שהלקוחות שלו שולחים בטפסים שלו. RockStack מפעילה את השירות עבור העסק ומעבדת את המידע רק כדי לספק אותו.</p>
          </Section>
          <Section title="מה נשמר ואיפה">
            <p>תשובות לטפסים, הצעות מחיר, החלטות, הערות פנימיות, הגדרות מותג ותמונות שהעסק מעלה נשמרים בשרתי Supabase באירלנד (האיחוד האירופי), מוצפנים בתעבורה ובאחסון.</p>
            <p>חשבונות של בעלי עסקים וצוות נוצרים רק בהזמנה. סיסמאות נשמרות כגיבוב בלבד, ואף אחד — כולל RockStack — אינו רואה אותן.</p>
          </Section>
          <Section title="מי רואה מה">
            <p>כל עסק רואה רק את הבקשות שלו; ההפרדה נאכפת בבסיס הנתונים. לקוח רואה את הבקשה שלו רק דרך קישור פרטי שהעסק יכול לבטל בכל רגע, ולעולם לא רואה הערות פנימיות. צוות RockStack רואה נתוני ניהול בלבד (שמות עסקים וכמויות), לא את תוכן הבקשות.</p>
          </Section>
          <Section title="תשלומים, הודעות וחתימות">
            <p>Formangle לא גובה תשלומים ולא שומר פרטי אשראי. אישור הצעת מחיר אינו חיוב ואינו חתימה אלקטרונית. השירות לא שולח הודעות SMS, וואטסאפ או אימייל בשם העסק.</p>
          </Section>
          <Section title="עוגיות ומעקב">
            <p>אין עוגיות מעקב ואין כלי אנליטיקה או פרסום של צד שלישי. הדפדפן שומר רק את פרטי ההתחברות של בעלי עסקים וצוות.</p>
          </Section>
          <Section title="שמירה, גיבוי ומחיקה">
            <p>המידע נשמר כל עוד העסק פעיל בשירות, ומגובה מדי יום לשבעה ימים. לקוח שרוצה לעיין במידע שלו או למחוק אותו פונה לעסק; עסק יכול לבקש מ-RockStack ייצוא או מחיקה של המידע שלו.</p>
          </Section>
          <Section title="יצירת קשר">
            <p>
              <a className="font-medium text-orange-700 underline" href={salesMailto('פנייה בנושא פרטיות', '')}>{CONTACT_EMAIL}</a>
            </p>
          </Section>
        </div>
        <p className="mt-6 text-xs text-ink-soft">הנוסח ממתין לבדיקה משפטית ולהשלמת פרטי הישות המשפטית (docs/LEGAL_PLACEHOLDERS.md).</p>
      </main>
      <SiteFooter />
    </>
  );
}
