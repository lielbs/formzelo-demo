/**
 * Formangle Tables on the public site: what a restaurant gets, shown with real screenshots of the
 * current product (public/showcase/tables, taken from the automated screen audit with demo data).
 * Used on the landing page and the demo page so both tell the same story.
 */
import { ClipboardList, LayoutGrid, Moon, Smartphone, UsersRound, Utensils } from 'lucide-react';
import { appHref } from '../lib/links';
import { cx } from '../components/ui';

const POINTS = [
  { icon: Utensils, title: 'משמרת חיה במבט אחד', text: 'כמה סועדים יושבים, כמה עוד צפויים, אילו שולחנות פנויים ומי מאחר. כל מספר עם היחידה שלו.' },
  { icon: Smartphone, title: 'פעולה אחת לכל הזמנה', text: 'הגיעו, הושבה, סיום. הפעולה הבאה נמצאת בשורה עצמה, והמשמרת מתעדכנת בזמן אמת אצל כל הצוות.' },
  { icon: LayoutGrid, title: 'מפת שולחנות שאפשר לעבוד איתה', text: 'מצב כל שולחן, שיבוץ והעברה בנגיעה, גם בטלפון, עם שולחנות בגודל אצבע.' },
  { icon: ClipboardList, title: 'רשימת המתנה וקוד QR בכניסה', text: 'אורחים מצטרפים מהטלפון, ואתם רואים זמן המתנה ושולחן מתאים עם הושבה בלחיצה.' },
  { icon: UsersRound, title: 'כל עובד רואה את מה שלו', text: 'גישה לשולחנות בלבד, לטפסים ולבקשות בלבד, או להכול. ההרשאות נאכפות בשרת.' },
  { icon: Moon, title: 'מצב כהה למשמרת הערב', text: 'כל Formangle, כולל המשמרת, עובר לתצוגה כהה לפי המכשיר או בבחירה.' },
];

export function TablesShowcase({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <section id="tables" aria-labelledby="tables-title" className={cx('scroll-mt-16', className)}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <p className="text-sm font-medium text-orange-700">Formangle Tables · למסעדות ובתי קפה</p>
          <h2 id="tables-title" className="mt-2 text-3xl font-semibold tracking-tight text-midnight">הזמנות, משמרת ושולחנות, בלי לחפש בתפריטים</h2>
          <p className="mt-3 max-w-xl leading-relaxed text-ink-muted">
            דף הזמנה ותפריט במיתוג של המקום, ומשמרת חיה שבנויה סביב מה שהמארח צריך לעשות עכשיו. אותה מערכת, אותו חשבון ואותה שפה עיצובית כמו שאר Formangle.
          </p>
          <ul className={cx('mt-7 grid gap-x-6 gap-y-5', !compact && 'sm:grid-cols-2')}>
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-soft">Formangle Tables פועל על השרת המאובטח של Formangle ונפתח לכל מסעדה בהקמה עם RockStack. בתמונות: נתוני הדגמה.</p>
        </div>
        <figure className="relative">
          <img src={appHref('/showcase/tables/shift-tablet.png')} alt="משמרת חיה בטאבלט: רשימת ההזמנות לפי שעה ופרטי הזמנה עם פעולת ההושבה" loading="lazy"
            width={1024} height={768} className="w-full rounded-2xl shadow-lift" />
          <img src={appHref('/showcase/tables/shift-phone.png')} alt="המשמרת בטלפון: סועדים יושבים, צפויים ושולחנות פנויים, ורשימת ההזמנות" loading="lazy"
            width={375} height={812} className="absolute -bottom-8 start-[-0.5rem] hidden w-[34%] rounded-[22px] border-4 border-white shadow-lift sm:block" />
          <figcaption className="sr-only">צילומי מסך של Formangle Tables</figcaption>
        </figure>
      </div>
    </section>
  );
}
