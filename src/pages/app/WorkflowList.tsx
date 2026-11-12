import { Archive, ArchiveRestore, Copy, ExternalLink, Link2, MoreHorizontal, Pencil, Plus, Search, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { chooseAction, confirmAction } from '../../components/Confirm';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, ButtonLink, Card, cx, DemoBadge, EmptyState, ErrorState, Input, PageHeader, Spinner } from '../../components/ui';
import type { Workflow } from '../../domain/schema';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { intakeState } from '../../engine/intake';
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

  const more = async (w: Workflow) => {
    const key = await chooseAction({
      title: w.draft.title,
      options: [
        ...(w.status === 'published' ? [{ key: 'open', label: 'פתיחת הטופס כמו לקוח', icon: ExternalLink }] : []),
        { key: 'duplicate', label: 'שכפול כטיוטה', icon: Copy },
        w.status === 'archived'
          ? { key: 'restore', label: 'שחזור מהארכיון', icon: ArchiveRestore }
          : { key: 'archive', label: 'העברה לארכיון', icon: Archive, hint: 'הקישור נסגר, הבקשות נשמרות' },
        { key: 'delete', label: 'מחיקה', icon: Trash2, destructive: true },
      ],
    });
    if (key === 'open') window.open(appHref(`/f/${w.slug}`), '_blank', 'noopener');
    if (key === 'duplicate') await act(w.id + 'dup', () => repo.duplicateWorkflow(org.id, w.id), 'נוצר עותק כטיוטה');
    if (key === 'restore') await act(w.id, () => repo.setArchived(org.id, w.id, false), 'התהליך שוחזר מהארכיון');
    if (key === 'archive' && await confirmAction({ title: 'להעביר לארכיון?', message: 'הקישור הציבורי יפסיק לעבוד. הבקשות הקיימות נשמרות, ואפשר לשחזר מהארכיון בכל רגע.', confirmLabel: 'העברה לארכיון' })) {
      await act(w.id, () => repo.setArchived(org.id, w.id, true), 'הועבר לארכיון');
    }
    if (key === 'delete') {
      const requests = runCount(w.id);
      const ok = await confirmAction({
        title: `למחוק את "${w.draft.title}"?`,
        message: requests
          ? `התהליך ו־${formatNumber(requests)} הבקשות שהתקבלו בו יוסרו מהמערכת, והקישור הציבורי יפסיק לעבוד. אי אפשר לבטל את המחיקה.`
          : 'התהליך יוסר מהמערכת והקישור הציבורי יפסיק לעבוד. אי אפשר לבטל את המחיקה.',
        confirmLabel: 'מחיקה לצמיתות',
        destructive: true,
        typeToConfirm: requests ? w.draft.title : undefined,
        action: () => repo.deleteWorkflow(org.id, w.id),
      });
      if (ok) toast('התהליך נמחק');
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
        <ul className="fz-stagger grid gap-4 md:grid-cols-2">
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
                        {w.status === 'published' && !intakeState(w.intake, q.data!.runs.filter((r) => r.workflowId === w.id)).open && <Badge tone="amber">סגור לבקשות חדשות</Badge>}
                        {w.isDemo && <DemoBadge />}
                        <span className="text-xs text-ink-soft">{TEMPLATES[w.templateKey as TemplateKey]?.label ?? w.templateKey}</span>
                      </div>
                      <Link to={`/app/workflows/${w.id}`} className="mt-2 block text-lg font-semibold leading-snug text-ink hover:text-orange-700">
                        {w.draft.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{w.draft.description}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-ink-soft">
                    {formatNumber(runCount(w.id))} בקשות · {w.draft.steps.length} שלבים · עודכן {formatRelative(w.updatedAt)}
                  </p>
                  <div className="mt-4 flex items-center gap-2 border-t border-ink/[0.06] pt-4">
                    <Button size="sm" variant="dark" icon={Pencil} onClick={() => navigate(`/app/workflows/${w.id}`)}>
                      עריכה
                    </Button>
                    {w.status === 'published' && (
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
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={MoreHorizontal}
                      aria-label={`פעולות נוספות: ${w.draft.title}`}
                      loading={busy === w.id || busy === w.id + 'dup'}
                      className="ms-auto h-9 w-9 rounded-full px-0"
                      onClick={() => void more(w)}
                    />
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
