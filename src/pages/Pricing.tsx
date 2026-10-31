import { Check, Info } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { ButtonLink, cx } from '../components/ui';
import { formatCurrency } from '../lib/format';
import { PLANS } from '../lib/plans';

export function Pricing() {
  return (
    <div className="min-h-screen bg-cloud">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-midnight">מחירים שקופים</h1>
          <p className="mx-auto mt-3 max-w-lg text-ink-muted">תוכנית חודשית פשוטה, בלי התחייבות. מחיר לפני מע״מ.</p>
          <p role="note" className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-amber-900">
            <Info className="h-4 w-4" aria-hidden /> מחירים להמחשה בלבד — אין חיוב או סליקה אמיתיים בדמו
          </p>
        </div>

        <ul className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((p) => {
            const hl = 'highlight' in p;
            return (
              <li key={p.key} className={cx('relative flex flex-col rounded-3xl border bg-white p-7', hl ? 'border-orange shadow-lift' : 'border-cloud-200 shadow-card')}>
                {hl && <span className="absolute -top-3 start-7 rounded-full bg-orange px-3 py-1 text-xs font-semibold text-white">הכי פופולרי</span>}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="mt-1 text-sm text-ink-muted">{p.blurb}</p>
                <p className="mt-6">
                  <span className="text-4xl font-semibold tabular-nums text-midnight">{formatCurrency(p.price)}</span>
                  <span className="text-sm text-ink-muted"> לחודש</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
                <ButtonLink to="/demo" variant={hl ? 'primary' : 'secondary'} className="mt-8 w-full">
                  נסו בדמו
                </ButtonLink>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-center text-xs text-ink-soft">* תשלומים ומקדמות קיימים בדמו כסימולציה בלבד. בגרסת ייצור יחוברו לספק סליקה מורשה.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
