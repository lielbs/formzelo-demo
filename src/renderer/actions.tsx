/**
 * Formangle Actions as the customer sees them, in the business's own design (fz tokens).
 * The same card is the owner's live preview in the composer (`preview`: buttons inert).
 */
import { BellRing, CheckCircle2, CircleSlash, Clock, ListChecks, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import type { CustomerAction } from '../domain/schema';
import { actionStatus } from '../engine/actions';
import { formatCurrency, formatDateTime } from '../lib/format';

const KIND = {
  approval: { icon: ShieldQuestion, label: 'נדרש אישור שלכם' },
  choice: { icon: ListChecks, label: 'נדרשת בחירה שלכם' },
  update: { icon: BellRing, label: 'עדכון מהעסק' },
} as const;

/**
 * The request's actions on the customer's page: open ones first ("נדרשת פעולה שלכם"),
 * then the history of updates and decisions. Renders nothing when there are none.
 */
export function RequestActions({
  actions,
  business,
  reference,
  onRespond,
}: {
  actions: CustomerAction[];
  business: string;
  reference?: string;
  onRespond: (actionId: string, optionId: 'a' | 'b') => Promise<void>;
}) {
  if (!actions.length) return null;
  const open = actions.filter((a) => actionStatus(a) === 'pending');
  const rest = actions.filter((a) => actionStatus(a) !== 'pending').reverse();
  return (
    <div className="space-y-5">
      {open.length > 0 && (
        <section aria-label="נדרשת פעולה שלכם" className="space-y-3">
          <h2 className="text-sm font-bold">{open.length > 1 ? `${open.length} בקשות ממתינות לתשובה שלכם` : 'בקשה שממתינה לתשובה שלכם'}</h2>
          {open.map((a) => (
            <ActionCard key={a.id} action={a} business={business} reference={reference} onRespond={(id) => onRespond(a.id, id)} />
          ))}
        </section>
      )}
      {rest.length > 0 && (
        <section aria-label="עדכונים והחלטות" className="space-y-3">
          <h2 className="text-sm font-bold">עדכונים והחלטות</h2>
          {rest.map((a) => (
            <ActionCard key={a.id} action={a} business={business} reference={reference} />
          ))}
        </section>
      )}
    </div>
  );
}

export function ActionCard({
  action,
  business,
  reference,
  onRespond,
  preview,
}: {
  action: CustomerAction;
  business: string;
  reference?: string;
  onRespond?: (optionId: 'a' | 'b') => Promise<void>;
  /** Owner's preview: shows the card exactly, buttons do nothing. */
  preview?: boolean;
}) {
  const status = preview ? (action.kind === 'update' ? 'posted' : 'pending') : actionStatus(action);
  const [confirming, setConfirming] = useState<'a' | 'b' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = KIND[action.kind];
  // Approving money is confirmed once more, so a stray tap never commits the customer.
  const needsConfirm = (id: 'a' | 'b') => action.kind === 'approval' && id === 'a' && Boolean(action.amount);

  const answer = async (id: 'a' | 'b') => {
    if (preview || !onRespond || busy) return;
    if (needsConfirm(id) && confirming !== id) return setConfirming(id);
    setBusy(true);
    setError(null);
    try {
      await onRespond(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא הצלחנו לשמור את התשובה');
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <article className="fz-action" data-kind={action.kind} data-state={status} aria-labelledby={`act-${action.id}`}>
      <header className="fz-action-head">
        <span className="fz-action-icon" aria-hidden>
          <k.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="fz-action-kind">{k.label}</span>
          <span className="fz-action-meta">
            {business}
            {reference && (
              <>
                {' · '}
                <bdi>{reference}</bdi>
              </>
            )}
            {' · '}
            {formatDateTime(action.createdAt)}
          </span>
        </span>
      </header>

      <h3 id={`act-${action.id}`} className="fz-action-title">
        {action.title}
      </h3>
      {action.description && <p className="fz-action-desc">{action.description}</p>}
      {action.amount ? (
        <p className="fz-action-amount">
          <span>סכום</span>
          <span className="fz-num">{formatCurrency(action.amount)}</span>
        </p>
      ) : null}
      {action.note && <p className="fz-help">{action.note}</p>}
      {action.expiresAt && status === 'pending' && (
        <p className="fz-help flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden /> אפשר להשיב עד {formatDateTime(action.expiresAt)}
        </p>
      )}

      {status === 'pending' && (
        <>
          {confirming ? (
            <div className="fz-action-confirm" role="group" aria-label="אישור סופי">
              <p>
                לאשר את &quot;{action.title}&quot; בסך <span className="fz-num">{formatCurrency(action.amount ?? 0)}</span>?
              </p>
              <div className="fz-action-buttons">
                <button type="button" className="fz-btn fz-btn-primary" disabled={busy} onClick={() => answer(confirming)}>
                  {busy ? 'שומר…' : 'כן, לאשר'}
                </button>
                <button type="button" className="fz-btn fz-btn-ghost" disabled={busy} onClick={() => setConfirming(null)}>
                  חזרה
                </button>
              </div>
            </div>
          ) : (
            <div className="fz-action-buttons" role="group" aria-label="התשובה שלכם">
              {action.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`fz-btn ${o.id === 'a' ? 'fz-btn-primary' : 'fz-btn-ghost'}`}
                  disabled={busy}
                  aria-disabled={preview || undefined}
                  onClick={() => answer(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="fz-error mt-2" role="alert">
              {error}
            </p>
          )}
          {preview && <p className="fz-help text-center">תצוגה מקדימה — הכפתורים פעילים רק אצל הלקוח.</p>}
        </>
      )}

      {status === 'responded' && action.response && (
        <p className="fz-action-result" data-tone={action.kind === 'approval' && action.response.optionId === 'b' ? 'declined' : 'ok'}>
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            בחרתם: <strong>{action.response.label}</strong> · {formatDateTime(action.response.at)}
            <span className="fz-action-small">התשובה נשמרה עם הפרטים שהוצגו לכם. לשינוי, פנו לעסק.</span>
          </span>
        </p>
      )}
      {status === 'cancelled' && (
        <p className="fz-action-result" data-tone="muted">
          <CircleSlash className="h-4 w-4 shrink-0" aria-hidden /> העסק ביטל את הבקשה הזו. אין צורך להשיב.
        </p>
      )}
      {status === 'expired' && (
        <p className="fz-action-result" data-tone="muted">
          <Clock className="h-4 w-4 shrink-0" aria-hidden /> תוקף הבקשה פג. אם עדיין רלוונטי, פנו לעסק.
        </p>
      )}
    </article>
  );
}
