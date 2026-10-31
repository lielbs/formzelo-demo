import { AlertTriangle, ArrowLeft, RotateCcw, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { LocalGenerationNotice } from '../../components/Brand';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, FieldLabel, PageHeader, Select, Textarea } from '../../components/ui';
import { useActiveOrg, useRepo } from '../../data/store';
import { EXAMPLE_PROMPTS, generateWorkflowFromPrompt, type GenerationResult } from '../../engine/generator';
import { COMPLETION_LABELS } from '../../engine/completion';
import { TEMPLATES, type TemplateKey } from '../../engine/templates';
import { WorkflowRenderer } from '../../renderer/WorkflowRenderer';
import { buildTheme, PRESET_LIST, PRESETS } from '../../theme/presets';

interface FormValues {
  prompt: string;
  template: TemplateKey | 'auto';
}

const CONFIDENCE = { high: { label: 'התאמה גבוהה', tone: 'teal' }, medium: { label: 'התאמה חלקית', tone: 'amber' }, low: { label: 'לא זוהה תחום', tone: 'neutral' } } as const;

export function WorkflowNew() {
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const initialPrompt = (location.state as { prompt?: string } | null)?.prompt ?? '';
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoRan = useRef(false);

  const { register, handleSubmit, setValue, formState, getValues } = useForm<FormValues>({
    defaultValues: { prompt: initialPrompt, template: 'auto' },
  });

  const generate = ({ prompt, template }: FormValues) => {
    setGenerating(true);
    // Short pause so the change is perceptible; generation itself is synchronous and local.
    setTimeout(() => {
      const r = generateWorkflowFromPrompt(prompt, template === 'auto' ? undefined : template);
      r.config.branding = { ...r.config.branding, primaryColor: org.brand.primaryColor, logoText: org.name };
      setResult(r);
      setGenerating(false);
    }, 350);
  };

  useEffect(() => {
    if (initialPrompt && !autoRan.current) {
      autoRan.current = true;
      generate({ prompt: initialPrompt, template: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const wf = await repo.createWorkflow(org.id, { config: result.config, templateKey: result.templateKey, sourcePrompt: getValues('prompt'), design: result.theme });
      toast('הטיוטה נשמרה. אפשר לערוך ולפרסם.');
      navigate(`/app/workflows/${wf.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="תהליך חדש" description="תארו במילים פשוטות מה הלקוחות שלכם צריכים למלא, לבחור או לאשר." eyebrow={<LocalGenerationNotice />} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Card className="p-5">
            <form onSubmit={handleSubmit(generate)} noValidate className="space-y-4">
              <div>
                <FieldLabel htmlFor="prompt" required>
                  מה התהליך צריך לעשות?
                </FieldLabel>
                <Textarea
                  id="prompt"
                  rows={5}
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
                  <p id="prompt-help" className="mt-1.5 text-xs text-ink-muted">
                    המנוע המקומי (לא AI) מזהה בעברית מטרה, קהל, אפשרויות, הגבלות, אישורים ותשלום — ומרכיב תהליך אמיתי שאפשר לערוך.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">דוגמאות:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setValue('prompt', p, { shouldValidate: true })}
                      className="rounded-full border border-cloud-300 bg-white px-3 py-1.5 text-start text-xs text-ink-muted transition hover:border-orange hover:text-ink"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="template">תבנית</FieldLabel>
                <Select id="template" {...register('template')}>
                  <option value="auto">זיהוי אוטומטי מהתיאור</option>
                  {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
                    <option key={k} value={k}>
                      {TEMPLATES[k].label} — {TEMPLATES[k].description}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" icon={result ? RotateCcw : Wand2} loading={generating}>
                  {generating ? 'מנתח מקומית…' : result ? 'יצירה מחדש' : 'יצירת תהליך'}
                </Button>
              </div>
            </form>
          </Card>

          {result && (
            <Card className="animate-fade-up p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">מה זוהה</h2>
                <Badge tone={CONFIDENCE[result.confidence].tone}>{CONFIDENCE[result.confidence].label}</Badge>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="text-ink-muted">תבנית:</dt>
                  <dd className="font-medium">{result.templateLabel}</dd>
                </div>
                {result.detected.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <dt className="text-ink-muted">זוהה:</dt>
                    {result.detected.map((k) => (
                      <dd key={k}>
                        <Badge tone="blue">{k}</Badge>
                      </dd>
                    ))}
                  </div>
                )}
                {!result.composed && result.matchedKeywords.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <dt className="text-ink-muted">מילות מפתח:</dt>
                    {result.matchedKeywords.map((k) => (
                      <dd key={k}>
                        <Badge>{k}</Badge>
                      </dd>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-ink-muted">מבנה:</dt>
                  <dd>
                    {result.config.steps.length} שלבים · {result.config.steps.reduce((n, s) => n + s.fields.length, 0)} שדות
                    {result.config.pricing.enabled ? ' · חישוב מחיר' : ''}
                    {result.config.mode === 'case' ? ' · מבוסס תיקים' : ''}
                    {result.config.booking?.enabled ? ' · כללי הזמנה' : ''}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted">סיום:</dt>
                  <dd>
                    {COMPLETION_LABELS[result.completionMode].title} <span className="text-xs text-ink-muted">— {COMPLETION_LABELS[result.completionMode].description}</span>
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-xl bg-cloud p-3">
                <p className="text-sm">
                  <span className="text-ink-muted">עיצוב:</span> <span className="font-medium">{PRESETS[result.theme.presetId].meta.nameHe}</span>
                  {result.theme.presetId === result.themeRecommendation.presetId && <span className="text-xs text-ink-muted"> · {result.themeRecommendation.reason}</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="בחירת עיצוב">
                  {PRESET_LIST.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={result.theme.presetId === p.id}
                      onClick={() => setResult({ ...result, theme: buildTheme(p.id, { source: p.id === result.themeRecommendation.presetId ? 'auto' : 'manual' }) })}
                      className={
                        result.theme.presetId === p.id
                          ? 'inline-flex items-center gap-1.5 rounded-full border border-midnight bg-midnight px-2.5 py-1 text-xs text-white'
                          : 'inline-flex items-center gap-1.5 rounded-full border border-cloud-300 bg-white px-2.5 py-1 text-xs text-ink-muted hover:border-ink-soft'
                      }
                    >
                      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: PRESETS[p.id].theme.palette.primary }} aria-hidden />
                      {p.nameHe}
                      {p.id === result.themeRecommendation.presetId && ' ★'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-muted">★ = המלצת המנוע המקומי. אפשר לשנות הכול גם אחר כך בלשונית ״עיצוב״.</p>
              </div>
              {result.adjustments.length > 0 && (
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-ink-muted">
                  {result.adjustments.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {result.reviewNotes.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900" role="note">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> דורש בדיקה או לא נתמך בדמו
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-[13px]">
                    {result.reviewNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-amber-800/80">ההערות נשמרות בטיוטה ומוצגות בסטודיו — לא ללקוחות.</p>
                </div>
              )}
              <Button className="mt-5 w-full sm:w-auto" onClick={save} loading={saving}>
                שמירה כטיוטה ומעבר לעריכה <ArrowLeft className="h-4 w-4" aria-hidden />
              </Button>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {result ? (
            <div className="animate-fade-up">
              <p className="mb-2 text-xs font-medium text-ink-muted">תצוגה מקדימה חיה — אפשר למלא ולנסות</p>
              <div data-fz-scroll className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-cloud-200">
                <WorkflowRenderer key={JSON.stringify(result.config.steps.map((s) => s.id))} config={result.config} theme={result.theme} mode="preview" embedded scrollFrame />
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-cloud-300 bg-white/60 p-8 text-center">
              <Wand2 className="h-8 w-8 text-ink-soft" aria-hidden />
              <p className="mt-3 font-medium">התצוגה המקדימה תופיע כאן</p>
              <p className="mt-1 max-w-xs text-sm text-ink-muted">כתבו תיאור או בחרו דוגמה, ולחצו "יצירת תהליך".</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
