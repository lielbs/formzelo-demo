/**
 * An interactive quote in the business's own design (fz tokens). The customer ticks the extras
 * they want, sees the total move, then approves, asks for changes or declines. The same card is
 * the owner's live preview (`preview`: buttons inert). Totals here are a preview; the server
 * recalculates the accepted total from the frozen quote.
 */
import { CheckCircle2, Clock, FileText, MessageSquareText, Minus, Plus, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TrackedQuote } from '../data/track';
import { defaultQuantity, quoteTotals, QUOTE_STATUS_LABELS, VAT_MODE_LABELS, type QuoteContent, type QuoteSelections } from '../engine/quote';
import { formatCurrency, formatDate, formatDateTime } from '../lib/format';

type Decision = 'approved' | 'declined' | 'changes_requested';

const DECIDED: Record<string, { icon: typeof CheckCircle2; tone?: string; text: string }> = {
  approved: { icon: CheckCircle2, tone: 'success', text: 'אישרתם את ההצעה. העסק יחזור אליכם עם ההמשך.' },
  declined: { icon: XCircle, text: 'דחיתם את ההצעה.' },
  changes_requested: { icon: MessageSquareText, tone: 'recommended', text: 'ביקשתם שינויים. העסק יעדכן את ההצעה.' },
  expired: { icon: Clock, text: 'תוקף ההצעה פג. אפשר לפנות לעסק להצעה מעודכנת.' },
  superseded: { icon: FileText, text: 'ההצעה הזו הוחלפה בגרסה חדשה יותר.' },
};

export function QuoteCard({
  quote,
  preview = false,
  onDecide,
}: {
  quote: Pick<TrackedQuote, 'id' | 'revision' | 'status' | 'content' | 'decision' | 'sentAt'>;
  preview?: boolean;
  onDecide?: (decision: Decision, selections: QuoteSelections, comment?: string) => Promise<void>;
}) {
  const content: QuoteContent = quote.content;
  const open = quote.status === 'sent' && !preview;
  const [selections, setSelections] = useState<QuoteSelections>(() => quote.decision?.selections ?? {});
  const [mode, setMode] = useState<'idle' | 'changes' | 'decline'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totals = useMemo(() => {
    try {
      return quoteTotals(content, selections);
    } catch {
      return quoteTotals(content);
    }
  }, [content, selections]);
  const qtyOf = (id: string) => totals.lines.find((l) => l.itemId === id)?.quantity ?? 0;
  const setQty = (id: string, qty: number) => setSelections((s) => ({ ...s, [id]: qty }));
  const decided = quote.status !== 'sent' ? DECIDED[quote.status] : undefined;
  const interactive = open || preview;

  const decide = async (decision: Decision) => {
    if (!onDecide) return;
    if (decision === 'changes_requested' && !comment.trim()) return setError('כתבו בקצרה מה תרצו לשנות');
    setBusy(decision);
    setError(null);
    try {
      // Only the extras the customer touched are sent; the rest stay as offered.
      await onDecide(decision, decision === 'approved' ? selections : {}, comment.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="fz-card fz-pad fz-quote" aria-labelledby={`quote-${quote.id}`} data-status={quote.status}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="fz-muted text-xs font-semibold">הצעת מחיר{quote.revision > 1 ? ` · גרסה ${quote.revision}` : ''}</p>
          <h2 id={`quote-${quote.id}`} className="fz-display mt-1 text-[calc(1.35rem*var(--fz-display-scale))]">
            {content.title}
          </h2>
        </div>
        <span className="fz-badge" data-tone={quote.status === 'approved' ? 'success' : quote.status === 'sent' ? 'recommended' : undefined}>
          {quote.status === 'sent' ? 'ממתינה להחלטה שלכם' : QUOTE_STATUS_LABELS[quote.status]}
        </span>
      </header>
      {content.intro && <p className="fz-muted mt-2 whitespace-pre-line text-[15px] leading-relaxed">{content.intro}</p>}

      <ul className="fz-quote-items mt-5" aria-label="פריטי ההצעה">
        {content.items.map((item) => {
          const qty = interactive ? qtyOf(item.id) : quote.decision ? qtyOf(item.id) : defaultQuantity(item);
          const chosen = qty > 0;
          const max = item.maxQuantity ?? item.quantity;
          return (
            <li key={item.id} className="fz-quote-item" data-off={!chosen || undefined}>
              <div className="min-w-0 flex-1">
                {item.optional && interactive ? (
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="fz-quote-check mt-1"
                      checked={chosen}
                      disabled={preview}
                      onChange={(e) => setQty(item.id, e.target.checked ? item.quantity : 0)}
                    />
                    <span className="min-w-0">
                      <span className="font-semibold">{item.label}</span>
                      <span className="fz-badge ms-2 align-middle">אפשרות</span>
                    </span>
                  </label>
                ) : (
                  <p className="font-semibold">{item.label}</p>
                )}
                {item.description && <p className="fz-muted mt-0.5 text-sm">{item.description}</p>}
                {!chosen ? (
                  <p className="fz-muted mt-0.5 text-xs fz-num">{formatCurrency(item.unitPrice)}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</p>
                ) : (
                  (qty > 1 || item.adjustable) && (
                    <p className="fz-muted mt-0.5 text-xs fz-num">
                      {formatCurrency(item.unitPrice)} × {qty}
                    </p>
                  )
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="fz-num font-semibold">{chosen ? formatCurrency(Math.round(item.unitPrice * qty * 100) / 100) : '—'}</span>
                {item.adjustable && chosen && interactive && (
                  <div className="fz-qty fz-qty-sm" dir="ltr">
                    <button type="button" aria-label={`פחות ${item.label}`} disabled={preview || qty <= (item.optional ? 0 : 1)} onClick={() => setQty(item.id, qty - 1)}>
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <output aria-live="polite" aria-label={`כמות ${item.label}`}>{qty}</output>
                    <button type="button" aria-label={`עוד ${item.label}`} disabled={preview || qty >= max} onClick={() => setQty(item.id, qty + 1)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="fz-quote-totals mt-4">
        {(totals.adjustments.length > 0 || content.vat.mode === 'excluded') && (
          <div>
            <dt>סכום ביניים</dt>
            <dd className="fz-num">{formatCurrency(totals.subtotal)}</dd>
          </div>
        )}
        {totals.adjustments.map((a, i) => (
          <div key={i}>
            <dt>{a.label}</dt>
            <dd className="fz-num">{formatCurrency(a.amount)}</dd>
          </div>
        ))}
        {content.vat.mode === 'excluded' && (
          <div>
            <dt>מע״מ {content.vat.rate}%</dt>
            <dd className="fz-num">{formatCurrency(totals.vat)}</dd>
          </div>
        )}
        <div className="fz-quote-total">
          <dt>סה״כ לתשלום</dt>
          <dd className="fz-num" aria-live="polite">{formatCurrency(quote.decision && !interactive ? quote.decision.total : totals.total)}</dd>
        </div>
      </dl>
      <p className="fz-help">
        {VAT_MODE_LABELS[content.vat.mode]}
        {content.vat.mode === 'included' && totals.vat > 0 ? ` (מתוכם מע״מ ${formatCurrency(totals.vat)})` : ''}
        {content.validUntil ? ` · בתוקף עד ${formatDate(content.validUntil)}` : ''}
      </p>
      {content.terms && <p className="fz-help whitespace-pre-line">{content.terms}</p>}

      {decided && (
        <p className="fz-panel mt-4 flex items-start gap-2 p-3 text-sm" role="status">
          <decided.icon className="mt-0.5 h-4 w-4 shrink-0 fz-ink" aria-hidden />
          <span>
            {decided.text}
            {quote.decision?.comment ? <span className="fz-muted block">״{quote.decision.comment}״</span> : null}
          </span>
        </p>
      )}

      {(open || preview) && (
        <div className="mt-5">
          {mode === 'changes' && (
            <div className="mb-3">
              <label htmlFor={`changes-${quote.id}`} className="mb-1 block text-sm font-semibold">
                מה תרצו לשנות?
              </label>
              <textarea id={`changes-${quote.id}`} className="fz-input min-h-[88px]" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="לדוגמה: אפשר להחליף את הוורדים בפיוניות?" />
            </div>
          )}
          {error && (
            <p role="alert" className="fz-error mb-2 text-sm">
              {error}
            </p>
          )}
          {mode === 'idle' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="fz-btn fz-btn-primary w-full" disabled={preview || Boolean(busy)} onClick={() => decide('approved')}>
                {busy === 'approved' ? 'שומר…' : `אישור ההצעה · ${formatCurrency(totals.total)}`}
              </button>
              <button type="button" className="fz-btn fz-btn-secondary flex-1" disabled={preview || Boolean(busy)} onClick={() => setMode('changes')}>
                בקשת שינויים
              </button>
              <button type="button" className="fz-btn fz-btn-ghost flex-1" disabled={preview || Boolean(busy)} onClick={() => setMode('decline')}>
                דחייה
              </button>
            </div>
          )}
          {mode === 'changes' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="fz-btn fz-btn-primary flex-1" disabled={Boolean(busy)} onClick={() => decide('changes_requested')}>
                {busy ? 'שולח…' : 'שליחת הבקשה לעסק'}
              </button>
              <button type="button" className="fz-btn fz-btn-ghost" onClick={() => setMode('idle')}>
                חזרה
              </button>
            </div>
          )}
          {mode === 'decline' && (
            <div className="fz-panel p-3 text-center">
              <p className="text-sm font-semibold">לדחות את ההצעה?</p>
              <p className="fz-help">העסק יראה שדחיתם. אפשר גם לבקש שינויים במקום.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button type="button" className="fz-btn fz-btn-secondary" disabled={Boolean(busy)} onClick={() => decide('declined')}>
                  {busy ? 'שומר…' : 'כן, לדחות'}
                </button>
                <button type="button" className="fz-btn fz-btn-ghost" onClick={() => setMode('idle')}>
                  חזרה
                </button>
              </div>
            </div>
          )}
          <p className="fz-help text-center">האישור אינו חיוב ואינו חתימה. העסק יאשר מולכם את ההמשך.</p>
        </div>
      )}
      {quote.sentAt && !preview && <p className="fz-help text-center">נשלחה {formatDateTime(quote.sentAt)}</p>}
    </article>
  );
}
