import {
  ArrowLeft,
  Car,
  Check,
  Flower2,
  GitBranch,
  History,
  Inbox,
  Link2,
  MessageSquareText,
  PencilRuler,
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
import { DEMO_GARAGE_CASE_ID, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { EXAMPLE_PROMPTS, generateWorkflowFromPrompt, type GenerationResult } from '../engine/generator';
import { formatCurrency, formatRelative } from '../lib/format';
import { PLANS } from '../lib/plans';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import type { ThemePresetId } from '../domain/theme';
import { HeroArt } from '../theme/art';
import { buildTheme, PRESET_LIST, PRESETS } from '../theme/presets';
import { ThemeScope } from '../theme/ThemeScope';

const STEPS = [
  { icon: MessageSquareText, title: 'מתארים', text: 'כותבים בעברית פשוטה מה הלקוח צריך למלא, לבחור או לאשר.' },
  { icon: PencilRuler, title: 'מתאימים', text: 'עורכים שלבים, שדות, מחירים, תנאים ומיתוג — עם תצוגה חיה.' },
  { icon: Link2, title: 'שולחים', text: 'מפרסמים גרסה ומקבלים קישור אחד שעובד מצוין גם בנייד.' },
  { icon: Inbox, title: 'מנהלים', text: 'כל בקשה נכנסת לתיבה אחת: אישור, דחייה, בקשת שינויים והיסטוריה.' },
];

const EXAMPLES = [
  { icon: Flower2, name: 'Bloom Studio', title: 'הזמנת זר פרחים', text: 'תקציב, צבעוניות, ברכה עם תצוגת כרטיס, אריזה ומשלוח — עם סכום מחושב.', href: `/f/${DEMO_SLUGS.flowers}`, preset: 'floral_boutique' as ThemePresetId },
  { icon: Car, name: 'AutoCare', title: 'אישור תיקונים לרכב', text: 'הלקוח מאשר או דוחה כל תיקון בנפרד ורואה סכום מדויק.', href: `/f/${DEMO_SLUGS.garage}?r=${DEMO_GARAGE_CASE_ID}`, preset: 'automotive_precision' as ThemePresetId },
  { icon: UtensilsCrossed, name: 'Urban Table', title: 'אירוע פרטי במסעדה', text: 'תאריך, אורחים, תפריט ותוספות, הערכת מחיר ומקדמה מדומה.', href: `/f/${DEMO_SLUGS.events}`, preset: 'hospitality_premium' as ThemePresetId },
];

const BENEFITS = [
  { icon: Wand2, title: 'מתיאור לתהליך בדקות', text: 'במקום לבנות טופס משדה ריק — מתחילים מתבנית אמיתית שמתאימה לעסק.' },
  { icon: Calculator, title: 'מחיר שמחושב לבד', text: 'אפשרויות, תוספות, מחיר לאורח ועמלות קבועות. הלקוח רואה סכום מדויק.' },
  { icon: GitBranch, title: 'תנאים בלי קוד', text: 'שדה שמופיע רק כשצריך, כמו שם חברה לאירוע עסקי.' },
  { icon: Smartphone, title: 'נראה מעולה בנייד', text: 'שלב אחרי שלב, עם התקדמות, בדיקות ושגיאות ברורות.' },
  { icon: History, title: 'גרסאות ובקרה', text: 'כל פרסום נשמר כגרסה קבועה. בקשה תמיד מקושרת לגרסה שבה נשלחה.' },
  { icon: ShieldCheck, title: 'שקיפות מלאה', text: 'בדמו הכול מסומן: נתוני דמו, סימולציות והודעות שלא נשלחות.' },
];

const FAQ = [
  ['האם היצירה מבוססת AI?', 'בדמו הזה — לא. מנוע מקומי מזהה מילות מפתח בעברית וממפה את התיאור לתבנית אמיתית שאפשר לערוך. בגרסת ייצור אפשר לחבר ספק AI אמיתי מאחורי אותו ממשק.'],
  ['איפה נשמרים הנתונים?', 'ב-localStorage של הדפדפן שלכם בלבד. אין שרת, אין חשבון ואין סנכרון בין מכשירים. קישור שנפתח בדפדפן אחר לא יראה את הנתונים.'],
  ['האם מתבצעים תשלומים או נשלחות הודעות?', 'לא. מקדמות, הודעות SMS, WhatsApp ואימייל הן סימולציות שמוצגות כתצוגה מקדימה בלבד.'],
  ['האם אישור במוסך מחייב משפטית?', 'לא. אישור בדמו נשמר מקומית, ללא חתימה אלקטרונית וללא תוקף משפטי. החלטות בטיחות מחייבות התייעצות עם איש מקצוע.'],
  ['אפשר להתאים את התהליך לעסק שלי?', 'כן. כותרות, שלבים, שדות, סוגי שדות, חובה, אפשרויות, מחירים, סדר, מיתוג ותנאים פשוטים — הכול ניתן לעריכה.'],
  ['מה המחירים?', 'המחירים בעמוד הם להמחשה בלבד: 99, 199 ו-399 ₪ לחודש. אין חיוב אמיתי בדמו.'],
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
        <span className="ms-3 text-xs text-ink-soft ltr">formzelo · builder</span>
      </div>
      <div className="grid gap-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3 border-b border-cloud-200 p-5 md:border-b-0 md:border-e">
          <LocalGenerationNotice />
          <label htmlFor="hero-prompt" className="block text-sm font-medium">
            תארו את התהליך
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
                className={cx('rounded-full border px-2.5 py-1 text-xs transition', prompt === p ? 'border-orange bg-orange-50 text-orange-600' : 'border-cloud-300 text-ink-muted hover:border-ink-soft')}
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
              המשך לעריכה <ArrowLeft className="h-4 w-4" aria-hidden />
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
        <Link to="/app/requests" className="text-sm font-medium text-orange hover:underline">
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
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:py-20">
            <div>
              <p className="text-sm font-medium text-orange">מתארים. יוצרים. שולחים.</p>
              <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-midnight sm:text-5xl lg:text-[56px]">כל רעיון הופך לתהליך.</h1>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-muted">תארו מה אתם צריכים, קבלו תהליך דיגיטלי מוכן ושלחו אותו ללקוחות בלינק אחד.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink to="/app/workflows/new" size="lg">
                  צרו תהליך עכשיו
                </ButtonLink>
                <ButtonLink to="/demo" size="lg" variant="secondary">
                  לסביבות הדמו
                </ButtonLink>
              </div>
              <ul className="mt-8 space-y-2 text-sm text-ink-muted">
                {['רץ מקומית בדפדפן — בלי חשבון ובלי כרטיס אשראי', 'מנוע אחד לכל סוג עסק, מונע סכמה', 'כל סימולציה מסומנת בבירור'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-teal" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <LivePromptDemo />
          </div>
        </section>

        <section id="how" className="scroll-mt-16 bg-midnight py-20 text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">ארבעה צעדים, תהליך אחד</h2>
            <p className="mt-2 max-w-lg text-white/60">מהרעיון ועד הבקשה המאושרת — בלי מפתחים ובלי טפסים מפוזרים.</p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between">
                    <s.icon className="h-6 w-6 text-orange" aria-hidden />
                    <span className="text-sm tabular-nums text-white/30">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/60">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="examples" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-midnight">שלוש דוגמאות חיות</h2>
                <p className="mt-2 text-ink-muted">אותו מנוע, שלושה עסקים — וכל אחד בשפה העיצובית שלו. מלאו ושלחו, והבקשה תופיע בלוח הבקרה.</p>
              </div>
              <DemoBadge className="self-start sm:self-auto" />
            </div>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {EXAMPLES.map((e) => (
                <li key={e.title}>
                  <Link to={e.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-cloud-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                    <ThemeScope theme={buildTheme(e.preset)} className="relative h-36 overflow-hidden" style={{ background: 'var(--fz-hero-bg)', color: 'var(--fz-hero-text)' }}>
                      <HeroArt decoration={PRESETS[e.preset].theme.decoration} className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-[1.04]" />
                      <div className="relative flex h-full flex-col justify-end p-5">
                        <span className="text-[11px] font-medium opacity-75">{e.name}</span>
                        <span className="fz-display mt-0.5 text-[calc(1.35rem*var(--fz-display-scale))] leading-tight">{e.title}</span>
                      </div>
                    </ThemeScope>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="flex-1 text-sm leading-relaxed text-ink-muted">{e.text}</p>
                      <span className="mt-4 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-orange">
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
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-orange">
                  לגלריית העיצובים <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" aria-hidden />
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="border-y border-cloud-200 bg-cloud py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-midnight">כל הבקשות במקום אחד</h2>
              <p className="mt-3 max-w-md leading-relaxed text-ink-muted">
                אישור, דחייה או בקשת שינויים בלחיצה. הערות פנימיות, ציר זמן מלא, תצוגה מקדימה של הודעות ללקוח וסטטוס מקדמה — הכול נגזר מאותו מודל נתונים.
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
            <h2 className="text-3xl font-semibold tracking-tight text-midnight">למה formzelo</h2>
            <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <b.icon className="h-6 w-6 text-orange" aria-hidden />
                  <h3 className="mt-4 font-semibold text-ink">{b.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{b.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-cloud-200 bg-cloud py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-midnight">מחירים פשוטים</h2>
              <p className="mt-2 text-sm text-ink-muted">מחירים להמחשה בלבד — אין חיוב אמיתי בדמו.</p>
            </div>
            <ul className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
              {PLANS.map((p) => (
                <li key={p.key} className={cx('rounded-2xl border bg-white p-6', 'highlight' in p ? 'border-orange shadow-lift' : 'border-cloud-200')}>
                  <p className="font-semibold">{p.name}</p>
                  <p className="mt-3">
                    <span className="text-3xl font-semibold tabular-nums">{formatCurrency(p.price)}</span>
                    <span className="text-sm text-ink-muted"> / חודש</span>
                  </p>
                  <p className="mt-2 text-sm text-ink-muted">{p.blurb}</p>
                </li>
              ))}
            </ul>
            <div className="mt-8 text-center">
              <ButtonLink to="/pricing" variant="secondary">
                השוואת תוכניות
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
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-midnight px-8 py-12 text-white md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">יש לכם רעיון? זה הזמן להפוך אותו לתהליך.</h2>
              <p className="mt-2 text-white/60">שתי דקות, בלי הרשמה. הכול נשאר בדפדפן שלכם.</p>
            </div>
            <ButtonLink to="/app/workflows/new" size="lg">
              צרו תהליך
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
