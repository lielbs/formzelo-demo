/**
 * The customer's own request page: status, the business's quotes and questions, and history,
 * in the business's design. Opened from a private link (the secret is in the URL fragment).
 */
import { CheckCircle2, ChevronDown, Copy, Link2Off } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { copyText } from '../components/Toast';
import type { CustomerAction, RunStatus } from '../domain/schema';
import { useRepo, useRepoQuery } from '../data/store';
import type { TrackView } from '../data/track';
import { formatCurrency, formatDateTime } from '../lib/format';
import { RequestActions } from '../renderer/actions';
import { DigitalPresence } from '../renderer/presence';
import { QuoteCard } from '../renderer/QuoteCard';
import { Notice, Shell } from './PublicFlow';

const STEPS: { label: string; reached: RunStatus[] }[] = [
  { label: 'נשלחה', reached: ['submitted', 'in_review', 'changes_requested', 'approved', 'completed'] },
  { label: 'בבדיקה', reached: ['in_review', 'changes_requested', 'approved', 'completed'] },
  { label: 'אושרה', reached: ['approved', 'completed'] },
  { label: 'הושלמה', reached: ['completed'] },
];

const STATUS_TEXT: Partial<Record<RunStatus, string>> = {
  submitted: 'הבקשה התקבלה וממתינה לעסק',
  in_review: 'העסק בודק את הבקשה',
  changes_requested: 'העסק צריך מכם פרטים נוספים',
  approved: 'הבקשה אושרה',
  completed: 'הבקשה הושלמה',
  rejected: 'הבקשה לא אושרה',
  cancelled: 'הבקשה בוטלה',
};

function timelineLabel(type: string): string {
  const map: Record<string, string> = {
    submitted: 'הבקשה נשלחה',
    'status:in_review': 'העסק התחיל לטפל בבקשה',
    'status:approved': 'הבקשה אושרה',
    'status:completed': 'הבקשה הושלמה',
    'status:rejected': 'הבקשה לא אושרה',
    'status:cancelled': 'הבקשה בוטלה',
    'status:changes_requested': 'העסק ביקש פרטים נוספים',
    'status:submitted': 'הבקשה נשלחה',
    resubmitted: 'עדכנתם את הבקשה',
    'action:approval': 'העסק מבקש את אישורכם',
    'action:choice': 'העסק מבקש שתבחרו',
    'action:update': 'עדכון מהעסק',
    action_created: 'הודעה מהעסק',
    action_responded: 'עניתם לעסק',
    quote_sent: 'התקבלה הצעת מחיר',
    quote_approved: 'אישרתם את הצעת המחיר',
    quote_declined: 'דחיתם את הצעת המחיר',
    quote_changes_requested: 'ביקשתם שינויים בהצעה',
    quote_decided: 'עניתם על הצעת המחיר',
    quote_withdrawn: 'העסק ביטל הצעת מחיר',
  };
  return map[type] ?? 'עדכון';
}

/** Tracked actions carry only what the customer may see; the shared card needs the full shape. */
const asCustomerAction = (view: TrackView, a: TrackView['actions'][number]): CustomerAction => ({
  ...a,
  orgId: '-',
  runId: view.request.id,
  workflowId: '-',
  versionId: '-',
  versionNumber: 1,
  description: a.description ?? '',
  status: a.status === 'expired' ? 'pending' : a.status,
  expiresAt: a.status === 'expired' ? new Date(0).toISOString() : a.expiresAt,
  updatedAt: a.createdAt,
});

function CancelRequest({ onCancel }: { onCancel: () => Promise<void> }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (step === 'idle')
    return (
      <button type="button" className="fz-btn fz-btn-ghost mt-4 w-full" onClick={() => setStep('confirm')}>
        ביטול הבקשה
      </button>
    );
  return (
    <div className="fz-panel mt-4 p-4 text-center" role="group" aria-label="אישור ביטול">
      <p className="text-sm font-semibold">לבטל את הבקשה?</p>
      <p className="fz-help">העסק יראה שביטלתם. אי אפשר לבטל את הביטול מכאן.</p>
      {error && <p role="alert" className="fz-error mt-2 text-sm">{error}</p>}
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          className="fz-btn fz-btn-secondary"
          disabled={step === 'busy'}
          onClick={async () => {
            setStep('busy');
            try {
              await onCancel();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'הביטול נכשל');
              setStep('confirm');
            }
          }}
        >
          {step === 'busy' ? 'מבטל…' : 'כן, לבטל'}
        </button>
        <button type="button" className="fz-btn fz-btn-ghost" onClick={() => setStep('idle')}>
          חזרה
        </button>
      </div>
    </div>
  );
}

export function Track() {
  const location = useLocation();
  const [params] = useSearchParams();
  const access = decodeURIComponent(location.hash.replace(/^#/, ''));
  const justSent = params.get('sent') === '1';
  const { repo } = useRepo();
  const q = useRepoQuery((r) => (access ? r.trackRequest(access) : Promise.resolve(null)), [access]);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Customers come back to this page later: show what changed since they last looked.
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && q.reload();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [q]);

  const view = q.data;
  useEffect(() => {
    if (view) document.title = `${view.workflow.title} · ${view.business.name}`;
  }, [view]);

  if (q.loading)
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  if (!view)
    return (
      <Shell>
        <Notice icon={Link2Off} title="הקישור אינו זמין">
          <p>ייתכן שפג תוקף הקישור או שהעסק שלח קישור חדש. פנו לעסק ונשלח לכם קישור מעודכן.</p>
        </Notice>
      </Shell>
    );

  const { request, workflow, business } = view;
  const design = workflow.design;
  const open = view.quotes.filter((x) => x.status === 'sent');
  const latestDecided = view.quotes.filter((x) => x.status !== 'sent');
  const shownQuotes = open.length ? open : latestDecided.slice(0, 1);
  const olderQuotes = view.quotes.filter((x) => !shownQuotes.includes(x));
  const closed = request.status === 'rejected' || request.status === 'cancelled';
  const link = typeof window !== 'undefined' ? window.location.href.replace('?sent=1', '') : '';

  return (
    <Shell theme={design} orgName={business.name}>
      <div className="mx-auto w-full max-w-xl space-y-5 px-3 py-6 sm:py-10">
        <p className="fz-display text-center text-lg">{business.name}</p>

        <section className="fz-card fz-pad" aria-labelledby="track-title">
          {justSent && (
            <div className="mb-5 text-center">
              <span className="fz-confirm-icon" aria-hidden>
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <h1 id="track-title" className="fz-display mt-3 text-[calc(1.6rem*var(--fz-display-scale))]">
                הבקשה נשלחה
              </h1>
              <p className="fz-muted mt-1 text-[15px]">זה העמוד האישי של הבקשה. שמרו את הקישור כדי לראות עדכונים והצעות מחיר.</p>
              <button
                type="button"
                className="fz-btn fz-btn-secondary mt-3"
                onClick={async () => setCopied(await copyText(link))}
              >
                <Copy className="h-4 w-4" aria-hidden /> {copied ? 'הקישור הועתק' : 'העתקת הקישור לעמוד הזה'}
              </button>
            </div>
          )}
          {!justSent && (
            <h1 id="track-title" className="fz-display text-center text-[calc(1.5rem*var(--fz-display-scale))]">
              {workflow.title}
            </h1>
          )}
          <div className="fz-panel mt-4 p-4 text-center">
            <p className="fz-muted text-xs">מספר הבקשה</p>
            <p className="fz-ref mt-1">
              <bdi>{request.reference}</bdi>
            </p>
            <p className="mt-2 font-semibold" role="status">
              {STATUS_TEXT[request.status] ?? 'הבקשה בטיפול'}
            </p>
            {!closed && (
              <ol className="fz-track-steps" aria-label="התקדמות הבקשה">
                {STEPS.map((s) => (
                  <li key={s.label} data-done={s.reached.includes(request.status) || undefined}>
                    {s.label}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {shownQuotes.map((quote) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            onDecide={async (decision, selections, comment) => {
              await repo.decideQuote(access, quote.id, { decision, selections, comment, key: crypto.randomUUID() });
              await q.reload();
            }}
          />
        ))}

        {view.actions.length > 0 && (
          <section className="fz-card fz-pad">
            <RequestActions
              actions={view.actions.map((a) => asCustomerAction(view, a))}
              business={business.name}
              reference={request.reference}
              onRespond={async (actionId, optionId) => {
                await repo.respondTracked(access, actionId, optionId);
                await q.reload();
              }}
            />
          </section>
        )}

        {olderQuotes.length > 0 && (
          <section className="fz-card fz-pad">
            <button type="button" className="flex w-full items-center justify-between text-sm font-bold" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              הצעות קודמות ({olderQuotes.length})
              <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {showHistory && (
              <div className="mt-4 space-y-4">
                {olderQuotes.map((quote) => (
                  <QuoteCard key={quote.id} quote={quote} />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="fz-card fz-pad" aria-labelledby="track-history">
          <h2 id="track-history" className="mb-3 text-sm font-bold">
            מה קרה עד עכשיו
          </h2>
          <ol className="fz-track-timeline">
            {[...view.timeline].reverse().map((e, i) => (
              <li key={i}>
                <span>
                  <span className="font-semibold">{timelineLabel(e.type)}</span>
                  {e.message && <span className="fz-muted block whitespace-pre-line">{e.message}</span>}
                  <span className="fz-help block !mt-0">{formatDateTime(e.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <details className="fz-card fz-pad">
          <summary className="cursor-pointer text-sm font-bold">הפרטים ששלחתם</summary>
          <dl className="fz-review-section mt-3">
            {request.answers.map((a) => (
              <div key={a.fieldId}>
                <dt>{a.label}</dt>
                <dd className="whitespace-pre-wrap">{a.displayValue}</dd>
              </div>
            ))}
            {request.total > 0 && (
              <div>
                <dt>הערכת מחיר בזמן השליחה</dt>
                <dd className="fz-num">{formatCurrency(request.total)}</dd>
              </div>
            )}
          </dl>
          <p className="fz-help">נשלח {formatDateTime(request.createdAt)}</p>
        </details>

        <DigitalPresence theme={design} slot="completion" title="אפשר ליצור איתנו קשר" />
        {request.cancellable && (
          <CancelRequest
            onCancel={async () => {
              await repo.cancelTracked(access);
              await q.reload();
            }}
          />
        )}
      </div>
    </Shell>
  );
}
