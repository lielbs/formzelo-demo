import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Workflow, WorkflowRun } from '../domain/schema';
import { formatCurrency, formatRelative } from '../lib/format';
import { PaymentBadge, StatusBadge } from './StatusBadge';
import { Badge, DemoBadge } from './ui';

export type RunActionInfo = Map<string, { awaiting: number; answered: number }>;

/** Formangle Actions state of a request, next to its status. */
function DecisionBadge({ info }: { info?: { awaiting: number; answered: number } }) {
  if (!info) return null;
  if (info.awaiting) return <Badge tone="amber">{info.awaiting > 1 ? `${info.awaiting} ממתינות להחלטת לקוח` : 'ממתין להחלטת לקוח'}</Badge>;
  return info.answered ? <Badge tone="teal">הלקוח השיב</Badge> : null;
}

/** Requests table on desktop, stacked cards on mobile. Rows are keyboard-activatable links. */
export function RunsTable({ runs, workflows, actions }: { runs: WorkflowRun[]; workflows: Workflow[]; actions?: RunActionInfo }) {
  const navigate = useNavigate();
  const title = (id: string) => workflows.find((w) => w.id === id)?.draft.title ?? '—';
  const open = (id: string) => navigate(`/app/requests/${id}`);

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cloud-200 text-start text-xs text-ink-muted">
              <th className="px-4 py-3 text-start font-medium">בקשה</th>
              <th className="px-4 py-3 text-start font-medium">לקוח/ה</th>
              <th className="px-4 py-3 text-start font-medium">תהליך</th>
              <th className="px-4 py-3 text-start font-medium">סטטוס</th>
              <th className="px-4 py-3 text-end font-medium">סכום</th>
              <th className="px-4 py-3 text-start font-medium">עודכן</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                role="link"
                aria-label={`בקשה ${r.reference} של ${r.customerName || 'לקוח'}`}
                onClick={() => open(r.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(r.id)}
                className="cursor-pointer border-b border-cloud-200 transition-colors last:border-0 hover:bg-cloud/60 focus-visible:bg-cloud focus-visible:outline-none"
              >
                <td className="px-4 py-3 font-medium ltr text-start">
                  {r.reference} {r.isDemo && <DemoBadge className="ms-1" />}
                </td>
                <td className="px-4 py-3">{r.customerName || '—'}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-ink-muted">{title(r.workflowId)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={r.status} />
                    <PaymentBadge payment={r.payment} runStatus={r.status} />
                    <DecisionBadge info={actions?.get(r.id)} />
                  </div>
                </td>
                <td className="px-4 py-3 text-end tabular-nums">{r.total > 0 ? formatCurrency(r.total) : '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatRelative(r.updatedAt)}</td>
                <td className="px-2 text-ink-soft">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-cloud-200 md:hidden">
        {runs.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => open(r.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-cloud/60">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.customerName || 'לקוח/ה'}</span>
                  <span className="text-xs text-ink-soft ltr">{r.reference}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {title(r.workflowId)} · {formatRelative(r.updatedAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={r.status} />
                <DecisionBadge info={actions?.get(r.id)} />
                {r.total > 0 && <span className="text-xs tabular-nums text-ink-muted">{formatCurrency(r.total)}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
