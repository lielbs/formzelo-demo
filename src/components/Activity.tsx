import { Bell, CalendarCheck, CreditCard, FilePlus2, Mail, MessageSquare, RefreshCw, Send, StickyNote, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NotificationPreview, RunEvent, WorkflowRun } from '../domain/schema';
import { formatDateTime, formatRelative } from '../lib/format';
import { Badge, cx } from './ui';

const EVENT_ICON = {
  case_created: FilePlus2,
  submitted: Send,
  resubmitted: RefreshCw,
  status_changed: RefreshCw,
  note_added: StickyNote,
  notification_simulated: Bell,
  payment_simulated: CreditCard,
  booking_confirmed: CalendarCheck,
} as const;

const ACTOR = { customer: 'לקוח/ה', owner: 'צוות', system: 'מערכת' } as const;

export function Timeline({ events, runs, showRun = false }: { events: RunEvent[]; runs?: WorkflowRun[]; showRun?: boolean }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-ink-muted">אין פעילות עדיין.</p>;
  const byId = new Map(runs?.map((r) => [r.id, r]));
  return (
    <ol className="relative space-y-4 before:absolute before:inset-y-2 before:start-[15px] before:w-px before:bg-cloud-200">
      {events.map((e) => {
        const Icon = EVENT_ICON[e.type];
        const run = byId.get(e.runId);
        return (
          <li key={e.id} className="relative flex gap-3">
            <span
              className={cx(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white',
                e.type === 'note_added' ? 'bg-amber-50 text-amber-700' : e.actor === 'customer' ? 'bg-orange-50 text-orange' : 'bg-cloud-200 text-ink-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm text-ink">
                {e.message}
                {e.internal && (
                  <Badge tone="amber" className="ms-2 align-middle">
                    פנימי
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {ACTOR[e.actor]} · <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>{formatRelative(e.createdAt)}</time>
                {showRun && run && (
                  <>
                    {' · '}
                    <Link to={`/app/requests/${run.id}`} className="font-medium text-ink-muted hover:text-orange">
                      {run.reference} {run.customerName && `· ${run.customerName}`}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const CHANNEL = {
  email: { icon: Mail, label: 'אימייל' },
  sms: { icon: Smartphone, label: 'SMS' },
  whatsapp: { icon: MessageSquare, label: 'WhatsApp' },
} as const;

export function NotificationList({ items }: { items: NotificationPreview[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-ink-muted">אין הודעות מדומות עדיין.</p>;
  return (
    <ul className="space-y-3">
      {items.map((n) => {
        const { icon: Icon, label } = CHANNEL[n.channel];
        return (
          <li key={n.id} className="rounded-xl border border-cloud-200 bg-cloud/50 p-3.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="font-medium text-ink">{label}</span>
              <span>אל</span>
              <span className="ltr">{n.to}</span>
              <Badge tone="neutral" className="ms-auto">
                סימולציה · לא נשלח
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium text-ink">{n.subject}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
            <p className="mt-1.5 text-[11px] text-ink-soft">{formatDateTime(n.createdAt)}</p>
          </li>
        );
      })}
    </ul>
  );
}
