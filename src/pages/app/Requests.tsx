import { runtimeConfiguration } from '../../production/runtime';
import { FilePlus2, Inbox, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreateCaseModal } from '../../components/CreateCaseModal';
import { RunsTable } from '../../components/RunsTable';
import { Button, Card, cx, EmptyState, ErrorState, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { RUN_STATUSES, type RunStatus, type Workflow } from '../../domain/schema';
import { useActiveOrg, useRepoQuery } from '../../data/store';
import { isPaymentOutstanding } from '../../engine/completion';
import { STATUS_LABELS } from '../../engine/transitions';
import { actionsByRun } from '../../engine/actions';

export function Requests() {
  const org = useActiveOrg();
  const [params, setParams] = useSearchParams();
  // 'decision' / 'answered' filter by Formangle Actions rather than by request status.
  const status = (params.get('status') ?? 'all') as RunStatus | 'all' | 'decision' | 'answered';
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [payFilter, setPayFilter] = useState<'all' | 'none' | 'outstanding' | 'paid' | 'quote'>('all');
  const [sort, setSort] = useState<'new' | 'old' | 'amount'>('new');
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [workflowFilter !== 'all', payFilter !== 'all', sort !== 'new'].filter(Boolean).length;
  const [caseWorkflow, setCaseWorkflow] = useState<Workflow | null>(null);

  const q = useRepoQuery(
    async (r) => {
      const [runs, workflows, actions] = await Promise.all([r.listRuns(org.id), r.listWorkflows(org.id), r.listActions(org.id)]);
      const caseFlows = await Promise.all(
        workflows
          .filter((w) => w.status === 'published' && w.publishedVersionId)
          .map(async (w) => ({ w, v: await r.getVersion(org.id, w.publishedVersionId!) })),
      );
      return { runs, workflows, actions, caseFlows: caseFlows.filter((x) => x.v?.config.mode === 'case') };
    },
    [org.id],
  );

  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;
  const { runs, workflows, caseFlows } = q.data;
  const byRun = actionsByRun(q.data.actions);
  const decisionOk = (id: string) => (status === 'decision' ? Boolean(byRun.get(id)?.awaiting) : status === 'answered' ? Boolean(byRun.get(id)?.answered) : true);

  const needle = search.trim().toLowerCase();
  const byWorkflow = runs.filter((r) => workflowFilter === 'all' || r.workflowId === workflowFilter);
  const payOk = (r: (typeof runs)[number]) =>
    payFilter === 'all' ||
    (payFilter === 'none' && r.payment.status === 'none') ||
    (payFilter === 'outstanding' && isPaymentOutstanding(r.payment)) ||
    (payFilter === 'paid' && r.payment.status.endsWith('_simulated')) ||
    (payFilter === 'quote' && r.payment.status === 'quote');
  const when = (r: (typeof runs)[number]) => r.submittedAt ?? r.createdAt;
  const list = byWorkflow
    .filter(
      (r) =>
        (status === 'all' || status === 'decision' || status === 'answered' || r.status === status) &&
        decisionOk(r.id) &&
        payOk(r) &&
        (!needle || r.reference.toLowerCase().includes(needle) || r.customerName.toLowerCase().includes(needle) || r.customerContact.includes(needle)),
    )
    .sort((a, b) => (sort === 'amount' ? b.total - a.total : sort === 'old' ? when(a).localeCompare(when(b)) : when(b).localeCompare(when(a))));
  const count = (s: RunStatus) => byWorkflow.filter((r) => r.status === s).length;
  const setStatus = (s: string) => setParams(s === 'all' ? {} : { status: s }, { replace: true });
  const caseTarget = caseFlows.find((c) => c.w.id === caseWorkflow?.id);

  return (
    <>
      <PageHeader
        title="בקשות"
        description="כל מה שלקוחות שלחו, עם סטטוס, היסטוריה והערות פנימיות."
        actions={caseFlows.map(({ w }) => (
          <Button key={w.id} icon={FilePlus2} onClick={() => setCaseWorkflow(w)}>
            תיק חדש{caseFlows.length > 1 ? ` · ${w.draft.title}` : ''}
          </Button>
        ))}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex gap-2 sm:flex-1">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input type="search" className="ps-9" placeholder="חיפוש לפי שם, טלפון או מספר בקשה" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="חיפוש בקשות" />
          </div>
          {/* Phones: the three filters fold into one button (with the number of active ones). */}
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="request-filters"
            className={cx('relative flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium sm:hidden', activeFilters ? 'border-ink bg-ink text-white' : 'border-cloud-300 bg-white text-ink')}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />סינון{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
        </div>
        <div id="request-filters" className={cx('grid gap-3 sm:flex sm:gap-3', !showFilters && 'hidden')}>
        <Select aria-label="סינון לפי תשלום" value={payFilter} onChange={(e) => setPayFilter(e.target.value as typeof payFilter)} className="sm:w-52">
          <option value="all">כל מצבי התשלום</option>
          <option value="none">ללא תשלום</option>
          <option value="quote">הצעת מחיר</option>
          {runtimeConfiguration.mode === 'demo' && <option value="outstanding">ממתין לתשלום (סימולציה)</option>}
          {runtimeConfiguration.mode === 'demo' && <option value="paid">שולם (סימולציה)</option>}
        </Select>
        <Select aria-label="מיון" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sm:w-40">
          <option value="new">החדשות קודם</option>
          <option value="old">הישנות קודם</option>
          <option value="amount">לפי סכום</option>
        </Select>
        <Select aria-label="סינון לפי תהליך" value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)} className="sm:w-64">
          <option value="all">כל התהליכים</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.draft.title}
            </option>
          ))}
        </Select>
        </div>
      </div>

      <div role="tablist" aria-label="סינון לפי סטטוס" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {(['all', 'decision', 'answered', ...RUN_STATUSES] as const).map((s) => {
          const n = s === 'all' ? byWorkflow.length : s === 'decision' ? byWorkflow.filter((r) => byRun.get(r.id)?.awaiting).length : s === 'answered' ? byWorkflow.filter((r) => byRun.get(r.id)?.answered).length : count(s);
          if (s !== 'all' && n === 0 && status !== s) return null;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                status === s ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:text-ink',
              )}
            >
              {s === 'all' ? 'הכול' : s === 'decision' ? 'ממתין להחלטת לקוח' : s === 'answered' ? 'הלקוח השיב' : STATUS_LABELS[s]} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {list.length ? (
          <RunsTable runs={list} workflows={workflows} actions={byRun} />
        ) : (
          <div className="p-4">
            <EmptyState icon={Inbox} title={runs.length ? 'אין בקשות שתואמות לסינון' : 'עדיין אין בקשות'}>
              {runs.length ? 'נסו לשנות את הסינון או החיפוש.' : 'פרסמו תהליך ושלחו את הקישור — בקשות יופיעו כאן מיד.'}
            </EmptyState>
          </div>
        )}
      </Card>

      {caseWorkflow && caseTarget?.v && (
        <CreateCaseModal open onClose={() => setCaseWorkflow(null)} orgId={org.id} workflow={caseWorkflow} caseFields={caseTarget.v.config.caseFields} />
      )}
    </>
  );
}
