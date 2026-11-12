import { ArrowRight, CalendarCheck, CircleSlash, Copy, CreditCard, ExternalLink, Eye, SendHorizontal, StickyNote } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NotificationList, Timeline } from '../../components/Activity';
import { PaymentBadge, StatusBadge } from '../../components/StatusBadge';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, DemoBadge, EmptyState, ErrorState, Modal, Spinner, Textarea } from '../../components/ui';
import type { CustomerAction, RunAnswer, RunStatus } from '../../domain/schema';
import { ACTION_KIND_INFO, actionStatus } from '../../engine/actions';
import { ActionComposer } from './ActionComposer';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { bookingState, WEEKDAY_LABELS, weekdayOf } from '../../engine/booking';
import { COMPLETION_LABELS, completionOf, isPaymentOutstanding } from '../../engine/completion';
import { ownerActions, STATUS_LABELS } from '../../engine/transitions';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/format';
import { publicFlowUrl } from '../../lib/links';
import { runtimeConfiguration } from '../../production/runtime';
import { CustomerLinkCard, QuotePanel } from './QuotePanel';
import { confirmAction } from '../../components/Confirm';

const PRODUCTION = runtimeConfiguration.mode === 'production';

const NEEDS_MESSAGE: RunStatus[] = ['changes_requested', 'rejected'];

/** The owner's view of the request's Formangle Actions: what is open, what the customer chose. */
function ActionsList({ actions, onCancel, busy }: { actions: CustomerAction[]; onCancel: (a: CustomerAction) => void; busy: string | null }) {
  return (
    <ul className="divide-y divide-cloud-200">
      {actions.map((a) => {
        const s = actionStatus(a);
        return (
          <li key={a.id} className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {a.title}
                {a.amount ? <span className="ms-2 font-normal tabular-nums text-ink-muted">{formatCurrency(a.amount)}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {ACTION_KIND_INFO[a.kind].title} · {formatDateTime(a.createdAt)}
                {a.options.length === 2 && ` · ${a.options[0]!.label} / ${a.options[1]!.label}`}
              </p>
              {s === 'responded' && a.response && (
                <p className="mt-1.5 text-sm">
                  <span className="text-ink-muted">הלקוח/ה בחר/ה: </span>
                  <strong className={a.kind === 'approval' && a.response.optionId === 'b' ? 'text-ink-soft' : 'text-teal-600'}>{a.response.label}</strong>
                  <span className="text-xs text-ink-muted"> · {formatDateTime(a.response.at)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {s === 'pending' && <Badge tone="amber">ממתין ללקוח</Badge>}
              {s === 'posted' && <Badge tone="blue">מוצג ללקוח</Badge>}
              {s === 'responded' && <Badge tone="teal">נענה</Badge>}
              {s === 'cancelled' && <Badge>בוטל</Badge>}
              {s === 'expired' && <Badge>פג תוקף</Badge>}
              {(s === 'pending' || s === 'posted') && (
                <Button size="sm" variant="ghost" icon={CircleSlash} loading={busy === a.id} onClick={() => onCancel(a)} aria-label={`ביטול: ${a.title}`}>
                  ביטול
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Answers({ items }: { items: RunAnswer[] }) {
  return (
    <dl className="divide-y divide-cloud-200">
      {items.map((a) => (
        <div key={a.fieldId} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[40%_1fr] sm:gap-4">
          <dt className="text-ink-muted">{a.label}</dt>
          <dd
            className={cx(
              'whitespace-pre-wrap font-medium',
              a.value === 'approved' && 'text-teal-600',
              a.value === 'declined' && 'text-ink-soft',
            )}
          >
            {a.displayValue}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RequestDetail() {
  const { id = '' } = useParams();
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ to: RunStatus; label: string } | null>(null);
  const [message, setMessage] = useState('');
  const [composing, setComposing] = useState(false);
  const [customerNudge, setCustomerNudge] = useState(0);
  const nudgeCustomer = () => setCustomerNudge((n) => n + 1);

  const q = useRepoQuery(
    async (r) => {
      const run = await r.getRun(org.id, id);
      if (!run) return null;
      const [workflow, version, events, notifications, runActions, quotes] = await Promise.all([
        r.getWorkflow(org.id, run.workflowId),
        r.getVersion(org.id, run.versionId),
        r.listEvents(org.id, run.id),
        r.listNotifications(org.id, run.id),
        r.listActions(org.id, run.id),
        r.listQuotes(org.id, run.id),
      ]);
      return { run, workflow, version, events, notifications, runActions, quotes };
    },
    [org.id, id],
  );

  if (q.loading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) {
    return (
      <EmptyState icon={StickyNote} title="הבקשה לא נמצאה בסביבת עבודה זו" action={<Link to="/app/requests" className="text-sm font-medium text-orange-700">חזרה לבקשות</Link>}>
        בקשות שייכות לסביבת העבודה שבה נשלחו.
      </EmptyState>
    );
  }
  const { run, workflow, version, events, notifications, runActions, quotes } = q.data;
  const customerView = workflow && !PRODUCTION ? `/f/${workflow.slug}?r=${run.id}&from=inbox` : '';
  const canAct = Boolean(workflow) && run.status !== 'cancelled' && run.status !== 'rejected';
  const actions = ownerActions(run.status);
  const customerLink = workflow ? publicFlowUrl(workflow.slug, run.id) : '';
  const customerCanEdit = !PRODUCTION && (run.status === 'awaiting_customer' || run.status === 'changes_requested');
  const config = version?.config;
  const booking = config?.booking?.enabled ? config.booking : undefined;
  const bState = booking ? bookingState(run.status) : null;
  const completion = config ? completionOf(config) : null;
  const answer = (key?: string) => (key ? run.answers.find((a) => a.fieldKey === key) : undefined);
  const bookingDate = booking ? String(answer(booking.dateKey)?.value ?? '') : '';

  const transition = async (to: RunStatus, msg?: string) => {
    setBusy(to);
    try {
      await repo.transitionRun(org.id, run.id, to, msg?.trim() || undefined);
      toast(PRODUCTION ? `הסטטוס עודכן ל"${STATUS_LABELS[to]}" ומוצג בעמוד הבקשה של הלקוח` : `הסטטוס עודכן ל"${STATUS_LABELS[to]}" · הודעה מדומה הוכנה`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'העדכון נכשל', 'error');
    } finally {
      setBusy(null);
      setPending(null);
      setMessage('');
    }
  };

  const addNote = async () => {
    if (!note.trim()) return setNoteError('כתבו הערה');
    setBusy('note');
    try {
      await repo.addNote(org.id, run.id, note);
      setNote('');
      setNoteError('');
      toast('ההערה נשמרה');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Link to="/app/requests" className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-orange-700">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden /> בקשות
      </Link>
      <div className="mb-6 mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {run.customerName || 'לקוח/ה'} <span className="text-lg font-normal text-ink-soft ltr">{run.reference}</span>
            </h1>
            <StatusBadge status={run.status} />
            {bState && <Badge tone={bState.confirmed ? 'teal' : 'amber'}>{bState.label}</Badge>}
            <PaymentBadge payment={run.payment} runStatus={run.status} />
            {run.isDemo && <DemoBadge />}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {workflow?.draft.title ?? 'תהליך שנמחק'} · גרסה {run.versionNumber}
            {run.submittedAt ? ` · נשלח ${formatDateTime(run.submittedAt)}` : ` · נפתח ${formatDateTime(run.createdAt)}`}
            {run.customerContact && (
              <>
                {' · '}
                <span className="ltr">{run.customerContact}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAct && (
            <Button variant="secondary" icon={SendHorizontal} onClick={() => setComposing(true)}>
              פעולה חדשה ללקוח
            </Button>
          )}
          {customerView && (
            <Link to={customerView} className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-4 text-sm font-medium text-ink hover:bg-cloud">
              <Eye className="h-4 w-4" aria-hidden /> צפייה כלקוח
            </Link>
          )}
          {actions.map((a) => (
            <Button
              key={a.to}
              variant={a.tone === 'primary' ? 'primary' : a.tone === 'danger' ? 'danger' : 'secondary'}
              loading={busy === a.to}
              onClick={() => (NEEDS_MESSAGE.includes(a.to) ? setPending(a) : transition(a.to))}
            >
              {booking && a.to === 'approved' ? 'אישור ההזמנה' : a.label}
            </Button>
          ))}
          {!PRODUCTION && isPaymentOutstanding(run.payment) && run.status !== 'cancelled' && run.status !== 'rejected' && (
            <Button
              variant="dark"
              icon={CreditCard}
              loading={busy === 'pay'}
              onClick={async () => {
                setBusy('pay');
                try {
                  await repo.markPaymentPaid(org.id, run.id);
                  toast(`${run.payment.status === 'deposit_requested' ? 'המקדמה' : 'התשלום'} סומן כשולם (סימולציה — לא בוצע חיוב)`);
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'העדכון נכשל', 'error');
                } finally {
                  setBusy(null);
                }
              }}
            >
              סימון {run.payment.status === 'deposit_requested' ? 'מקדמה' : 'תשלום'} כשולם (סימולציה)
            </Button>
          )}
        </div>
      </div>

      {customerCanEdit && (
        <Card className="mb-6 flex flex-col gap-3 border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-amber-900">
            {run.status === 'awaiting_customer' ? 'ממתין שהלקוח/ה ימלא/תמלא את הקישור האישי.' : 'נשלחה בקשת שינויים. הלקוח/ה יכול/ה לעדכן ולשלוח מחדש מאותו קישור.'}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={Copy}
              onClick={async () => {
                const ok = await copyText(customerLink);
                toast(ok ? 'הקישור האישי הועתק' : 'לא ניתן להעתיק', ok ? 'success' : 'error');
              }}
            >
              העתקת קישור אישי
            </Button>
            <a href={customerLink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-midnight px-3 text-sm font-medium text-white">
              <ExternalLink className="h-4 w-4" aria-hidden /> פתיחה כלקוח
            </a>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {booking && (
            <Card className="flex flex-wrap items-center gap-4 p-5">
              <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl', bState?.confirmed ? 'bg-teal-50 text-teal-600' : 'bg-amber-50 text-amber-700')}>
                <CalendarCheck className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{bState?.label}</p>
                <p className="text-sm text-ink-muted">
                  {bookingDate ? `יום ${WEEKDAY_LABELS[weekdayOf(bookingDate) ?? 0]}, ${formatDate(bookingDate)}` : '—'}
                  {booking.timeKey && answer(booking.timeKey) ? ` · ${answer(booking.timeKey)!.displayValue}` : ''}
                  {booking.guestsKey && answer(booking.guestsKey) ? ` · ${answer(booking.guestsKey)!.displayValue} ${booking.capacityUnit === 'guests' ? 'משתתפים' : ''}` : ''}
                </p>
              </div>
              <p className="w-full text-xs text-ink-muted">{PRODUCTION ? 'אישור כאן הופך את הבקשה להזמנה מאושרת. המקום נשמר על השרת מרגע השליחה, ומשתחרר אם הבקשה נדחית או מבוטלת.' : 'אישור כאן הופך את הבקשה להזמנה מאושרת. בדמו אין יומן משותף ואין שמירת מקום בין מכשירים — הקיבולת מחושבת מבקשות בדפדפן זה.'}</p>
            </Card>
          )}
          <QuotePanel orgId={org.id} run={run} design={version?.design} quotes={quotes} canAct={canAct} onChanged={q.reload} onSent={nudgeCustomer} />
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">פעולות ללקוח</h2>
                <p className="mt-0.5 text-xs text-ink-muted">אישורים, בחירות ועדכונים מובנים — עם שתי תשובות ברורות ותיעוד מלא.</p>
              </div>
              {canAct && runActions.length > 0 && (
                <Button size="sm" variant="secondary" icon={SendHorizontal} onClick={() => setComposing(true)}>
                  פעולה חדשה
                </Button>
              )}
            </div>
            {runActions.length ? (
              <ActionsList
                actions={runActions}
                busy={busy}
                onCancel={async (a) => {
                  if (!(await confirmAction({ title: `לבטל את "${a.title}"?`, message: 'הלקוח יראה שהבקשה בוטלה.', confirmLabel: 'ביטול הפעולה', cancelLabel: 'השארה', destructive: true }))) return;
                  setBusy(a.id);
                  try {
                    await repo.cancelAction(org.id, a.id);
                    toast('הפעולה בוטלה ונרשמה בהיסטוריה');
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'הביטול נכשל', 'error');
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            ) : (
              <div className="mt-3 rounded-xl bg-cloud p-4 text-sm text-ink-muted">
                <p>צריך אישור לעבודה נוספת, בחירה בין משלוח לאיסוף, או לעדכן שההזמנה מוכנה? במקום הודעה בוואטסאפ, שלחו פעולה מובנית: הלקוח בוחר אחת משתי תשובות, והכול נשמר כאן.</p>
                {canAct && (
                  <Button size="sm" className="mt-3" icon={SendHorizontal} onClick={() => setComposing(true)}>
                    פעולה חדשה ללקוח
                  </Button>
                )}
              </div>
            )}
          </Card>
          {run.caseAnswers.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 font-semibold">פרטי התיק</h2>
              <Answers items={run.caseAnswers} />
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-2 font-semibold">תשובות הלקוח</h2>
            {run.answers.length ? <Answers items={run.answers} /> : <p className="py-4 text-sm text-ink-muted">הלקוח/ה עדיין לא שלח/ה תשובות.</p>}
          </Card>
          {completion && run.submittedAt && !PRODUCTION && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">סיום ותשלום</h2>
                <Badge tone="neutral">{COMPLETION_LABELS[run.completionMode ?? completion.mode].title}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-muted">
                {run.payment.kind === 'external' && run.payment.status === 'none'
                  ? 'קישור התשלום של העסק יוצג ללקוח רק אחרי שתאשרו את הבקשה.'
                  : run.payment.status === 'none' && run.payment.amount === 0
                  ? 'אין תשלום בבקשה הזו — זו הגשה בלבד, לא חוב פתוח.'
                  : run.payment.status === 'quote'
                    ? `הלקוח ראה הערכה של ${formatCurrency(run.payment.amount)}. לא נדרש תשלום; שלחו הצעה סופית.`
                    : run.payment.status === 'external_link'
                      ? 'קישור התשלום של העסק מוצג ללקוח בעמוד הבקשה. Formangle לא יודע אם הלקוח פתח אותו או שילם — בדקו במערכת התשלום שלכם.'
                      : run.payment.status === 'none'
                        ? `${run.payment.kind === 'deposit' ? 'מקדמה' : 'תשלום'} של ${formatCurrency(run.payment.amount)} יתבקש רק אחרי אישור.`
                        : isPaymentOutstanding(run.payment)
                          ? `ממתין ל${run.payment.status === 'deposit_requested' ? 'מקדמה' : 'תשלום'} של ${formatCurrency(run.payment.amount)}.`
                          : `${run.payment.status === 'deposit_paid_simulated' ? 'מקדמה' : 'תשלום'} של ${formatCurrency(run.payment.amount)} סומן כשולם.`}{' '}
                {run.payment.kind !== 'external' && (run.payment.status !== 'none' || run.payment.amount > 0) ? 'כל התשלומים בדמו הם סימולציה — לא עבר כסף.' : ''}
              </p>
            </Card>
          )}
          {version?.config.pricing.enabled && run.answers.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">{version.config.pricing.totalLabel}</h2>
              <ul className="space-y-1.5 text-sm">
                {run.priceLines.map((l, i) => (
                  <li key={i} className="flex justify-between text-ink-muted">
                    <span>{l.label}</span>
                    <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                  </li>
                ))}
                {run.priceLines.length === 0 && <li className="text-ink-muted">אין פריטים בתשלום</li>}
              </ul>
              <div className="mt-3 flex justify-between border-t border-cloud-200 pt-3 text-base font-semibold">
                <span>סה״כ</span>
                <span className="tabular-nums">{formatCurrency(run.total)}</span>
              </div>

            </Card>
          )}
          {!PRODUCTION && <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">הודעות מדומות</h2>
              <Badge>לא נשלחות בפועל</Badge>
            </div>
            <NotificationList items={notifications} />
          </Card>}
        </div>

        <div className="space-y-6">
          {workflow && <CustomerLinkCard orgId={org.id} run={run} production={PRODUCTION} nudge={customerNudge} />}
          <Card className="p-5">
            <h2 className="font-semibold">הערה פנימית</h2>
            <p className="mt-0.5 text-xs text-ink-muted">נראית רק לצוות, לא ללקוח.</p>
            <Textarea
              className="mt-3"
              rows={3}
              value={note}
              maxLength={1000}
              invalid={Boolean(noteError)}
              aria-label="הערה פנימית"
              onChange={(e) => {
                setNote(e.target.value);
                setNoteError('');
              }}
              placeholder="לדוגמה: התקשרתי לאשר כתובת"
            />
            {noteError && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {noteError}
              </p>
            )}
            <Button size="sm" className="mt-2" icon={StickyNote} onClick={addNote} loading={busy === 'note'}>
              שמירת הערה
            </Button>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">היסטוריה</h2>
            <Timeline events={events} />
          </Card>
        </div>
      </div>

      <ActionComposer open={composing} onClose={() => setComposing(false)} orgId={org.id} business={org.name} run={run} design={version?.design} onCreated={() => { q.reload(); nudgeCustomer(); }} />

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending?.label ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              ביטול
            </Button>
            <Button variant={pending?.to === 'rejected' ? 'danger' : 'primary'} loading={Boolean(busy)} onClick={() => pending && transition(pending.to, message)}>
              {pending?.label}
            </Button>
          </>
        }
      >
        <label htmlFor="transition-msg" className="mb-1.5 block text-sm font-medium">
          {PRODUCTION ? 'הודעה ללקוח (תופיע בעמוד הבקשה שלו)' : 'הודעה ללקוח (תופיע בהודעה המדומה)'}
        </label>
        <Textarea
          id="transition-msg"
          rows={3}
          value={message}
          maxLength={300}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={pending?.to === 'changes_requested' ? 'מה צריך לעדכן?' : 'סיבת הדחייה (אופציונלי)'}
        />
      </Modal>
    </>
  );
}
