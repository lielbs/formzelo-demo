import { ArrowLeft, CheckCircle2, MessageSquareReply, SendHorizontal, CircleDashed, Clock, ExternalLink, Inbox, Plus, Sparkles, Wallet, Workflow as WorkflowIcon, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotificationList, Timeline } from '../../components/Activity';
import { RunsTable } from '../../components/RunsTable';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge, ButtonLink, Card, cx, DemoBadge, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '../../components/ui';
import { useActiveOrg, useRepoQuery } from '../../data/store';
import { simulatedMoney, workflowOutcome } from '../../engine/metrics';
import { DONE_STATUSES, ownerActions, PENDING_STATUSES } from '../../engine/transitions';
import { actionsByRun, actionStatus, countActions } from '../../engine/actions';
import { formatCurrency, formatNumber, formatRelative } from '../../lib/format';
import { appHref } from '../../lib/links';

const FILTERS = [
  { key: 'all', label: 'הכול' },
  { key: 'pending', label: 'ממתינות' },
  { key: 'done', label: 'אושרו / הושלמו' },
  { key: 'decision', label: 'ממתינות להחלטה' },
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
      const [workflows, runs, events, notifications, usage, actions] = await Promise.all([
        r.listWorkflows(org.id),
        r.listRuns(org.id),
        r.listEvents(org.id),
        r.listNotifications(org.id),
        r.listUsage(org.id),
        r.listActions(org.id),
      ]);
      return { workflows, runs, events, notifications, usage, actions };
    },
    [org.id],
  );
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [dismissed, setDismissed] = useState(() => readDismissed(org.id));
  // Phones: activity and simulated messages fold behind one button (always shown on desktop).
  const [showFeed, setShowFeed] = useState(false);

  const stats = useMemo(() => {
    if (!q.data) return null;
    const { workflows, runs } = q.data;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const done = runs.filter((r) => DONE_STATUSES.includes(r.status));
    const decided = runs.filter((r) => DONE_STATUSES.includes(r.status) || r.status === 'rejected').length;
    return {
      active: workflows.filter((w) => w.status === 'published').length,
      drafts: workflows.filter((w) => w.status === 'draft' || w.hasUnpublishedChanges).length,
      approvalRate: decided ? Math.round((done.length / decided) * 100) : null,
      incoming: runs.filter((r) => r.submittedAt && new Date(r.submittedAt).getTime() > weekAgo).length,
      pending: runs.filter((r) => PENDING_STATUSES.includes(r.status)).length,
      completed: done.length,
      money: simulatedMoney(runs),
      outcomes: workflows
        .filter((w) => w.status !== 'archived')
        .map((w) => ({ w, outcome: workflowOutcome(w.draft, runs.filter((r) => r.workflowId === w.id)) })),
      demoShare: runs.length ? runs.filter((r) => r.isDemo).length / runs.length : 0,
    };
  }, [q.data]);

  if (q.loading) return <Spinner />;
  if (q.error || !q.data || !stats) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;
  const { workflows, runs, events, notifications, usage, actions } = q.data;
  const byRun = actionsByRun(actions);
  const decisions = countActions(actions);
  const openActions = actions.filter((a) => actionStatus(a) === 'pending').slice(0, 4);
  const answeredActions = actions
    .filter((a) => actionStatus(a) === 'responded')
    .sort((a, b) => b.response!.at.localeCompare(a.response!.at))
    .slice(0, 4);
  const runOf = (id: string) => runs.find((r) => r.id === id);

  const filtered = runs.filter((r) =>
    filter === 'pending' ? PENDING_STATUSES.includes(r.status) : filter === 'done' ? DONE_STATUSES.includes(r.status) : filter === 'decision' ? Boolean(byRun.get(r.id)?.awaiting) : true,
  );
  const mainFlow = workflows.find((w) => w.status === 'published');
  // The newest submitted request — the moment a customer's answers reach the business.
  const latest = runs.filter((r) => r.submittedAt).sort((a, b) => b.submittedAt!.localeCompare(a.submittedAt!))[0];
  const latestFlow = latest && workflows.find((w) => w.id === latest.workflowId);
  const latestNext = latest ? ownerActions(latest.status) : [];

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
            {org.isDemo && <DemoBadge />}
            {org.industry && <span className="text-xs text-ink-muted">{org.industry}</span>}
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">ארבעה צעדים לתהליך הראשון שלכם</h2>
                <p className="text-sm text-ink-muted">כ-3 דקות. {org.isDemo ? 'בדמו הכול נשמר מקומית בדפדפן.' : 'הכול נשמר אוטומטית בחשבון שלכם.'}</p>
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

      {latest && (
        <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <Inbox className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-muted">הבקשה האחרונה שהגיעה · {formatRelative(latest.submittedAt!)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 font-semibold">
              <span className="truncate">{latest.customerName || 'לקוח/ה'}</span>
              <bdi className="text-sm font-normal text-ink-muted">{latest.reference}</bdi>
              <StatusBadge status={latest.status} />
              {latest.isDemo && <Badge tone="amber">דמו</Badge>}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              מהתהליך ״{latestFlow?.draft.title ?? 'תהליך שנמחק'}״{latest.total > 0 ? ` · ${formatCurrency(latest.total)}` : ''}
              {latestNext.length > 0 && <> · אפשר: {latestNext.slice(0, 3).map((a) => a.label).join(' / ')}</>}
            </p>
          </div>
          <ButtonLink to={`/app/requests/${latest.id}`} variant="dark" className="shrink-0">
            פתיחת הבקשה <ArrowLeft className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4">
        <Stat label="תהליכים פעילים" value={formatNumber(stats.active)} icon={WorkflowIcon} hint={stats.drafts ? `${stats.drafts} עם טיוטה שלא פורסמה` : undefined} />
        <Stat label="בקשות ב-7 ימים" value={formatNumber(stats.incoming)} icon={Inbox} tone="orange" />
        <Stat label="ממתינות לטיפול" value={formatNumber(stats.pending)} icon={Clock} tone="orange" />
        <Stat
          label="אושרו / הושלמו"
          value={formatNumber(stats.completed)}
          icon={CheckCircle2}
          tone="teal"
          hint={stats.approvalRate !== null ? `שיעור אישור ${stats.approvalRate}% מהבקשות שהוכרעו` : undefined}
        />
        <div className="col-span-2 md:col-span-1">
          {stats.money.paid > 0 || stats.money.outstanding > 0 ? (
            <Stat
              label="תשלומים מדומים"
              value={formatCurrency(stats.money.paid)}
              icon={Wallet}
              tone="teal"
              hint={`${stats.money.outstanding ? `${formatCurrency(stats.money.outstanding)} ממתינים · ` : ''}סימולציה, לא עבר כסף`}
            />
          ) : (
            <Stat label="שיעור אישור" value={stats.approvalRate !== null ? `${stats.approvalRate}%` : '—'} icon={CheckCircle2} tone="teal" hint="תהליכים ללא תשלום לא מציגים הכנסות" />
          )}
        </div>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">החלטות לקוחות</h2>
          <p className="text-xs text-ink-muted">פעולות מובנות שנפתחו מתוך בקשות: אישורים, בחירות ועדכונים.</p>
        </div>
        {actions.length ? (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <section aria-label="ממתינות לתשובת הלקוח">
              <p className="flex items-center gap-2 text-sm font-medium">
                <SendHorizontal className="h-4 w-4 text-amber-700" aria-hidden /> ממתינות לתשובת הלקוח
                <span className="tabular-nums text-ink-muted">{formatNumber(decisions.awaiting)}</span>
              </p>
              {openActions.length ? (
                <ul className="mt-2 space-y-1.5">
                  {openActions.map((a) => (
                    <li key={a.id}>
                      <Link to={`/app/requests/${a.runId}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-cloud">
                        <span className="min-w-0 truncate">{a.title}</span>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {runOf(a.runId)?.customerName || runOf(a.runId)?.reference} · {formatRelative(a.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">אין כרגע החלטות פתוחות.</p>
              )}
            </section>
            <section aria-label="תשובות אחרונות">
              <p className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareReply className="h-4 w-4 text-teal-600" aria-hidden /> תשובות אחרונות
                <span className="tabular-nums text-ink-muted">{formatNumber(decisions.answered)}</span>
              </p>
              {answeredActions.length ? (
                <ul className="mt-2 space-y-1.5">
                  {answeredActions.map((a) => (
                    <li key={a.id}>
                      <Link to={`/app/requests/${a.runId}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-cloud">
                        <span className="min-w-0 truncate">
                          {a.title}: <strong className={a.kind === 'approval' && a.response!.optionId === 'b' ? 'text-ink-soft' : 'text-teal-600'}>{a.response!.label}</strong>
                        </span>
                        <span className="shrink-0 text-xs text-ink-muted">{formatRelative(a.response!.at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">עדיין לא התקבלו תשובות.</p>
              )}
            </section>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-cloud p-4 text-sm text-ink-muted">
            מתוך כל בקשה אפשר לשלוח ללקוח פעולה מובנית — אישור עבודה נוספת, בחירה בין שתי אפשרויות או עדכון — ולראות כאן מה ממתין ומה נענה.
          </p>
        )}
      </Card>

      {stats.outcomes.length > 0 && (
        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">לפי מטרת התהליך</h2>
            <p className="text-xs text-ink-muted">כל תהליך נמדד לפי מה שהוא נועד לעשות — לא כל תהליך הוא מכירה.</p>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stats.outcomes.map(({ w, outcome }) => (
              <li key={w.id}>
                <Link to={`/app/workflows/${w.id}`} className="block h-full rounded-xl border border-cloud-200 p-4 transition hover:border-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold">{w.draft.title}</p>
                    <Badge tone="neutral">{outcome.objectiveLabel}</Badge>
                  </div>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{formatNumber(outcome.primary.value)}</span>
                    <span className="text-sm text-ink-muted">{outcome.primary.label}</span>
                  </p>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    {outcome.secondary.map((m) => (
                      <div key={m.label} className="flex gap-1">
                        <dt>{m.label}:</dt>
                        <dd className="font-medium text-ink tabular-nums">{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
            <RunsTable runs={filtered.slice(0, 8)} workflows={workflows} actions={byRun} />
          ) : (
            <div className="p-4">
              <EmptyState icon={Inbox} title="אין בקשות בסינון הזה">
                שלחו את הקישור הציבורי ללקוח — או פתחו אותו בעצמכם כדי לנסות.
              </EmptyState>
            </div>
          )}
          <div className="border-t border-cloud-200 px-4 py-3 text-end">
            <Link to="/app/requests" className="text-sm font-medium text-orange-700 hover:underline">
              לכל הבקשות ({formatNumber(runs.length)})
            </Link>
          </div>
        </Card>

        <button type="button" onClick={() => setShowFeed((v) => !v)} aria-expanded={showFeed} aria-controls="dashboard-feed"
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-cloud-300 bg-white text-sm font-medium text-ink lg:hidden">
          {showFeed ? 'הסתרת הפעילות וההודעות' : 'פעילות אחרונה והודעות'}
        </button>
        <div id="dashboard-feed" className={cx('space-y-6', !showFeed && 'hidden lg:block')}>
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
