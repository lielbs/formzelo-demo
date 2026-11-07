import { runtimeConfiguration } from '../production/runtime';
import { CalendarCheck, CalendarX, CheckCircle2, Clock, ExternalLink, ShieldCheck } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { PaymentBadge, StatusBadge } from '../components/StatusBadge';
import type { WorkflowConfig, WorkflowRun } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { BOOKING_STAGES, bookingState, CUSTOMER_CANCELLABLE } from '../engine/booking';
import { completionOf, safeExternalUrl } from '../engine/completion';
import { formatCurrency, formatDateTime } from '../lib/format';
import { BrandRow } from './parts';
import { DigitalPresence, ReviewRequest } from './presence';
import { Signoff } from './extras';
import { BusinessGallery, resolveMedia } from './media';
import { presenceOf, reviewLink, shouldAskForReview } from '../engine/presence';

/** Pieces of the completion burst: end offset (px) and spin, spread evenly around the mark. */
const BURST: [number, number, number][] = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const d = 58 + (i % 3) * 16;
  return [Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d), (i % 2 ? 1 : -1) * (120 + i * 12)];
});

const REVIEWED: WorkflowRun['status'][] = ['in_review', 'approved', 'rejected', 'completed', 'cancelled'];
const DECIDED: WorkflowRun['status'][] = ['approved', 'rejected', 'completed', 'cancelled'];

function nextSteps(run: WorkflowRun, config: WorkflowConfig) {
  const custom = config.confirmation?.nextSteps;
  const steps: { label: string; done: boolean }[] = [{ label: 'הבקשה התקבלה ונשמרה', done: true }];
  if (custom?.length) {
    // Owner-written steps; the first is "done" once the business starts reviewing.
    custom.forEach((label, i) => steps.push({ label, done: i === 0 ? REVIEWED.includes(run.status) : DECIDED.includes(run.status) }));
  } else {
    const hasDecisions = run.answers.some((a) => a.value === 'approved' || a.value === 'declined');
    steps.push({ label: hasDecisions ? 'העסק מקבל את ההחלטות ומבצע רק את מה שאישרתם' : 'העסק בודק את הפרטים', done: REVIEWED.includes(run.status) });
    steps.push({ label: runtimeConfiguration.mode === 'demo' ? 'עדכון סטטוס יופיע בעמוד הזה (הודעות בדמו הן מדומות ואינן נשלחות)' : 'עדכון סטטוס יופיע בעמוד הבקשה שלכם', done: DECIDED.includes(run.status) });
  }
  if ((run.payment.status === 'deposit_requested' || run.payment.status === 'payment_requested') && run.status !== 'rejected' && run.status !== 'cancelled') {
    steps.push({ label: `נדרש ${run.payment.status === 'deposit_requested' ? 'מקדמה' : 'תשלום'} של ${formatCurrency(run.payment.amount)} — סימולציה בלבד, ללא חיוב`, done: false });
  }
  return steps;
}

/** Branded confirmation / status page, rendered with the run's own frozen version theme. */
/** Requested → in review → confirmed, or a terminal rejected / cancelled state. */
function BookingProgress({ status }: { status: WorkflowRun['status'] }) {
  const state = bookingState(status);
  if (state.stage === 'rejected' || state.stage === 'cancelled') {
    return (
      <p className="fz-warn mt-4 flex items-center justify-center gap-2" role="status">
        <CalendarX className="h-4 w-4" aria-hidden /> {state.label}. המקום לא שמור.
      </p>
    );
  }
  const reached = state.stage === 'confirmed' ? 2 : state.stage === 'pending' || state.stage === 'changes' ? 1 : 0;
  return (
    <ol className="fz-progress-strip mt-4" aria-label="מצב ההזמנה">
      {BOOKING_STAGES.map((s, i) => (
        <li key={s.stage} data-state={i < reached ? 'done' : i === reached ? 'current' : undefined} aria-current={i === reached ? 'step' : undefined}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function CancelBooking({ onCancel }: { onCancel: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return (
      <button type="button" className="fz-btn fz-btn-ghost mt-4 w-full" onClick={() => setConfirming(true)}>
        ביטול בקשת ההזמנה
      </button>
    );
  }
  return (
    <div className="fz-panel mt-4 p-4 text-center" role="group" aria-label="אישור ביטול">
      <p className="text-sm font-semibold">לבטל את הבקשה? המקום ישתחרר.</p>
      {error && (
        <p className="fz-error mt-2" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          className="fz-btn fz-btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onCancel();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'הביטול נכשל');
              setBusy(false);
            }
          }}
        >
          {busy ? 'מבטל…' : 'כן, לבטל'}
        </button>
        <button type="button" className="fz-btn fz-btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
          השארת הבקשה
        </button>
      </div>
    </div>
  );
}

export function Confirmation({
  run,
  config,
  theme,
  logoUrl,
  assets = {},
  justSubmitted,
  onCancelBooking,
  actions,
}: {
  /** The request's Formangle Actions with their answer handler (customer page). */
  actions?: ReactNode;
  run: WorkflowRun;
  config: WorkflowConfig;
  theme: WorkflowTheme;
  logoUrl?: string;
  /** Workspace images (the business's gallery when it is placed on the confirmation). */
  assets?: Record<string, string>;
  justSubmitted: boolean;
  /** Booking flows only: lets the customer withdraw their own request. */
  onCancelBooking?: () => Promise<void>;
}) {
  const decisions = run.answers.filter((a) => a.value === 'approved' || a.value === 'declined');
  const booking = config.booking?.enabled ? bookingState(run.status) : null;
  const c = completionOf(config);
  // Shown only once the run's payment state says so (right away, or after approval) and never on a closed request.
  const externalUrl = c.mode === 'external_link' && run.payment.status === 'external_link' && run.status !== 'rejected' && run.status !== 'cancelled' ? safeExternalUrl(c.externalUrl) : null;
  const title = justSubmitted ? (config.confirmation?.title ?? 'נשלח בהצלחה') : config.title;

  return (
    <div className="mx-auto w-full max-w-xl px-3 py-6 sm:py-12">
      <div className="mb-5 flex justify-center">
        <BrandRow name={config.branding.logoText} logoUrl={logoUrl} showName={theme.logo.showName} logoStyle={resolveMedia(theme).logoStyle} />
      </div>
      <section className="fz-card fz-pad fz-step" data-dir="fwd" aria-labelledby="fz-confirm-title">
        <div className="text-center">
          <span className="fz-confirm-icon" aria-hidden>
            {justSubmitted && (
              <span className="fz-burst">
                {BURST.map(([x, y, r], i) => (
                  <i key={i} style={{ '--x': `${x}px`, '--y': `${y}px`, '--r': `${r}deg` } as CSSProperties} />
                ))}
              </span>
            )}
            {booking?.confirmed ? <CalendarCheck className="h-8 w-8" /> : justSubmitted ? <CheckCircle2 className="h-8 w-8" /> : <Clock className="h-8 w-8" />}
          </span>
          <h1 id="fz-confirm-title" className="fz-display mt-4 text-[calc(1.7rem*var(--fz-display-scale))]">
            {title}
          </h1>
          <p className="fz-muted mx-auto mt-2 max-w-md text-[15px] leading-relaxed">{justSubmitted ? config.successMessage : 'זהו מצב הבקשה העדכני כפי שנשמר בדפדפן זה.'}</p>
        </div>

        <div className="fz-panel mt-7 p-4 text-center">
          <p className="fz-muted text-xs">מספר הבקשה</p>
          <p className="fz-ref mt-1">
            <bdi>{run.reference}</bdi>
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {booking ? (
              <span className="fz-badge" data-tone={booking.confirmed ? 'success' : 'recommended'}>
                {booking.label}
              </span>
            ) : (
              <StatusBadge status={run.status} />
            )}
            <PaymentBadge payment={run.payment} runStatus={run.status} />
          </div>
          {booking && <BookingProgress status={run.status} />}
        </div>

        {actions && <div className="mt-6">{actions}</div>}

        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer nofollow" className="fz-btn fz-btn-primary mt-5 w-full">
            <ExternalLink className="h-4 w-4" aria-hidden />
            {c.externalLabel || 'מעבר לעמוד התשלום של העסק'}
          </a>
        )}
        {externalUrl && <p className="fz-help text-center">עמוד התשלום של העסק באתר חיצוני ({new URL(externalUrl).hostname}). Formangle לא מעבד את התשלום ולא יודע אם בוצע — העסק יאשר מולכם.</p>}
        {c.mode === 'external_link' && run.payment.status === 'none' && run.payment.kind === 'external' && run.status !== 'rejected' && run.status !== 'cancelled' && (
          <p className="fz-help text-center">אחרי שהעסק יאשר את הבקשה, יופיע כאן קישור לעמוד התשלום שלו.</p>
        )}

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
            {(run.payment.kind === 'deposit' || run.payment.status.startsWith('deposit')) && run.payment.amount > 0 && (
              <div>
                <dt>מקדמה (סימולציה)</dt>
                <dd className="fz-num">{formatCurrency(run.payment.amount)}</dd>
              </div>
            )}
          </dl>
        </div>

        {decisions.length > 0 && (
          <section className="mt-5" aria-label="ההחלטות שנשמרו">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
              <ShieldCheck className="h-4 w-4 fz-ink" aria-hidden /> רישום ההחלטות
            </h2>
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
            <p className="fz-help">
              {run.consentAt ? `אושר במפורש ${formatDateTime(run.consentAt)}` : 'נשמר'} · גרסת תהליך {run.versionNumber} · {decisions.filter((d) => d.value === 'approved').length} אושרו, {decisions.filter((d) => d.value === 'declined').length} נדחו. רישום מקומי לצורכי דמו — ללא תוקף משפטי.
            </p>
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
        <Signoff signoff={theme.extras?.signoff} />
        <BusinessGallery theme={theme} assets={assets} slot="completion" />
        {booking && onCancelBooking && CUSTOMER_CANCELLABLE.includes(run.status) && <CancelBooking onCancel={onCancelBooking} />}
        {/* Engagement comes after the confirmation details, never instead of them. */}
        <DigitalPresence theme={theme} slot="completion" title={booking && !booking.confirmed ? 'בינתיים, אפשר להכיר אותנו' : 'נשארים בקשר'} />
        {shouldAskForReview({ enabled: presenceOf(theme.presence).reviewCta, hasReviewLink: Boolean(reviewLink(theme.presence?.links ?? [])), status: run.status }) && <ReviewRequest theme={theme} />}
        <p className="fz-help mt-5 text-center">אפשר לרענן את הדף — הבקשה נשמרה מקומית בדפדפן זה.</p>
      </section>
    </div>
  );
}
