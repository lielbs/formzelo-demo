import { FilePlus2, Inbox, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreateCaseModal } from '../../components/CreateCaseModal';
import { RunsTable } from '../../components/RunsTable';
import { Button, Card, cx, EmptyState, ErrorState, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { RUN_STATUSES, type RunStatus, type Workflow } from '../../domain/schema';
import { useActiveOrg, useRepoQuery } from '../../data/store';
import { STATUS_LABELS } from '../../engine/transitions';

export function Requests() {
  const org = useActiveOrg();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'all') as RunStatus | 'all';
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [caseWorkflow, setCaseWorkflow] = useState<Workflow | null>(null);

  const q = useRepoQuery(
    async (r) => {
      const [runs, workflows] = await Promise.all([r.listRuns(org.id), r.listWorkflows(org.id)]);
      const caseFlows = await Promise.all(
        workflows
          .filter((w) => w.status === 'published' && w.publishedVersionId)
          .map(async (w) => ({ w, v: await r.getVersion(org.id, w.publishedVersionId!) })),
      );
      return { runs, workflows, caseFlows: caseFlows.filter((x) => x.v?.config.mode === 'case') };
    },
    [org.id],
  );

  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;
  const { runs, workflows, caseFlows } = q.data;

  const needle = search.trim().toLowerCase();
  const byWorkflow = runs.filter((r) => workflowFilter === 'all' || r.workflowId === workflowFilter);
  const list = byWorkflow.filter(
    (r) =>
      (status === 'all' || r.status === status) &&
      (!needle || r.reference.toLowerCase().includes(needle) || r.customerName.toLowerCase().includes(needle) || r.customerContact.includes(needle)),
  );
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
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <Input type="search" className="ps-9" placeholder="חיפוש לפי שם, טלפון או מספר בקשה" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="חיפוש בקשות" />
        </div>
        <Select aria-label="סינון לפי תהליך" value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)} className="sm:w-64">
          <option value="all">כל התהליכים</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.draft.title}
            </option>
          ))}
        </Select>
      </div>

      <div role="tablist" aria-label="סינון לפי סטטוס" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {(['all', ...RUN_STATUSES] as const).map((s) => {
          const n = s === 'all' ? byWorkflow.length : count(s);
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
              {s === 'all' ? 'הכול' : STATUS_LABELS[s]} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {list.length ? (
          <RunsTable runs={list} workflows={workflows} />
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
