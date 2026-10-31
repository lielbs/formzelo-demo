import { ArrowDown, ArrowUp, Copy, Eye, FilePlus2, History, Link2, Palette, PenLine, Plus, RotateCcw, Rocket, Save, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CreateCaseModal } from '../../components/CreateCaseModal';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, DemoBadge, EmptyState, ErrorState, FieldLabel, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { WorkflowConfigSchema, type Condition, type WorkflowConfig, type WorkflowVersion } from '../../domain/schema';
import type { WorkflowTheme } from '../../domain/theme';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { OPERATOR_LABELS } from '../../engine/conditions';
import { formatDateTime, formatNumber } from '../../lib/format';
import { newId } from '../../lib/id';
import { publicFlowUrl } from '../../lib/links';
import { WorkflowRenderer } from '../../renderer/WorkflowRenderer';
import { PRESETS } from '../../theme/presets';
import { themeResolver } from '../../theme/resolver';
import { DesignPanel } from './editor/DesignPanel';
import { DevicePreview, DeviceToggle, type Device } from './editor/DevicePreview';
import { FieldListEditor, move } from './editor/FieldEditor';

type Panel = 'preview' | 'versions' | 'share';

function Section({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return (
    <Card as="section" className="p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

function schemaIssues(config: WorkflowConfig): string[] {
  const r = WorkflowConfigSchema.safeParse(config);
  if (r.success) return [];
  return r.error.issues.slice(0, 5).map((i) => {
    const path = i.path.join('.');
    if (path.endsWith('label') || path.endsWith('title')) return 'יש שדה, שלב או אפשרות ללא שם';
    if (path.startsWith('steps') && i.code === 'too_small') return 'נדרש לפחות שלב אחד';
    if (path.includes('primaryColor')) return 'צבע המותג אינו תקין (#RRGGBB)';
    return `${path}: ${i.message}`;
  });
}

export function WorkflowEditor() {
  const { id = '' } = useParams();
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const navigate = useNavigate();

  const q = useRepoQuery(
    async (r) => {
      const workflow = await r.getWorkflow(org.id, id);
      if (!workflow) return null;
      const [versions, runs] = await Promise.all([r.listVersions(org.id, id), r.listRuns(org.id)]);
      return { workflow, versions, runCount: runs.filter((x) => x.workflowId === id).length };
    },
    [org.id, id],
  );
  const assetsQ = useRepoQuery((r) => r.listAssets(org.id), [org.id]);
  const assets = useMemo(() => assetsQ.data ?? [], [assetsQ.data]);
  const assetUrls = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a.dataUrl])), [assets]);

  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [design, setDesignState] = useState<WorkflowTheme | null>(null);
  const [savedDesignJson, setSavedDesignJson] = useState('');
  const [designHistory, setDesignHistory] = useState<WorkflowTheme[]>([]);
  const [leftTab, setLeftTab] = useState<'content' | 'design'>('content');
  const [device, setDevice] = useState<Device>('mobile');
  const [panel, setPanel] = useState<Panel>('preview');
  const [mobileView, setMobileView] = useState<'edit' | 'panel'>('edit');
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [viewVersion, setViewVersion] = useState<WorkflowVersion | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Load the draft once per workflow; later refetches must not clobber local edits.
  const loadedId = q.data?.workflow.id;
  useEffect(() => {
    if (q.data?.workflow) {
      setConfig(structuredClone(q.data.workflow.draft));
      setSavedJson(JSON.stringify(q.data.workflow.draft));
      setDesignState(structuredClone(q.data.workflow.design));
      setSavedDesignJson(JSON.stringify(q.data.workflow.design));
      setDesignHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const designDirty = design !== null && JSON.stringify(design) !== savedDesignJson;
  const dirty = (config !== null && JSON.stringify(config) !== savedJson) || designDirty;
  const recommendation = useMemo(
    () =>
      themeResolver.resolve({
        templateKey: q.data?.workflow.templateKey,
        title: config?.title,
        description: config?.description,
        prompt: q.data?.workflow.sourcePrompt,
        industry: org.industry,
      }),
    [q.data?.workflow.templateKey, q.data?.workflow.sourcePrompt, config?.title, config?.description, org.industry],
  );

  const setDesign = useCallback((next: WorkflowTheme) => {
    setDesignState((prev) => {
      if (prev) setDesignHistory((h) => [...h.slice(-29), prev]);
      return next;
    });
  }, []);

  const loadSaved = (draft: WorkflowConfig, theme: WorkflowTheme) => {
    setConfig(structuredClone(draft));
    setSavedJson(JSON.stringify(draft));
    setDesignState(structuredClone(theme));
    setSavedDesignJson(JSON.stringify(theme));
    setDesignHistory([]);
  };
  const issues = useMemo(() => (config ? schemaIssues(config) : []), [config]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = useCallback((fn: (draft: WorkflowConfig) => void) => {
    setConfig((c) => {
      if (!c) return c;
      const next = structuredClone(c);
      fn(next);
      return next;
    });
  }, []);

  if (q.loading || (q.data && (!config || !design))) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data || !config || !design) {
    return (
      <EmptyState icon={FilePlus2} title="התהליך לא נמצא בסביבת עבודה זו" action={<Link className="text-sm font-medium text-orange" to="/app/workflows">חזרה לתהליכים</Link>}>
        ייתכן שהוא שייך לסביבת עבודה אחרת.
      </EmptyState>
    );
  }

  const { workflow, versions, runCount } = q.data;
  const allFields = config.steps.flatMap((s) => s.fields);
  const link = publicFlowUrl(workflow.slug);
  const published = workflow.status === 'published';

  const save = async () => {
    if (issues.length) return toast('יש לתקן שגיאות לפני שמירה', 'error');
    setBusy('save');
    try {
      const wf = await repo.saveDraft(org.id, workflow.id, config, design);
      setSavedJson(JSON.stringify(wf.draft));
      setSavedDesignJson(JSON.stringify(wf.design));
      toast('הטיוטה נשמרה — כולל העיצוב');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setConfirmPublish(false);
    if (issues.length) return toast('יש לתקן שגיאות לפני פרסום', 'error');
    setBusy('publish');
    try {
      if (dirty) {
        const wf = await repo.saveDraft(org.id, workflow.id, config, design);
        setSavedJson(JSON.stringify(wf.draft));
        setSavedDesignJson(JSON.stringify(wf.design));
      }
      const v = await repo.publishWorkflow(org.id, workflow.id);
      toast(`גרסה ${v.version} פורסמה — הקישור פעיל`);
      setPanel('share');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפרסום נכשל', 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    const ok = await copyText(link);
    await repo.trackUsage(org.id, 'link_copied', workflow.id);
    toast(ok ? 'הקישור הועתק' : 'סמנו והעתיקו ידנית', ok ? 'success' : 'error');
  };

  const setFee = (i: number, patch: Partial<WorkflowConfig['pricing']['fees'][number]>) =>
    update((d) => {
      d.pricing.fees[i] = { ...d.pricing.fees[i]!, ...patch };
    });

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link to="/app/workflows" className="text-xs font-medium text-ink-muted hover:text-orange">
            ← תהליכים
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{config.title || 'ללא שם'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <Badge tone={published ? 'teal' : workflow.status === 'archived' ? 'neutral' : 'amber'}>
              {published ? `פורסם · גרסה ${versions[0]?.version ?? 1}` : workflow.status === 'archived' ? 'בארכיון' : 'טיוטה'}
            </Badge>
            {(dirty || (workflow.hasUnpublishedChanges && published)) && <Badge tone="amber">{dirty ? 'שינויים שלא נשמרו' : 'טיוטה שלא פורסמה'}</Badge>}
            {workflow.isDemo && <DemoBadge />}
            <span>{formatNumber(runCount)} בקשות</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            icon={RotateCcw}
            disabled={!dirty}
            onClick={() => window.confirm('לבטל את כל השינויים שלא נשמרו (תוכן ועיצוב)?') && loadSaved(JSON.parse(savedJson), JSON.parse(savedDesignJson))}
          >
            ביטול שינויים
          </Button>
          <Button variant="secondary" icon={Save} onClick={save} loading={busy === 'save'} disabled={!dirty}>
            שמירת טיוטה
          </Button>
          <Button icon={Rocket} onClick={() => setConfirmPublish(true)} loading={busy === 'publish'} disabled={workflow.status === 'archived' || Boolean(issues.length)}>
            {published ? 'פרסום גרסה חדשה' : 'פרסום'}
          </Button>
          <Button
            variant="ghost"
            icon={Copy}
            onClick={async () => {
              const copy = await repo.duplicateWorkflow(org.id, workflow.id);
              toast('נוצר עותק כטיוטה');
              navigate(`/app/workflows/${copy.id}`);
            }}
          >
            שכפול
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">לא ניתן לשמור עד שיתוקנו:</p>
          <ul className="mt-1 list-inside list-disc">
            {[...new Set(issues)].map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 shadow-card xl:hidden" role="tablist" aria-label="תצוגה">
        {(['edit', 'panel'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={cx('flex-1 rounded-lg py-2 text-sm font-medium', mobileView === v ? 'bg-midnight text-white' : 'text-ink-muted')}>
            {v === 'edit' ? 'עריכה' : 'תצוגה, גרסאות ושיתוף'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cx('space-y-5', mobileView !== 'edit' && 'hidden xl:block')}>
          <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card" role="tablist" aria-label="עריכה">
            {(
              [
                ['content', 'תוכן ושדות', PenLine],
                ['design', 'עיצוב', Palette],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                role="tab"
                aria-selected={leftTab === k}
                onClick={() => setLeftTab(k)}
                className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition', leftTab === k ? 'bg-midnight text-white' : 'text-ink-muted hover:text-ink')}
              >
                <Icon className="h-4 w-4" aria-hidden /> {label}
                {k === 'design' && designDirty && <span className="h-1.5 w-1.5 rounded-full bg-orange" aria-label="שינויים שלא נשמרו" />}
              </button>
            ))}
          </div>

          {leftTab === 'design' && (
            <DesignPanel
              design={design}
              onChange={setDesign}
              recommendation={recommendation}
              orgId={org.id}
              orgBrandColor={org.brand.primaryColor}
              assets={assets}
              assetUrls={assetUrls}
              canUndo={designHistory.length > 0}
              onUndo={() => {
                const prev = designHistory[designHistory.length - 1];
                if (!prev) return;
                setDesignHistory((h) => h.slice(0, -1));
                setDesignState(prev);
              }}
              designDirty={designDirty}
              onRevert={() => setDesign(JSON.parse(savedDesignJson))}
            />
          )}

          {leftTab === 'content' && (
          <>
          <Section title="פרטים כלליים">
            <div>
              <FieldLabel htmlFor="wf-title" required>
                כותרת
              </FieldLabel>
              <Input id="wf-title" value={config.title} invalid={!config.title.trim()} onChange={(e) => update((d) => void (d.title = e.target.value))} />
            </div>
            <div>
              <FieldLabel htmlFor="wf-desc">תיאור ללקוח</FieldLabel>
              <Textarea id="wf-desc" rows={2} value={config.description} onChange={(e) => update((d) => void (d.description = e.target.value))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="wf-mode">אופן פתיחה</FieldLabel>
                <Select id="wf-mode" value={config.mode} onChange={(e) => update((d) => void (d.mode = e.target.value as WorkflowConfig['mode']))}>
                  <option value="public">קישור ציבורי — כל אחד יכול להתחיל</option>
                  <option value="case">תיק אישי — העסק פותח ושולח קישור</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="wf-success">הודעת הצלחה</FieldLabel>
                <Input id="wf-success" value={config.successMessage} onChange={(e) => update((d) => void (d.successMessage = e.target.value))} />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="wf-disc">אזהרה / הבהרה (אופציונלי)</FieldLabel>
              <Textarea id="wf-disc" rows={2} value={config.disclaimer ?? ''} onChange={(e) => update((d) => void (d.disclaimer = e.target.value || undefined))} />
            </div>
          </Section>

          {config.mode === 'case' && (
            <Section title="שדות התיק" description="ממולאים על ידי העסק בפתיחת התיק ומוצגים ללקוח לקריאה בלבד.">
              <FieldListEditor fields={config.caseFields} allFields={config.caseFields} priced={false} onChange={(fields) => update((d) => void (d.caseFields = fields))} />
            </Section>
          )}

          <Section title="שלבים ושדות" description="סדר השלבים הוא סדר המסכים אצל הלקוח. שלב הסיכום וההסכמה מתווסף אוטומטית.">
            {config.steps.map((s, i) => (
              <div key={s.id} className="rounded-2xl border border-cloud-200 bg-cloud/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-midnight text-xs font-semibold text-white">{i + 1}</span>
                  <Input aria-label={`שם שלב ${i + 1}`} value={s.title} invalid={!s.title.trim()} onChange={(e) => update((d) => void (d.steps[i]!.title = e.target.value))} className="flex-1 font-medium" />
                  <Button size="sm" variant="ghost" aria-label="העלאת שלב" disabled={i === 0} onClick={() => update((d) => void (d.steps = move(d.steps, i, -1)))}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="הורדת שלב" disabled={i === config.steps.length - 1} onClick={() => update((d) => void (d.steps = move(d.steps, i, 1)))}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`מחיקת שלב ${s.title}`}
                    disabled={config.steps.length <= 1}
                    onClick={() => window.confirm(`למחוק את השלב "${s.title}" וכל השדות בו?`) && update((d) => void d.steps.splice(i, 1))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  aria-label={`תיאור שלב ${i + 1}`}
                  placeholder="תיאור קצר לשלב (אופציונלי)"
                  value={s.description ?? ''}
                  onChange={(e) => update((d) => void (d.steps[i]!.description = e.target.value || undefined))}
                  className="mt-2 text-sm"
                />
                <div className="mt-3">
                  <FieldListEditor fields={s.fields} allFields={allFields} priced={config.pricing.enabled} onChange={(fields) => update((d) => void (d.steps[i]!.fields = fields))} />
                </div>
              </div>
            ))}
            <Button variant="secondary" icon={Plus} onClick={() => update((d) => void d.steps.push({ id: newId('stp'), title: `שלב ${d.steps.length + 1}`, fields: [] }))}>
              הוספת שלב
            </Button>
          </Section>

          <Section title="מחיר" description="חישוב דקלרטיבי: מחירי אפשרויות, תוספות, עמלות קבועות ומקדמה מדומה.">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={config.pricing.enabled} onChange={(e) => update((d) => void (d.pricing.enabled = e.target.checked))} />
              הצגת חישוב מחיר ללקוח
            </label>
            {config.pricing.enabled && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="wf-total">כותרת הסכום</FieldLabel>
                    <Input id="wf-total" value={config.pricing.totalLabel} onChange={(e) => update((d) => void (d.pricing.totalLabel = e.target.value))} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="wf-dep">מקדמה מדומה לאחר אישור (%)</FieldLabel>
                    <Input
                      id="wf-dep"
                      type="number"
                      min={0}
                      max={100}
                      dir="ltr"
                      value={config.pricing.depositPercent}
                      onChange={(e) => update((d) => void (d.pricing.depositPercent = Math.min(100, Math.max(0, Number(e.target.value) || 0))))}
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">עמלות קבועות</p>
                  <ul className="space-y-2">
                    {config.pricing.fees.map((f, i) => (
                      <li key={f.id} className="rounded-xl border border-cloud-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input aria-label="שם העמלה" value={f.label} onChange={(e) => setFee(i, { label: e.target.value })} className="min-w-0 flex-1" />
                          <Input aria-label="סכום העמלה" type="number" min={0} dir="ltr" value={f.amount} onChange={(e) => setFee(i, { amount: Number(e.target.value) || 0 })} className="w-28" />
                          <Button size="sm" variant="ghost" aria-label={`מחיקת ${f.label}`} onClick={() => update((d) => void d.pricing.fees.splice(i, 1))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                          <span>חלה רק אם</span>
                          <Select
                            aria-label="תנאי לעמלה"
                            className="w-auto py-1.5 text-xs"
                            value={f.condition ? `${f.condition.fieldKey}|${f.condition.operator}` : ''}
                            onChange={(e) => {
                              const [fieldKey, operator] = e.target.value.split('|');
                              setFee(i, { condition: fieldKey ? ({ fieldKey, operator } as Condition) : undefined });
                            }}
                          >
                            <option value="">תמיד</option>
                            {allFields
                              .filter((x) => x.type === 'checkbox' || x.type === 'decision')
                              .map((x) => (
                                <option key={x.id} value={`${x.key}|isTrue`}>
                                  {x.label} — {OPERATOR_LABELS.isTrue}
                                </option>
                              ))}
                          </Select>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="secondary" icon={Plus} className="mt-2" onClick={() => update((d) => void d.pricing.fees.push({ id: newId('fee'), label: 'עמלה', amount: 0 }))}>
                    עמלה
                  </Button>
                </div>
              </>
            )}
          </Section>

          <Section title="שם העסק והסכמה" description="צבעים, גופנים, לוגו ותמונות נמצאים בלשונית ״עיצוב״.">
            <div>
              <FieldLabel htmlFor="wf-logo">שם העסק בטופס</FieldLabel>
              <Input id="wf-logo" maxLength={40} value={config.branding.logoText} onChange={(e) => update((d) => void (d.branding.logoText = e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={config.consent.required} onChange={(e) => update((d) => void (d.consent.required = e.target.checked))} />
              נדרשת הסכמה מפורשת לפני שליחה
            </label>
            <div>
              <FieldLabel htmlFor="wf-consent">נוסח ההסכמה</FieldLabel>
              <Textarea id="wf-consent" rows={2} value={config.consent.text} onChange={(e) => update((d) => void (d.consent.text = e.target.value))} />
            </div>
          </Section>
          </>
          )}
        </div>

        <div className={cx('xl:sticky xl:top-6 xl:self-start', mobileView !== 'panel' && 'hidden xl:block')}>
          <div className="mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-card" role="tablist" aria-label="לוח צד">
            {(
              [
                ['preview', 'תצוגה מקדימה', Eye],
                ['versions', `גרסאות (${versions.length})`, History],
                ['share', 'שיתוף', Link2],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                role="tab"
                aria-selected={panel === k}
                onClick={() => setPanel(k)}
                className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition', panel === k ? 'bg-midnight text-white' : 'text-ink-muted hover:text-ink')}
              >
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          {panel === 'preview' && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <DeviceToggle device={device} onChange={setDevice} />
                <span>מתעדכן בזמן אמת · שליחה בתצוגה לא נשמרת</span>
                <button type="button" className="font-medium hover:text-orange" onClick={() => setPreviewKey((k) => k + 1)}>
                  איפוס התצוגה
                </button>
              </div>
              {issues.length ? (
                <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">התצוגה תחזור אחרי תיקון השגיאות.</p>
              ) : (
                <DevicePreview device={device} height={device === 'mobile' ? 720 : 560}>
                  <WorkflowRenderer key={`${previewKey}-${device}`} config={config} theme={design} assets={assetUrls} mode="preview" embedded scrollFrame />
                </DevicePreview>
              )}
            </div>
          )}

          {panel === 'versions' && (
            <Card className="p-5">
              <p className="text-sm text-ink-muted">כל פרסום יוצר גרסה קבועה. בקשות נשארות מקושרות לגרסה שבה נשלחו.</p>
              {versions.length === 0 ? (
                <p className="mt-4 rounded-xl bg-cloud p-4 text-center text-sm text-ink-muted">עוד לא פורסמה גרסה.</p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-cloud-200 p-3">
                      <span className="font-semibold">גרסה {v.version}</span>
                      {v.id === workflow.publishedVersionId && <Badge tone="teal">פעילה</Badge>}
                      <span className="text-xs text-ink-muted">{formatDateTime(v.publishedAt)}</span>
                      <Badge tone="neutral">{PRESETS[v.design.presetId].meta.nameHe}</Badge>
                      <div className="ms-auto flex gap-1">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewVersion(v)}>
                          צפייה
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Undo2}
                          onClick={async () => {
                            if (dirty && !window.confirm('השינויים שלא נשמרו יוחלפו בגרסה זו. להמשיך?')) return;
                            const wf = await repo.restoreVersionToDraft(org.id, workflow.id, v.id);
                            loadSaved(wf.draft, wf.design);
                            toast(`גרסה ${v.version} שוחזרה לטיוטה`);
                          }}
                        >
                          שחזור לטיוטה
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}

          {panel === 'share' && (
            <Card className="space-y-4 p-5">
              {published ? (
                <>
                  <div>
                    <FieldLabel htmlFor="share-link">{config.mode === 'case' ? 'כתובת התהליך (נדרש תיק אישי)' : 'קישור ציבורי'}</FieldLabel>
                    <div className="flex gap-2">
                      <input id="share-link" readOnly dir="ltr" value={link} onFocus={(e) => e.target.select()} className="fz-input min-w-0 flex-1 rounded-xl border border-cloud-300 bg-cloud px-3 py-2 text-sm" />
                      <Button variant="secondary" icon={Copy} onClick={copyLink}>
                        העתקה
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-medium text-white hover:bg-midnight-700">
                      <Eye className="h-4 w-4" aria-hidden /> פתיחה כלקוח
                    </a>
                    {versions[0]?.config.mode === 'case' && (
                      <Button icon={FilePlus2} onClick={() => setCaseOpen(true)}>
                        פתיחת תיק ללקוח
                      </Button>
                    )}
                  </div>
                  <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                    הקישור עובד בדפדפן הזה בלבד: הנתונים נשמרים ב-localStorage ואינם מסתנכרנים בין מכשירים או דפדפנים. בגרסת ייצור הקישור יעבוד מכל מקום.
                  </p>
                </>
              ) : (
                <EmptyState icon={Rocket} title="פרסמו כדי לקבל קישור" action={<Button icon={Rocket} onClick={() => setConfirmPublish(true)} disabled={workflow.status === 'archived'}>פרסום</Button>}>
                  {workflow.status === 'archived' ? 'התהליך בארכיון. שחזרו אותו מרשימת התהליכים.' : 'הקישור נוצר ברגע הפרסום הראשון.'}
                </EmptyState>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={`פרסום גרסה ${versions.length + 1}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPublish(false)}>
              ביטול
            </Button>
            <Button icon={Rocket} onClick={publish}>
              פרסום
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          {dirty ? 'השינויים יישמרו ו' : ''}תיווצר תמונת מצב קבועה של התהליך והעיצוב ({PRESETS[design.presetId].meta.nameHe}). לקוחות חדשים יראו את הגרסה החדשה; בקשות קיימות ({formatNumber(runCount)}) נשארות מקושרות לגרסה שבה נשלחו.
        </p>
      </Modal>

      <Modal open={Boolean(viewVersion)} onClose={() => setViewVersion(null)} title={`גרסה ${viewVersion?.version ?? ''} · לקריאה בלבד`} side>
        {viewVersion && <WorkflowRenderer config={viewVersion.config} theme={viewVersion.design} assets={assetUrls} mode="preview" embedded />}
      </Modal>

      {versions[0] && (
        <CreateCaseModal open={caseOpen} onClose={() => setCaseOpen(false)} orgId={org.id} workflow={workflow} caseFields={versions.find((v) => v.id === workflow.publishedVersionId)?.config.caseFields ?? []} />
      )}
    </>
  );
}
