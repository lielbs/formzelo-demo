import { Archive, ArchiveRestore, Copy, ExternalLink, Link2, Pencil, Plus, Search, Workflow as WorkflowIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, ButtonLink, Card, cx, DemoBadge, EmptyState, ErrorState, Input, PageHeader, Spinner } from '../../components/ui';
import type { Workflow } from '../../domain/schema';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { TEMPLATES, type TemplateKey } from '../../engine/templates';
import { formatNumber, formatRelative } from '../../lib/format';
import { appHref, publicFlowUrl } from '../../lib/links';

const STATUS: Record<Workflow['status'], { label: string; tone: 'teal' | 'neutral' | 'amber' }> = {
  published: { label: 'פורסם', tone: 'teal' },
  draft: { label: 'טיוטה', tone: 'amber' },
  archived: { label: 'בארכיון', tone: 'neutral' },
};

const FILTERS = [
  { key: 'active', label: 'פעילים' },
  { key: 'published', label: 'פורסמו' },
  { key: 'draft', label: 'טיוטות' },
  { key: 'archived', label: 'ארכיון' },
] as const;

export function WorkflowList() {
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('active');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useRepoQuery(async (r) => ({ workflows: await r.listWorkflows(org.id), runs: await r.listRuns(org.id) }), [org.id]);

  if (q.loading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;

  const needle = query.trim().toLowerCase();
  const list = q.data.workflows.filter((w) => {
    if (filter === 'active' ? w.status === 'archived' : w.status !== filter) return false;
    return !needle || w.draft.title.toLowerCase().includes(needle) || w.draft.description.toLowerCase().includes(needle) || w.slug.includes(needle);
  });
  const runCount = (id: string) => q.data!.runs.filter((r) => r.workflowId === id && r.status !== 'awaiting_customer').length;

  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="תהליכים"
        description="כל תהליך הוא סכמה אחת שמוצגת ללקוחות דרך אותו מנוע."
        actions={
          <ButtonLink to="/app/workflows/new" icon={Plus}>
            תהליך חדש
          </ButtonLink>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם או תיאור" className="ps-9" aria-label="חיפוש תהליכים" />
        </div>
        <div role="tablist" aria-label="סינון לפי סטטוס" className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-medium transition', filter === f.key ? 'bg-midnight text-white' : 'text-ink-muted hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title={needle ? 'לא נמצאו תהליכים' : filter === 'archived' ? 'הארכיון ריק' : 'עדיין אין תהליכים כאן'}
          action={
            <ButtonLink to="/app/workflows/new" icon={Plus}>
              צרו תהליך מתיאור חופשי
            </ButtonLink>
          }
        >
          {needle ? 'נסו מילת חיפוש אחרת.' : 'כתבו בעברית מה אתם צריכים, וקבלו תהליך מוכן לעריכה.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((w) => {
            const s = STATUS[w.status];
            return (
              <li key={w.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 h-10 w-1.5 shrink-0 rounded-full" style={{ background: w.design.palette.primary }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {w.hasUnpublishedChanges && w.status === 'published' && <Badge tone="amber">שינויים שלא פורסמו</Badge>}
                        {w.isDemo && <DemoBadge />}
                        <span className="text-xs text-ink-soft">{TEMPLATES[w.templateKey as TemplateKey]?.label ?? w.templateKey}</span>
                      </div>
                      <Link to={`/app/workflows/${w.id}`} className="mt-2 block text-lg font-semibold leading-snug text-ink hover:text-orange">
                        {w.draft.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{w.draft.description}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-ink-soft">
                    {formatNumber(runCount(w.id))} בקשות · {w.draft.steps.length} שלבים · עודכן {formatRelative(w.updatedAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-cloud-200 pt-4">
                    <Button size="sm" variant="dark" icon={Pencil} onClick={() => navigate(`/app/workflows/${w.id}`)}>
                      עריכה
                    </Button>
                    {w.status === 'published' && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Link2}
                          onClick={async () => {
                            const ok = await copyText(publicFlowUrl(w.slug));
                            await repo.trackUsage(org.id, 'link_copied', w.id);
                            toast(ok ? 'הקישור הועתק' : 'לא ניתן להעתיק — העתיקו ידנית מהעורך', ok ? 'success' : 'error');
                          }}
                        >
                          העתקת קישור
                        </Button>
                        <a href={appHref(`/f/${w.slug}`)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud">
                          <ExternalLink className="h-4 w-4" aria-hidden /> פתיחה
                        </a>
                      </>
                    )}
                    <Button size="sm" variant="ghost" icon={Copy} loading={busy === w.id + 'dup'} onClick={() => act(w.id + 'dup', () => repo.duplicateWorkflow(org.id, w.id), 'נוצר עותק כטיוטה')}>
                      שכפול
                    </Button>
                    {w.status === 'archived' ? (
                      <Button size="sm" variant="ghost" icon={ArchiveRestore} onClick={() => act(w.id, () => repo.setArchived(org.id, w.id, false), 'התהליך שוחזר מהארכיון')}>
                        שחזור
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Archive}
                        onClick={() => {
                          if (window.confirm('להעביר לארכיון? הקישור הציבורי יפסיק לעבוד, הבקשות הקיימות יישמרו.')) {
                            void act(w.id, () => repo.setArchived(org.id, w.id, true), 'הועבר לארכיון');
                          }
                        }}
                      >
                        ארכיון
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
