/**
 * Privacy and terms for the sales demo. States only what this build actually does; facts the
 * owner must supply (legal entity details) are marked as pending rather than invented.
 * Checklist for the owner: docs/LEGAL_PLACEHOLDERS.md.
 */
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { CONTACT_EMAIL, salesMailto } from '../lib/links';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-cloud-200 py-6 first:border-0 first:pt-0">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export function Privacy() {
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
