/**
 * Visual design studio. Structure pane (steps & blocks) · live canvas (the
 * real generic renderer) · contextual inspector. Every action edits the draft
 * WorkflowConfig / WorkflowTheme; publishing snapshots both into an immutable
 * version (with the brand kit resolved).
 */
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  GitBranch,
  Play,
  ArrowUp,
  CalendarClock,
  Gauge,
  Copy,
  CreditCard,
  Eye,
  GripVertical,
  FilePlus2,
  History,
  Layers,
  MousePointerClick,
  Palette,
  PenLine,
  Plus,
  Redo2,
  RotateCcw,
  Rocket,
  Save,
  Settings2,
  Share2,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CreateCaseModal } from '../../components/CreateCaseModal';
import { SharePanel } from '../../components/SharePanel';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, DemoBadge, EmptyState, ErrorState, FieldLabel, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { isDisplayField, WorkflowConfigSchema, type WorkflowConfig, type WorkflowField, type WorkflowVersion } from '../../domain/schema';
import type { WorkflowTheme } from '../../domain/theme';
import { DEMO_SLUGS } from '../../data/seed';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { COMPLETION_LABELS, completionOf } from '../../engine/completion';
import { fieldHasPrice } from '../../engine/pricing';
import { formatDateTime, formatNumber } from '../../lib/format';
import { newId } from '../../lib/id';
import { assetSrc, publicFlowUrl } from '../../lib/links';
import { linkReach } from '../../lib/share';
import { WorkflowRenderer } from '../../renderer/WorkflowRenderer';
import { effectiveTheme } from '../../theme/brand';
import { PRESETS } from '../../theme/presets';
import { themeResolver } from '../../theme/resolver';
import { blockIcon, createBlocks, type BlockAction, type BlockDef } from './editor/blockLibrary';
import { FieldLibrary } from './editor/FieldLibrary';
import { LogicPanel } from './editor/LogicPanel';
import { duplicateField, earlierAnswerFields, historyOf, pushHistory, redoHistory, undoHistory, type History as EditHistory } from '../../engine/builder';
import { advise } from '../../engine/advisor';
import { hasIntakeRules, intakeState } from '../../engine/intake';
import { canPublish, logicIssues, publishReadiness } from '../../engine/logic';
import { DesignPanel, Toggle } from './editor/DesignPanel';
import { DevicePreview, DeviceToggle, type Device } from './editor/DevicePreview';
import { FIELD_TYPE_LABELS, FieldListEditor, move } from './editor/FieldEditor';
import { BookingInspector, CompletionInspector, FieldInspector, NextStepsEditor, Panel, StepInspector } from './editor/Inspector';
import { IntakePanel } from './editor/IntakePanel';
import { PresenceInspector } from './editor/PresenceInspector';
import { StudioCoach } from './editor/StudioCoach';

type Selection =
  | { kind: 'workflow' }
  | { kind: 'design' }
  | { kind: 'completion' }
  | { kind: 'booking' }
  | { kind: 'intake' }
  | { kind: 'presence' }
  | { kind: 'publish' }
  | { kind: 'logic' }
  | { kind: 'step'; stepId: string }
  | { kind: 'field'; fieldId: string };

interface Snapshot {
  config: WorkflowConfig;
  design: WorkflowTheme;
}

function schemaIssues(config: WorkflowConfig): string[] {
  const r = WorkflowConfigSchema.safeParse(config);
  if (r.success) return [];
  return r.error.issues.slice(0, 5).map((i) => {
    const path = i.path.join('.');
    if (path.endsWith('label') || path.endsWith('title')) return 'יש רכיב, שלב או אפשרות ללא שם';
    if (path.startsWith('steps') && i.code === 'too_small') return 'נדרש לפחות שלב אחד';
    if (path.includes('externalUrl')) return 'קישור התשלום החיצוני חייב להתחיל ב-https://';
    if (path.includes('slots')) return 'שעות הזמנה חייבות להיות בפורמט HH:MM';
    return `${path}: ${i.message}`;
  });
}

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function NavItem({ active, icon: Icon, children, onClick, badge }: { active: boolean; icon: typeof Eye; children: ReactNode; onClick: () => void; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cx(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
        active ? 'bg-midnight text-white' : 'text-ink hover:bg-cloud',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </button>
  );
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
      const own = runs.filter((x) => x.workflowId === id);
      return { workflow, versions, runs: own, runCount: own.length };
    },
    [org.id, id],
  );
  const side = useRepoQuery(async (r) => ({ assets: await r.listAssets(org.id), kit: await r.getBrandKit(org.id) }), [org.id]);
  const assets = useMemo(() => side.data?.assets ?? [], [side.data?.assets]);
  const assetUrls = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, assetSrc(a.dataUrl)])), [assets]);
  const kit = side.data?.kit;

  // Undo history (engine/builder): the present is the draft being edited.
  const [hist, setHist] = useState<EditHistory<Snapshot> | null>(null);
  const snap = hist?.present ?? null;
  const past = hist?.past ?? [];
  const future = hist?.future ?? [];
  /** Replaces the draft and starts a fresh history (load, restore, discard). */
  const setSnap = useCallback((s: Snapshot) => setHist(historyOf(s)), []);
  const [saved, setSaved] = useState('');
  /** Adopts the stored draft as the present (keeping undo history) so "saved" compares like with like. */
  const markSaved = useCallback((stored: Snapshot) => {
    setHist((h) => (h ? { ...h, present: stored } : historyOf(stored)));
    setSaved(JSON.stringify(stored));
  }, []);
  const [previewMode, setPreviewMode] = useState(false);
  const [published, setPublished] = useState<{ version: number } | null>(null);
  const lastEdit = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const [sel, setSel] = useState<Selection>({ kind: 'workflow' });
  const [device, setDevice] = useState<Device>('mobile');
  const [pickMode, setPickMode] = useState(true);
  const [mobilePane, setMobilePane] = useState<'structure' | 'canvas' | 'inspector'>('canvas');
  const [library, setLibrary] = useState<{ stepId: string } | null>(null);
  /** The step expanded in the structure list and shown in the preview when nothing in it is selected. */
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [viewVersion, setViewVersion] = useState<WorkflowVersion | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ stepId: string; index: number } | null>(null);
  const [guideHidden] = useState(() => {
    try {
      return localStorage.getItem(`formzelo:ui:studio-guide:${id}`) === '1';
    } catch {
      return false;
    }
  });

  // Load the draft once per workflow; later refetches must not clobber local edits.
  const loadedId = q.data?.workflow.id;
  useEffect(() => {
    if (q.data?.workflow) {
      const s = { config: structuredClone(q.data.workflow.draft), design: structuredClone(q.data.workflow.design) };
      setSnap(s);
      setSaved(JSON.stringify(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const dirty = snap !== null && JSON.stringify(snap) !== saved;
  const issues = useMemo(() => (snap ? schemaIssues(snap.config) : []), [snap]);
  const logic = useMemo(() => (snap ? logicIssues(snap.config) : []), [snap]);
  const logicErrors = logic.filter((i) => i.level === 'error').length;

  /** Applies an edit and records undo history; rapid edits to the same thing (typing) coalesce. */
  const apply = useCallback((fn: (s: Snapshot) => void, key = 'edit') => {
    // Decided outside the state updater so it stays pure (StrictMode runs updaters twice).
    const now = Date.now();
    const coalesce = lastEdit.current.key === key && now - lastEdit.current.at < 700;
    lastEdit.current = { key, at: now };
    setHist((h) => {
      if (!h) return h;
      const next = structuredClone(h.present);
      fn(next);
      return pushHistory(h, next, coalesce);
    });
  }, []);
  const update = useCallback((fn: (d: WorkflowConfig) => void, key = 'cfg') => apply((s) => fn(s.config), key), [apply]);

  const undo = useCallback(() => {
    lastEdit.current = { key: '', at: 0 };
    setHist((h) => h && undoHistory(h));
  }, []);
  const redo = useCallback(() => {
    lastEdit.current = { key: '', at: 0 };
    setHist((h) => h && redoHistory(h));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useUnsavedGuard(dirty);

  const recommendation = useMemo(
    () =>
      themeResolver.resolve({
        templateKey: q.data?.workflow.templateKey,
        title: snap?.config.title,
        description: snap?.config.description,
        prompt: q.data?.workflow.sourcePrompt,
        industry: org.industry,
      }),
    [q.data?.workflow.templateKey, q.data?.workflow.sourcePrompt, snap?.config.title, snap?.config.description, org.industry],
  );
  const previewTheme = useMemo(() => (snap ? effectiveTheme(snap.design, kit) : null), [snap, kit]);

  if (q.loading || (q.data && !snap)) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data || !snap || !previewTheme) {
    return (
      <EmptyState icon={FilePlus2} title="התהליך לא נמצא בסביבת עבודה זו" action={<Link className="text-sm font-medium text-orange-700" to="/app/workflows">חזרה לתהליכים</Link>}>
        ייתכן שהוא שייך לסביבת עבודה אחרת.
      </EmptyState>
    );
  }

  const { workflow, versions, runCount } = q.data;
  const { config, design } = snap;
  const allFields = config.steps.flatMap((s) => s.fields);
  const link = publicFlowUrl(workflow.slug);
  const publishedVersion = versions.find((v) => v.id === workflow.publishedVersionId);
  const share = workflow.status === 'published' ? (
    <SharePanel
      url={link}
      slug={workflow.slug}
      business={org.name}
      title={publishedVersion?.config.title ?? config.title}
      color={publishedVersion?.config.branding.primaryColor ?? config.branding.primaryColor}
      reach={linkReach(workflow, publishedVersion?.version, Object.values(DEMO_SLUGS))}
      caseMode={publishedVersion?.config.mode === 'case'}
      onCopied={() => void repo.trackUsage(org.id, 'link_copied', workflow.id)}
    />
  ) : null;
  const isPublished = workflow.status === 'published';
  const intakeNow = intakeState(workflow.intake, q.data.runs);
  const advice = advise({
    config,
    intake: workflow.intake,
    hasLogo: Boolean(design.logo.assetId || kit?.logoAssetId),
    presenceLinks: design.presence?.visibility === 'hidden' ? 0 : (kit?.links.filter((l) => l.enabled).length ?? 0),
  });
  const intakeBadge = !intakeNow.open ? (
    <Badge tone="amber">סגור</Badge>
  ) : workflow.intake?.maxPerDay ? (
    <span className="text-[10px] opacity-70">
      {intakeNow.counts.today}/{workflow.intake.maxPerDay} היום
    </span>
  ) : hasIntakeRules(workflow.intake) ? (
    <Badge tone="teal">מוגבל</Badge>
  ) : undefined;
  const studioMode = previewMode ? 'preview' : sel.kind === 'design' || sel.kind === 'presence' ? 'design' : sel.kind === 'logic' ? 'logic' : 'content';
  const readiness = publishReadiness(config);
  const ready = canPublish(readiness) && !issues.length;
  const completion = completionOf(config);
  const savedSnap = JSON.parse(saved) as Snapshot;

  const locate = (fieldId: string) => {
    const si = config.steps.findIndex((s) => s.fields.some((f) => f.id === fieldId));
    return si < 0 ? null : { si, fi: config.steps[si]!.fields.findIndex((f) => f.id === fieldId) };
  };
  const selectedField = sel.kind === 'field' ? allFields.find((f) => f.id === sel.fieldId) : undefined;
  const selectedStepId = sel.kind === 'field' ? config.steps[locate(sel.fieldId)?.si ?? -1]?.id : sel.kind === 'step' ? sel.stepId : undefined;
  const focusStepId = selectedStepId ?? (openStepId && config.steps.some((s) => s.id === openStepId) ? openStepId : undefined);
  // One step is open at a time in the structure list, so moving between steps needs no long scroll.
  const expandedStepId = focusStepId ?? config.steps[0]?.id;
  /** Show a step in the preview (from its top) and open it in the structure list. */
  const showStep = (stepId: string, fromStructure = false) => {
    setOpenStepId(stepId);
    // From the canvas switcher the owner stays on the preview (narrow screens included).
    if (fromStructure) select({ kind: 'step', stepId });
    else setSel({ kind: 'step', stepId });
    requestAnimationFrame(() => document.querySelector('[data-fz-canvas] [data-fz-scroll]')?.scrollTo({ top: 0 }));
  };

  const select = (s: Selection) => {
    setSel(s);
    // On narrow screens selecting something opens its properties.
    if (window.matchMedia('(max-width: 1279px)').matches) setMobilePane('inspector');
  };

  const save = async () => {
    if (issues.length) return toast('יש לתקן שגיאות לפני שמירה', 'error');
    setBusy('save');
    try {
      const wf = await repo.saveDraft(org.id, workflow.id, config, design);
      markSaved({ config: wf.draft, design: wf.design });
      toast('הטיוטה נשמרה — תוכן ועיצוב');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (issues.length || !canPublish(publishReadiness(config))) return toast('יש לתקן את הפריטים המסומנים לפני פרסום', 'error');
    setBusy('publish');
    try {
      if (dirty) {
        const wf = await repo.saveDraft(org.id, workflow.id, config, design);
        markSaved({ config: wf.draft, design: wf.design });
      }
      const v = await repo.publishWorkflow(org.id, workflow.id);
      // The success state is shown only now, after the repository confirmed the new version.
      setPublished({ version: v.version });
      setSel({ kind: 'publish' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפרסום נכשל', 'error');
    } finally {
      setBusy(null);
    }
  };

  const addStep = () => {
    const stepId = newId('stp');
    apply((s) => void s.config.steps.push({ id: stepId, title: `שלב ${s.config.steps.length + 1}`, fields: [] }), `step-${stepId}`);
    setSel({ kind: 'step', stepId });
    toast('נוסף שלב חדש — הוסיפו לו שדות');
  };

  const addBlock = (stepId: string, def: BlockDef) => {
    const blocks = createBlocks(def, allFields.map((f) => f.key));
    if (!blocks.length) return;
    apply((s) => {
      const step = s.config.steps.find((x) => x.id === stepId)!;
      const after = sel.kind === 'field' ? step.fields.findIndex((f) => f.id === sel.fieldId) : -1;
      step.fields.splice(after >= 0 ? after + 1 : step.fields.length, 0, ...blocks);
    }, `add-${blocks[0]!.id}`);
    setLibrary(null);
    // A new block is opened for editing at once (on a phone this switches to its properties).
    select({ kind: 'field', fieldId: blocks[0]!.id });
    toast(blocks.length > 1 ? `נוספו ${blocks.length} שדות: ${def.label}` : `נוסף: ${def.label}`, 'success', { label: 'ביטול', onClick: undo });
  };

  const libraryAction = (action: BlockAction) => {
    setLibrary(null);
    if (action === 'step') return addStep();
    setPreviewMode(false);
    select({ kind: action });
  };

  const changeField = (f: WorkflowField) =>
    apply((s) => {
      for (const st of s.config.steps) {
        const i = st.fields.findIndex((x) => x.id === f.id);
        if (i >= 0) st.fields[i] = f;
      }
    }, `field-${f.id}`);

  const deleteField = (f: WorkflowField) => {
    const dependents = allFields.filter((x) => x.condition?.fieldKey === f.key || x.multiplyByKey === f.key);
    const usedByBooking = config.booking?.enabled && [config.booking.dateKey, config.booking.timeKey, config.booking.guestsKey].includes(f.key);
    const msg = usedByBooking
      ? `"${f.label}" משמש את כללי ההזמנה. למחוק בכל זאת? (כללי ההזמנה ייכבו)`
      : dependents.length
        ? `"${f.label}" משמש בתנאים או בחישוב של: ${dependents.map((d) => d.label).join(', ')}. למחוק בכל זאת?`
        : `למחוק את "${f.label}"?`;
    // Rules depend on this field: ask first. Otherwise delete at once — the toast offers undo.
    if ((usedByBooking || dependents.length) && !window.confirm(msg)) return;
    const pos = locate(f.id);
    const stepId = pos ? config.steps[pos.si]!.id : undefined;
    apply((s) => {
      s.config.steps.forEach((st) => (st.fields = st.fields.filter((x) => x.id !== f.id)));
      if (usedByBooking && s.config.booking) s.config.booking.enabled = false;
    }, `del-${f.id}`);
    setSel(stepId ? { kind: 'step', stepId } : { kind: 'workflow' });
    toast(`״${f.label}״ נמחק`, 'info', { label: 'ביטול', onClick: undo });
  };

  /** Drag-and-drop: place a block at an index of any step. */
  const moveFieldTo = (fieldId: string, stepId: string, index: number) => {
    const pos = locate(fieldId);
    if (!pos) return;
    apply((s) => {
      const from = s.config.steps[pos.si]!;
      const to = s.config.steps.find((x) => x.id === stepId);
      if (!to) return;
      const [f] = from.fields.splice(pos.fi, 1);
      const at = from === to && index > pos.fi ? index - 1 : index;
      to.fields.splice(Math.max(0, Math.min(at, to.fields.length)), 0, f!);
    }, `drag-${fieldId}-${Date.now()}`);
  };

  const moveField = (fieldId: string, dir: -1 | 1) => {
    const pos = locate(fieldId);
    if (!pos) return;
    apply((s) => {
      const steps = s.config.steps;
      const st = steps[pos.si]!;
      const target = pos.fi + dir;
      if (target >= 0 && target < st.fields.length) st.fields = move(st.fields, pos.fi, dir);
      else {
        // Moving past the edge moves the block into the neighbouring step.
        const ns = steps[pos.si + dir];
        if (!ns) return;
        const [f] = st.fields.splice(pos.fi, 1);
        if (dir === 1) ns.fields.unshift(f!);
        else ns.fields.push(f!);
      }
    }, `move-${fieldId}-${Date.now()}`);
  };

  // ---------- panes ----------

  const structure = (
    <nav aria-label="מבנה התהליך" className="space-y-4">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-ink-soft">
          <Layers className="h-3.5 w-3.5" aria-hidden /> שלבים ורכיבים
        </p>
        <p className="px-2.5 text-[11px] text-ink-soft">גררו רכיב כדי לשנות סדר, גם בין שלבים. במקלדת: חיצי ההעלאה וההורדה.</p>
        {config.steps.map((st, si) => (
          <div
            key={st.id}
            className={cx('rounded-xl border bg-white transition', dropAt?.stepId === st.id ? 'border-orange ring-2 ring-orange/20' : 'border-cloud-200')}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (dropAt?.stepId !== st.id) setDropAt({ stepId: st.id, index: st.fields.length });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dropAt) moveFieldTo(dragId, dropAt.stepId, dropAt.index);
              setDragId(null);
              setDropAt(null);
            }}
          >
            <button
              type="button"
              onClick={() => showStep(st.id, true)}
              aria-current={(sel.kind === 'step' && sel.stepId === st.id) || undefined}
              aria-expanded={st.id === expandedStepId || Boolean(dragId)}
              className={cx('flex w-full items-center gap-2 px-2.5 py-2 text-start text-sm font-semibold', st.id === expandedStepId || dragId ? 'rounded-t-xl' : 'rounded-xl', sel.kind === 'step' && sel.stepId === st.id ? 'bg-midnight text-white' : 'hover:bg-cloud')}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cloud-200 text-[11px] text-ink">{si + 1}</span>
              <span className="min-w-0 flex-1 truncate">{st.title || 'שלב ללא שם'}</span>
              {st.condition && <Badge tone="blue">מותנה</Badge>}
              {st.id !== expandedStepId && !dragId && <span className="shrink-0 text-[11px] font-normal text-ink-soft">{st.fields.length} רכיבים</span>}
            </button>
            {(st.id === expandedStepId || Boolean(dragId)) && (
            <>
            <ul className="space-y-0.5 p-1.5">
              {st.fields.map((f, fi) => {
                const Icon = blockIcon(f);
                const active = sel.kind === 'field' && sel.fieldId === f.id;
                const dropHere = dropAt?.stepId === st.id && dropAt.index === fi && dragId !== f.id;
                return (
                  <li
                    key={f.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(f.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', f.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropAt(null);
                    }}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const index = e.clientY > r.top + r.height / 2 ? fi + 1 : fi;
                      if (dropAt?.stepId !== st.id || dropAt.index !== index) setDropAt({ stepId: st.id, index });
                    }}
                    className={cx(
                      'group relative flex items-center gap-1 rounded-lg',
                      active ? 'bg-orange-50 ring-1 ring-orange/40' : 'hover:bg-cloud',
                      dragId === f.id && 'opacity-40',
                      dropHere && 'before:absolute before:inset-x-1 before:-top-[3px] before:h-[3px] before:rounded-full before:bg-orange',
                      dropAt?.stepId === st.id && dropAt.index === fi + 1 && fi === st.fields.length - 1 && dragId !== f.id && 'after:absolute after:inset-x-1 after:-bottom-[3px] after:h-[3px] after:rounded-full after:bg-orange',
                    )}
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-soft/60 group-hover:text-ink-soft" aria-hidden />
                    <button type="button" onClick={() => select({ kind: 'field', fieldId: f.id })} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                      <Icon className={cx('h-3.5 w-3.5 shrink-0', isDisplayField(f) ? 'text-teal-600' : 'text-ink-soft')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{f.label}</span>
                        <span className="block truncate text-[10.5px] text-ink-soft">
                          {FIELD_TYPE_LABELS[f.type]}
                          {f.required && <span className="text-orange-700"> · חובה</span>}
                          {fieldHasPrice(f) && <span className="text-teal-600"> · ₪</span>}
                          {f.condition && <span className="text-sky-700"> · מותנה</span>}
                        </span>
                      </span>
                    </button>
                    <span className="flex opacity-60 group-hover:opacity-100">
                      <button type="button" aria-label={`העלאת ${f.label}`} disabled={si === 0 && fi === 0} onClick={() => moveField(f.id, -1)} className="rounded p-1 hover:bg-white disabled:opacity-30">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button type="button" aria-label={`הורדת ${f.label}`} disabled={si === config.steps.length - 1 && fi === st.fields.length - 1} onClick={() => moveField(f.id, 1)} className="rounded p-1 hover:bg-white disabled:opacity-30">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </span>
                  </li>
                );
              })}
              {st.fields.length === 0 && (
                <li>
                  <button type="button" onClick={() => setLibrary({ stepId: st.id })} className="w-full rounded-lg border border-dashed border-cloud-300 px-2 py-3 text-center text-xs text-ink-muted hover:border-orange hover:text-ink">
                    שלב ריק — לחצו להוספת השדה הראשון
                  </button>
                </li>
              )}
            </ul>
            <div className="border-t border-cloud-200 p-1.5">
              <Button size="sm" variant="ghost" icon={Plus} className="w-full !justify-start" onClick={() => setLibrary({ stepId: st.id })}>
                הוספת שדה
              </Button>
            </div>
            </>
            )}
          </div>
        ))}
        <Button variant="secondary" icon={Plus} className="w-full" onClick={addStep}>
          שלב חדש
        </Button>
      </div>

      <div className="space-y-1">
        <p className="px-2.5 text-[11px] font-semibold tracking-wide text-ink-soft">הגדרות התהליך</p>
        <NavItem active={sel.kind === 'workflow'} icon={Settings2} onClick={() => select({ kind: 'workflow' })}>
          פרטי התהליך
        </NavItem>
        <NavItem active={sel.kind === 'intake'} icon={Gauge} onClick={() => select({ kind: 'intake' })} badge={intakeBadge}>
          קבלת בקשות
        </NavItem>
        <NavItem active={sel.kind === 'booking'} icon={CalendarClock} onClick={() => select({ kind: 'booking' })} badge={config.booking?.enabled ? <Badge tone="teal">פעיל</Badge> : undefined}>
          הזמנות ושעות
        </NavItem>
        <NavItem active={sel.kind === 'completion'} icon={CreditCard} onClick={() => select({ kind: 'completion' })} badge={<span className="text-[10px] opacity-70">{COMPLETION_LABELS[completion.mode].title}</span>}>
          סיום ותשלום
        </NavItem>
        <NavItem
          active={sel.kind === 'presence'}
          icon={Share2}
          onClick={() => select({ kind: 'presence' })}
          badge={design.presence?.visibility === 'hidden' ? <span className="text-[10px] opacity-70">מוסתר</span> : kit?.links.some((l) => l.enabled) ? <Badge tone="teal">קישורים</Badge> : undefined}
        >
          נוכחות דיגיטלית
        </NavItem>
        <NavItem active={sel.kind === 'publish'} icon={History} onClick={() => select({ kind: 'publish' })} badge={<span className="text-[10px] opacity-70">{versions.length} גרסאות</span>}>
          גרסאות ושיתוף
        </NavItem>
      </div>
    </nav>
  );

  const stepIndex = sel.kind === 'step' ? config.steps.findIndex((s) => s.id === sel.stepId) : -1;
  const inspector = (() => {
    switch (sel.kind) {
      case 'field':
        return selectedField ? (
          <FieldInspector
            f={selectedField}
            allFields={allFields}
            earlier={earlierAnswerFields(config, { fieldId: selectedField.id })}
            priced={config.pricing.enabled}
            images={assets.filter((a) => a.kind === 'image')}
            orgId={org.id}
            onChange={changeField}
            onDelete={() => deleteField(selectedField)}
            onDuplicate={() => {
              const pos = locate(selectedField.id)!;
              const copy = duplicateField(selectedField, allFields.map((f) => f.key));
              apply((s) => void s.config.steps[pos.si]!.fields.splice(pos.fi + 1, 0, copy), `dup-${copy.id}`);
              setSel({ kind: 'field', fieldId: copy.id });
              toast('נוצר עותק מתחת לשדה המקורי', 'success', { label: 'ביטול', onClick: undo });
            }}
          />
        ) : (
          <p className="text-sm text-ink-muted">הרכיב נמחק.</p>
        );
      case 'step':
        return stepIndex >= 0 ? (
          <StepInspector
            step={config.steps[stepIndex]!}
            index={stepIndex}
            count={config.steps.length}
            earlier={earlierAnswerFields(config, { stepId: config.steps[stepIndex]!.id })}
            onChange={(st) => update((d) => void (d.steps[stepIndex] = st), `step-${st.id}`)}
            onMove={(dir) => update((d) => void (d.steps = move(d.steps, stepIndex, dir)), `stepmove-${Date.now()}`)}
            onDelete={() => {
              const st = config.steps[stepIndex]!;
              if (!window.confirm(`למחוק את השלב "${st.title}" וכל ${st.fields.length} הרכיבים בו?`)) return;
              update((d) => void d.steps.splice(stepIndex, 1), `stepdel-${st.id}`);
              setSel({ kind: 'workflow' });
            }}
          />
        ) : null;
      case 'logic':
        return <LogicPanel config={config} onField={(fieldId) => select({ kind: 'field', fieldId })} onStep={(stepId) => select({ kind: 'step', stepId })} onOpen={(kind) => select({ kind })} />;
      case 'presence':
        return (
          <PresenceInspector
            settings={design.presence}
            kitLinks={kit?.links ?? []}
            booking={Boolean(config.booking?.enabled)}
            onChange={(presence) => apply((s) => void (s.design.presence = presence), 'presence')}
          />
        );
      case 'design':
        return (
          <div className="space-y-4">
            <Card className="p-4">
              <Toggle checked={design.inheritBrand === true} onChange={(v) => apply((s) => void (s.design.inheritBrand = v), 'inherit')}>
                <span className="font-medium">ירושה מערכת המותג</span>
                <span className="block text-xs text-ink-muted">
                  צבעים, גופן, כפתורים, צפיפות, לוגו ותמונת כיסוי מגיעים מ
                  <Link className="text-orange-700 underline" to="/app/brand">
                    ערכת המותג
                  </Link>
                  . כבוי = עיצוב עצמאי לתהליך הזה.
                </span>
              </Toggle>
              {design.inheritBrand && <p className="mt-2 rounded-lg bg-cloud p-2 text-xs text-ink-muted">בזמן ירושה, ערכי צבע/גופן/כפתור/צפיפות למטה נדרסים ע״י ערכת המותג. הפריסה, הפתיח והרכיבים נשלטים מכאן.</p>}
            </Card>
            <DesignPanel
              design={design}
              onChange={(d) => apply((s) => void (s.design = d), 'design')}
              recommendation={recommendation}
              orgId={org.id}
              orgBrandColor={kit?.palette.primary ?? org.brand.primaryColor}
              assets={assets}
              assetUrls={assetUrls}
              canUndo={past.length > 0}
              onUndo={undo}
              designDirty={JSON.stringify(design) !== JSON.stringify(savedSnap.design)}
              onRevert={() => apply((s) => void (s.design = structuredClone(savedSnap.design)), 'design-revert')}
            />
          </div>
        );
      case 'completion':
        return <CompletionInspector config={config} update={(fn) => update(fn, 'completion')} />;
      case 'intake':
        return <IntakePanel orgId={org.id} workflow={workflow} runs={q.data.runs} published={isPublished} />;
      case 'booking':
        return <BookingInspector config={config} update={(fn) => update(fn, 'booking')} />;
      case 'publish':
        return (
          <Panel title="גרסאות ושיתוף">
            {isPublished ? (
              <div className="space-y-3">
                {share}
                {publishedVersion?.config.mode === 'case' && (
                  <Button icon={FilePlus2} onClick={() => setCaseOpen(true)}>
                    פתיחת תיק ללקוח
                  </Button>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-cloud p-4 text-sm text-ink-muted">{workflow.status === 'archived' ? 'התהליך בארכיון. שחזרו אותו מרשימת התהליכים.' : 'הקישור נוצר ברגע הפרסום הראשון.'}</p>
            )}
            <div>
              <p className="mb-2 text-sm font-medium">גרסאות שפורסמו</p>
              <p className="mb-2 text-xs text-ink-muted">כל פרסום יוצר תמונת מצב קבועה של התוכן והעיצוב (כולל ערכת המותג באותו רגע). בקשות נשארות מקושרות לגרסה שבה נשלחו.</p>
              {versions.length === 0 ? (
                <p className="rounded-xl bg-cloud p-3 text-center text-sm text-ink-muted">עוד לא פורסמה גרסה.</p>
              ) : (
                <ol className="space-y-2">
                  {versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-cloud-200 p-3">
                      <span className="font-semibold">גרסה {v.version}</span>
                      {v.id === workflow.publishedVersionId && <Badge tone="teal">פעילה</Badge>}
                      <Badge tone="neutral">{PRESETS[v.design.presetId].meta.nameHe}</Badge>
                      <span className="text-xs text-ink-muted">{formatDateTime(v.publishedAt)}</span>
                      <div className="ms-auto flex gap-1">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewVersion(v)}>
                          צפייה
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={RotateCcw}
                          onClick={async () => {
                            if (dirty && !window.confirm('השינויים שלא נשמרו יוחלפו בגרסה זו. להמשיך?')) return;
                            const wf = await repo.restoreVersionToDraft(org.id, workflow.id, v.id);
                            const s = { config: structuredClone(wf.draft), design: structuredClone(wf.design) };
                            setSnap(s);
                            setSaved(JSON.stringify(s));
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
            </div>
          </Panel>
        );
      default:
        return (
          <Panel title="פרטי התהליך">
            <div>
              <FieldLabel htmlFor="wf-title" required>
                כותרת
              </FieldLabel>
              <Input id="wf-title" value={config.title} invalid={!config.title.trim()} onChange={(e) => update((d) => void (d.title = e.target.value), 'title')} />
            </div>
            <div>
              <FieldLabel htmlFor="wf-desc">תיאור ללקוח</FieldLabel>
              <Textarea id="wf-desc" rows={2} value={config.description} onChange={(e) => update((d) => void (d.description = e.target.value), 'desc')} />
            </div>
            <div>
              <FieldLabel htmlFor="wf-logo">שם העסק בטופס</FieldLabel>
              <Input id="wf-logo" maxLength={40} value={config.branding.logoText} onChange={(e) => update((d) => void (d.branding.logoText = e.target.value), 'logo')} />
            </div>
            <div>
              <FieldLabel htmlFor="wf-mode">אופן פתיחה</FieldLabel>
              <Select id="wf-mode" value={config.mode} onChange={(e) => update((d) => void (d.mode = e.target.value as WorkflowConfig['mode']))}>
                <option value="public">קישור ציבורי — כל אחד יכול להתחיל</option>
                <option value="case">תיק אישי — העסק פותח ושולח קישור</option>
              </Select>
            </div>
            {config.mode === 'case' && (
              <div>
                <p className="mb-2 text-sm font-medium">שדות התיק (העסק ממלא, הלקוח רואה)</p>
                <FieldListEditor fields={config.caseFields} allFields={config.caseFields} priced={false} onChange={(fields) => update((d) => void (d.caseFields = fields), 'case')} />
              </div>
            )}
            <div>
              <FieldLabel htmlFor="wf-disc">אזהרה / הבהרה (אופציונלי)</FieldLabel>
              <Textarea id="wf-disc" rows={2} value={config.disclaimer ?? ''} onChange={(e) => update((d) => void (d.disclaimer = e.target.value || undefined), 'disc')} />
            </div>
            <div className="space-y-3 border-t border-cloud-200 pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={config.consent.required} onChange={(e) => update((d) => void (d.consent.required = e.target.checked))} />
                נדרש אישור מפורש לפני שליחה
              </label>
              <div>
                <FieldLabel htmlFor="wf-consent">נוסח האישור</FieldLabel>
                <Textarea id="wf-consent" rows={2} value={config.consent.text} onChange={(e) => update((d) => void (d.consent.text = e.target.value), 'consent')} />
              </div>
            </div>
            <div className="space-y-3 border-t border-cloud-200 pt-4">
              <div>
                <FieldLabel htmlFor="wf-ctitle">כותרת מסך הסיום</FieldLabel>
                <Input id="wf-ctitle" maxLength={80} placeholder="נשלח בהצלחה" value={config.confirmation?.title ?? ''} onChange={(e) => update((d) => void (d.confirmation = { ...d.confirmation, title: e.target.value || undefined }), 'ctitle')} />
              </div>
              <div>
                <FieldLabel htmlFor="wf-success">הודעת הצלחה</FieldLabel>
                <Input id="wf-success" value={config.successMessage} onChange={(e) => update((d) => void (d.successMessage = e.target.value), 'success')} />
              </div>
              <NextStepsEditor steps={config.confirmation?.nextSteps ?? []} onChange={(nextSteps) => update((d) => void (d.confirmation = { ...d.confirmation, nextSteps: nextSteps.length ? nextSteps : undefined }), 'next')} />
            </div>
          </Panel>
        );
    }
  })();

  const canvas = (
    <div data-fz-canvas>
      <div className="mb-2 flex items-center justify-between gap-2">
        <DeviceToggle device={device} onChange={setDevice} tablet />
        <div className="flex items-center gap-1.5">
          {!previewMode && <button
            type="button"
            aria-pressed={pickMode}
            onClick={() => setPickMode((m) => !m)}
            className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', pickMode ? 'bg-midnight text-white' : 'bg-cloud-200 text-ink-muted')}
            title="במצב בחירה, לחיצה על רכיב בתצוגה פותחת את המאפיינים שלו"
          >
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden /> {pickMode ? 'מצב בחירה' : 'מצב מילוי'}
          </button>}
          <button type="button" aria-label="איפוס תצוגה" title="איפוס תצוגה" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-muted hover:text-orange-700" onClick={() => setPreviewKey((k) => k + 1)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">איפוס תצוגה</span>
          </button>
        </div>
      </div>
      {!previewMode && config.steps.length > 1 && (
        <div className="mb-2 flex items-center gap-1.5" role="group" aria-label="מעבר בין שלבים בתצוגה">
          <button
            type="button"
            aria-label="השלב הקודם"
            disabled={config.steps.findIndex((s) => s.id === expandedStepId) <= 0}
            onClick={() => showStep(config.steps[config.steps.findIndex((s) => s.id === expandedStepId) - 1]!.id)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cloud-200 text-ink-muted hover:text-ink disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {config.steps.map((st, si) => (
              <button
                key={st.id}
                type="button"
                aria-pressed={st.id === expandedStepId}
                onClick={() => showStep(st.id)}
                className={cx('inline-flex h-8 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition', st.id === expandedStepId ? 'bg-midnight text-white' : 'bg-white text-ink-muted ring-1 ring-cloud-300 hover:text-ink')}
              >
                <span className="tabular-nums opacity-70">{si + 1}</span>
                <span className="truncate">{st.title || 'שלב ללא שם'}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="השלב הבא"
            disabled={config.steps.findIndex((s) => s.id === expandedStepId) >= config.steps.length - 1}
            onClick={() => showStep(config.steps[config.steps.findIndex((s) => s.id === expandedStepId) + 1]!.id)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cloud-200 text-ink-muted hover:text-ink disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {previewMode && (
        <p className="mb-2 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900" role="note">
          מצב בדיקה: מלאו כמו לקוח — מעבר בין שלבים, שגיאות, תנאים וחישוב מחיר עובדים כמו בקישור הציבורי. שליחה כאן לא נשמרת כבקשה.
        </p>
      )}
      {issues.length ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">התצוגה תחזור אחרי תיקון השגיאות.</p>
      ) : (
        <DevicePreview device={device} height={previewMode ? 820 : device === 'desktop' ? 600 : 760}>
          <WorkflowRenderer
            key={`${previewKey}-${device}`}
            config={config}
            theme={previewTheme}
            assets={assetUrls}
            mode="preview"
            embedded
            scrollFrame
            focusStepId={focusStepId}
            selectedFieldId={sel.kind === 'field' ? sel.fieldId : undefined}
            onSelectField={pickMode && !previewMode ? (fieldId) => select({ kind: 'field', fieldId }) : undefined}
          />
        </DevicePreview>
      )}
    </div>
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0">
          <Link to="/app/workflows" className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-orange-700">
            <ArrowRight className="h-3.5 w-3.5" aria-hidden /> תהליכים
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{config.title || 'ללא שם'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <Badge tone={isPublished ? 'teal' : workflow.status === 'archived' ? 'neutral' : 'amber'}>
              {isPublished ? `פורסם · גרסה ${versions.find((v) => v.id === workflow.publishedVersionId)?.version ?? versions[0]?.version ?? 1}` : workflow.status === 'archived' ? 'בארכיון' : 'טיוטה'}
            </Badge>
            {(dirty || (workflow.hasUnpublishedChanges && isPublished)) && <Badge tone="amber">{dirty ? 'שינויים שלא נשמרו' : 'טיוטה שלא פורסמה'}</Badge>}
            {!dirty && (
              <span className="inline-flex items-center gap-1 text-teal-600">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> הכול שמור
              </span>
            )}
            {workflow.isDemo && <DemoBadge />}
            <span>{formatNumber(runCount)} בקשות</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-cloud-300 bg-white">
            <Button variant="ghost" aria-label="ביטול פעולה (Ctrl+Z)" title="ביטול פעולה (Ctrl+Z)" disabled={!past.length} onClick={undo}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" aria-label="ביצוע מחדש (Ctrl+Shift+Z)" title="ביצוע מחדש (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            icon={RotateCcw}
            aria-label="ביטול שינויים"
            disabled={!dirty}
            onClick={() => {
              if (!window.confirm('לבטל את כל השינויים שלא נשמרו (תוכן ועיצוב)?')) return;
              setSnap(structuredClone(savedSnap));
            }}
          >
            <span className="hidden sm:inline">ביטול שינויים</span>
          </Button>
          <Button variant="secondary" icon={Save} onClick={save} loading={busy === 'save'} disabled={!dirty}>
            שמירת טיוטה
          </Button>
          <Button
            icon={Rocket}
            onClick={() => {
              setPublished(null);
              setConfirmPublish(true);
            }}
            loading={busy === 'publish'}
            disabled={workflow.status === 'archived' || Boolean(issues.length)}
          >
            {isPublished ? 'פרסום גרסה חדשה' : 'פרסום'}
          </Button>
          <Button
            variant="ghost"
            icon={Copy}
            aria-label="שכפול"
            onClick={async () => {
              const copy = await repo.duplicateWorkflow(org.id, workflow.id);
              toast('נוצר עותק כטיוטה');
              navigate(`/app/workflows/${copy.id}`);
            }}
          >
            <span className="hidden sm:inline">שכפול</span>
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">לא ניתן לשמור עד שיתוקנו:</p>
          <ul className="mt-1 list-inside list-disc">
            {[...new Set(issues)].map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <StudioCoach
        workflowId={workflow.id}
        steps={
          workflow.isDemo || guideHidden
            ? undefined
            : [
                ['נוצר תהליך', true, undefined],
                ['לוגו וצבעים', Boolean(kit?.logoAssetId) || (kit ? kit.updatedAt > workflow.createdAt : false), () => navigate('/app/brand')],
                ['סגנון עיצוב', design.source === 'manual', () => select({ kind: 'design' })],
                ['עריכת שלבים ושדות', past.length > 0 || workflow.updatedAt > workflow.createdAt, () => select({ kind: 'step', stepId: config.steps[0]!.id })],
                ['תצוגה בטלפון ובמחשב', device !== 'mobile', () => setDevice('desktop')],
                ['פרסום וקישור', isPublished, () => setConfirmPublish(true)],
              ]
        }
        notes={config.draftNotes}
        onClearNotes={() => update((d) => void (d.draftNotes = undefined), 'notes')}
        advice={advice}
        onFix={(a) => {
          if (a.fix.kind === 'apply') {
            update(a.fix.apply, `advice-${a.id}`);
            toast(`בוצע: ${a.title}`, 'success', { label: 'ביטול', onClick: undo });
          } else if (a.fix.target === 'brand') navigate('/app/brand');
          else {
            setPreviewMode(false);
            select({ kind: a.fix.target });
          }
        }}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full gap-1 overflow-x-auto rounded-xl border border-cloud-200 bg-white p-1 sm:w-auto" role="group" aria-label="מצב עבודה">
          {(
            [
              ['content', 'תוכן', Layers, () => { setPreviewMode(false); if (studioMode !== 'content') select({ kind: 'workflow' }); }],
              ['design', 'עיצוב', Palette, () => { setPreviewMode(false); select({ kind: 'design' }); }],
              ['logic', 'לוגיקה', GitBranch, () => { setPreviewMode(false); select({ kind: 'logic' }); }],
              ['preview', 'בדיקה', Play, () => { setPreviewMode(true); setMobilePane('canvas'); setPreviewKey((k) => k + 1); }],
            ] as const
          ).map(([k, label, Icon, go]) => (
            <button
              key={k}
              type="button"
              aria-pressed={studioMode === k}
              onClick={go}
              className={cx('inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', studioMode === k ? 'bg-midnight text-white' : 'text-ink-muted hover:bg-cloud hover:text-ink')}
            >
              <Icon className="h-4 w-4" aria-hidden />{' '}
              {k === 'preview' ? (
                <>
                  <span className="sm:hidden">{label}</span>
                  <span className="hidden sm:inline">תצוגה ובדיקה</span>
                </>
              ) : (
                label
              )}
              {k === 'logic' && logicErrors > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{logicErrors}</span>}
            </button>
          ))}
        </div>
        {previewMode ? (
          <Button size="sm" variant="secondary" icon={PenLine} onClick={() => setPreviewMode(false)}>
            חזרה לעריכה
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setLibrary({ stepId: focusStepId ?? config.steps[0]!.id })}>
            הוספת שדה
          </Button>
        )}
      </div>

      <div className={cx('mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-card xl:hidden', previewMode && 'hidden')} role="tablist" aria-label="חלוניות הסטודיו">
        {(
          [
            ['structure', 'שלבים', Layers],
            ['canvas', 'תצוגה', Eye],
            ['inspector', 'עריכה', PenLine],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mobilePane === k}
            onClick={() => setMobilePane(k)}
            className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium', mobilePane === k ? 'bg-midnight text-white' : 'text-ink-muted')}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {previewMode ? (
        <section aria-label="תצוגה ובדיקה" className="mx-auto max-w-5xl">
          {canvas}
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_360px] 2xl:grid-cols-[270px_minmax(0,1fr)_400px]">
          <aside className={cx('xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto xl:pe-1', mobilePane !== 'structure' && 'hidden xl:block')}>{structure}</aside>
          <section aria-label="תצוגה חיה" className={cx('min-w-0 xl:sticky xl:top-4 xl:self-start', mobilePane !== 'canvas' && 'hidden xl:block')}>
            {canvas}
          </section>
          <aside aria-label="מאפיינים" className={cx('min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto', mobilePane !== 'inspector' && 'hidden xl:block')}>
            <Card key={sel.kind === 'field' ? sel.fieldId : sel.kind === 'step' ? sel.stepId : sel.kind} className="animate-fade-up p-4">
              {inspector}
            </Card>
          </aside>
        </div>
      )}

      <FieldLibrary
        open={Boolean(library)}
        onClose={() => setLibrary(null)}
        stepTitle={config.steps.find((x) => x.id === library?.stepId)?.title}
        onAdd={(def) => library && addBlock(library.stepId, def)}
        onAction={libraryAction}
        theme={previewTheme}
        config={config}
        assets={assetUrls}
      />

      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={published ? 'התהליך פורסם בהצלחה' : `פרסום גרסה ${versions.length + 1}`}
        footer={
          published ? (
            <Button variant="secondary" onClick={() => setConfirmPublish(false)}>
              חזרה לעורך
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setConfirmPublish(false)}>
                ביטול
              </Button>
              <Button icon={Rocket} onClick={publish} loading={busy === 'publish'} disabled={!ready}>
                {dirty ? 'שמירה ופרסום' : 'פרסום'}
              </Button>
            </>
          )
        }
      >
        {published ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-teal-50 p-4" role="status">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-teal-600" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-ink">{config.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  פורסם · גרסה {published.version} · {formatDateTime(publishedVersion?.publishedAt ?? new Date().toISOString())}
                </p>
                <p className="mt-1 text-xs text-ink-muted">הגרסה נשמרה כתמונת מצב קבועה. שינויים בסטודיו לא ישפיעו על הלקוחות עד הפרסום הבא.</p>
              </div>
            </div>
            {share}
            <p className="text-sm text-ink-muted">
              כל בקשה שנשלחת מופיעה ב
              <Link className="font-medium text-orange-700 underline" to="/app/requests">
                תיבת הבקשות
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-1.5" aria-label="בדיקת מוכנות">
              {readiness.map((r) => (
                <li key={r.id} className={cx('flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm', r.ok ? 'text-ink' : r.level === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> : r.level === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                  <span>
                    {r.label}
                    <span className="sr-only">{r.ok ? ' — תקין' : r.level === 'error' ? ' — חובה לתקן' : ' — מומלץ'}</span>
                    {!r.ok && r.hint && <span className="block text-xs opacity-90">{r.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-muted">
              {dirty ? 'השינויים יישמרו ו' : ''}תיווצר תמונת מצב קבועה של התהליך והעיצוב ({PRESETS[design.presetId].meta.nameHe}
              {design.inheritBrand ? ' + ערכת המותג הנוכחית' : ''}). סיום: {COMPLETION_LABELS[completion.mode].title}. בקשות קיימות ({formatNumber(runCount)}) נשארות מקושרות לגרסה שבה נשלחו.
            </p>
            {!ready && <p className="text-xs font-medium text-red-700">תקנו את הפריטים המסומנים באדום כדי לפרסם. אפשר לשמור טיוטה בכל שלב.</p>}
          </div>
        )}
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
