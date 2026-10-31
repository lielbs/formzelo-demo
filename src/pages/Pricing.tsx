import { ClipboardList, Headphones, Palette, Rocket } from 'lucide-react';
import { PackageCards, PricingFinePrint } from '../components/Packages';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { ButtonLink } from '../components/ui';
import { PACKAGES, PRICING_TERMS } from '../lib/plans';

const SETUP = [
  { icon: ClipboardList, title: 'אפיון', text: 'שיחה על הלקוחות, השירותים והתהליכים שהעסק רוצה להעביר לדיגיטל.' },
  { icon: Palette, title: 'הקמה ומיתוג', text: 'RockStack בונה את התהליכים, ערכת המותג והקישורים העסקיים.' },
  { icon: Rocket, title: 'בדיקה ופרסום', text: 'עוברים יחד על חוויית הלקוח ועל לוח הבקשות, ואז מפרסמים.' },
  { icon: Headphones, title: 'ליווי', text: 'תמיכה והתאמות לפי החבילה. פיתוח מותאם ואינטגרציות — בהצעה נפרדת.' },
];

const COMPARE: [string, string, string, string][] = [
  ['תהליכים פעילים', 'עד 3', 'עד 8', 'לפי אפיון'],
  ['ערכת מותג וחוויות לקוח ממותגות', '✓', '✓', '✓'],
  ['לוח בקרה לניהול בקשות', '✓', '✓', '✓'],
  ['נוכחות דיגיטלית וקישורים עסקיים', '✓', '✓', '✓'],
  ['תנאים ולוגיקה מורכבת', '—', '✓', '✓'],
  ['ריבוי סניפים ואינטגרציות מותאמות', '—', '—', '✓'],
  ['תמיכה', 'רגילה', 'מורחבת', 'לפי הסכם'],
  ['הקמה', 'אישית', 'הטמעה אישית', 'פרויקט מותאם'],
];

export function Pricing() {
  return (
    <div className="min-h-screen bg-cloud">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-orange-700">חבילות Formangle</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">שירות מנוהל, מותאם לעסק שלכם</h1>
          <p className="mt-3 leading-relaxed text-ink-muted">{PRICING_TERMS.managed} מחיר חודשי קבוע, ודמי הקמה חד-פעמיים שנקבעים לפי מה שהעסק צריך.</p>
          <p className="mt-3 text-sm font-medium text-ink">{PRICING_TERMS.indicative} {PRICING_TERMS.vat}</p>
        </div>

        <PackageCards className="mt-10" />

        <section aria-labelledby="compare-title" className="mt-12 hidden rounded-2xl border border-cloud-200 bg-white p-6 shadow-card md:block">
          <h2 id="compare-title" className="text-lg font-semibold text-midnight">השוואה מהירה</h2>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-cloud-200 text-start text-ink-muted">
                <th scope="col" className="py-2 text-start font-medium">
                  <span className="sr-only">יכולת</span>
                </th>
                {PACKAGES.map((p) => (
                  <th key={p.key} scope="col" className="w-[22%] py-2 text-center font-semibold text-ink">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([label, ...vals]) => (
                <tr key={label} className="border-b border-cloud-200 last:border-0">
                  <th scope="row" className="py-2.5 text-start font-normal text-ink">
                    {label}
                  </th>
                  {vals.map((v, i) => (
                    <td key={i} className={v === '—' ? 'py-2.5 text-center text-ink-soft' : 'py-2.5 text-center text-ink'}>
                      {v === '✓' ? <span aria-label="כלול" className="font-semibold text-teal">✓</span> : v === '—' ? <span aria-label="לא כלול">—</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="setup-title" className="mt-12">
          <h2 id="setup-title" className="text-center text-2xl font-semibold tracking-tight text-midnight">מה כוללת ההקמה</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SETUP.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-cloud-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <s.icon className="h-5 w-5 text-orange-700" aria-hidden />
                  <span className="text-xs tabular-nums text-ink-soft">0{i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <PricingFinePrint className="max-w-2xl" />
          <ButtonLink to="/tour" variant="secondary">
            צפו בהדגמה לפני שמדברים
          </ButtonLink>
          <p className="text-xs text-ink-soft">בדמו אין חיוב, סליקה או מנוי. המחירים מוצגים לצורך שיחת מכירה בלבד.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
