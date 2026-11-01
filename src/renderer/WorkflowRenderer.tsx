/**
 * The universal workflow renderer. Every customer-facing flow — flowers,
 * garage, restaurant, generated forms — is rendered by this one component,
 * driven entirely by WorkflowConfig (business data) and WorkflowTheme
 * (design tokens). No per-business pages exist.
 */
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CreditCard, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { isDisplayField, type RunAnswer, type WorkflowConfig } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { ValidationFailedError } from '../data/repository';
import { visibleFields, visibleSteps, type Values } from '../engine/conditions';
import { validateBooking, type SlotAvailability } from '../engine/booking';
import { validateOptionCapacity, type OptionUsage } from '../engine/capacity';
import { paymentPlan } from '../engine/completion';
import { computePrice } from '../engine/pricing';
import { validateFields, type FieldErrors } from '../engine/validation';
import { focusPosition, focusScreens } from '../engine/focus';
import { ThemeScope } from '../theme/ThemeScope';
import { recommendTheme } from '../theme/resolver';
import { fieldDomId, FieldInput } from './FieldInput';
import { DigitalPresence } from './presence';
import { Promises, Ribbon, Welcome } from './extras';
import { BusinessGallery, PagePhoto } from './media';
import { CheckoutPanel, decisionFields, Hero, PriceBar, PriceCard, ReservationCard, Review, Stepper } from './parts';

export interface RendererProps {
  config: WorkflowConfig;
  mode: 'live' | 'preview';
  /** Design tokens. Defaults to the locally recommended theme for the config. */
  theme?: WorkflowTheme;
  /** Resolved local image data URLs keyed by asset id (logo / cover). */
  assets?: Record<string, string>;
  initialValues?: Values;
  caseAnswers?: RunAnswer[];
  /** `payNow`: the customer chose the simulated payment (no money moves). */
  onSubmit?: (values: Values, consent: boolean, opts: { payNow: boolean }) => Promise<void>;
  /** Local slot usage for booking workflows (demo only, see engine/booking.ts). */
  getAvailability?: (date: string) => Promise<SlotAvailability[]>;
  /** Live runs only: local places taken per limited option. */
  getOptionUsage?: () => Promise<OptionUsage>;
  /** Studio: jump the preview to the step that contains this step id. */
  focusStepId?: string;
  /** Studio: highlight a block and let clicks in the canvas select blocks. */
  selectedFieldId?: string;
  onSelectField?: (fieldId: string) => void;
  /** Rendered inside another page (editor, landing) rather than as the whole page. */
  embedded?: boolean;
  /** The renderer sits in its own scroll container marked data-fz-scroll (device previews). */
  scrollFrame?: boolean;
}

export function WorkflowRenderer({
  config,
  mode,
  theme: themeProp,
  assets = {},
  initialValues,
  caseAnswers = [],
  onSubmit,
  embedded,
  scrollFrame,
  getAvailability,
  getOptionUsage,
  focusStepId,
  selectedFieldId,
  onSelectField,
}: RendererProps) {
  const theme = useMemo(() => themeProp ?? recommendTheme({ title: config.title, description: config.description }).theme, [themeProp, config.title, config.description]);
  const { control, watch, getValues, setError, clearErrors, formState } = useForm<Values>({ defaultValues: initialValues ?? {} });
  const values = watch();
  const [stepIndex, setStepIndex] = useState(0);
  /** Focus experience: which question of the current step is on screen. */
  const [screen, setScreen] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewNotice, setPreviewNotice] = useState(false);
  const [payNow, setPayNow] = useState(true);
  const [availability, setAvailability] = useState<Record<string, SlotAvailability> | undefined>();
  const [usage, setUsage] = useState<OptionUsage | undefined>();
  const topRef = useRef<HTMLDivElement>(null);

  const steps = visibleSteps(config, values);
  const summaryIndex = steps.length;
  const isSummary = stepIndex >= summaryIndex;
  const current = isSummary ? null : steps[stepIndex];
  const flow = theme.flow ?? 'card';
  const focus = flow === 'focus';
  const fieldsNow = current ? visibleFields(current, values) : [];
  const screens = focus ? focusScreens(fieldsNow) : [fieldsNow];
  const screenIdx = Math.min(screen, screens.length - 1);
  const shown = screens[screenIdx] ?? [];
  const price = useMemo(() => computePrice(config, values), [config, values]);
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const hasDecisions = decisionFields(config).length > 0;

  const plan = paymentPlan(config, price);
  const bookingDate = config.booking?.enabled ? values[config.booking.dateKey] : undefined;

  // Booking: refresh local slot usage when the date changes. The callback is read
  // through a ref so an inline function from the parent doesn't refetch every render.
  const availabilityRef = useRef(getAvailability);
  availabilityRef.current = getAvailability;
  const hasAvailability = Boolean(getAvailability);
  useEffect(() => {
    const fetchSlots = availabilityRef.current;
    if (!fetchSlots || typeof bookingDate !== 'string' || !bookingDate) {
      setAvailability(undefined);
      return;
    }
    let cancelled = false;
    fetchSlots(bookingDate)
      .then((slots) => !cancelled && setAvailability(Object.fromEntries(slots.map((s) => [s.time, s]))))
      .catch(() => !cancelled && setAvailability(undefined));
    return () => {
      cancelled = true;
    };
  }, [hasAvailability, bookingDate]);

  // Limited options (e.g. 30 places per track): load local usage once per mount.
  const usageRef = useRef(getOptionUsage);
  usageRef.current = getOptionUsage;
  const hasUsage = Boolean(getOptionUsage);
  useEffect(() => {
    const load = usageRef.current;
    if (!load) return;
    let cancelled = false;
    load()
      .then((u) => !cancelled && setUsage(u))
      .catch(() => !cancelled && setUsage(undefined));
    return () => {
      cancelled = true;
    };
  }, [hasUsage]);

  // Studio: selecting a block in the structure pane jumps the canvas to its step.
  useEffect(() => {
    if (!focusStepId) return;
    const i = steps.findIndex((s) => s.id === focusStepId);
    if (i >= 0 && i !== stepIndex) {
      setDir(i > stepIndex ? 'fwd' : 'back');
      setStepIndex(i);
      setScreen(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStepId]);

  // Studio, focus experience: show the question that holds the selected block.
  useEffect(() => {
    if (!focus || !selectedFieldId) return;
    const i = screens.findIndex((sc) => sc.some((f) => f.id === selectedFieldId));
    if (i >= 0 && i !== screenIdx) setScreen(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldId, focus, stepIndex]);

  // Studio: bring the selected block into view inside the (scaled) device frame.
  useEffect(() => {
    if (!selectedFieldId) return;
    const raf = requestAnimationFrame(() => {
      const el = topRef.current?.querySelector<HTMLElement>(`[data-fz-field-id="${selectedFieldId}"]`);
      const frame = topRef.current?.closest<HTMLElement>('[data-fz-scroll]');
      if (!el || !frame) return;
      const scale = frame.getBoundingClientRect().height / frame.offsetHeight || 1;
      const delta = (el.getBoundingClientRect().top - frame.getBoundingClientRect().top) / scale;
      frame.scrollTo({ top: frame.scrollTop + delta - frame.clientHeight / 4, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedFieldId, stepIndex]);

  // Keep the cursor valid when the editor removes steps or a condition hides one.
  useEffect(() => {
    if (stepIndex > summaryIndex) setStepIndex(summaryIndex);
  }, [stepIndex, summaryIndex]);

  const scrollTop = () => {
    const frame = topRef.current?.closest<HTMLElement>('[data-fz-scroll]');
    if (frame) frame.scrollTo({ top: 0, behavior: 'smooth' });
    else if (!embedded) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** `toEnd`: arriving backwards in the focus experience lands on the step's last question. */
  const go = (i: number, opts: { toEnd?: boolean; screen?: number } = {}) => {
    setDir(i > stepIndex ? 'fwd' : 'back');
    setStepIndex(i);
    setScreen(opts.screen ?? (opts.toEnd ? Number.MAX_SAFE_INTEGER : 0));
    setErrorCount(0);
    scrollTop();
  };
  /** The focus screen of step `i` that holds the first of these error keys. */
  const screenOf = (i: number, errs: FieldErrors, all: Values) =>
    focus ? Math.max(0, focusScreens(visibleFields(steps[i]!, all)).findIndex((sc) => sc.some((f) => errs[f.key]))) : 0;

  const applyErrors = (errs: FieldErrors) => {
    clearErrors();
    const keys = Object.keys(errs);
    keys.forEach((k) => setError(k, { type: 'validate', message: errs[k] }));
    setErrorCount(keys.length);
    if (keys[0]) setTimeout(() => document.getElementById(fieldDomId(keys[0]!))?.focus({ preventScroll: false }), 0);
    return keys.length === 0;
  };

  /** Field rules + booking rules (open days, offered slots, locally-known full slots) for some fields. */
  const stepErrors = (fields: ReturnType<typeof visibleFields>, all: Values): FieldErrors => {
    const errs = validateFields(fields, all);
    if (usage) {
      const keys = new Set(fields.map((f) => f.key));
      for (const [k, msg] of Object.entries(validateOptionCapacity(config, all, usage))) if (keys.has(k) && !errs[k]) errs[k] = msg;
    }
    const b = config.booking;
    if (b?.enabled) {
      const keys = new Set(fields.map((f) => f.key));
      const booking = validateBooking(config, all, []);
      const time = b.timeKey ? all[b.timeKey] : undefined;
      if (b.timeKey && typeof time === 'string' && availability?.[time]?.state === 'full' && !booking[b.timeKey]) {
        booking[b.timeKey] = 'המועד מלא לפי הבקשות שנשמרו בדפדפן זה. בחרו שעה אחרת.';
      }
      for (const [k, msg] of Object.entries(booking)) if (keys.has(k) && !errs[k]) errs[k] = msg;
    }
    return errs;
  };

  const goNext = () => {
    if (!current) return;
    const all = getValues();
    if (!applyErrors(stepErrors(focus ? shown : visibleFields(current, all), all))) return;
    if (focus && screenIdx < screens.length - 1) {
      setDir('fwd');
      setScreen(screenIdx + 1);
      setErrorCount(0);
      scrollTop();
      return;
    }
    go(stepIndex + 1);
  };

  const goBack = () => {
    if (focus && !isSummary && screenIdx > 0) {
      setDir('back');
      setScreen(screenIdx - 1);
      setErrorCount(0);
      scrollTop();
      return;
    }
    go(Math.max(0, stepIndex - 1), { toEnd: focus });
  };

  const submit = async () => {
    // Re-validate all steps: values may have changed after visiting the summary.
    const all = getValues();
    for (let i = 0; i < steps.length; i++) {
      const errs = stepErrors(visibleFields(steps[i]!, all), all);
      if (Object.keys(errs).length) {
        go(i, { screen: screenOf(i, errs, all) });
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
      // Nothing due now → no payment; due with no choice → the simulated pay button is the submit.
      await onSubmit(all, consent, { payNow: plan.dueNow > 0 && (plan.choice ? payNow : true) });
    } catch (err) {
      if (err instanceof ValidationFailedError) {
        const target = steps.findIndex((s) => s.fields.some((f) => err.errors[f.key]));
        if (target >= 0) {
          go(target, { screen: screenOf(target, err.errors, all) });
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
  const booking = Boolean(config.booking?.enabled);
  const hasAside = (pricing || booking) && !editorial;
  const stickyBar = pricing && theme.mobile.stickySummary;
  const logoUrl = theme.logo.assetId ? assets[theme.logo.assetId] : undefined;
  const coverUrl = theme.hero.coverAssetId ? assets[theme.hero.coverAssetId] : undefined;
  const caseInHero = theme.hero.layout === 'banner';
  const titles = [...steps.map((s) => s.title), 'סיכום ואישור'];
  const fieldsCount = steps.reduce((n, s) => n + s.fields.filter((f) => !isDisplayField(f)).length, 0);
  const submitLabel = hasDecisions
    ? 'שליחת ההחלטות'
    : plan.dueNow > 0 && (!plan.choice || payNow)
      ? 'תשלום מדומה ושליחה'
      : booking
        ? 'שליחת בקשת הזמנה'
        : 'שליחה';
  const lastBeforeSummary = stepIndex === summaryIndex - 1 && screenIdx === screens.length - 1;
  const firstScreen = screenIdx === 0;
  const position = focus ? focusPosition(steps.map((st) => focusScreens(visibleFields(st, values)).length), Math.min(stepIndex, summaryIndex), isSummary ? 0 : screenIdx) : null;
  const extras = theme.extras;

  return (
    <ThemeScope theme={theme} className={embedded ? 'fz-frame' : undefined}>
      <Ribbon text={extras?.ribbon} />
      <PagePhoto theme={theme} assets={assets} />
      <div
        ref={topRef}
        className="fz-layout scroll-mt-2"
        data-composition={composition}
        data-flow={flow}
        // Stage: the hero's colour runs edge to edge and the form card rests on it (not for the side-by-side
        // editorial layout, and not for the magazine experience, whose content sits on the open page).
        data-stage={(composition !== 'editorial_split' && flow !== 'editorial' && ['banner', 'immersive', 'centered', 'compact'].includes(theme.hero.layout)) || undefined}
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
            badge={extras?.badge}
            assets={assets}
            studio={Boolean(onSelectField)}
            condensed={stepIndex > 0}
            preview={mode === 'preview'}
          >
            {editorial && booking ? <ReservationCard config={config} values={values} /> : editorial && pricing ? <PriceCard config={config} price={price} values={values} /> : null}
          </Hero>
          <Promises items={extras?.promises} />
          <DigitalPresence theme={theme} slot="header" interactive={mode === 'live'} />
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
            <Stepper style={flow === 'console' ? 'rail' : theme.progress} titles={titles} index={Math.min(stepIndex, summaryIndex)} onJump={(i) => go(i)} />
            {position && !isSummary && (
              <div className="fz-focus-meter" aria-hidden>
                <span className="fz-focus-count fz-num">
                  {String(position.n).padStart(2, '0')}
                  <small>/{String(position.total).padStart(2, '0')}</small>
                </span>
                <span className="fz-focus-bar">
                  <span style={{ width: `${Math.round((position.n / Math.max(1, position.total)) * 100)}%` }} />
                </span>
              </div>
            )}

            <div className="space-y-4">
              {stepIndex === 0 && firstScreen && <Welcome welcome={extras?.welcome} assets={assets} />}
              {stepIndex === 0 && firstScreen && <BusinessGallery theme={theme} assets={assets} slot="intro" studio={Boolean(onSelectField)} />}

              {config.disclaimer && ((stepIndex === 0 && firstScreen) || isSummary) && (
                <div role="note" className="fz-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>{config.disclaimer}</p>
                </div>
              )}

              {caseAnswers.length > 0 && stepIndex === 0 && firstScreen && !caseInHero && (
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
                <div key={`${current.id}:${screenIdx}`} className="fz-step" data-dir={dir} data-focus={focus || undefined}>
                  {current.description && firstScreen && <p className="fz-muted fz-step-desc mb-5 text-[15px] leading-relaxed">{current.description}</p>}
                  <div className="fz-fields">
                    {shown.map((f) => (
                      <div
                        key={f.id}
                        className="fz-block"
                        data-type={f.type}
                        data-fz-field-id={f.id}
                        data-selected={selectedFieldId === f.id || undefined}
                        data-selectable={onSelectField ? true : undefined}
                        onClickCapture={
                          onSelectField
                            ? (e) => {
                                // In the studio a click selects the block instead of answering it.
                                e.preventDefault();
                                e.stopPropagation();
                                onSelectField(f.id);
                              }
                            : undefined
                        }
                      >
                      <Controller
                        name={f.key}
                        control={control}
                        render={({ field: rhf }) => (
                          <FieldInput
                            field={f}
                            value={rhf.value}
                            values={values}
                            assets={assets}
                            price={price}
                            config={config}
                            availability={config.booking?.timeKey === f.key ? availability : undefined}
                            usage={usage?.[f.key]}
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
                      </div>
                    ))}
                    {current.fields.length === 0 && <p className="fz-muted text-sm">אין שדות בשלב זה עדיין.</p>}
                  </div>
                </div>
              )}

              {isSummary && (
                <div key="summary" className="fz-step space-y-5" data-dir={dir}>
                  <Review config={config} steps={steps} values={values} visible={(s) => visibleFields(s, values)} onEdit={go} price={price} optionArt={theme.optionArt} />
                  {booking && (
                    <div className="fz-inline-price">
                      <ReservationCard config={config} values={values} />
                    </div>
                  )}
                  <CheckoutPanel config={config} price={price} payNow={payNow} onPayNow={setPayNow} />

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
              <button type="button" className="fz-btn fz-btn-ghost" onClick={goBack} disabled={stepIndex === 0 && firstScreen}>
                <ArrowRight className="h-4 w-4" aria-hidden />
                חזרה
              </button>
              {isSummary ? (
                <button type="submit" className="fz-btn fz-btn-primary" disabled={submitting} aria-busy={submitting || undefined}>
                  {submitting ? <span className="fz-spin" aria-hidden /> : plan.dueNow > 0 && (!plan.choice || payNow) ? <CreditCard className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  {submitting ? 'שולח…' : submitLabel}
                </button>
              ) : (
                <button type="submit" className="fz-btn fz-btn-primary">
                  {lastBeforeSummary ? 'לסיכום' : 'המשך'}
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
              )}
              {focus && !isSummary && (
                <span className="fz-focus-hint" aria-hidden>
                  או <kbd>Enter</kbd> ↵
                </span>
              )}
            </div>
          </div>
          <DigitalPresence theme={theme} slot="footer" interactive={mode === 'live'} />
        </form>

        {(pricing || booking) && (
          <aside className="fz-aside" aria-label={booking ? 'פרטי ההזמנה' : 'סיכום מחיר'}>
            <div className="fz-aside-inner space-y-4">
              {booking && <ReservationCard config={config} values={values} />}
              {pricing && <PriceCard config={config} price={price} values={values} />}
            </div>
          </aside>
        )}
      </div>
      {stickyBar && <PriceBar config={config} price={price} values={values} hasAside={pricing} staticBar={Boolean(embedded && !scrollFrame)} />}
    </ThemeScope>
  );
}
