/** Catalogue of future payment connectors. Nothing here connects to anything. */
import { ChevronDown, CreditCard } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { PAYMENT_PROVIDERS } from '../../integrations/payments';

const CAP_LABELS = { hosted_checkout: 'דף סליקה מאובטח', payment_link: 'קישור תשלום', tokenization: 'שמירת אמצעי תשלום', invoices: 'חשבוניות', bit: 'Bit' } as const;

export function PaymentConnectors() {
  return (
    <Card as="section" className="p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CreditCard className="h-4 w-4" aria-hidden /> חיבורי תשלום
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            בדמו פעיל רק <strong className="font-medium text-ink">חיבור מדומה</strong>: כפתורי ״תשלום״ מסמנים סימולציה ואינם מחייבים. הספקים למטה הם קטלוג לתכנון — לא מחוברים, ללא הזנת מפתחות וללא סליקה. תהליכי ״בקשה בלבד״ ו״הצעת מחיר״ עובדים ללא שום ספק.
          </p>
        </div>
        <Badge tone="teal">פעיל: סימולציה מקומית</Badge>
      </div>
      {/* A planning catalogue, not a row of dead buttons: one compact list, folded by default. */}
      <details className="group mt-5 rounded-xl border border-cloud-200">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span>ספקים מתוכננים <span className="font-normal text-ink-muted">({PAYMENT_PROVIDERS.length})</span></span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="grid border-t border-cloud-200 sm:grid-cols-2">
          {PAYMENT_PROVIDERS.map((p) => (
            <li key={p.id} className="min-w-0 border-b border-cloud-100 px-4 py-3 last:border-b-0">
              <p className="break-words font-medium" dir={/[a-z]/i.test(p.name) ? 'ltr' : undefined}>{p.name}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{p.capabilities.map((c) => CAP_LABELS[c]).join(' · ')}</p>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-4 text-xs text-ink-soft">בגרסה המלאה כל ספק מתחבר בצד השרת, והתשלום עצמו נעשה בדף הסליקה המאובטח של הספק. פרטי אשראי לעולם לא מוזנים בטפסי Formangle.</p>
    </Card>
  );
}
