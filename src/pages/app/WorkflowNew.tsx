/**
 * "מה נרצה ליצור היום?" — the creation journey: choose how to start
 * (describe / template / blank / duplicate), choose the experience (design
 * personality), then continue in the studio to customize, test and publish.
 */
import { AlertTriangle, ArrowLeft, Copy, FilePlus2, LayoutTemplate, MessageSquareText, RotateCcw, Square, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { LocalGenerationNotice } from '../../components/Brand';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, FieldLabel, PageHeader, Textarea } from '../../components/ui';
import type { WorkflowConfig } from '../../domain/schema';
import type { ThemePresetId, WorkflowTheme } from '../../domain/theme';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { blankWorkflow, START_OPTIONS, type StartOption } from '../../engine/builder';
import { COMPLETION_LABELS } from '../../engine/completion';
import { generateWorkflowFromPrompt, PROMPT_EXAMPLES, type GenerationResult } from '../../engine/generator';
import { TEMPLATES, type TemplateKey } from '../../engine/templates';
import { formatRelative } from '../../lib/format';
import { WorkflowRenderer } from '../../renderer/WorkflowRenderer';
import { buildTheme, PRESET_LIST, PRESETS } from '../../theme/presets';
import { PresetPreview } from '../../theme/PresetPreview';
import { EXPERIENCES } from '../../theme/experiences';

const CONFIDENCE = { high: { label: 'התאמה גבוהה', tone: 'teal' }, medium: { label: 'התאמה חלקית', tone: 'amber' }, low: { label: 'לא זוהה תחום', tone: 'neutral' } } as const;
const START_ICONS: Record<StartOption, typeof Wand2> = { describe: MessageSquareText, template: LayoutTemplate, blank: Square, duplicate: Copy };

const JOURNEY = ['מה יוצרים', 'בוחרים חוויה', 'מתאימים', 'בודקים', 'מפרסמים'];

interface Draft {
  config: WorkflowConfig;
  theme: WorkflowTheme;
  templateKey: string;
  recommended: ThemePresetId;
  prompt?: string;
  generation?: GenerationResult;
  label: string;
}

interface FormValues {
  prompt: string;
}

export function WorkflowNew() {
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const initialPrompt = (location.state as { prompt?: string } | null)?.prompt ?? '';
  const [start, setStart] = useState<StartOption>('describe');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoRan = useRef(false);
  const side = useRepoQuery(async (r) => ({ kit: await r.getBrandKit(org.id), workflows: await r.listWorkflows(org.id) }), [org.id]);
  const brandColor = side.data?.kit.palette.primary ?? org.brand.primaryColor;

  const { register, handleSubmit, setValue, formState } = useForm<FormValues>({ defaultValues: { prompt: initialPrompt } });

  const fromGeneration = (r: GenerationResult, prompt: string): Draft => {
    r.config.branding = { ...r.config.branding, primaryColor: org.brand.primaryColor, logoText: org.name };
    return { config: r.config, theme: r.theme, templateKey: r.templateKey, recommended: r.themeRecommendation.presetId, prompt, generation: r, label: r.templateLabel };
  };

  const generate = ({ prompt }: FormValues) => {
    setGenerating(true);
    // Short pause so the change is perceptible; generation itself is synchronous and local.
    setTimeout(() => {
      setDraft(fromGeneration(generateWorkflowFromPrompt(prompt), prompt));
      setGenerating(false);
    }, 350);
  };

  const fromTemplate = (k: TemplateKey) => {
    const t = TEMPLATES[k];
    setDraft(fromGeneration(generateWorkflowFromPrompt(`${t.label}: ${t.description}`, k), `${t.label}: ${t.description}`));
  };

  const blank = () => {
    const personality = side.data?.kit.personality ?? 'modern_minimal';
    setDraft({ config: blankWorkflow(org.name, brandColor), theme: buildTheme(personality, { source: 'manual' }), templateKey: 'blank', recommended: personality, label: 'תהליך ריק' });
  };

  useEffect(() => {
    if (initialPrompt && !autoRan.current) {
      autoRan.current = true;
      generate({ prompt: initialPrompt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const wf = await repo.createWorkflow(org.id, { config: draft.config, templateKey: draft.templateKey, sourcePrompt: draft.prompt, design: draft.theme });
      toast('הטיוטה נוצרה — ממשיכים בסטודיו');
      navigate(`/app/workflows/${wf.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
      setSaving(false);
    }
  };

  const duplicate = async (workflowId: string) => {
    try {
      const copy = await repo.duplicateWorkflow(org.id, workflowId);
      toast('נוצר עותק כטיוטה — כולל העיצוב');
      navigate(`/app/workflows/${copy.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השכפול נכשל', 'error');
    }
  };

  const choose = (o: StartOption) => {
    setStart(o);
    setDraft(null);
  };

  const r = draft?.generation;
  const stage = draft ? 1 : 0;
  const existing = (side.data?.workflows ?? []).filter((w) => w.status !== 'archived');

  return (
    <>
      <PageHeader title="מה נרצה ליצור היום?" description="בוחרים איך להתחיל ואיזו חוויה תהיה ללקוח. את השאר — שדות, מיתוג, בדיקה ופרסום — עושים בסטודיו עם תצוגה חיה." />
      <ol className="-mt-2 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs" aria-label="שלבי היצירה">
        {JOURNEY.map((j, i) => (
          <li key={j} className="flex items-center gap-2">
            <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', i < stage ? 'bg-teal-50 text-teal-600' : i === stage ? 'bg-midnight text-white' : 'bg-white text-ink-muted ring-1 ring-cloud-200')} aria-current={i === stage ? 'step' : undefined}>
              <span className="tabular-nums">{i < stage ? '✓' : i + 1}</span> {j}
              {i >= 2 && <span className="sr-only"> (בסטודיו)</span>}
            </span>
            {i < JOURNEY.length - 1 && <span className="text-ink-soft" aria-hidden>←</span>}
          </li>
        ))}
      </ol>

      <div role="radiogroup" aria-label="איך מתחילים" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {START_OPTIONS.map((o) => {
          const Icon = START_ICONS[o.id];
          const on = start === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.id)}
              className={cx('flex items-start gap-3 rounded-2xl border bg-white p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', on ? 'border-midnight shadow-card ring-2 ring-midnight/10' : 'border-cloud-200 hover:border-ink-soft')}
            >
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', on ? 'bg-midnight text-white' : 'bg-cloud text-ink-muted')}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold text-ink">{o.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {start === 'describe' && (
            <Card className="p-5">
              <form onSubmit={handleSubmit(generate)} noValidate className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">מתארים את הצורך — ומקבלים תהליך מוכן לעריכה.</h2>
                  <LocalGenerationNotice />
                </div>
                <div>
                  <FieldLabel htmlFor="prompt" required>
                    מה הלקוחות שלכם צריכים להזמין, לאשר או למלא?
                  </FieldLabel>
                  <Textarea
                    id="prompt"
                    rows={4}
                    placeholder="לדוגמה: אני חנות פרחים ורוצה שלקוחות יזמינו זר עם תקציב, צבעים, ברכה ומשלוח"
                    invalid={Boolean(formState.errors.prompt)}
                    aria-describedby={formState.errors.prompt ? 'prompt-err' : 'prompt-help'}
                    {...register('prompt', {
                      required: 'כתבו כמה מילים על התהליך',
                      minLength: { value: 8, message: 'קצת יותר פירוט, בבקשה (לפחות 8 תווים)' },
                      maxLength: { value: 1000, message: 'עד 1000 תווים' },
                    })}
                  />
                  {formState.errors.prompt ? (
                    <p id="prompt-err" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                      {formState.errors.prompt.message}
                    </p>
                  ) : (
                    <p id="prompt-help" className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                      מנוע מקומי מבוסס תבניות מזהה בעברית את סוג העסק, אפשרויות, מחירים, הגבלות, אישורים ותשלום — ומרכיב תהליך אמיתי שאפשר לערוך.
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-muted">דוגמאות שאפשר להתחיל מהן:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PROMPT_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        type="button"
                        title={ex.prompt}
                        onClick={() => setValue('prompt', ex.prompt, { shouldValidate: true })}
                        className="min-h-[36px] rounded-full border border-cloud-300 bg-white px-3 text-xs font-medium text-ink-muted transition hover:border-orange-700 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-ink-soft">אפשר לשלב: ״הרשמה לסדנה עם 2 מועדים, עד 12 משתתפים, באישור ידני, ללא תשלום״.</p>
                </div>
                <Button type="submit" icon={draft ? RotateCcw : Wand2} loading={generating}>
                  {generating ? 'מרכיבים תהליך…' : draft ? 'יצירה מחדש' : 'יצירת תהליך'}
                </Button>
              </form>
            </Card>
          )}

          {start === 'template' && (
            <Card className="p-5">
              <h2 className="font-semibold">תבנית לפי תחום</h2>
              <p className="mt-1 text-sm text-ink-muted">תהליך מלא עם שלבים, שדות ומחירים לדוגמה. אחרי הבחירה הכול ניתן לעריכה.</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="תבניות">
                {(Object.keys(TEMPLATES) as TemplateKey[])
                  .filter((k) => k !== 'generic')
                  .map((k) => {
                    const on = draft?.templateKey === k;
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => fromTemplate(k)}
                          className={cx('h-full w-full rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', on ? 'border-midnight bg-cloud' : 'border-cloud-200 bg-white hover:border-ink-soft')}
                        >
                          <span className="block text-sm font-semibold text-ink">{TEMPLATES[k].label}</span>
                          <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{TEMPLATES[k].description}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          )}

          {start === 'blank' && (
            <Card className="p-5">
              <h2 className="font-semibold">תהליך ריק</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">שלב אחד עם שם וטלפון — כדי שכל בקשה תגיע עם דרך לחזור ללקוח. בסטודיו מוסיפים שדות, שלבים, מחירים ותנאים.</p>
              {!draft && (
                <Button className="mt-4" icon={FilePlus2} onClick={blank}>
                  התחלה מתהליך ריק
                </Button>
              )}
            </Card>
          )}

          {start === 'duplicate' && (
            <Card className="p-5">
              <h2 className="font-semibold">שכפול תהליך קיים</h2>
              <p className="mt-1 text-sm text-ink-muted">העותק נוצר כטיוטה חדשה עם אותו תוכן ועיצוב. התהליך המקורי והבקשות שלו לא משתנים.</p>
              {existing.length ? (
                <ul className="mt-4 divide-y divide-cloud-200 rounded-xl border border-cloud-200">
                  {existing.map((w) => (
                    <li key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: PRESETS[w.design.presetId].theme.palette.primary }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{w.draft.title}</span>
                        <span className="text-xs text-ink-muted">
                          {w.status === 'published' ? 'פורסם' : 'טיוטה'} · {EXPERIENCES[w.design.presetId]} · עודכן {formatRelative(w.updatedAt)}
                        </span>
                      </span>
                      <Button size="sm" variant="secondary" icon={Copy} onClick={() => duplicate(w.id)} aria-label={`שכפול ${w.draft.title}`}>
                        שכפול
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-cloud p-4 text-sm text-ink-muted">עוד אין תהליכים בסביבת העבודה הזו. התחילו מתיאור או מתבנית.</p>
              )}
            </Card>
          )}

          {draft && start !== 'duplicate' && (
            <Card className="animate-fade-up p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">החוויה ללקוח</h2>
                <span className="text-xs text-ink-muted">שלב 2 · אפשר להחליף גם אחר כך</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="בחירת חוויה ועיצוב">
                {PRESET_LIST.map((p) => {
                  const on = draft.theme.presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${EXPERIENCES[p.id]} — ${p.nameHe}${p.id === draft.recommended ? ' (מומלץ)' : ''}`}
                      onClick={() => setDraft({ ...draft, theme: buildTheme(p.id, { source: p.id === draft.recommended ? 'auto' : 'manual' }) })}
                      className={cx('rounded-2xl border bg-white p-1.5 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', on ? 'border-midnight ring-2 ring-midnight/15' : 'border-cloud-200 hover:border-ink-soft')}
                    >
                      <PresetPreview theme={buildTheme(p.id)} />
                      <span className="flex items-center gap-1 px-1 pb-0.5 pt-1.5">
                        <span className="text-sm font-semibold">{EXPERIENCES[p.id]}</span>
                        {p.id === draft.recommended && <Badge tone="teal">מומלץ</Badge>}
                      </span>
                      <span className="block px-1 text-[11px] text-ink-muted">{p.nameHe}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-muted">{PRESETS[draft.theme.presetId].meta.description}</p>

              <div className="mt-5 rounded-xl bg-cloud p-3 text-sm">
                <p className="font-medium">
                  מה הכנו: {draft.label}
                  {r && <Badge tone={CONFIDENCE[r.confidence].tone} className="ms-2">{CONFIDENCE[r.confidence].label}</Badge>}
                </p>
                <p className="mt-1 text-ink-muted">
                  {draft.config.steps.length} שלבים · {draft.config.steps.reduce((n, s) => n + s.fields.length, 0)} שדות
                  {draft.config.pricing.enabled ? ' · חישוב מחיר' : ''}
                  {draft.config.mode === 'case' ? ' · תיק אישי לכל לקוח' : ''}
                  {draft.config.booking?.enabled ? ' · כללי הזמנה' : ''} · סיום: {COMPLETION_LABELS[draft.config.completion?.mode ?? 'request'].title}
                </p>
                {r && r.detected.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-ink-muted">זוהה בתיאור:</span>
                    {r.detected.map((k) => (
                      <Badge key={k} tone="blue">
                        {k}
                      </Badge>
                    ))}
                  </p>
                )}
                {r && r.adjustments.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-ink-muted">
                    {r.adjustments.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
              {r && r.reviewNotes.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900" role="note">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> דורש בדיקה או לא נתמך בדמו
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-[13px]">
                    {r.reviewNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-amber-800/80">ההערות נשמרות בטיוטה ומוצגות בסטודיו — לא ללקוחות.</p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button onClick={save} loading={saving}>
                  המשך לסטודיו <ArrowLeft className="h-4 w-4" aria-hidden />
                </Button>
                <span className="text-xs text-ink-muted">בסטודיו: הוספת שדות, מיתוג, תצוגה בנייד, בדיקה ופרסום.</span>
              </div>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {draft ? (
            <div className="animate-fade-up">
              <p className="mb-2 text-xs font-medium text-ink-muted">כך הלקוח יראה את זה — אפשר למלא ולנסות</p>
              <div data-fz-scroll className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-cloud-200">
                <WorkflowRenderer key={`${draft.templateKey}-${JSON.stringify(draft.config.steps.map((s) => s.id))}`} config={draft.config} theme={draft.theme} mode="preview" embedded scrollFrame />
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-cloud-300 bg-white/60 p-8 text-center">
              <Wand2 className="h-8 w-8 text-ink-soft" aria-hidden />
              <p className="mt-3 font-medium">התצוגה המקדימה תופיע כאן</p>
              <p className="mt-1 max-w-xs text-sm text-ink-muted">
                {start === 'duplicate' ? 'בחרו תהליך לשכפול — הוא ייפתח ישר בסטודיו.' : start === 'template' ? 'בחרו תבנית כדי לראות אותה כמו שהלקוח יראה.' : start === 'blank' ? 'התחילו מתהליך ריק ותראו אותו כאן.' : 'כתבו תיאור או בחרו דוגמה, ולחצו ״יצירת תהליך״.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
