import {
  ArrowLeft,
  Briefcase,
  Car,
  Mail,
  UserRound,
  Check,
  Flower2,
  GitBranch,
  History,
  Inbox,
  Trophy,
  Calculator,
  ShieldCheck,
  Smartphone,
  UtensilsCrossed,
  Wand2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LocalGenerationNotice } from '../components/Brand';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { StatusBadge } from '../components/StatusBadge';
import { Button, ButtonLink, Card, cx, DemoBadge } from '../components/ui';
import { useRepoQuery } from '../data/store';
import { InterestCTA } from '../components/Interest';
import { DEMO_GARAGE_CASE_ID, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { EXAMPLE_PROMPTS, generateWorkflowFromPrompt, type GenerationResult } from '../engine/generator';
import { formatCurrency, formatRelative } from '../lib/format';
import { demoRequestMailto, PRICING_TERMS } from '../lib/plans';
import { PackageCards, PricingFinePrint } from '../components/Packages';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import type { ThemePresetId } from '../domain/theme';
import { HeroArt } from '../theme/art';
import { BrandShowcase, CompletionShowcase } from './LandingShowcase';
import { buildTheme, PRESET_LIST, PRESETS } from '../theme/presets';
import { ThemeScope } from '../theme/ThemeScope';

/** The story in three roles: who does what. */
const STORY = [
  { icon: UserRound, who: 'הלקוח', title: 'ממלא בנייד, בחוויה של המותג שלכם', text: 'בוחר שירות, תאריך או חבילה, רואה מחיר מדויק ומאשר — בלי שיחות הלוך-חזור.' },
  { icon: Inbox, who: 'העסק', title: 'מקבל בקשה מסודרת במקום אחד', text: 'כל הפרטים שהלקוח מילא, סטטוס ברור, ואישור, דחייה או בקשת שינויים בלחיצה.' },
  { icon: Briefcase, who: 'RockStack', title: 'מאפיינת, מקימה ומלווה', text: 'אנחנו בונים את התהליכים, המיתוג והקישורים בשבילכם — ומתאימים כשהעסק משתנה.' },
];

const EXAMPLES = [
  { icon: Flower2, name: 'Bloom Studio', title: 'הזמנת זר פרחים', text: 'תקציב, צבעוניות, ברכה עם תצוגת כרטיס, אריזה ומשלוח — עם סכום מחושב.', href: `/f/${DEMO_SLUGS.flowers}`, preset: 'floral_boutique' as ThemePresetId },
  { icon: Car, name: 'AutoCare', title: 'אישור תיקונים לרכב', text: 'הלקוח מאשר או דוחה כל תיקון בנפרד ורואה סכום מדויק.', href: `/f/${DEMO_SLUGS.garage}?r=${DEMO_GARAGE_CASE_ID}`, preset: 'automotive_precision' as ThemePresetId },
  { icon: UtensilsCrossed, name: 'Urban Table', title: 'אירוע פרטי במסעדה', text: 'תאריך, אורחים, תפריט ותוספות, הערכת מחיר ומקדמה רק אחרי אישור.', href: `/f/${DEMO_SLUGS.events}`, preset: 'hospitality_premium' as ThemePresetId },
  { icon: UtensilsCrossed, name: 'Urban Table', title: 'הזמנת שולחן', text: 'תאריך, שעה וסועדים. בקשה עד אישור המסעדה — בלי תשלום מראש.', href: `/f/${DEMO_SLUGS.booking}`, preset: 'hospitality_premium' as ThemePresetId },
  { icon: Trophy, name: 'Valley Run', title: 'הרשמה למרוץ', text: 'מסלולים עם מקומות שנותרו, אישור הורה רק לקטינים ותשלום מדומה אופציונלי.', href: `/f/${DEMO_SLUGS.contest}`, preset: 'creative_studio' as ThemePresetId },
];

const BENEFITS = [
  { icon: Smartphone, title: 'פחות שיחות, יותר הזמנות סגורות', text: 'הלקוח עונה על הכול בשלבים קצרים בנייד, והפנייה מגיעה אליכם שלמה.' },
  { icon: Calculator, title: 'מחיר ברור עוד לפני השיחה', text: 'אפשרויות, תוספות, מחיר לאורח ועמלות — הלקוח רואה סכום מדויק בזמן אמת.' },
  { icon: Wand2, title: 'נראה כמו העסק שלכם', text: 'צבעים, גופן, לוגו, תמונות וקישורים עסקיים — כל תהליך מרגיש כמו המותג.' },
  { icon: GitBranch, title: 'שואלים רק מה שצריך', text: 'שאלה שמופיעה רק כשהיא רלוונטית, כמו שם חברה לאירוע עסקי.' },
  { icon: History, title: 'כל בקשה מתועדת', text: 'סטטוס, ציר זמן והגרסה המדויקת שהלקוח ראה ברגע השליחה.' },
  { icon: ShieldCheck, title: 'בלי הפתעות', text: 'בדמו הכול מסומן: נתוני דמו, סימולציות והודעות שלא נשלחות.' },
];

const FAQ = [
  ['מי מקים את המערכת?', 'RockStack. אנחנו מאפיינים יחד אתכם את התהליכים, מקימים אותם עם המיתוג והקישורים של העסק, בודקים ומלווים. אין הרשמה עצמית באתר.'],
  ['איך נוצר תהליך מתיאור?', 'מנוע מקומי מזהה מילות מפתח בעברית וממפה את התיאור לתבנית אמיתית שאפשר לערוך. הכול רץ בדפדפן, בלי שירות חיצוני בתשלום.'],
  ['איפה נשמרים הנתונים?', 'ב-localStorage של הדפדפן שלכם בלבד. אין שרת, אין חשבון ואין סנכרון בין מכשירים. קישור שנפתח בדפדפן אחר לא יראה את הנתונים.'],
  ['האם מתבצעים תשלומים או נשלחות הודעות?', 'לא. מקדמות, הודעות SMS, WhatsApp ואימייל הן סימולציות שמוצגות כתצוגה מקדימה בלבד.'],
  ['האם אישור במוסך מחייב משפטית?', 'לא. אישור בדמו נשמר מקומית, ללא חתימה אלקטרונית וללא תוקף משפטי. החלטות בטיחות מחייבות התייעצות עם איש מקצוע.'],
  ['אפשר להתאים את התהליך לעסק שלי?', 'כן. כותרות, שלבים, שדות, סוגי שדות, חובה, אפשרויות, מחירים, סדר, מיתוג ותנאים פשוטים — הכול ניתן לעריכה.'],
  ['כמה זה עולה?', 'Business: 399 ₪ לחודש + 990 ₪ הקמה. Business Plus: 499 ₪ לחודש + 1,490 ₪ הקמה. Enterprise: הצעת מחיר מותאמת. כל המחירים לפני מע״מ, והם מחירי חבילות מוצעים בכפוף לאפיון. אינטגרציות ופיתוח מותאם מתומחרים בנפרד.'],
];

function LivePromptDemo() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]!);
  const [result, setResult] = useState<GenerationResult>(() => generateWorkflowFromPrompt(EXAMPLE_PROMPTS[0]!));
  const [version, setVersion] = useState(0);
  const run = (p = prompt) => {
    if (p.trim().length < 4) return;
    setResult(generateWorkflowFromPrompt(p));
    setVersion((v) => v + 1);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-cloud-200 bg-white shadow-lift">
      <div className="flex items-center gap-1.5 border-b border-cloud-200 bg-cloud px-4 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-cloud-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-cloud-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-cloud-300" />
        <span className="ms-3 text-xs text-ink-soft ltr">Formangle · builder</span>
      </div>
      <div className="grid gap-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3 border-b border-cloud-200 p-5 md:border-b-0 md:border-e">
          <p className="text-[15px] font-semibold leading-snug text-ink">מתארים את הצורך — ומקבלים תהליך מוכן לעריכה.</p>
          <LocalGenerationNotice />
          <label htmlFor="hero-prompt" className="block text-sm font-medium">
            מה הלקוחות שלכם צריכים לעשות?
          </label>
          <textarea
            id="hero-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && run()}
            rows={4}
            maxLength={500}
            className="fz-input w-full resize-none rounded-xl border border-cloud-300 p-3 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.slice(0, 3).map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPrompt(p);
                  run(p);
                }}
                className={cx('min-h-[32px] rounded-full border px-3 py-1 text-xs transition', prompt === p ? 'border-orange-700 bg-orange-50 text-orange-700' : 'border-cloud-300 text-ink-muted hover:border-ink-soft')}
              >
                {['פרחים', 'מוסך', 'מסעדה'][i]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button icon={Wand2} onClick={() => run()}>
              יצירה
            </Button>
            <Button variant="secondary" onClick={() => navigate('/app/workflows/new', { state: { prompt } })}>
              פתיחה בבונה <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="text-xs text-ink-muted" aria-live="polite">
            זוהה: <span className="font-medium text-ink">{result.templateLabel}</span> · {result.config.steps.length} שלבים · עיצוב{' '}
            <span className="font-medium text-ink">{PRESETS[result.theme.presetId].meta.nameHe}</span>
          </p>
        </div>
        <div data-fz-scroll className="max-h-[560px] overflow-y-auto">
          <WorkflowRenderer key={version} config={result.config} theme={result.theme} mode="preview" embedded scrollFrame />
        </div>
      </div>
    </div>
  );
}

function InboxPreview() {
  const q = useRepoQuery(async (r) => {
    await r.init();
    const [runs, workflows] = await Promise.all([r.listRuns(DEMO_ORG_IDS.bloom), r.listWorkflows(DEMO_ORG_IDS.bloom)]);
    return { runs: runs.filter((x) => x.submittedAt).slice(0, 4), workflows };
  }, []);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-cloud-200 px-5 py-3">
        <span className="font-semibold">בקשות · Bloom Studio</span>
        <DemoBadge />
      </div>
      <ul className="divide-y divide-cloud-200">
        {(q.data?.runs ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cloud text-sm font-semibold">{r.customerName.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.customerName}</p>
              <p className="text-xs text-ink-muted">
                <span className="ltr">{r.reference}</span> · {formatRelative(r.submittedAt!)}
              </p>
            </div>
            <span className="text-sm tabular-nums">{formatCurrency(r.total)}</span>
            <StatusBadge status={r.status} />
          </li>
        ))}
        {q.loading && <li className="px-5 py-6 text-center text-sm text-ink-muted">טוען…</li>}
      </ul>
      <div className="border-t border-cloud-200 px-5 py-3 text-end">
        <Link to="/app/requests" className="text-sm font-medium text-orange-700 hover:underline">
          פתיחת תיבת הבקשות
        </Link>
      </div>
    </Card>
  );
}

export function Landing() {
  return (
    <div className="bg-white">
      <SiteHeader />
      <main id="main">
        <section className="relative overflow-hidden border-b border-cloud-200 bg-cloud">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-20">
            <div>
              <p className="text-sm font-medium text-orange-700">Formangle by RockStack · לכל עסק יש את הזווית שלו.</p>
              <h1 className="mt-3 text-[32px] font-semibold leading-[1.15] tracking-tight text-midnight sm:text-[44px] xl:text-[48px]">
                כל הפניות והתהליכים של העסק.
                <span className="mt-1 block text-midnight-600">בחוויה אחת שמרגישה כמו המותג שלכם.</span>
              </h1>
              <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-muted">הזמנות, אישורים, תיאום שירות וקליטת לקוחות — בתהליך דיגיטלי ממותג, עם ניהול מסודר במקום אחד.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink to="/tour" size="lg">
                  צפו בהדגמה
                </ButtonLink>
                <a
                  href={demoRequestMailto()}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-5 text-[15px] font-medium text-ink transition hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
                >
                  <Mail className="h-4 w-4" aria-hidden /> תיאום הדגמה לעסק
                </a>
              </div>
              <ul className="mt-7 grid gap-2 text-[13px] text-ink-muted sm:grid-cols-2">
                {['RockStack מקימה ומתאימה עבורכם', 'עובד מצוין בנייד', 'כל בקשה מגיעה ללוח בקרה אחד', 'ההדגמה רצה מקומית, בלי הרשמה'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 shrink-0 text-teal" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <LivePromptDemo />
          </div>
        </section>

        <section id="how" className="scroll-mt-16 bg-midnight py-20 text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">מהבקשה של הלקוח — לטיפול מסודר אצלכם</h2>
            <p className="mt-2 max-w-xl text-white/65">בלי טפסים מפוזרים, צילומי מסך ושיחות הלוך-חזור. שלושה תפקידים, תהליך אחד.</p>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STORY.map((s, i) => (
                <li key={s.who} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-orange">
                      <s.icon className="h-5 w-5" aria-hidden /> {s.who}
                    </span>
                    <span className="text-sm tabular-nums text-white/40">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm text-white/65">
              רוצים לראות את זה קורה?{' '}
              <Link to="/tour" className="font-medium text-white underline underline-offset-4 hover:text-orange">
                ההדגמה המודרכת לוקחת כשתי דקות
              </Link>
              .
            </p>
          </div>
        </section>

        <section id="examples" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-midnight">דוגמאות חיות</h2>
                <p className="mt-2 text-ink-muted">אותו מנוע — הזמנה, אישור תיקונים, אירוע והזמנת שולחן — כל אחד בשפה העיצובית שלו. מלאו ושלחו, והבקשה תופיע בלוח הבקרה.</p>
              </div>
              <DemoBadge className="self-start sm:self-auto" />
            </div>
            {/* Editorial 2 + 3 grid on desktop: the two flagship flows get wider cards. */}
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
              {EXAMPLES.map((e, i) => (
                <li key={e.title} className={i < 2 ? 'lg:col-span-3' : i === EXAMPLES.length - 1 && EXAMPLES.length % 2 === 1 ? 'sm:col-span-2 lg:col-span-2' : 'lg:col-span-2'}>
                  <Link to={e.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-cloud-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                    <ThemeScope theme={buildTheme(e.preset)} className="relative h-36 overflow-hidden" style={{ background: 'var(--fz-hero-bg)', color: 'var(--fz-hero-text)' }}>
                      <HeroArt decoration={PRESETS[e.preset].theme.decoration} className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-[1.04]" />
                      {/* Scrim: the artwork never sits behind the title text. */}
                      <div className="relative flex h-full flex-col justify-end p-5" style={{ background: 'linear-gradient(to top, var(--fz-hero-bg) 34%, color-mix(in srgb, var(--fz-hero-bg) 70%, transparent) 62%, transparent)' }}>
                        <span className="text-[11px] font-medium opacity-75">{e.name}</span>
                        <span className="fz-display mt-0.5 text-[calc(1.35rem*var(--fz-display-scale))] leading-tight">{e.title}</span>
                      </div>
                    </ThemeScope>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="flex-1 text-sm leading-relaxed text-ink-muted">{e.text}</p>
                      <span className="mt-4 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700">
                          פתיחת התהליך <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" aria-hidden />
                        </span>
                        <span className="rounded-full bg-cloud px-2.5 py-1 text-[11px] text-ink-muted">{PRESETS[e.preset].meta.nameHe}</span>
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              to="/themes"
              className="group mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-cloud-200 bg-white p-5 shadow-card transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:flex-row sm:items-center"
            >
              <span>
                <span className="block font-semibold text-ink">שישה עיצובים, מנוע אחד</span>
                <span className="mt-0.5 block text-sm text-ink-muted">בוטיק, טכני, אירוח, משרדי, יצירתי ומינימלי — המנוע בוחר מקומית לפי התיאור, ואפשר להחליף בלחיצה.</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="flex -space-x-1.5 space-x-reverse" aria-hidden>
                  {PRESET_LIST.map((p) => (
                    <span key={p.id} className="h-6 w-6 rounded-full ring-2 ring-white" style={{ background: PRESETS[p.id].theme.palette.primary }} />
                  ))}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700">
                  לגלריית העיצובים <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" aria-hidden />
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section aria-label="ערכת מותג" className="border-y border-cloud-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <BrandShowcase />
          </div>
        </section>

        <section aria-label="אופן סיום ותשלום" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <CompletionShowcase />
          </div>
        </section>

        <section className="border-y border-cloud-200 bg-cloud py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-midnight">הבקשה מגיעה בדיוק כמו שהלקוח מילא</h2>
              <p className="mt-3 max-w-md leading-relaxed text-ink-muted">
                כל התשובות, הסכום והגרסה שהלקוח ראה — בתיבה אחת. אישור, דחייה או בקשת שינויים בלחיצה, עם הערות פנימיות וציר זמן מלא.
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-3 text-sm">
                {['ציר זמן לכל בקשה', 'הערות פנימיות', 'הודעות מדומות', 'אנליטיקה דינמית'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-teal" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
              <ButtonLink to="/app" variant="dark" className="mt-8">
                ללוח הבקרה
              </ButtonLink>
            </div>
            <InboxPreview />
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-midnight">מה העסק מרוויח</h2>
            <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <b.icon className="h-6 w-6 text-orange-700" aria-hidden />
                  <h3 className="mt-4 font-semibold text-ink">{b.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{b.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="pricing-title" className="border-t border-cloud-200 bg-cloud py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="pricing-title" className="text-3xl font-semibold tracking-tight text-midnight">חבילות בהקמה ובליווי של RockStack</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{PRICING_TERMS.managed}</p>
            </div>
            <PackageCards compact className="mx-auto mt-10 max-w-5xl" />
            <div className="mt-6 flex flex-col items-center gap-4 text-center">
              <PricingFinePrint />
              <ButtonLink to="/pricing" variant="secondary">
                כל הפרטים והשוואה
              </ButtonLink>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-midnight">שאלות נפוצות</h2>
            <div className="mt-8 divide-y divide-cloud-200 border-y border-cloud-200">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="text-xl leading-none text-ink-soft transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col justify-between gap-6 rounded-3xl border border-cloud-200 bg-cloud p-6 sm:p-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">ראו איך זה ייראה אצלכם</h2>
                <p className="mt-2 text-ink-muted">בחרו סוג עסק, מלאו בקשה כלקוח וראו אותה מגיעה ללוח הבקרה — בערך שתי דקות, בלי הרשמה.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink to="/tour" size="lg">
                  צפו בהדגמה
                </ButtonLink>
                <ButtonLink to="/app/workflows/new" size="lg" variant="secondary">
                  נסו לבנות תהליך
                </ButtonLink>
              </div>
            </div>
            <InterestCTA dark />
          </div>
          <p className="mx-auto mt-4 max-w-6xl text-xs leading-relaxed text-ink-soft">
            מה הדמו לא עושה: אין שרת, חשבונות או סנכרון בין מכשירים; תשלומים והודעות הם סימולציה; היצירה היא מנוע מקומי מבוסס תבניות. כך הדמו נשאר חינמי לגמרי.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
