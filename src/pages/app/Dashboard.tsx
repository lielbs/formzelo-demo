import { CheckCircle2, CircleDashed, Clock, ExternalLink, Inbox, Plus, Sparkles, Wallet, Workflow as WorkflowIcon, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotificationList, Timeline } from '../../components/Activity';
import { RunsTable } from '../../components/RunsTable';
import { Badge, ButtonLink, Card, cx, DemoBadge, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '../../components/ui';
import { useActiveOrg, useRepoQuery } from '../../data/store';
import { DONE_STATUSES, PENDING_STATUSES } from '../../engine/transitions';
import { formatCurrency, formatNumber } from '../../lib/format';
import { appHref } from '../../lib/links';

const FILTERS = [
  { key: 'all', label: 'הכול' },
  { key: 'pending', label: 'ממתינות' },
  { key: 'done', label: 'אושרו / הושלמו' },
] as const;

const onboardingKey = (orgId: string) => `formzelo:ui:onboarding-dismissed:${orgId}`;

function readDismissed(orgId: string) {
  try {
    return localStorage.getItem(onboardingKey(orgId)) === '1';
  } catch {
    return false;
  }
}

export function Dashboard() {
  const org = useActiveOrg();
  const q = useRepoQuery(
    async (r) => {
      const [workflows, runs, events, notifications, usage] = await Promise.all([
        r.listWorkflows(org.id),
        r.listRuns(org.id),
        r.listEvents(org.id),
        r.listNotifications(org.id),
        r.listUsage(org.id),
      ]);
      return { workflows, runs, events, notifications, usage };
    },
    [org.id],
  );
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [dismissed, setDismissed] = useState(() => readDismissed(org.id));

  const stats = useMemo(() => {
    if (!q.data) return null;
    const { workflows, runs } = q.data;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const done = runs.filter((r) => DONE_STATUSES.includes(r.status));
    return {
      active: workflows.filter((w) => w.status === 'published').length,
      incoming: runs.filter((r) => r.submittedAt && new Date(r.submittedAt).getTime() > weekAgo).length,
      pending: runs.filter((r) => PENDING_STATUSES.includes(r.status)).length,
      completed: done.length,
      value: done.reduce((s, r) => s + r.total, 0),
      demoShare: runs.length ? runs.filter((r) => r.isDemo).length / runs.length : 0,
    };
  }, [q.data]);

  if (q.loading) return <Spinner />;
  if (q.error || !q.data || !stats) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;
  const { workflows, runs, events, notifications, usage } = q.data;

  const filtered = runs.filter((r) =>
    filter === 'pending' ? PENDING_STATUSES.includes(r.status) : filter === 'done' ? DONE_STATUSES.includes(r.status) : true,
  );
  const mainFlow = workflows.find((w) => w.status === 'published');

  const steps = [
    { done: usage.some((u) => u.type === 'workflow_generated'), label: 'תארו תהליך במילים שלכם', to: '/app/workflows/new' },
    { done: workflows.some((w) => !w.isDemo && w.status === 'published'), label: 'ערכו ופרסמו גרסה', to: '/app/workflows' },
    { done: usage.some((u) => u.type === 'link_copied'), label: 'העתיקו את הקישור ושלחו ללקוח', to: '/app/workflows' },
    { done: events.some((e) => e.actor === 'owner' && e.type === 'status_changed' && !runs.find((r) => r.id === e.runId)?.isDemo), label: 'אשרו בקשה ראשונה', to: '/app/requests' },
  ];
  const showOnboarding = !dismissed && steps.some((s) => !s.done);

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <DemoBadge />
            <span className="text-xs text-ink-muted">{org.industry}</span>
          </div>
        }
        title={`לוח בקרה · ${org.name}`}
        description={org.tagline}
        actions={
          <>
            {mainFlow && (
              <a href={appHref(`/f/${mainFlow.slug}`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-4 text-sm font-medium hover:bg-cloud">
                <ExternalLink className="h-4 w-4" aria-hidden /> צפייה כלקוח
              </a>
            )}
            <ButtonLink to="/app/workflows/new" icon={Plus}>
              תהליך חדש
            </ButtonLink>
          </>
        }
      />

      {showOnboarding && (
        <Card className="mb-6 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">ארבעה צעדים לתהליך הראשון שלכם</h2>
                <p className="text-sm text-ink-muted">כ-3 דקות. הכול נשמר מקומית בדפדפן.</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="הסתרת המדריך"
              className="rounded-lg p-1.5 text-ink-soft hover:bg-cloud hover:text-ink"
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(onboardingKey(org.id), '1');
                } catch {
                  /* per-viewer convenience only */
                }
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link to={s.to} className={cx('flex items-center gap-2.5 rounded-xl border p-3 text-sm transition hover:border-ink-soft', s.done ? 'border-teal-50 bg-teal-50/50 text-ink-muted' : 'border-cloud-200')}>
                  {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" aria-label="בוצע" /> : <CircleDashed className="h-4 w-4 shrink-0 text-ink-soft" aria-label="טרם בוצע" />}
                  <span className={s.done ? 'line-through' : 'font-medium'}>
                    {i + 1}. {s.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4">
        <Stat label="תהליכים פעילים" value={formatNumber(stats.active)} icon={WorkflowIcon} />
        <Stat label="בקשות ב-7 ימים" value={formatNumber(stats.incoming)} icon={Inbox} tone="orange" />
        <Stat label="ממתינות לטיפול" value={formatNumber(stats.pending)} icon={Clock} tone="orange" />
        <Stat label="אושרו / הושלמו" value={formatNumber(stats.completed)} icon={CheckCircle2} tone="teal" />
        <div className="col-span-2 md:col-span-1">
          <Stat label="ערך להמחשה" value={formatCurrency(stats.value)} icon={Wallet} tone="teal" hint="סכום בקשות שאושרו, מחושב מנתונים מקומיים (כולל נתוני דמו)" />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud-200 px-4 py-3">
            <h2 className="font-semibold">בקשות אחרונות</h2>
            <div role="tablist" aria-label="סינון בקשות" className="flex gap-1 rounded-xl bg-cloud p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition', filter === f.key ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {filtered.length ? (
            <RunsTable runs={filtered.slice(0, 8)} workflows={workflows} />
          ) : (
            <div className="p-4">
              <EmptyState icon={Inbox} title="אין בקשות בסינון הזה">
                שלחו את הקישור הציבורי ללקוח — או פתחו אותו בעצמכם כדי לנסות.
              </EmptyState>
            </div>
          )}
          <div className="border-t border-cloud-200 px-4 py-3 text-end">
            <Link to="/app/requests" className="text-sm font-medium text-orange hover:underline">
              לכל הבקשות ({formatNumber(runs.length)})
            </Link>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">פעילות אחרונה</h2>
            <Timeline events={events.slice(0, 7)} runs={runs} showRun />
          </Card>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">הודעות מדומות</h2>
              <Badge tone="neutral">לא נשלחות</Badge>
            </div>
            <NotificationList items={notifications.slice(0, 3)} />
          </Card>
        </div>
      </div>
      {stats.demoShare > 0 && <p className="mt-6 text-xs text-ink-soft">חלק מהנתונים בעמוד זה הם נתוני דמו בדיוניים ({Math.round(stats.demoShare * 100)}% מהבקשות), מסומנים בתג "דמו".</p>}
    </>
  );
}
