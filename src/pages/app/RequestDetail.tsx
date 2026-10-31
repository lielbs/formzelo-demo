import { ArrowRight, Copy, CreditCard, ExternalLink, StickyNote } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NotificationList, Timeline } from '../../components/Activity';
import { PaymentBadge, StatusBadge } from '../../components/StatusBadge';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, DemoBadge, EmptyState, ErrorState, Modal, Spinner, Textarea } from '../../components/ui';
import type { RunAnswer, RunStatus } from '../../domain/schema';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { ownerActions, STATUS_LABELS } from '../../engine/transitions';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { publicFlowUrl } from '../../lib/links';

const NEEDS_MESSAGE: RunStatus[] = ['changes_requested', 'rejected'];

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

  const q = useRepoQuery(
    async (r) => {
      const run = await r.getRun(org.id, id);
      if (!run) return null;
      const [workflow, version, events, notifications] = await Promise.all([
        r.getWorkflow(org.id, run.workflowId),
        r.getVersion(org.id, run.versionId),
        r.listEvents(org.id, run.id),
        r.listNotifications(org.id, run.id),
      ]);
      return { run, workflow, version, events, notifications };
    },
    [org.id, id],
  );

  if (q.loading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) {
    return (
      <EmptyState icon={StickyNote} title="הבקשה לא נמצאה בסביבת עבודה זו" action={<Link to="/app/requests" className="text-sm font-medium text-orange">חזרה לבקשות</Link>}>
        בקשות שייכות לסביבת העבודה שבה נשלחו.
      </EmptyState>
    );
  }
  const { run, workflow, version, events, notifications } = q.data;
  const actions = ownerActions(run.status);
  const customerLink = workflow ? publicFlowUrl(workflow.slug, run.id) : '';
  const customerCanEdit = run.status === 'awaiting_customer' || run.status === 'changes_requested';

  const transition = async (to: RunStatus, msg?: string) => {
    setBusy(to);
    try {
      await repo.transitionRun(org.id, run.id, to, msg?.trim() || undefined);
      toast(`הסטטוס עודכן ל"${STATUS_LABELS[to]}" · הודעה מדומה הוכנה`);
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
      <Link to="/app/requests" className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-orange">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden /> בקשות
      </Link>
      <div className="mb-6 mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {run.customerName || 'לקוח/ה'} <span className="text-lg font-normal text-ink-soft ltr">{run.reference}</span>
            </h1>
            <StatusBadge status={run.status} />
            <PaymentBadge payment={run.payment} />
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
          {actions.map((a) => (
            <Button
              key={a.to}
              variant={a.tone === 'primary' ? 'primary' : a.tone === 'danger' ? 'danger' : 'secondary'}
              loading={busy === a.to}
              onClick={() => (NEEDS_MESSAGE.includes(a.to) ? setPending(a) : transition(a.to))}
            >
              {a.label}
            </Button>
          ))}
          {run.payment.status === 'deposit_requested' && (
            <Button
              variant="dark"
              icon={CreditCard}
              loading={busy === 'pay'}
              onClick={async () => {
                setBusy('pay');
                try {
                  await repo.markDepositPaid(org.id, run.id);
                  toast('המקדמה סומנה כשולמה (סימולציה)');
                } finally {
                  setBusy(null);
                }
              }}
            >
              סימון מקדמה כשולמה (סימולציה)
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
              {run.payment.amount > 0 && (
                <p className="mt-2 text-xs text-ink-muted">
                  מקדמה: {formatCurrency(run.payment.amount)} · {run.payment.status === 'none' ? 'תידרש לאחר אישור' : run.payment.status === 'deposit_requested' ? 'ממתינה' : 'שולמה'} — סימולציה בלבד, לא נגבה כסף.
                </p>
              )}
            </Card>
          )}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">הודעות מדומות</h2>
              <Badge>לא נשלחות בפועל</Badge>
            </div>
            <NotificationList items={notifications} />
          </Card>
        </div>

        <div className="space-y-6">
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
          הודעה ללקוח (תופיע בהודעה המדומה)
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
