/**
 * Interactive landing sections. Both use the REAL renderer components and
 * theme engine — no screenshots, no mockups.
 */
import { CalendarCheck, CircleSlash, FileText, ShieldCheck, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../components/ui';
import type { CompletionMode, WorkflowConfig } from '../domain/schema';
import type { BrandKit } from '../domain/theme';
import { COMPLETION_LABELS } from '../engine/completion';
import { computePrice } from '../engine/pricing';
import { TEMPLATES } from '../engine/templates';
import { CheckoutPanel } from '../renderer/parts';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import { effectiveTheme } from '../theme/brand';
import { buildTheme } from '../theme/presets';
import { ThemeScope } from '../theme/ThemeScope';
import { DevicePreview } from './app/editor/DevicePreview';
import { DEMO_ORG_IDS } from '../data/seed';
import { showcaseAssets, showcaseId } from '../data/showcase';
import { assetSrc } from '../lib/links';

const SWATCHES = [
  { name: 'יין', primary: '#8E2F4F', accent: '#E7B7A3', secondary: '#7E8F72', background: '#FAF4EF' },
  { name: 'יער', primary: '#2F5D50', accent: '#D9B26F', secondary: '#4A3F35', background: '#F3F1EA' },
  { name: 'לילה', primary: '#22304A', accent: '#E3843C', secondary: '#55627A', background: '#F1F3F7' },
  { name: 'טרקוטה', primary: '#A9502F', accent: '#D3A15A', secondary: '#3F2A21', background: '#F5EEE4' },
];

// Photos of the demo flower studio (CC0, public/showcase), used as this sample's own images.
const COVER = showcaseId(DEMO_ORG_IDS.bloom, 'cover');
const PHOTO: Record<string, string> = { round: showcaseId(DEMO_ORG_IDS.bloom, 'roses'), garden: showcaseId(DEMO_ORG_IDS.bloom, 'garden'), tall: showcaseId(DEMO_ORG_IDS.bloom, 'tall') };
const SHOWCASE_URLS = Object.fromEntries(showcaseAssets(DEMO_ORG_IDS.bloom).map((a) => [a.id, assetSrc(a.dataUrl)]));

/** Live brand customization on a real workflow. */
export function BrandShowcase() {
  const [swatch, setSwatch] = useState(0);
  const [placement, setPlacement] = useState<BrandKit['logoPlacement']>('start');
  const [decor, setDecor] = useState(true);
  const config = useMemo(() => {
    const c = TEMPLATES.flower_order.build();
    c.branding.logoText = 'הסטודיו של נועה';
    // Real photos on the choice cards, so the colour change is seen on a real-looking form.
    const style = c.steps.flatMap((st) => st.fields).find((f) => f.key === 'bouquet_style');
    style?.options?.forEach((o) => (o.image = PHOTO[o.value] ?? o.image));
    if (style) style.appearance = 'image_cards';
    return c;
  }, []);
  const s = SWATCHES[swatch]!;
  const kit: BrandKit = {
    displayName: 'הסטודיו של נועה',
    description: '',
    palette: { primary: s.primary, secondary: s.secondary, accent: s.accent, background: s.background },
    typography: 'editorial',
    button: 'pill',
    density: 'comfortable',
    logoPlacement: placement,
    decorations: decor,
    personality: 'floral_boutique',
    links: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const theme = effectiveTheme({ ...buildTheme('floral_boutique'), hero: { ...buildTheme('floral_boutique').hero, coverAssetId: COVER }, media: { coverStyle: 'panel', tone: 'natural' }, inheritBrand: true }, kit);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-midnight">המותג שלכם, בכל תהליך</h2>
        <p className="mt-3 max-w-md leading-relaxed text-ink-muted">ערכת מותג אחת לעסק — צבעים, גופן, לוגו, כפתורים ותמונות — וכל תהליך יורש אותה. גרסאות שכבר פורסמו לא משתנות עד הפרסום הבא.</p>
        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-medium">צבעי מותג</legend>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((sw, i) => (
              <button
                key={sw.name}
                type="button"
                aria-pressed={swatch === i}
                onClick={() => setSwatch(i)}
                className={cx('flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition', swatch === i ? 'border-midnight bg-white shadow-card' : 'border-cloud-300 bg-white/60 hover:border-ink-soft')}
              >
                <span className="flex -space-x-1 space-x-reverse" aria-hidden>
                  {[sw.primary, sw.accent, sw.secondary].map((c) => (
                    <span key={c} className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: c }} />
                  ))}
                </span>
                {sw.name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">מיקום הלוגו</legend>
          <div className="flex gap-1.5">
            {(
              [
                ['start', 'בצד'],
                ['center', 'במרכז'],
                ['hidden', 'מוסתר'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={placement === v} onClick={() => setPlacement(v)} className={cx('min-h-[40px] rounded-lg border px-3 text-sm', placement === v ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted')}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="mt-5 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={decor} onChange={(e) => setDecor(e.target.checked)} />
          סימנים גרפיים בפתיח (כבוי = נקי לגמרי)
        </label>
        <Link to="/app/brand" className="mt-6 inline-block text-sm font-medium text-orange-700 hover:underline">
          לערכת המותג בדמו ←
        </Link>
      </div>
      <DevicePreview device="mobile" height={600}>
        <WorkflowRenderer config={config} theme={theme} assets={SHOWCASE_URLS} mode="preview" embedded scrollFrame />
      </DevicePreview>
    </div>
  );
}

const MODES: { mode: CompletionMode; icon: typeof Wallet }[] = [
  { mode: 'request', icon: CircleSlash },
  { mode: 'quote', icon: FileText },
  { mode: 'pay_after_approval', icon: ShieldCheck },
  { mode: 'deposit', icon: CalendarCheck },
  { mode: 'calculated', icon: Wallet },
];

/** Payment is optional and independent from pricing — shown with the real checkout panel. */
export function CompletionShowcase() {
  const [mode, setMode] = useState<CompletionMode>('request');
  const config: WorkflowConfig = useMemo(() => {
    const c = TEMPLATES.restaurant_event.build();
    c.completion =
      mode === 'deposit'
        ? { mode, depositPercent: 20, depositTiming: 'after_approval' }
        : mode === 'calculated'
          ? { mode, allowPayLater: true }
          : { mode };
    return c;
  }, [mode]);
  const price = computePrice(config, { guests: 24, menu: 'chef', wine: true, extras: ['cake'] });
  const theme = buildTheme('hospitality_premium');
  const [payNow, setPayNow] = useState(true);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-midnight">לא כל תהליך הוא תשלום</h2>
        <p className="mt-3 max-w-md leading-relaxed text-ink-muted">חישוב המחיר ואיסוף הכסף נפרדים. בקשה בלי תשלום לא נראית כמו חשבונית פתוחה, ואישור עסק יכול לבוא לפני כל חיוב.</p>
        <div className="mt-6 grid gap-2" role="radiogroup" aria-label="אופן סיום לדוגמה">
          {MODES.map(({ mode: m, icon: Icon }) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cx('flex items-start gap-3 rounded-xl border p-3 text-start transition', mode === m ? 'border-midnight bg-white shadow-card' : 'border-cloud-300 bg-white/60 hover:border-ink-soft')}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{COMPLETION_LABELS[m].title}</span>
                <span className="block text-xs text-ink-muted">{COMPLETION_LABELS[m].description}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">חיבורי סליקה ישראליים (PayPlus, Cardcom, Tranzila, Grow ועוד) מופיעים בדמו כקטלוג עתידי בלבד — לא מחוברים.</p>
      </div>
      <ThemeScope theme={theme} className="fz-frame rounded-3xl p-5 sm:p-8">
        <div className="fz-card fz-pad space-y-4">
          <div className="fz-total">
            <span className="text-sm font-semibold">הערכת מחיר · 24 סועדים</span>
            <span className="fz-total-amount">{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(price.total)}</span>
          </div>
          <CheckoutPanel config={config} price={price} payNow={payNow} onPayNow={setPayNow} />
          <p className="fz-help">זה רכיב הסיום האמיתי שהלקוח רואה בשלב האחרון.</p>
        </div>
      </ThemeScope>
    </div>
  );
}
