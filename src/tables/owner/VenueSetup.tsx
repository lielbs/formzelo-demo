import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Info, Moon, Plus, Rocket, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, cx, ErrorState, FieldLabel, Input, Select, Spinner, Textarea } from '../../components/ui';
import { getVenue, publishVenue, saveDraft } from '../data/client';
import { normalizeDraft, problemText, stepOfProblem, totalSeats, uuid } from '../domain/draft';
import type { TablesError } from '../domain/errors';
import { daysText, minutesText, previewApproval, ruleSentence, WEEKDAY_SHORT_HE } from '../domain/policy';
import { range } from '../domain/bidi';
import { crossesMidnight, slotTimes } from '../domain/time';
import type { ApprovalRule, Problem, ServiceDef, SetupStep, VenueDetail, VenueDraft, Weekday } from '../domain/types';
import { Hint, NumberField, SaveIndicator, type SaveState } from '../ui';
import { FloorEditor } from './FloorEditor';

const STEPS: { key: SetupStep; title: string; lead: string }[] = [
  { key: 'basics', title: 'פרטי המקום', lead: 'מה האורחים יראו בראש עמוד ההזמנה.' },
  { key: 'hours', title: 'שעות ומשמרות', lead: 'מתי אפשר להזמין, וכמה זמן אורחים יושבים בדרך כלל.' },
  { key: 'seating', title: 'שולחנות ומפה', lead: 'הכניסו את השולחנות כמו שהם במקום. התחלנו בשבילכם עם פריסה לדוגמה — עדכנו אותה.' },
  { key: 'rules', title: 'כללי הזמנה', lead: 'גודל קבוצות, כמה זמן מראש, ומי מאשר הזמנות.' },
  { key: 'guest', title: 'עמוד האורחים', lead: 'מה כתוב בעמוד ההזמנה והתנאים שהאורחים מאשרים.' },
  { key: 'review', title: 'בדיקה ופרסום', lead: 'בדקו שהכול נכון ופרסמו. עד הפרסום שום דבר לא גלוי לאורחים.' },
];

const TIMEZONES = ['Asia/Jerusalem', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai'];
const TZ_HE: Record<string, string> = { 'Asia/Jerusalem': 'ישראל', 'Europe/London': 'לונדון', 'Europe/Paris': 'פריז', 'Europe/Berlin': 'ברלין', 'America/New_York': 'ניו יורק', 'America/Los_Angeles': 'לוס אנג׳לס', 'Asia/Dubai': 'דובאי' };
const TYPES: Record<string, string> = { restaurant: 'מסעדה', cafe: 'בית קפה', bar: 'בר', event_hall: 'אולם אירועים', other: 'אחר' };

export function VenueSetup() {
  const { venueId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [draft, setDraft] = useState<VenueDraft | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const lock = useRef(0);
  const pending = useRef<VenueDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const step = (params.get('step') as SetupStep) || draft?.progress?.step || 'basics';
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.key === step));

  const load = useCallback(async () => {
    try {
      const v = await getVenue(venueId);
      setVenue(v);
      lock.current = v.lockVersion;
      setDraft(normalizeDraft(v.draft ?? {}, v.name));
      setProblems(v.problems ?? []);
      setLoadError(null);
      setSave('idle');
    } catch (e) {
      setLoadError(e as Error);
    }
  }, [venueId]);
  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inflight.current) await inflight.current;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSave('saving');
    inflight.current = (async () => {
      try {
        const r = await saveDraft(venueId, next, lock.current);
        lock.current = r.lockVersion;
        setProblems(r.problems);
        setSavedAt(new Date());
        setSave(pending.current ? 'saving' : 'saved');
      } catch (e) {
        const te = e as TablesError;
        pending.current = pending.current ?? next;
        setSave(te.sqlState === '40001' ? 'conflict' : 'error');
      } finally {
        inflight.current = null;
      }
    })();
    await inflight.current;
  }, [venueId]);

  const update = useCallback((next: VenueDraft) => {
    setDraft(next);
    pending.current = next;
    setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 700);
  }, [flush]);

  // Save before leaving the page; warn the browser if a save is still pending.
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (pending.current || inflight.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('beforeunload', before); void flush(); };
  }, [flush]);

  const go = async (key: SetupStep) => {
    if (!draft) return;
    const visited = Array.from(new Set([...(draft.progress?.visited ?? []), key]));
    update({ ...draft, progress: { step: key, visited } });
    await flush();
    setParams({ step: key }, { replace: false });
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => document.getElementById('step-title')?.focus());
  };

  async function onPublish() {
    setPublishing(true);
    setPublishError(null);
    try {
      await flush();
      await publishVenue(venueId, lock.current);
      navigate(`/app/tables/${venueId}?published=1`);
    } catch (e) {
      const te = e as TablesError;
      setPublishError(te.sqlState === '22023' ? 'יש עוד דברים לתקן ברשימה למעלה לפני הפרסום.' : te.message);
      await load();
    } finally {
      setPublishing(false);
    }
  }

  if (loadError) return <ErrorState error={loadError} onRetry={load} />;
  if (!venue || !draft) return <Spinner label="טוען את ההקמה…" />;
  if (venue.role !== 'owner' && venue.role !== 'manager') return <ErrorState error="רק בעלים או מנהל/ת יכולים לערוך את הגדרות המקום." />;

  const blocking = problems.length;
  const current = STEPS[stepIndex]!;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to={venue.published ? `/app/tables/${venueId}` : '/app/tables'} className="text-sm text-ink-muted hover:text-ink">
            ← {venue.published ? 'חזרה לניהול המקום' : 'כל המקומות'}
          </Link>
          <h1 className="mt-1 break-words text-[26px] font-bold leading-tight tracking-tight text-ink">{venue.published ? 'עריכת' : 'הקמת'} {draft.basics.name || venue.name}</h1>
        </div>
        <SaveIndicator state={save} at={savedAt} />
      </div>
      {save === 'conflict' && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4" aria-hidden /> מישהו אחר שינה את ההגדרות במקביל. השינויים האחרונים שלכם לא נשמרו.
          <Button size="sm" variant="secondary" onClick={() => { pending.current = null; void load(); }}>טעינת הגרסה העדכנית</Button>
        </div>
      )}
      {save === 'error' && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4" aria-hidden /> השינויים לא נשמרו (אין חיבור?). הם עדיין כאן במסך.
          <Button size="sm" variant="secondary" onClick={() => void flush()}>לנסות שוב</Button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="שלבי ההקמה" className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <ol className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {STEPS.map((s, i) => {
              const done = (draft.progress?.visited ?? []).includes(s.key) && i < stepIndex;
              const stepProblems = s.key === 'review' ? 0 : problems.filter((p) => stepOfProblem(p) === s.key).length;
              return (
                <li key={s.key} className="shrink-0">
                  <button type="button" onClick={() => void go(s.key)} aria-current={s.key === step ? 'step' : undefined}
                    className={cx('flex h-11 w-full items-center gap-2 rounded-xl px-3 text-start text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                      s.key === step ? 'bg-midnight text-white' : 'bg-white text-ink hover:bg-cloud border border-cloud-200')}>
                    <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs', s.key === step ? 'bg-white/20' : done ? 'bg-teal-50 text-teal-700' : 'bg-cloud text-ink-muted')}>
                      {done && !stepProblems ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{s.title}</span>
                    {stepProblems > 0 && <span className="ms-auto rounded-full bg-red-100 px-1.5 text-xs text-red-800" aria-label={`${stepProblems} דברים לתקן`}>{stepProblems}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby="step-title" className="min-w-0">
          <p className="text-xs font-medium text-ink-muted xl:hidden">שלב {stepIndex + 1} מתוך {STEPS.length}</p>
          <h2 id="step-title" tabIndex={-1} className="text-xl font-semibold text-ink outline-none">{current.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{current.lead}</p>
          <div className="mt-5">
            {step === 'basics' && <BasicsStep draft={draft} update={update} />}
            {step === 'hours' && <HoursStep draft={draft} update={update} />}
            {step === 'seating' && <FloorEditor floor={draft} onChange={(f) => update({ ...draft, ...f })} />}
            {step === 'rules' && <RulesStep draft={draft} update={update} />}
            {step === 'guest' && <GuestStep draft={draft} update={update} />}
            {step === 'review' && <ReviewStep draft={draft} problems={problems} venue={venue} onFix={(s) => void go(s)} onPublish={onPublish} publishing={publishing} publishError={publishError} blocking={blocking} />}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-cloud-200 pt-4">
            {stepIndex > 0 ? <Button variant="ghost" icon={ArrowRight} onClick={() => void go(STEPS[stepIndex - 1]!.key)}>הקודם</Button> : <span />}
            {stepIndex < STEPS.length - 1 && (
              <Button size="lg" onClick={() => void go(STEPS[stepIndex + 1]!.key)}>
                המשך: {STEPS[stepIndex + 1]!.title} <ArrowLeft className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

type StepProps = { draft: VenueDraft; update: (d: VenueDraft) => void };

function BasicsStep({ draft, update }: StepProps) {
  const b = draft.basics;
  const set = (p: Partial<VenueDraft['basics']>) => update({ ...draft, basics: { ...b, ...p } });
  return (
    <Card className="grid gap-4 p-5 sm:max-w-2xl">
      <div>
        <FieldLabel htmlFor="b-name" required>שם המקום</FieldLabel>
        <Input id="b-name" value={b.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="b-type">סוג המקום</FieldLabel>
          <Select id="b-type" value={b.venueType ?? 'restaurant'} onChange={(e) => set({ venueType: e.target.value })}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="b-phone">טלפון של המקום</FieldLabel>
          <Input id="b-phone" type="tel" dir="ltr" inputMode="tel" value={b.phone ?? ''} maxLength={24} placeholder="03-1234567" onChange={(e) => set({ phone: e.target.value })} />
          <p className="mt-1 text-xs text-ink-muted">יוצג לאורחים כדי שיוכלו להתקשר.</p>
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="b-address">כתובת</FieldLabel>
        <Input id="b-address" value={b.address ?? ''} maxLength={300} placeholder="רחוב, מספר, עיר" onChange={(e) => set({ address: e.target.value })} />
      </div>
      <div className="sm:max-w-xs">
        <FieldLabel htmlFor="b-tz">שעון המקום</FieldLabel>
        <Select id="b-tz" value={b.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{TZ_HE[tz]}</option>)}
        </Select>
        <p className="mt-1 text-xs text-ink-muted">כל השעות במערכת מוצגות לפי השעון של המקום, גם כשמישהו מזמין מחו״ל.</p>
      </div>
    </Card>
  );
}

const DURATIONS = [45, 60, 75, 90, 105, 120, 150, 180, 240];

function HoursStep({ draft, update }: StepProps) {
  const setService = (i: number, p: Partial<ServiceDef>) => update({ ...draft, services: draft.services.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const add = () => update({ ...draft, services: [...draft.services, { key: `s${uuid().slice(0, 6)}`, name: 'משמרת חדשה', weekdays: [0, 1, 2, 3, 4], start: '19:00', lastSeating: '22:00', durationMinutes: 90 }] });
  return (
    <div className="grid gap-4">
      {draft.services.map((s, i) => {
        const id = `svc-${i}`;
        const slots = slotTimes(s, draft.policy.slotMinutes);
        return (
          <Card key={s.key} as="section" className="grid gap-4 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <FieldLabel htmlFor={`${id}-name`} required>שם המשמרת</FieldLabel>
                <Input id={`${id}-name`} value={s.name} maxLength={60} onChange={(e) => setService(i, { name: e.target.value })} placeholder="ערב" />
              </div>
              <Button size="sm" variant="ghost" icon={Trash2} disabled={draft.services.length === 1} onClick={() => update({ ...draft, services: draft.services.filter((_, j) => j !== i) })}>
                מחיקת המשמרת
              </Button>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">באילו ימים</legend>
              <div className="grid max-w-md grid-cols-7 gap-1.5">
                {WEEKDAY_SHORT_HE.map((d, day) => {
                  const on = s.weekdays.includes(day as Weekday);
                  return (
                    <button key={d} type="button" aria-pressed={on} aria-label={`יום ${d}`}
                      onClick={() => setService(i, { weekdays: (on ? s.weekdays.filter((x) => x !== day) : [...s.weekdays, day as Weekday]).sort() as Weekday[] })}
                      className={cx('h-11 w-full rounded-xl border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', on ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink')}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor={`${id}-start`}>הושבה ראשונה</FieldLabel>
                <Input id={`${id}-start`} type="time" dir="ltr" value={s.start} step={900} onChange={(e) => e.target.value && setService(i, { start: e.target.value })} />
              </div>
              <div>
                <FieldLabel htmlFor={`${id}-last`}>הושבה אחרונה</FieldLabel>
                <Input id={`${id}-last`} type="time" dir="ltr" value={s.lastSeating} step={900} onChange={(e) => e.target.value && setService(i, { lastSeating: e.target.value })} />
              </div>
              <div>
                <FieldLabel htmlFor={`${id}-dur`}>כמה זמן יושבים בערך</FieldLabel>
                <Select id={`${id}-dur`} value={s.durationMinutes} onChange={(e) => setService(i, { durationMinutes: Number(e.target.value) })}>
                  {DURATIONS.map((m) => <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שעות` : `${m} דקות`}</option>)}
                </Select>
              </div>
            </div>
            <p className="text-sm text-ink-muted">
              {daysText(s.weekdays)}, אורחים יוכלו לבחור {slots.length} שעות הגעה בין <bdi dir="ltr">{s.start}</bdi> ל-<bdi dir="ltr">{s.lastSeating}</bdi>, כל {draft.policy.slotMinutes} דקות.
            </p>
            {crossesMidnight(s) && (
              <Hint icon={Moon}>המשמרת נמשכת אחרי חצות. הזמנה ל-<bdi dir="ltr">{s.lastSeating}</bdi> תיחשב חלק מהמשמרת של הערב שבו היא התחילה (למשל הזמנה ל-00:30 בליל שישי שייכת ליום חמישי).</Hint>
            )}
          </Card>
        );
      })}
      <div><Button variant="secondary" icon={Plus} onClick={add}>הוספת משמרת</Button></div>
    </div>
  );
}

function RulesStep({ draft, update }: StepProps) {
  const p = draft.policy;
  const set = (patch: Partial<VenueDraft['policy']>) => update({ ...draft, policy: { ...p, ...patch } });
  const [advanced, setAdvanced] = useState(false);
  const setRule = (i: number, r: Partial<ApprovalRule>) => set({ rules: p.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  return (
    <div className="grid gap-5">
      <Card as="section" className="grid gap-4 p-5">
        <h3 className="font-semibold">מי יכול להזמין ומתי</h3>
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <NumberField id="p-min" label="קבוצה קטנה ביותר" value={p.minParty} min={1} max={p.maxParty} onChange={(v) => set({ minParty: v })} suffix="סועדים" />
          <NumberField id="p-max" label="קבוצה גדולה ביותר באתר" value={p.maxParty} min={p.minParty} max={60} onChange={(v) => set({ maxParty: v })} suffix="סועדים" hint="קבוצות גדולות יותר יתקשרו אליכם." />
          <NumberField id="p-h" label="אפשר להזמין עד" value={p.horizonDays} min={1} max={180} onChange={(v) => set({ horizonDays: v })} suffix="ימים קדימה" />
          <NumberField id="p-lead" label="לפחות" value={p.leadMinutes} min={0} max={10080} step={15} onChange={(v) => set({ leadMinutes: v })} suffix="דקות מראש" hint="למשל 60 = אי אפשר להזמין לשעה הקרובה." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="p-slot">שעות הגעה לבחירה כל</FieldLabel>
            <Select id="p-slot" value={p.slotMinutes} onChange={(e) => set({ slotMinutes: Number(e.target.value) as 15 | 30 | 60 })}>
              <option value={15}>רבע שעה</option><option value={30}>חצי שעה</option><option value={60}>שעה</option>
            </Select>
          </div>
          <NumberField id="p-buffer" label="זמן התארגנות בין אורחים" value={p.bufferMinutes} min={0} max={120} step={5} onChange={(v) => set({ bufferMinutes: v })} suffix="דקות" hint="זמן לניקוי ועריכת השולחן לפני ההזמנה הבאה." />
        </div>
      </Card>

      <Card as="section" className="grid gap-4 p-5">
        <h3 className="font-semibold">אישור הזמנות</h3>
        <div role="radiogroup" aria-label="איך מאשרים הזמנות" className="grid gap-2">
          {([
            ['auto', 'אוטומטי', 'כל הזמנה שיש לה שולחן פנוי מאושרת מיד. מומלץ לרוב המקומות.'],
            ['manual', 'אני מאשר/ת כל הזמנה', 'האורח שולח בקשה ומקבל תשובה אחרי שתאשרו במשמרת.'],
            ['conditional', 'לפי כללים', 'רוב ההזמנות אוטומטיות, ומקרים מסוימים (למשל קבוצות גדולות) מחכים לאישור.'],
          ] as const).map(([v, title, text]) => (
            <label key={v} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', p.approvalMode === v ? 'border-midnight bg-cloud' : 'border-cloud-300')}>
              <input type="radio" name="approval" className="mt-1 h-6 w-6 shrink-0 accent-orange-700" checked={p.approvalMode === v} onChange={() => set({ approvalMode: v, rules: v === 'conditional' && !p.rules.length ? [{ id: 'large', priority: 1, enabled: true, when: { partyAtLeast: 8 }, then: 'require_manual' }] : p.rules })} />
              <span><span className="block font-medium">{title}</span><span className="block text-sm text-ink-muted">{text}</span></span>
            </label>
          ))}
        </div>
        {p.approvalMode === 'conditional' && (
          <div className="grid gap-3">
            {p.rules.map((r, i) => (
              <div key={r.id} className="rounded-xl border border-cloud-300 p-3">
                <p className="font-medium text-ink">{ruleSentence(r, draft.zones)}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <NumberField id={`r-${r.id}-party`} label="מגודל קבוצה" value={r.when.partyAtLeast ?? 1} min={1} max={60} onChange={(v) => setRule(i, { when: { ...r.when, partyAtLeast: v } })} suffix="ומעלה" />
                  <fieldset className="w-full">
                    <legend className="mb-1.5 text-sm font-medium">בימים</legend>
                    <div className="grid w-full max-w-sm grid-cols-7 gap-1">
                      {WEEKDAY_SHORT_HE.map((d, day) => {
                        const on = (r.when.weekdays ?? []).includes(day as Weekday);
                        return (
                          <button key={d} type="button" aria-pressed={on} aria-label={`יום ${d}`}
                            onClick={() => setRule(i, { when: { ...r.when, weekdays: (on ? (r.when.weekdays ?? []).filter((x) => x !== day) : [...(r.when.weekdays ?? []), day as Weekday]).sort() as Weekday[] } })}
                            className={cx('h-10 w-full rounded-lg border text-sm font-semibold', on ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white')}>{d}</button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">בלי בחירה = כל יום</p>
                  </fieldset>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set({ rules: p.rules.filter((_, j) => j !== i) })}>מחיקה</Button>
                </div>
              </div>
            ))}
            <div>
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => set({ rules: [...p.rules, { id: `r${uuid().slice(0, 6)}`, priority: p.rules.length + 1, enabled: true, when: { partyAtLeast: 6, weekdays: [5, 6] }, then: 'require_manual' }] })}>
                כלל נוסף
              </Button>
            </div>
            <ApprovalPreview draft={draft} />
          </div>
        )}
      </Card>

      <Card as="section" className="grid gap-4 p-5">
        <h3 className="font-semibold">ביטולים ושינויים של אורחים</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <CutoffSelect id="p-cancel" label="אורחים יכולים לבטל בעצמם עד" value={p.cancelCutoffMinutes} onChange={(v) => set({ cancelCutoffMinutes: v })} />
          <CutoffSelect id="p-modify" label="אורחים יכולים לשנות שעה או גודל עד" value={p.modifyCutoffMinutes} onChange={(v) => set({ modifyCutoffMinutes: v })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={p.allowGuestModify} onChange={(e) => set({ allowGuestModify: e.target.checked })} />
          לאפשר לאורחים לשנות הזמנה בעצמם (אחרת רק לבטל)
        </label>
        <p className="text-xs text-ink-muted">האורחים רואים את המועד המדויק (תאריך ושעה) לפני שהם מאשרים את ההזמנה. אין חיוב כספי על ביטול — המערכת לא גובה תשלומים.</p>
      </Card>

      <div>
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)} className="inline-flex min-h-11 items-center text-sm font-medium text-orange-800 hover:underline">
          {advanced ? 'הסתרת הגדרות מתקדמות' : 'הגדרות מתקדמות (לא חובה)'}
        </button>
        <p className="text-xs text-ink-muted">
          {`כרגע: ${p.pacing?.maxArrivals ? `עד ${p.pacing.maxArrivals} הגעות בכל ${p.pacing.windowMinutes} דקות` : 'בלי הגבלת קצב הגעות'} · ${p.waitlist?.publicEnabled ? 'רשימת המתנה פתוחה לאורחים' : 'רשימת המתנה רק דרך הצוות'} · ${p.zoneChoice ? 'אורחים בוחרים אזור' : 'האזור נבחר על ידכם'}`}
        </p>
      </div>
      {advanced && (
        <Card as="section" className="grid gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="p-pacing">הגבלת קצב הגעות (כדי שהמטבח לא יוצף)</FieldLabel>
              <Select id="p-pacing" value={p.pacing?.maxArrivals ?? 0} onChange={(e) => { const n = Number(e.target.value); set({ pacing: n ? { windowMinutes: p.pacing?.windowMinutes ?? 30, maxArrivals: n } : null }); }}>
                <option value={0}>בלי הגבלה</option>
                {[2, 3, 4, 5, 6, 8, 10, 12, 15].map((n) => <option key={n} value={n}>עד {n} הזמנות שמגיעות בכל חצי שעה</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="p-pending">בקשה שממתינה לאישור</FieldLabel>
              <Select id="p-pending" value={p.pendingMode} onChange={(e) => set({ pendingMode: e.target.value as 'hold' | 'unallocated' })}>
                <option value="unallocated">לא שומרת שולחן — בודקים מקום כשמאשרים</option>
                <option value="hold">שומרת שולחן ל-{p.pendingHoldMinutes} דקות ואז פגה</option>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={!!p.zoneChoice} onChange={(e) => set({ zoneChoice: e.target.checked })} />
            לאפשר לאורחים לבקש אזור ישיבה (בקשה, לא התחייבות)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={!!p.waitlist?.publicEnabled} onChange={(e) => set({ waitlist: { offerMinutes: p.waitlist?.offerMinutes ?? 10, publicEnabled: e.target.checked } })} />
            לאפשר לאורחים להצטרף לרשימת המתנה מהטלפון (עם קוד QR בכניסה)
          </label>
        </Card>
      )}
    </div>
  );
}

function CutoffSelect({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  const options = [0, 60, 120, 240, 360, 720, 1440, 2880];
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {(options.includes(value) ? options : [...options, value].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{minutesText(m)}</option>)}
      </Select>
    </div>
  );
}

function ApprovalPreview({ draft }: { draft: VenueDraft }) {
  const [party, setParty] = useState(8);
  const [day, setDay] = useState(5);
  const [time, setTime] = useState('20:00');
  const r = previewApproval(draft.policy, { party, weekday: day, time });
  return (
    <div className="rounded-xl bg-cloud p-3">
      <p className="text-sm font-medium">בדיקה מהירה: מה יקרה עם הזמנה כזו?</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <NumberField id="pv-party" label="סועדים" value={party} min={1} max={60} onChange={setParty} />
        <div>
          <label htmlFor="pv-day" className="mb-1.5 block text-sm font-medium">יום</label>
          <Select id="pv-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {WEEKDAY_SHORT_HE.map((d, i) => <option key={d} value={i}>יום {d}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="pv-time" className="mb-1.5 block text-sm font-medium">שעה</label>
          <Input id="pv-time" type="time" dir="ltr" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className="h-11" />
        </div>
      </div>
      <p role="status" className="mt-3 text-sm font-medium" aria-live="polite">
        {r.manual ? 'תגיע אליכם בקשה לאישור.' : 'תאושר מיד (אם יש שולחן פנוי).'}
      </p>
    </div>
  );
}

function GuestStep({ draft, update }: StepProps) {
  const g = draft.guest;
  const set = (p: Partial<VenueDraft['guest']>) => update({ ...draft, guest: { ...g, ...p } });
  return (
    <Card className="grid gap-4 p-5 sm:max-w-2xl">
      <div>
        <FieldLabel htmlFor="g-intro">משפט פתיחה (רשות)</FieldLabel>
        <Textarea id="g-intro" maxLength={1000} value={g.intro ?? ''} onChange={(e) => set({ intro: e.target.value })} placeholder="למשל: מטבח ים-תיכוני, מרפסת עם נוף לים. נשמח לראותכם!" />
      </div>
      <div>
        <FieldLabel htmlFor="g-terms" required>תנאי ההזמנה</FieldLabel>
        <Textarea id="g-terms" maxLength={2000} value={g.terms} onChange={(e) => set({ terms: e.target.value })} aria-describedby="g-terms-hint" />
        <p id="g-terms-hint" className="mt-1 text-xs text-ink-muted">האורחים יראו את הטקסט הזה ויאשרו אותו לפני ההזמנה. כתבו בשפה פשוטה. אין צורך לכתוב כמה שעות מראש אפשר לבטל — המועד המדויק מוצג לאורחים אוטומטית לפי ההגדרה בשלב ״כללי הזמנה״.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={!!g.showWhatsapp} onChange={(e) => set({ showWhatsapp: e.target.checked })} />
        להציג לאורחים כפתור וואטסאפ אל הטלפון של המקום
      </label>
      <Hint icon={Info}>הצבעים והלוגו מגיעים מ״ערכת המותג״ של העסק. אפשר לשנות אותם בכל זמן מהתפריט.</Hint>
    </Card>
  );
}

function ReviewStep({ draft, problems, venue, onFix, onPublish, publishing, publishError, blocking }: {
  draft: VenueDraft; problems: Problem[]; venue: VenueDetail; onFix: (s: SetupStep) => void; onPublish: () => void; publishing: boolean; publishError: string | null; blocking: number;
}) {
  const seats = totalSeats(draft.tables);
  const biggest = Math.max(0, ...draft.tables.map((t) => t.maxCovers), ...draft.combinations.map((c) => c.maxCovers));
  const summary = useMemo(() => [
    `${draft.services.length} משמרות: ${draft.services.map((s) => `${s.name} (${range(s.start, s.lastSeating)})`).join(', ')}`,
    `${draft.tables.length} שולחנות, ${seats} מקומות ישיבה ב-${draft.zones.length} אזורים`,
    `קבוצות של ${range(draft.policy.minParty, draft.policy.maxParty)} סועדים, עד ${draft.policy.horizonDays} ימים קדימה`,
    draft.policy.approvalMode === 'auto' ? 'הזמנות מאושרות אוטומטית' : draft.policy.approvalMode === 'manual' ? 'כל הזמנה מחכה לאישור שלכם' : `אישור לפי ${draft.policy.rules.length} כללים`,
    `ביטול עצמי ${minutesText(draft.policy.cancelCutoffMinutes)}`,
  ], [draft, seats]);
  return (
    <div className="grid gap-5">
      {blocking > 0 ? (
        <Card className="border-red-200 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-red-800"><AlertCircle className="h-5 w-5" aria-hidden /> לפני הפרסום צריך לתקן {blocking === 1 ? 'דבר אחד' : `${blocking} דברים`}</h3>
          <ul className="mt-3 grid gap-2">
            {problems.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{problemText(p)}</span>
                <Button size="sm" variant="secondary" onClick={() => onFix(stepOfProblem(p))}>לתיקון</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="border-teal-200 bg-teal-50/50 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-teal-900"><CheckCircle2 className="h-5 w-5" aria-hidden /> הכול מוכן לפרסום</h3>
        </Card>
      )}
      <Card className="p-5">
        <h3 className="font-semibold">מה האורחים יקבלו</h3>
        <ul className="mt-3 grid gap-1.5 text-sm text-ink">
          {summary.map((s) => <li key={s} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />{s}</li>)}
        </ul>
        {biggest < draft.policy.maxParty && (
          <div className="mt-3"><Hint tone="warn" icon={Clock}>הקבוצה הגדולה ביותר שאפשר להזמין באתר היא {draft.policy.maxParty}, אבל השולחן (או הצירוף) הגדול ביותר מתאים ל-{biggest}. קבוצות גדולות מ-{biggest} לא ימצאו מקום — הוסיפו צירוף שולחנות או הקטינו את הגודל המקסימלי.</Hint></div>
        )}
      </Card>
      {venue.published && <Hint icon={Info}>המקום כבר מפורסם (גרסה {venue.published.versionNumber}). פרסום חדש יחול על הזמנות חדשות; הזמנות קיימות נשארות כמו שהן.</Hint>}
      {publishError && <p role="alert" className="text-sm font-medium text-red-700">{publishError}</p>}
      <div>
        <Button size="lg" icon={Rocket} onClick={onPublish} loading={publishing} disabled={blocking > 0}>
          {venue.published ? 'פרסום השינויים' : 'פרסום ופתיחת ההזמנות'}
        </Button>
      </div>
    </div>
  );
}

export const SETUP_STEPS = STEPS;
