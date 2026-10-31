/**
 * The universal workflow renderer. Every customer-facing flow — flowers,
 * garage, restaurant, generated forms — is rendered by this one component,
 * driven entirely by WorkflowConfig (business data) and WorkflowTheme
 * (design tokens). No per-business pages exist.
 */
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { RunAnswer, WorkflowConfig } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { ValidationFailedError } from '../data/repository';
import { visibleFields, visibleSteps, type Values } from '../engine/conditions';
import { computePrice } from '../engine/pricing';
import { validateFields, type FieldErrors } from '../engine/validation';
import { ThemeScope } from '../theme/ThemeScope';
import { recommendTheme } from '../theme/resolver';
import { fieldDomId, FieldInput } from './FieldInput';
import { decisionFields, Hero, PriceBar, PriceCard, Review, Stepper } from './parts';

export interface RendererProps {
  config: WorkflowConfig;
  mode: 'live' | 'preview';
  /** Design tokens. Defaults to the locally recommended theme for the config. */
  theme?: WorkflowTheme;
  /** Resolved local image data URLs keyed by asset id (logo / cover). */
  assets?: Record<string, string>;
  initialValues?: Values;
  caseAnswers?: RunAnswer[];
  onSubmit?: (values: Values, consent: boolean) => Promise<void>;
  /** Rendered inside another page (editor, landing) rather than as the whole page. */
  embedded?: boolean;
  /** The renderer sits in its own scroll container marked data-fz-scroll (device previews). */
  scrollFrame?: boolean;
}

export function WorkflowRenderer({ config, mode, theme: themeProp, assets = {}, initialValues, caseAnswers = [], onSubmit, embedded, scrollFrame }: RendererProps) {
  const theme = useMemo(() => themeProp ?? recommendTheme({ title: config.title, description: config.description }).theme, [themeProp, config.title, config.description]);
  const { control, watch, getValues, setError, clearErrors, formState } = useForm<Values>({ defaultValues: initialValues ?? {} });
  const values = watch();
  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewNotice, setPreviewNotice] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const steps = visibleSteps(config, values);
  const summaryIndex = steps.length;
  const isSummary = stepIndex >= summaryIndex;
  const current = isSummary ? null : steps[stepIndex];
  const price = useMemo(() => computePrice(config, values), [config, values]);
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const hasDecisions = decisionFields(config).length > 0;

  // Keep the cursor valid when the editor removes steps or a condition hides one.
  useEffect(() => {
    if (stepIndex > summaryIndex) setStepIndex(summaryIndex);
  }, [stepIndex, summaryIndex]);

  const scrollTop = () => {
    const frame = topRef.current?.closest<HTMLElement>('[data-fz-scroll]');
    if (frame) frame.scrollTo({ top: 0, behavior: 'smooth' });
    else if (!embedded) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const go = (i: number) => {
    setDir(i > stepIndex ? 'fwd' : 'back');
    setStepIndex(i);
    setErrorCount(0);
    scrollTop();
  };

  const applyErrors = (errs: FieldErrors) => {
    clearErrors();
    const keys = Object.keys(errs);
    keys.forEach((k) => setError(k, { type: 'validate', message: errs[k] }));
    setErrorCount(keys.length);
    if (keys[0]) setTimeout(() => document.getElementById(fieldDomId(keys[0]!))?.focus({ preventScroll: false }), 0);
    return keys.length === 0;
  };

  const goNext = () => {
    if (!current) return;
    if (!applyErrors(validateFields(visibleFields(current, getValues()), getValues()))) return;
    go(stepIndex + 1);
  };

  const submit = async () => {
    // Re-validate all steps: values may have changed after visiting the summary.
    const all = getValues();
    for (let i = 0; i < steps.length; i++) {
      const errs = validateFields(visibleFields(steps[i]!, all), all);
      if (Object.keys(errs).length) {
        go(i);
        applyErrors(errs);
        return;
      }
    }
    if (config.consent.required && !consent) {
      setConsentError('יש לסמן את האישור כדי לשלוח');
      document.getElementById('fz-consent')?.focus();
      return;
    }
    if (mode === 'preview' || !onSubmit) {
      setPreviewNotice(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(all, consent);
    } catch (err) {
      if (err instanceof ValidationFailedError) {
        const target = steps.findIndex((s) => s.fields.some((f) => err.errors[f.key]));
        if (target >= 0) {
          go(target);
          applyErrors(err.errors);
        } else setSubmitError(Object.values(err.errors)[0] ?? 'בדקו את הפרטים');
      } else {
        setSubmitError(err instanceof Error ? err.message : 'השליחה נכשלה. נסו שוב.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const composition = theme.composition;
  const editorial = composition === 'editorial_split';
  const pricing = config.pricing.enabled;
  const hasAside = pricing && !editorial;
  const stickyBar = pricing && theme.mobile.stickySummary;
  const logoUrl = theme.logo.assetId ? assets[theme.logo.assetId] : undefined;
  const coverUrl = theme.hero.coverAssetId ? assets[theme.hero.coverAssetId] : undefined;
  const caseInHero = theme.hero.layout === 'banner';
  const titles = [...steps.map((s) => s.title), 'סיכום ואישור'];
  const fieldsCount = steps.reduce((n, s) => n + s.fields.filter((f) => f.type !== 'info').length, 0);
  const lastBeforeSummary = stepIndex === summaryIndex - 1;

  return (
    <ThemeScope theme={theme} className={embedded ? 'fz-frame' : undefined}>
      <div
        ref={topRef}
        className="fz-layout scroll-mt-2"
        data-composition={composition}
        data-aside={hasAside || undefined}
        data-inline-summary={(pricing && !theme.mobile.stickySummary) || undefined}
      >
        <div className="fz-hero-area">
          <Hero
            theme={theme}
            config={config}
            stepsCount={titles.length}
            fieldsCount={fieldsCount}
            logoUrl={logoUrl}
            coverUrl={coverUrl}
            caseAnswers={caseAnswers}
            condensed={stepIndex > 0}
            preview={mode === 'preview'}
          >
            {editorial && pricing ? <PriceCard config={config} price={price} values={values} /> : null}
          </Hero>
        </div>

        <form
          noValidate
          className="fz-main"
          aria-label={config.title}
          onSubmit={(e) => {
            e.preventDefault();
            if (isSummary) void submit();
            else goNext();
          }}
        >
          <div className="fz-card fz-pad">
            <Stepper style={theme.progress} titles={titles} index={Math.min(stepIndex, summaryIndex)} onJump={go} />

            <div className="space-y-4">
              {config.disclaimer && (stepIndex === 0 || isSummary) && (
                <div role="note" className="fz-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>{config.disclaimer}</p>
                </div>
              )}

              {caseAnswers.length > 0 && stepIndex === 0 && !caseInHero && (
                <section aria-label="פרטי התיק" className="fz-panel p-4">
                  <h3 className="text-sm font-bold">פרטי התיק</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {caseAnswers.map((a) => (
                      <div key={a.fieldId} className="min-w-0">
                        <dt className="fz-muted text-xs">{a.label}</dt>
                        <dd className="font-semibold [overflow-wrap:anywhere]">
                          <bdi>{a.displayValue}</bdi>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {errorCount > 0 && (
                <p role="alert" className="fz-alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {errorCount === 1 ? 'שדה אחד דורש תיקון לפני שממשיכים.' : `${errorCount} שדות דורשים תיקון לפני שממשיכים.`}
                </p>
              )}

              {current && (
                <div key={current.id} className="fz-step" data-dir={dir}>
                  {current.description && <p className="fz-muted mb-5 text-[15px] leading-relaxed">{current.description}</p>}
                  <div className="fz-fields">
                    {visibleFields(current, values).map((f) => (
                      <Controller
                        key={f.id}
                        name={f.key}
                        control={control}
                        render={({ field: rhf }) => (
                          <FieldInput
                            field={f}
                            value={rhf.value}
                            values={values}
                            optionArt={theme.optionArt}
                            onChange={(v) => {
                              rhf.onChange(v);
                              if (errors[f.key]) {
                                clearErrors(f.key);
                                setErrorCount((n) => Math.max(0, n - 1));
                              }
                            }}
                            onBlur={rhf.onBlur}
                            error={errors[f.key]?.message}
                          />
                        )}
                      />
                    ))}
                    {current.fields.length === 0 && <p className="fz-muted text-sm">אין שדות בשלב זה עדיין.</p>}
                  </div>
                </div>
              )}

              {isSummary && (
                <div key="summary" className="fz-step space-y-5" data-dir={dir}>
                  <Review config={config} steps={steps} values={values} visible={(s) => visibleFields(s, values)} onEdit={go} price={price} optionArt={theme.optionArt} />

                  {config.consent.text && (
                    <div>
                      {config.consent.required && (
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                          <ShieldCheck className="h-4 w-4 fz-ink" aria-hidden /> אישור מפורש לפני שליחה
                        </p>
                      )}
                      <label className="fz-option fz-consent" data-kind="row">
                        <input
                          id="fz-consent"
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => {
                            setConsent(e.target.checked);
                            setConsentError(null);
                          }}
                          aria-invalid={Boolean(consentError) || undefined}
                          aria-describedby={consentError ? 'fz-consent-err' : undefined}
                        />
                        <span className="fz-indicator" data-shape="box" aria-hidden />
                        <span className="fz-opt-body text-sm leading-relaxed">
                          {config.consent.text}
                          {config.consent.required && (
                            <span className="fz-req" aria-hidden>
                              *
                            </span>
                          )}
                        </span>
                      </label>
                      {consentError && (
                        <p id="fz-consent-err" role="alert" className="fz-error">
                          <AlertCircle className="h-4 w-4" aria-hidden /> {consentError}
                        </p>
                      )}
                    </div>
                  )}
                  {submitError && (
                    <p role="alert" className="fz-alert">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {submitError}
                    </p>
                  )}
                  {previewNotice && (
                    <p role="status" className="fz-note">
                      זו תצוגה מקדימה — הבקשה לא נשמרה. פרסמו את התהליך ופתחו את הקישור הציבורי כדי לשלוח באמת.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="fz-divider my-6" />
            <div className="fz-nav">
              <button type="button" className="fz-btn fz-btn-ghost" onClick={() => go(Math.max(0, stepIndex - 1))} disabled={stepIndex === 0}>
                <ArrowRight className="h-4 w-4" aria-hidden />
                חזרה
              </button>
              {isSummary ? (
                <button type="submit" className="fz-btn fz-btn-primary" disabled={submitting} aria-busy={submitting || undefined}>
                  {submitting ? <span className="fz-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  {submitting ? 'שולח…' : hasDecisions ? 'שליחת ההחלטות' : 'שליחה'}
                </button>
              ) : (
                <button type="submit" className="fz-btn fz-btn-primary">
                  {lastBeforeSummary ? 'לסיכום' : 'המשך'}
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </form>

        {pricing && (
          <aside className="fz-aside" aria-label="סיכום מחיר">
            <div className="fz-aside-inner">
              <PriceCard config={config} price={price} values={values} />
            </div>
          </aside>
        )}
      </div>
      {stickyBar && <PriceBar config={config} price={price} values={values} hasAside={pricing} staticBar={Boolean(embedded && !scrollFrame)} />}
    </ThemeScope>
  );
}
