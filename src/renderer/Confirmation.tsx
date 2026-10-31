import { CheckCircle2, Clock } from 'lucide-react';
import { PaymentBadge, StatusBadge } from '../components/StatusBadge';
import type { WorkflowConfig, WorkflowRun } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { formatCurrency, formatDateTime } from '../lib/format';
import { BrandRow } from './parts';

const REVIEWED: WorkflowRun['status'][] = ['in_review', 'approved', 'rejected', 'completed', 'cancelled'];
const DECIDED: WorkflowRun['status'][] = ['approved', 'rejected', 'completed', 'cancelled'];

function nextSteps(run: WorkflowRun, config: WorkflowConfig) {
  const hasDecisions = run.answers.some((a) => a.value === 'approved' || a.value === 'declined');
  const steps = [
    { label: 'הבקשה התקבלה ונשמרה', done: true },
    { label: hasDecisions ? 'העסק מקבל את ההחלטות ומבצע רק את מה שאישרתם' : 'העסק בודק את הפרטים', done: REVIEWED.includes(run.status) },
  ];
  if (config.pricing.depositPercent > 0 && run.payment.amount > 0) {
    steps.push({
      label: `לאחר אישור תתבקש מקדמה של ${formatCurrency(run.payment.amount)} — סימולציה בלבד, ללא חיוב`,
      done: run.payment.status === 'deposit_paid_simulated',
    });
  }
  steps.push({ label: 'עדכון סטטוס יופיע בעמוד הזה (הודעות בדמו הן מדומות ואינן נשלחות)', done: DECIDED.includes(run.status) });
  return steps;
}

/** Branded confirmation / status page, rendered with the run's own frozen version theme. */
export function Confirmation({ run, config, theme, logoUrl, justSubmitted }: { run: WorkflowRun; config: WorkflowConfig; theme: WorkflowTheme; logoUrl?: string; justSubmitted: boolean }) {
  const decisions = run.answers.filter((a) => a.value === 'approved' || a.value === 'declined');
  return (
    <div className="mx-auto w-full max-w-xl px-3 py-6 sm:py-12">
      <div className="mb-5 flex justify-center">
        <BrandRow name={config.branding.logoText} logoUrl={logoUrl} showName={theme.logo.showName} />
      </div>
      <section className="fz-card fz-pad fz-step" data-dir="fwd" aria-labelledby="fz-confirm-title">
        <div className="text-center">
          <span className="fz-confirm-icon" aria-hidden>
            {justSubmitted ? <CheckCircle2 className="h-8 w-8" /> : <Clock className="h-8 w-8" />}
          </span>
          <h1 id="fz-confirm-title" className="fz-display mt-4 text-[calc(1.7rem*var(--fz-display-scale))]">
            {justSubmitted ? 'נשלח בהצלחה' : config.title}
          </h1>
          <p className="fz-muted mx-auto mt-2 max-w-md text-[15px] leading-relaxed">{justSubmitted ? config.successMessage : 'זהו מצב הבקשה העדכני כפי שנשמר בדפדפן זה.'}</p>
        </div>

        <div className="fz-panel mt-7 p-4 text-center">
          <p className="fz-muted text-xs">מספר הבקשה</p>
          <p className="fz-ref mt-1">
            <bdi>{run.reference}</bdi>
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <StatusBadge status={run.status} />
            <PaymentBadge payment={run.payment} />
          </div>
        </div>

        <div className="fz-review mt-5">
          <dl className="fz-review-section !py-2">
            {run.submittedAt && (
              <div>
                <dt>נשלח</dt>
                <dd>{formatDateTime(run.submittedAt)}</dd>
              </div>
            )}
            {run.total > 0 && (
              <div>
                <dt>{config.pricing.totalLabel}</dt>
                <dd className="fz-num">{formatCurrency(run.total)}</dd>
              </div>
            )}
            {run.payment.amount > 0 && config.pricing.depositPercent > 0 && (
              <div>
                <dt>מקדמה (סימולציה)</dt>
                <dd className="fz-num">{formatCurrency(run.payment.amount)}</dd>
              </div>
            )}
          </dl>
        </div>

        {decisions.length > 0 && (
          <section className="mt-5" aria-label="ההחלטות שנשמרו">
            <h2 className="mb-2 text-sm font-bold">ההחלטות שנשמרו</h2>
            <ul className="fz-decision-summary">
              {decisions.map((a) => (
                <li key={a.fieldId} data-v={a.value === 'declined' ? 'declined' : 'approved'}>
                  <span className="min-w-0 flex-1">{a.label}</span>
                  <span className="fz-badge" data-tone={a.value === 'approved' ? 'success' : undefined}>
                    {a.displayValue}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6" aria-label="מה קורה עכשיו">
          <h2 className="mb-1 text-sm font-bold">מה קורה עכשיו</h2>
          <ol className="fz-next">
            {nextSteps(run, config).map((s) => (
              <li key={s.label} data-done={s.done || undefined}>
                {s.label}
              </li>
            ))}
          </ol>
        </section>
        <p className="fz-help mt-5 text-center">אפשר לרענן את הדף — הבקשה נשמרה מקומית בדפדפן זה.</p>
      </section>
    </div>
  );
}
