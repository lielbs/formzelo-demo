import { runtimeConfiguration } from '../../production/runtime';
import { BarChart3, CheckCircle2, Clock, Inbox, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '../../components/ui';
import { RUN_STATUSES } from '../../domain/schema';
import { useActiveOrg, useRepoQuery } from '../../data/store';
import { simulatedMoney, workflowOutcome } from '../../engine/metrics';
import { DONE_STATUSES } from '../../engine/transitions';
import { formatCurrency, formatNumber, formatShortDate, isoDay } from '../../lib/format';

const RANGES = [7, 14, 30] as const;

export function Analytics() {
  const org = useActiveOrg();
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [includeDemo, setIncludeDemo] = useState(true);
  const q = useRepoQuery(
    async (r) => {
      const [runs, workflows, events] = await Promise.all([r.listRuns(org.id), r.listWorkflows(org.id), r.listEvents(org.id)]);
      return { runs, workflows, events };
    },
    [org.id],
  );

  const metrics = useMemo(() => {
    if (!q.data) return null;
    const since = new Date(isoDay(-(range - 1)) + 'T00:00:00').getTime();
    const runs = q.data.runs.filter((r) => r.submittedAt && (includeDemo || !r.isDemo) && new Date(r.submittedAt).getTime() >= since);
    const decided = runs.filter((r) => ['approved', 'completed', 'rejected'].includes(r.status));

    const days = Array.from({ length: range }, (_, i) => isoDay(i - (range - 1)));
    const perDay = days.map((d) => ({
      day: formatShortDate(d),
      בקשות: runs.filter((r) => isoDay(0, new Date(r.submittedAt!)) === d).length,
    }));

    // Time from submission to the owner's first status change.
    const responseHours = runs
      .map((r) => {
        const first = q.data!.events
          .filter((e) => e.runId === r.id && e.type === 'status_changed' && e.actor === 'owner')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        return first ? (new Date(first.createdAt).getTime() - new Date(r.submittedAt!).getTime()) / 3_600_000 : null;
      })
      .filter((h): h is number => h !== null && h >= 0);

    const byWorkflow = q.data.workflows
      .map((w) => {
        const list = runs.filter((r) => r.workflowId === w.id);
        const ok = list.filter((r) => DONE_STATUSES.includes(r.status));
        return { w, count: list.length, approved: ok.length, outcome: workflowOutcome(w.draft, list) };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      total: runs.length,
      approvalRate: decided.length ? Math.round((runs.filter((r) => DONE_STATUSES.includes(r.status)).length / decided.length) * 100) : null,
      money: simulatedMoney(runs),
      avgResponse: responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null,
      perDay,
      statuses: RUN_STATUSES.map((s) => ({ s, n: runs.filter((r) => r.status === s).length })).filter((x) => x.n > 0),
      byWorkflow,
      demoCount: runs.filter((r) => r.isDemo).length,
    };
  }, [q.data, range, includeDemo]);

  if (q.loading) return <Spinner />;
  if (q.error || !metrics) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;
  const maxStatus = Math.max(1, ...metrics.statuses.map((x) => x.n));

  return (
    <>
      <PageHeader
        title="אנליטיקה"
        description="מחושב בזמן אמת מהבקשות השמורות בדפדפן."
        actions={
          <>
            <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-card">
              <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
              כולל נתוני דמו
            </label>
            <div role="tablist" aria-label="טווח זמן" className="fz-seg">
              {RANGES.map((r) => (
                <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className="fz-seg-btn">
                  {r} ימים
                </button>
              ))}
            </div>
          </>
        }
      />
      {metrics.demoCount > 0 && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800">
          <Badge tone="amber">דמו</Badge> {formatNumber(metrics.demoCount)} מתוך {formatNumber(metrics.total)} הבקשות בטווח הן נתוני דמו בדיוניים
        </p>
      )}

      {metrics.total === 0 ? (
        <EmptyState icon={BarChart3} title="אין נתונים בטווח הזה">
          {includeDemo ? 'הרחיבו את הטווח או שלחו בקשה דרך קישור ציבורי.' : 'עדיין אין בקשות אמיתיות (שאינן דמו). שלחו בקשה דרך קישור ציבורי כדי לראות אותה כאן.'}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
            <Stat label="בקשות שנשלחו" value={formatNumber(metrics.total)} icon={Inbox} tone="orange" />
            <Stat label="שיעור אישור" value={metrics.approvalRate === null ? '—' : `${metrics.approvalRate}%`} icon={CheckCircle2} tone="teal" hint="מתוך בקשות שהוכרעו" />
            {runtimeConfiguration.mode === 'demo' && <Stat label="תשלומים מדומים" value={formatCurrency(metrics.money.paid)} icon={Wallet} tone="teal" hint={`${metrics.money.outstanding ? `${formatCurrency(metrics.money.outstanding)} ממתינים · ` : ''}רק תהליכים עם תשלום. סימולציה — לא עבר כסף`} />}
            <Stat label="זמן תגובה ממוצע" value={metrics.avgResponse === null ? '—' : `${metrics.avgResponse.toFixed(1)} ש׳`} icon={Clock} hint="עד שינוי הסטטוס הראשון" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 font-semibold">בקשות לפי יום</h2>
              <div dir="ltr" className="h-64" role="img" aria-label={`תרשים עמודות: בקשות לפי יום ב-${range} הימים האחרונים`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.perDay} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E8EAEE" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5B6675' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5B6675' }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#F5F6F8' }} contentStyle={{ borderRadius: 12, border: '1px solid #E8EAEE', direction: 'rtl', fontFamily: 'Rubik' }} />
                    <Bar dataKey="בקשות" fill="#E96B3D" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 font-semibold">לפי סטטוס</h2>
              <ul className="space-y-3">
                {metrics.statuses.map(({ s, n }) => (
                  <li key={s}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <StatusBadge status={s} />
                      <span className="tabular-nums text-ink-muted">{formatNumber(n)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-cloud-200">
                      <div className="h-full rounded-full bg-midnight" style={{ width: `${(n / maxStatus) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="mt-6 overflow-x-auto">
            <h2 className="px-5 pt-5 font-semibold">לפי תהליך</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-cloud-200 text-xs text-ink-muted">
                  <th className="px-5 py-2 text-start font-medium">תהליך</th>
                  <th className="px-5 py-2 text-end font-medium">בקשות</th>
                  <th className="px-5 py-2 text-end font-medium">אושרו</th>
                  <th className="px-5 py-2 text-end font-medium">מדד המטרה</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byWorkflow.map(({ w, count, approved, outcome }) => (
                  <tr key={w.id} className="border-b border-cloud-200 last:border-0">
                    <td className="px-5 py-3 font-medium">{w.draft.title}</td>
                    <td className="px-5 py-3 text-end tabular-nums">{formatNumber(count)}</td>
                    <td className="px-5 py-3 text-end tabular-nums">{formatNumber(approved)}</td>
                    <td className="px-5 py-3 text-end">
                      <span className="tabular-nums font-medium">{formatNumber(outcome.primary.value)}</span> <span className="text-xs text-ink-muted">{outcome.primary.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
