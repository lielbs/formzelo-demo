/** Catalog of future payment connectors. Nothing here connects to anything. */
import { CreditCard, PlugZap } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
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
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PAYMENT_PROVIDERS.map((p) => (
          <li key={p.id} className="flex flex-col rounded-xl border border-cloud-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold" dir={/[a-z]/i.test(p.name) ? 'ltr' : undefined}>
                {p.name}
              </span>
              <Badge tone="neutral">לא מחובר · עתידי</Badge>
            </div>
            <p className="mt-2 flex-1 text-xs text-ink-muted">{p.capabilities.map((c) => CAP_LABELS[c]).join(' · ')}</p>
            <Button size="sm" variant="secondary" icon={PlugZap} className="mt-3" disabled aria-label={`חיבור ${p.name} — לא זמין בדמו`}>
              חיבור — לא זמין בדמו
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-soft">בגרסת ייצור כל ספק יחובר בצד השרת דרך ממשק PaymentProviderAdapter, עם דף סליקה מאובטח של הספק ואימות webhooks. פרטי אשראי לעולם לא יוזנו בטפסי Formangle.</p>
    </Card>
  );
}
