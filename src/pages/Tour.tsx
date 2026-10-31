/**
 * Guided sales demo: business type → sample workflow → branding → try it as a
 * customer → what the business sees. Everything uses the real renderer and the
 * local repository; a submission here is a real request stored in THIS browser.
 */
import { ArrowLeft, ArrowRight, Car, Check, Flower2, ImagePlus, Inbox, PartyPopper, Trophy, UtensilsCrossed, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InterestCTA } from '../components/Interest';
import { RunsTable } from '../components/RunsTable';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { PaymentBadge, StatusBadge } from '../components/StatusBadge';
import { Badge, Button, Card, cx, ErrorState, FieldLabel, Input, Spinner } from '../components/ui';
import { DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { useRepo, useRepoQuery } from '../data/store';
import type { WorkflowRun } from '../domain/schema';
import type { ThemePresetId, WorkflowTheme } from '../domain/theme';
import { hasOptionCapacity } from '../engine/capacity';
import { workflowOutcome } from '../engine/metrics';
import { formatNumber, formatRelative } from '../lib/format';
import { ownerActions } from '../engine/transitions';
import { prepareImage } from '../lib/images';
import { publicBaseUrl } from '../lib/links';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import { buildTheme, PRESET_LIST, PRESETS } from '../theme/presets';
import { DevicePreview, DeviceToggle, type Device } from './app/editor/DevicePreview';

interface Business {
  id: string;
  icon: typeof Flower2;
  label: string;
  value: string;
  orgId: string;
  slug: string;
  name: string;
  points: string[];
  /** Case-based flows: the business opens a personal case first. */
  caseValues?: Record<string, string>;
}

const BUSINESSES: Business[] = [
  {
    id: 'flowers',
    icon: Flower2,
    label: 'חנות פרחים או מתנות',
    value: 'הזמנה ממותגת עם מחיר שמתעדכן',
    orgId: DEMO_ORG_IDS.bloom,
    slug: DEMO_SLUGS.flowers,
    name: 'Bloom Studio',
    points: ['בחירת סגנון, תקציב וצבעוניות בכרטיסים', 'כרטיס ברכה עם תצוגה חיה', 'משלוח וסכום מחושב — תשלום מדומה או "אחר כך"'],
  },
  {
    id: 'garage',
    icon: Car,
    label: 'מוסך או שירות טכני',
    value: 'הלקוח מאשר או דוחה כל פריט',
    orgId: DEMO_ORG_IDS.autocare,
    slug: DEMO_SLUGS.garage,
    name: 'AutoCare Garage',
    points: ['תיק אישי עם פרטי הרכב', 'אישור או דחייה לכל תיקון בנפרד, עם דחיפות', 'סכום מדויק ותיעוד ההחלטות — בלי תשלום'],
    caseValues: { customer_name: 'לקוח/ה בסיור', customer_phone: '050-555-0123', car_plate: '12-345-67', car_model: 'מאזדה 3 2021', advisor: 'אבי (דמו)' },
  },
  {
    id: 'events',
    icon: UtensilsCrossed,
    label: 'מסעדה או אירועים',
    value: 'הערכת מחיר ומקדמה רק אחרי אישור',
    orgId: DEMO_ORG_IDS.urban,
    slug: DEMO_SLUGS.events,
    name: 'Urban Table',
    points: ['מספר אורחים, תפריט ותוספות', 'שדה שמופיע רק לאירוע עסקי', 'מקדמה מדומה מתבקשת רק אחרי שהעסק מאשר'],
  },
  {
    id: 'booking',
    icon: UtensilsCrossed,
    label: 'הזמנת מקום או תורים',
    value: 'בקשה עד אישור, עם זמינות',
    orgId: DEMO_ORG_IDS.urban,
    slug: DEMO_SLUGS.booking,
    name: 'Urban Table',
    points: ['ימי פעילות ושעות מוצעות', 'זמינות לפי בקשות קודמות (בדפדפן זה)', 'בקשה → בבדיקה → מאושרת, וביטול על ידי הלקוח'],
  },
  {
    id: 'contest',
    icon: Trophy,
    label: 'הרשמה, חוגים ותחרויות',
    value: 'מסלולים, מקומות שנותרו ואישור הורה',
    orgId: DEMO_ORG_IDS.valley,
    slug: DEMO_SLUGS.contest,
    name: 'Valley Run',
    points: ['מסלולים עם מספר מקומות שנותרו', 'שלב אישור הורה רק מתחת לגיל 18', 'תשלום מדומה אופציונלי'],
  },
];

const STEPS = ['סוג העסק', 'התהליך', 'המותג שלכם', 'נסו כלקוח', 'מה העסק רואה'] as const;
const SWATCHES = ['#A8436A', '#2F5D50', '#22304A', '#A9502F', '#3D3BF3', '#0F5E7A'];
const TOUR_LOGO = 'ast_tour';

function Frame({ device, children }: { device: Device; children: ReactNode }) {
  return (
    <div data-fz-canvas>
      <DevicePreview device={device} height={device === 'desktop' ? 640 : 720}>
        {children}
      </DevicePreview>
    </div>
  );
}

export function Tour() {
  const { repo, switchOrg } = useRepo();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [biz, setBiz] = useState<Business | null>(null);
  const [device, setDevice] = useState<Device>('mobile');
  const [brand, setBrand] = useState<{ name: string; color?: string; preset?: ThemePresetId; logoUrl?: string; logoError?: string }>({ name: '' });
  const [caseRun, setCaseRun] = useState<WorkflowRun | null>(null);
  const [submitted, setSubmitted] = useState<WorkflowRun | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const pub = useRepoQuery((r) => (biz ? r.resolvePublic(biz.slug) : Promise.resolve(null)), [biz?.slug]);
  const owner = useRepoQuery(
    async (r) => (biz && step === 4 ? { runs: await r.listRuns(biz.orgId), workflows: await r.listWorkflows(biz.orgId) } : null),
    [biz?.orgId, step],
  );

  // Revoke the in-memory logo when it is replaced or the tour unmounts.
  useEffect(() => () => void (brand.logoUrl && URL.revokeObjectURL(brand.logoUrl)), [brand.logoUrl]);

  // Garage: a case is opened for the tour visitor (as the business would), then filled as the customer.
  useEffect(() => {
    if (step !== 3 || !biz?.caseValues || caseRun || !pub.data) return;
    repo.createCase(biz.orgId, pub.data.workflow.id, biz.caseValues, publicBaseUrl()).then(setCaseRun).catch(() => setCaseRun(null));
  }, [step, biz, caseRun, pub.data, repo]);

  const go = (n: number) => {
    setStep(n);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const config = useMemo(() => {
    if (!pub.data) return null;
    const c = structuredClone(pub.data.version.config);
    if (brand.name.trim()) c.branding = { ...c.branding, logoText: brand.name.trim().slice(0, 40) };
    return c;
  }, [pub.data, brand.name]);

  const theme: WorkflowTheme | null = useMemo(() => {
    if (!pub.data) return null;
    const base = structuredClone(brand.preset && brand.preset !== pub.data.version.design.presetId ? buildTheme(brand.preset) : pub.data.version.design);
    if (brand.color) base.palette = { ...base.palette, primary: brand.color };
    if (brand.logoUrl) base.logo = { ...base.logo, assetId: TOUR_LOGO, showName: true };
    return base;
  }, [pub.data, brand]);
  const assets: Record<string, string> = brand.logoUrl ? { [TOUR_LOGO]: brand.logoUrl } : {};

  const pick = (b: Business) => {
    setBiz(b);
    setBrand({ name: '' });
    setCaseRun(null);
    setSubmitted(null);
    go(1);
  };

  const preview = config && theme && biz && (
    <WorkflowRenderer
      key={`${biz.id}-${theme.presetId}-${device}`}
      config={config}
      theme={theme}
      assets={assets}
      mode="preview"
      embedded
      scrollFrame
      getOptionUsage={hasOptionCapacity(config) ? () => repo.getOptionUsage(biz.slug) : undefined}
    />
  );

  return (
    <div className="bg-cloud">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div ref={top} className="scroll-mt-20">
          <p className="text-sm font-medium text-orange-700">סיור מודרך · כ-2 דקות</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">כך זה ייראה אצלכם</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">הסיור רץ בדפדפן שלכם בלבד. בקשה שתשלחו נשמרת כאן כדי שתראו איך היא מגיעה לעסק — היא לא נשלחת לאף אחד.</p>
        </div>

        <ol className="mt-6 grid grid-cols-5 gap-1.5" aria-label="שלבי הסיור">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                disabled={i > 0 && !biz}
                onClick={() => go(i)}
                aria-current={step === i ? 'step' : undefined}
                className={cx(
                  'w-full border-t-[3px] pt-2 text-start text-[11px] font-medium transition sm:text-sm disabled:cursor-not-allowed',
                  step === i ? 'border-orange text-ink' : i < step ? 'border-midnight text-ink-muted' : 'border-cloud-300 text-ink-soft',
                )}
              >
                <span className="tabular-nums">{i + 1}.</span> <span className="hidden sm:inline">{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm font-semibold sm:hidden">{STEPS[step]}</p>

        {step === 0 && (
          <section className="mt-8" aria-labelledby="t-biz">
            <h2 id="t-biz" className="text-xl font-semibold">
              איזה עסק יש לכם?
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESSES.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => pick(b)}
                    className="group flex h-full w-full items-start gap-3 rounded-2xl border border-cloud-200 bg-white p-5 text-start shadow-card transition hover:-translate-y-0.5 hover:border-ink-soft hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                      <b.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{b.label}</span>
                      <span className="mt-1 block text-sm text-ink-muted">{b.value}</span>
                    </span>
                    <ArrowLeft className="ms-auto mt-1 h-4 w-4 shrink-0 text-ink-soft transition group-hover:-translate-x-1 group-hover:text-orange-700" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-muted">
              העסק שלכם לא ברשימה?{' '}
              <Link to="/app/workflows/new" className="font-medium text-orange-700 hover:underline">
                תארו אותו במילים ונבנה תהליך
              </Link>
            </p>
          </section>
        )}

        {step > 0 && biz && (pub.loading || !config || !theme) && (pub.error ? <ErrorState error={pub.error} onRetry={pub.reload} /> : <Spinner />)}

        {step === 1 && biz && config && theme && (
          <section className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="t-flow">
            <div>
              <h2 id="t-flow" className="text-xl font-semibold">
                {config.title}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{biz.name} · דוגמה מלאה שנוצרה מתבנית אמיתית — ואפשר לערוך כל חלק בה.</p>
              <ul className="mt-5 space-y-3">
                {biz.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-[15px]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-xl border border-cloud-200 bg-white p-3 text-xs leading-relaxed text-ink-muted">
                לא טופס גנרי: אותו מנוע מציג כל עסק בשפה עיצובית משלו — <strong className="font-medium text-ink">{PRESETS[theme.presetId].meta.nameHe}</strong> כאן.
              </p>
              <div className="mt-6 flex gap-2">
                <Button onClick={() => go(2)}>
                  להתאמת המותג <ArrowLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" onClick={() => go(0)}>
                  <ArrowRight className="h-4 w-4" aria-hidden /> סוג עסק אחר
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-end">
                <DeviceToggle device={device} onChange={setDevice} />
              </div>
              <Frame device={device}>{preview}</Frame>
            </div>
          </section>
        )}

        {step === 2 && biz && config && theme && (
          <section className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="t-brand">
            <div className="space-y-5">
              <div>
                <h2 id="t-brand" className="text-xl font-semibold">
                  המותג שלכם, בשניות
                </h2>
                <p className="mt-1 text-sm text-ink-muted">השינויים כאן הם לתצוגה בסיור בלבד. בערכת המותג אפשר לשמור אותם לכל התהליכים.</p>
              </div>
              <div>
                <FieldLabel htmlFor="t-name">שם העסק</FieldLabel>
                <Input id="t-name" value={brand.name} maxLength={40} placeholder={biz.name} onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">לוגו</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-cloud-300 bg-white px-4 text-sm font-medium hover:border-ink-soft focus-within:ring-2 focus-within:ring-orange">
                    <ImagePlus className="h-4 w-4" aria-hidden />
                    {brand.logoUrl ? 'החלפת לוגו' : 'העלאת לוגו'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="sr-only"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try {
                          const img = await prepareImage(file, 'logo');
                          const blob = await (await fetch(img.dataUrl)).blob();
                          setBrand((b) => ({ ...b, logoUrl: URL.createObjectURL(blob), logoError: undefined }));
                        } catch (err) {
                          setBrand((b) => ({ ...b, logoError: err instanceof Error ? err.message : 'לא ניתן לקרוא את התמונה' }));
                        }
                      }}
                    />
                  </label>
                  {brand.logoUrl && (
                    <Button variant="ghost" icon={X} onClick={() => setBrand((b) => ({ ...b, logoUrl: undefined }))}>
                      הסרה
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">{brand.logoError ?? 'הלוגו נשאר בדפדפן שלכם בלבד ונמחק כשעוזבים את הסיור.'}</p>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">צבע ראשי</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`צבע ${c}`}
                      aria-pressed={brand.color === c}
                      onClick={() => setBrand((b) => ({ ...b, color: c }))}
                      className={cx('h-9 w-9 rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', brand.color === c ? 'ring-2 ring-midnight' : 'ring-1 ring-black/10')}
                      style={{ background: c }}
                    />
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input type="color" value={brand.color ?? theme.palette.primary} onChange={(e) => setBrand((b) => ({ ...b, color: e.target.value.toUpperCase() }))} className="h-9 w-10 cursor-pointer rounded-lg border border-cloud-300 bg-white p-0.5" aria-label="בחירת צבע מותאם" />
                    מותאם
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">סגנון עיצוב</legend>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סגנון עיצוב">
                  {PRESET_LIST.map((p) => {
                    const active = (brand.preset ?? pub.data!.version.design.presetId) === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setBrand((b) => ({ ...b, preset: p.id }))}
                        className={cx('inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm', active ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:border-ink-soft')}
                      >
                        <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: PRESETS[p.id].theme.palette.primary }} aria-hidden />
                        {p.nameHe}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => go(3)}>
                  לנסות כלקוח <ArrowLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" onClick={() => setBrand({ name: '' })}>
                  איפוס
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-end">
                <DeviceToggle device={device} onChange={setDevice} />
              </div>
              <Frame device={device}>{preview}</Frame>
            </div>
          </section>
        )}

        {step === 3 && biz && config && theme && pub.data && (
          <section className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]" aria-labelledby="t-try">
            <div>
              <h2 id="t-try" className="text-xl font-semibold">
                מלאו את התהליך כמו לקוח
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {biz.caseValues ? 'העסק פתח לכם תיק אישי. אשרו או דחו תיקונים ושלחו.' : 'בחרו, מלאו ושלחו. בשלב הבא תראו איך הבקשה מגיעה לעסק.'}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>· אין תשלום אמיתי: כל תשלום הוא כפתור סימולציה מסומן.</li>
                <li>· ההודעות ללקוח ולעסק מוצגות כתצוגה בלבד ולא נשלחות.</li>
              </ul>
              <Button variant="ghost" className="mt-4" onClick={() => go(4)}>
                דלגו לתצוגת העסק <ArrowLeft className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="overflow-hidden rounded-3xl border border-cloud-200 bg-white" data-fz-canvas>
              {biz.caseValues && !caseRun ? (
                <Spinner label="פותחים תיק…" />
              ) : submitted ? (
                <div className="p-8 text-center">
                  <PartyPopper className="mx-auto h-8 w-8 text-orange-700" aria-hidden />
                  <p className="mt-3 font-semibold">נשלח! מספר הבקשה {submitted.reference}</p>
                  <Button className="mt-4" onClick={() => go(4)}>
                    לראות מה העסק מקבל <ArrowLeft className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <WorkflowRenderer
                  key={`${biz.id}-live-${caseRun?.id ?? ''}`}
                  config={config}
                  theme={theme}
                  assets={assets}
                  mode="live"
                  embedded
                  caseAnswers={caseRun?.caseAnswers}
                  getAvailability={config.booking?.enabled ? (date) => repo.getBookingAvailability(biz.slug, date) : undefined}
                  getOptionUsage={hasOptionCapacity(config) ? () => repo.getOptionUsage(biz.slug) : undefined}
                  onSubmit={async (values, consent, { payNow }) => {
                    const run = await repo.submitRun(biz.slug, { values, consent, payNow, runId: caseRun?.id });
                    setSubmitted(run);
                    go(4);
                  }}
                />
              )}
            </div>
          </section>
        )}

        {step === 4 && biz && (
          <section className="mt-8 space-y-6" aria-labelledby="t-owner">
            <div>
              <h2 id="t-owner" className="text-xl font-semibold">
                ככה העסק מקבל את זה
              </h2>
              <p className="mt-1 text-sm text-ink-muted">תיבת בקשות אחת עם סטטוסים, החלטות, סכומים ופעולות. בסיור הנתונים קיימים רק בדפדפן הזה.</p>
            </div>
            {owner.loading || !owner.data ? (
              <Spinner />
            ) : (
              (() => {
                const wf = owner.data.workflows.find((w) => w.slug === biz.slug);
                const own = owner.data.runs.filter((r) => r.workflowId === wf?.id);
                const outcome = wf ? workflowOutcome(wf.draft, own) : null;
                const mine = submitted ? owner.data.runs.find((r) => r.id === submitted.id) : undefined;
                return (
                  <>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <Card className="p-5">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <Inbox className="h-4 w-4 text-orange-700" aria-hidden /> {mine ? 'הבקשה שלכם' : 'בקשה לדוגמה'}
                        </p>
                        {(mine ?? own[0]) && (
                          <>
                            <p className="mt-3 text-lg font-semibold">
                              <bdi>{(mine ?? own[0])!.reference}</bdi> · {(mine ?? own[0])!.customerName || 'לקוח/ה'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <StatusBadge status={(mine ?? own[0])!.status} />
                              <PaymentBadge payment={(mine ?? own[0])!.payment} runStatus={(mine ?? own[0])!.status} />
                              {!mine && <Badge tone="amber">דמו</Badge>}
                            </div>
                            <dl className="mt-3 space-y-1 text-sm">
                              <div className="flex gap-1.5">
                                <dt className="text-ink-muted">מהתהליך:</dt>
                                <dd className="font-medium">{wf?.draft.title}</dd>
                              </div>
                              {(mine ?? own[0])!.submittedAt && (
                                <div className="flex gap-1.5">
                                  <dt className="text-ink-muted">התקבלה:</dt>
                                  <dd>{formatRelative((mine ?? own[0])!.submittedAt!)}</dd>
                                </div>
                              )}
                              {ownerActions((mine ?? own[0])!.status)[0] && (
                                <div className="flex gap-1.5">
                                  <dt className="text-ink-muted">הצעד הבא של העסק:</dt>
                                  <dd className="font-medium">{ownerActions((mine ?? own[0])!.status).map((a) => a.label).slice(0, 3).join(' · ')}</dd>
                                </div>
                              )}
                            </dl>
                            <Button
                              className="mt-4"
                              variant="dark"
                              onClick={async () => {
                                await switchOrg(biz.orgId);
                                navigate(`/app/requests/${(mine ?? own[0])!.id}`);
                              }}
                            >
                              פתיחה בלוח הבקרה <ArrowLeft className="h-4 w-4" aria-hidden />
                            </Button>
                          </>
                        )}
                      </Card>
                      {outcome && (
                        <Card className="p-5">
                          <p className="text-sm font-semibold">המדד שחשוב לתהליך הזה</p>
                          <p className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-semibold tabular-nums">{formatNumber(outcome.primary.value)}</span>
                            <span className="text-sm text-ink-muted">{outcome.primary.label}</span>
                          </p>
                          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                            {outcome.secondary.map((m) => (
                              <div key={m.label} className="flex gap-1">
                                <dt>{m.label}:</dt>
                                <dd className="font-medium text-ink tabular-nums">{m.value}</dd>
                              </div>
                            ))}
                          </dl>
                          <p className="mt-3 text-xs text-ink-soft">כולל נתוני דמו בדיוניים. כל תהליך נמדד לפי המטרה שלו — לא כל תהליך הוא מכירה.</p>
                        </Card>
                      )}
                    </div>
                    <Card className="overflow-hidden">
                      <p className="border-b border-cloud-200 px-4 py-3 text-sm font-semibold">בקשות אחרונות · {biz.name}</p>
                      <RunsTable runs={own.slice(0, 5)} workflows={owner.data.workflows} />
                    </Card>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          await switchOrg(biz.orgId);
                          navigate(wf ? `/app/workflows/${wf.id}` : '/app/workflows');
                        }}
                      >
                        עריכת התהליך בסטודיו
                      </Button>
                      <Button variant="ghost" onClick={() => go(0)}>
                        סיור עם סוג עסק אחר
                      </Button>
                    </div>
                  </>
                );
              })()
            )}
            <Card className="p-5 sm:p-6">
              <h3 className="text-lg font-semibold">מה RockStack מקימה עבורכם</h3>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {['אפיון התהליכים של העסק — הזמנות, אישורים, תורים או הרשמות', 'מיתוג מלא: צבעים, גופן, לוגו, תמונות וקישורים עסקיים', 'שאלות, מחירים ותנאים שמתאימים בדיוק לשירות שלכם', 'לוח בקרה לניהול הבקשות, וליווי אחרי העלייה לאוויר'].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-muted">
                חבילות מ-399 ₪ לחודש + 990 ₪ הקמה, לפני מע״מ.{' '}
                <Link to="/pricing" className="font-medium text-orange-700 underline underline-offset-2">
                  לפרטי החבילות
                </Link>
              </p>
            </Card>
            <InterestCTA dark business={biz.label} name={brand.name.trim() || undefined} />
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
