/**
 * Public showcase: six art-directed themes, one schema-driven renderer.
 * Every preview is the real WorkflowRenderer in preview mode — nothing is a screenshot.
 */
import { ArrowLeft, Check, Cpu, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { ButtonLink, cx } from '../components/ui';
import type { RunAnswer, WorkflowConfig } from '../domain/schema';
import type { ThemePresetId } from '../domain/theme';
import { field, option, step, TEMPLATES } from '../engine/templates';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import { buildTheme, PRESET_LIST, PRESETS } from '../theme/presets';
import { PresetPreview } from '../theme/PresetPreview';
import { TYPOGRAPHY } from '../theme/tokens';
import { DevicePreview, DeviceToggle, type Device } from './app/editor/DevicePreview';

function workshop(): WorkflowConfig {
  return {
    title: 'הרשמה לסדנת צילום',
    description: 'שלוש שעות בקבוצה קטנה, עם מצלמה ביד ומנטור צמוד. בוחרים מסלול, רמה ומועד.',
    mode: 'public',
    caseFields: [],
    steps: [
      step('המסלול שלכם', [
        field('track', 'מסלול', 'radio', {
          required: true,
          options: [
            option('street', 'צילום רחוב', { price: 280, description: 'סיור צילום בשוק ובסמטאות' }),
            option('portrait', 'פורטרט בסטודיו', { price: 320, description: 'תאורה, הכוונה ועריכה' }),
            option('product', 'צילום מוצר', { price: 300, description: 'לחנויות אונליין ולרשתות' }),
          ],
        }),
        field('level', 'רמת ניסיון', 'radio', { required: true, options: [option('new', 'מתחילים'), option('mid', 'בינוניים'), option('pro', 'מתקדמים')] }),
        field('camera', 'השכרת מצלמה לסדנה', 'checkbox', { price: 90, helpText: 'מצלמה ועדשה קבועה, מוחזרות בסוף המפגש' }),
      ]),
      step('מועד ופרטים', [
        field('session_date', 'תאריך מועדף', 'date', { required: true, min: 3, max: 90, role: 'date' }),
        field('name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
        field('email', 'אימייל', 'email', { role: 'customer_email' }),
      ]),
    ],
    pricing: { enabled: true, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ להרשמה' },
    branding: { primaryColor: '#4B2FE0', logoText: 'סטודיו פריים' },
    consent: { required: true, text: 'אני מאשר/ת את פרטי ההרשמה. זהו דמו מקומי — לא מתבצע תשלום.' },
    successMessage: 'נרשמתם! נשלח אישור עם כל הפרטים.',
  };
}

const GARAGE_CASE: RunAnswer[] = [
  ['customer_name', 'שם הלקוח/ה', 'דנה שמיר'],
  ['car_plate', 'מספר רישוי', '84-219-63'],
  ['car_model', 'דגם הרכב', 'טויוטה יאריס 2020'],
  ['advisor', 'יועץ/ת שירות', 'אבי (דמו)'],
].map(([k, label, v]) => ({ fieldId: `case_${k}`, fieldKey: k!, label: label!, value: v!, displayValue: v! }));

type SampleKey = 'flowers' | 'garage' | 'events' | 'documents' | 'workshop' | 'quote';
const SAMPLES: { key: SampleKey; label: string; build: () => WorkflowConfig; preset: ThemePresetId; caseAnswers?: RunAnswer[] }[] = [
  { key: 'flowers', label: 'הזמנת פרחים', build: TEMPLATES.flower_order.build, preset: 'floral_boutique' },
  { key: 'garage', label: 'אישור תיקונים', build: TEMPLATES.garage_repairs.build, preset: 'automotive_precision', caseAnswers: GARAGE_CASE },
  { key: 'events', label: 'אירוע במסעדה', build: TEMPLATES.restaurant_event.build, preset: 'hospitality_premium' },
  { key: 'documents', label: 'איסוף מסמכים', build: TEMPLATES.document_collection.build, preset: 'corporate_modern' },
  { key: 'workshop', label: 'הרשמה לסדנה', build: workshop, preset: 'creative_studio' },
  { key: 'quote', label: 'בקשה להצעת מחיר', build: TEMPLATES.quote_request.build, preset: 'modern_minimal' },
];

export function Themes() {
  const [presetId, setPresetId] = useState<ThemePresetId>('floral_boutique');
  const [sampleKey, setSampleKey] = useState<SampleKey>('flowers');
  const [device, setDevice] = useState<Device>('desktop');
  // Build each sample once so option ids stay stable while browsing.
  const configs = useMemo(() => Object.fromEntries(SAMPLES.map((s) => [s.key, s.build()])) as Record<SampleKey, WorkflowConfig>, []);
  const theme = useMemo(() => buildTheme(presetId), [presetId]);
  const sample = SAMPLES.find((s) => s.key === sampleKey)!;
  const meta = PRESETS[presetId].meta;
  const mixed = sample.preset !== presetId;

  return (
    <div className="min-h-screen bg-cloud">
      <SiteHeader />
      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6">
          <p className="text-sm font-medium text-orange-700">גלריית עיצובים</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-midnight sm:text-5xl">שישה עיצובים. מנוע אחד.</h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
            כל תהליך ב-Formangle מקבל שפה עיצובית שמתאימה לעסק: קומפוזיציה, טיפוגרפיה, צורות ותנועה — לא רק צבע. כל התצוגות כאן הן הרנדרר האמיתי שרץ אצל הלקוחות, במצב תצוגה מקדימה.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-cloud-300 bg-white px-3 py-1.5 text-xs text-ink-muted">
            <Cpu className="h-3.5 w-3.5" aria-hidden /> בחירת העיצוב האוטומטית היא מקומית, לפי מילות מפתח
          </p>
        </section>

        <section aria-label="בחירת עיצוב" className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="עיצוב">
            {PRESET_LIST.map((p) => {
              const active = p.id === presetId;
              const pal = PRESETS[p.id].theme.palette;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setPresetId(p.id);
                    setSampleKey(SAMPLES.find((s) => s.preset === p.id)!.key);
                  }}
                  className={cx(
                    'group rounded-2xl border bg-white p-2.5 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                    active ? 'border-midnight ring-2 ring-midnight/15' : 'border-cloud-200',
                  )}
                >
                  <PresetPreview theme={buildTheme(p.id)} tall />
                  <span className="flex items-center gap-2 px-1.5 pt-3">
                    <span className="font-semibold text-ink">{p.nameHe}</span>
                    <span className="text-xs text-ink-soft" dir="ltr">
                      {p.name}
                    </span>
                    {active && <Check className="ms-auto h-4 w-4 text-midnight" aria-hidden />}
                  </span>
                  <span className="mt-1 block px-1.5 text-xs leading-relaxed text-ink-muted">{p.bestFor}</span>
                  <span className="mt-2.5 flex gap-1 px-1.5 pb-1" aria-hidden>
                    {[pal.primary, pal.accent, pal.secondary, pal.background, pal.text].map((c, i) => (
                      <span key={i} className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="תצוגה חיה" className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-midnight">
                {meta.nameHe} <span className="text-base font-normal text-ink-soft">· {TYPOGRAPHY[theme.typography].label}</span>
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{meta.description}</p>
            </div>
            <DeviceToggle device={device} onChange={setDevice} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <Shuffle className="h-3.5 w-3.5" aria-hidden /> אותו עיצוב, תוכן אחר:
            </span>
            {SAMPLES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={s.key === sampleKey}
                onClick={() => setSampleKey(s.key)}
                className={cx(
                  'min-h-[34px] rounded-full border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                  s.key === sampleKey ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:border-ink-soft hover:text-ink',
                )}
              >
                {s.label}
                {s.preset === presetId && ' ★'}
              </button>
            ))}
          </div>
          {mixed && <p className="mt-2 text-xs text-ink-muted">שילוב חופשי: התוכן נשאר אותו נתון, רק שכבת העיצוב מתחלפת. ★ = ההתאמה שהמנוע המקומי היה בוחר.</p>}

          <div className="mt-6 rounded-3xl bg-white/60 p-3 sm:p-5">
            <DevicePreview device={device} height={device === 'mobile' ? 760 : 680}>
              <WorkflowRenderer key={`${presetId}-${sampleKey}-${device}`} config={configs[sampleKey]} theme={theme} caseAnswers={sample.caseAnswers} mode="preview" embedded scrollFrame />
            </DevicePreview>
          </div>
          <p className="mt-3 text-center text-xs text-ink-soft">אפשר למלא ולנווט — שום דבר לא נשמר בתצוגה. האיורים הם איורים מקומיים להמחשה בלבד.</p>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl bg-midnight p-8 text-white sm:flex-row sm:items-center">
            <div>
              <p className="text-xl font-semibold">כתבו תיאור — קבלו תהליך עם עיצוב מתאים</p>
              <p className="mt-1 text-sm text-white/70">אפשר להחליף עיצוב, צבעים, גופנים ותמונות בלשונית ״עיצוב״ בעורך.</p>
            </div>
            <ButtonLink to="/app/workflows/new" icon={ArrowLeft}>
              יצירת תהליך
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
