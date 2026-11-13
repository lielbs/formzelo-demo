import { CalendarDays, CalendarPlus, Check, CheckCircle2, Clock, Copy, ExternalLink, Hourglass, MessageCircle, Moon, Navigation, ShieldCheck, Sun, Sunset, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cx, PageLoader } from '../../components/ui';
import { publicBaseUrl } from '../../lib/links';
import { newKey, publicAvailability, publicBook, publicVenue, type BookResult, type PublicAvailability, type PublicVenue } from '../data/client';
import { desiredTimes, nearestSlots, type OpenSlot } from '../domain/desiredTime';
import { messageFor, type TablesError } from '../domain/errors';
import { answersPayload, missingAnswers, type PageConfig } from '../domain/publicPages';
import { normalizePhone } from '../domain/phone';
import { addDays, dateInTz, formatDate, formatInstant } from '../domain/time';
import { Ltr } from '../ui';
import { GuestFields, type GuestValues } from './GuestFields';
import { tx, type Lang } from './i18n';
import { lookFor, pageOf } from './look';
import { accentButton, PublicShell, softButton, useDocumentLanguage, useLang } from './PublicShell';
import { ScrollStrip } from './ScrollStrip';
import { calendarFile, mapsHref, VenueAside, weekdayOf } from './VenueInfo';

type Step = 'choose' | 'details' | 'result';
type Choice = { serviceKey: string; time: string; approval: 'instant' | 'request' };

export const manageUrl = (token: string, lang: Lang) => `${publicBaseUrl()}/t/r${lang === 'en' ? '?lang=en' : ''}#t=${token}`;

function useFocusOnChange(dep: unknown) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    ref.current?.focus();
  }, [dep]);
  return ref;
}

export function BookingPage() {
  const { slug = '' } = useParams();
  const lang = useLang();
  const s = tx(lang);
  const [venue, setVenue] = useState<PublicVenue | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  useDocumentLanguage(lang, venue ? `${venue.name} · ${s.bookTitle}` : s.bookTitle);
  useEffect(() => {
    publicVenue(slug, lang).then(setVenue).catch((e) => setLoadError((e as TablesError).message));
  }, [slug, lang]);
  const design = useMemo(() => (venue ? lookFor(venue, 'booking') : null), [venue]);

  if (loadError) return <PublicShell lang={lang} venue={null}><p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{loadError}</p></PublicShell>;
  // Keep the branded loader until the venue arrives, then show the whole page at once (no jumping).
  if (venue === undefined) return <PageLoader label={s.loading} />;
  if (venue === null) return (
    <PublicShell lang={lang} venue={null}>
      <h1 className="text-xl font-semibold">{s.notFound}</h1>
      <p className="mt-2 text-ink-muted">{s.notFoundBody}</p>
    </PublicShell>
  );
  const today = dateInTz(new Date(venue.serverNow), venue.timezone);
  return (
    <PublicShell lang={lang} venue={{ ...venue, today, slug: venue.slug }} design={design}
      aside={<VenueAside lang={lang} today={today} venue={venue} />}>
      <Booking venue={venue} lang={lang} page={pageOf(design, 'booking')} />
    </PublicShell>
  );
}

/** Where the guest is in the booking (choose → details → confirmed). */
export function Stepper({ lang, step }: { lang: Lang; step: 0 | 1 | 2 }) {
  const s = tx(lang);
  const labels = [s.stepWhen, s.stepDetails, s.stepDone];
  return (
    <ol className="mb-5 flex items-center gap-2 text-xs font-medium sm:text-sm" aria-label={lang === 'he' ? 'שלבי ההזמנה' : 'Booking steps'}>
      {labels.map((label, i) => (
        <li key={label} className="pp-step flex min-w-0 items-center gap-2" aria-current={i === step ? 'step' : undefined} data-done={i < step ? '' : undefined}>
          <span className="pp-step-dot flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums">
            {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={cx('truncate', i !== step && 'hidden sm:inline')}>{label}</span>
          {i < labels.length - 1 && <span aria-hidden className="pp-step-line h-px w-6 shrink-0 sm:w-10" />}
        </li>
      ))}
    </ol>
  );
}

/** Section heading inside the booking sheet. */
function SectionTitle({ icon, children, id, as: As = 'h2' }: { icon: ReactNode; children: ReactNode; id?: string; as?: 'h2' | 'legend' }) {
  return (
    <As id={id} className="mb-3 flex items-center gap-2 text-base font-semibold">
      <span aria-hidden className="pp-icon-chip flex h-7 w-7 items-center justify-center rounded-full">{icon}</span>{children}
    </As>
  );
}

const serviceIcon = (time: string | undefined) => {
  const h = Number((time ?? '19:00').slice(0, 2));
  return h < 15 ? <Sun className="h-4 w-4" aria-hidden /> : h < 18 ? <Sunset className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />;
};

function Booking({ venue, lang, page }: { venue: PublicVenue; lang: Lang; page: PageConfig | null }) {
  const s = tx(lang);
  const today = dateInTz(new Date(venue.serverNow), venue.timezone);
  const [step, setStep] = useState<Step>('choose');
  const [party, setParty] = useState(Math.min(Math.max(2, venue.policy.minParty), venue.policy.maxParty));
  const [date, setDate] = useState(today);
  const [zone, setZone] = useState<string>('');
  const [avail, setAvail] = useState<PublicAvailability | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [values, setValues] = useState<GuestValues>({});
  const [terms, setTerms] = useState(false);
  const shown = (key: string) => !page || page.fields.some((f) => f.key === key && !f.hidden);
  const text = (key: string) => (typeof values[key] === 'string' ? (values[key] as string).trim() : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BookResult | null>(null);
  const key = useRef(newKey());
  const heading = useFocusOnChange(step);

  // Availability per (date, party, zone): a tap shows a remembered answer at once, the previous
  // times stay on screen (dimmed) while a new one loads, and the next day is fetched ahead.
  const availCache = useRef(new Map<string, { at: number; value: Promise<PublicAvailability | null> }>());
  const [availLoading, setAvailLoading] = useState(false);
  const fetchAvail = useCallback((d: string) => {
    const k = `${d}|${party}|${zone}|${lang}`;
    const hit = availCache.current.get(k);
    if (hit && Date.now() - hit.at < 45_000) return hit.value;
    const value = publicAvailability(venue.slug, d, party, zone || null, lang);
    availCache.current.set(k, { at: Date.now(), value });
    value.catch(() => availCache.current.delete(k));
    return value;
  }, [venue.slug, party, zone, lang]);
  useEffect(() => {
    let alive = true;
    setAvailError(null);
    setAvailLoading(true);
    fetchAvail(date)
      .then((a) => { if (alive) { setAvail(a); setAvailLoading(false); } })
      .catch((e) => { if (alive) { setAvail(null); setAvailLoading(false); setAvailError((e as TablesError).message); } });
    const ahead = window.setTimeout(() => { if (date < addDays(today, venue.policy.horizonDays)) void fetchAvail(addDays(date, 1)).catch(() => undefined); }, 400);
    return () => { alive = false; window.clearTimeout(ahead); };
  }, [date, fetchAvail, today, venue.policy.horizonDays]);

  // Any change to the request makes a new idempotency key; a retry of the same request reuses it.
  useEffect(() => { key.current = newKey(); }, [choice, date, party, zone, values]);

  const days = useMemo(() => Array.from({ length: Math.min(14, venue.policy.horizonDays + 1) }, (_, i) => addDays(today, i)), [today, venue.policy.horizonDays]);
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
  const dayLabel = (d: string) => (d === today ? s.today : d === addDays(today, 1) ? s.tomorrow : fmt(d, { weekday: 'short' }));
  const parties = Array.from({ length: Math.min(12, venue.policy.maxParty - venue.policy.minParty + 1) }, (_, i) => venue.policy.minParty + i);
  const [serviceTab, setServiceTab] = useState<string | null>(null);
  /** The time the guest asked for when it was not free (free times book straight away). */
  const [desired, setDesired] = useState<string | null>(null);
  useEffect(() => { setDesired(null); }, [date, party, zone]);
  const cancelDeadline = choice ? deadline(date, choice.time, venue.timezone, venue.policy.cancelCutoffMinutes) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!text('name')) errs.name = messageFor('name_required', lang);
    if (!normalizePhone(text('phone'))) errs.phone = messageFor('phone_invalid', lang);
    if (shown('email') && text('email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text('email'))) errs.email = messageFor('email_invalid', lang);
    if (page) for (const k of missingAnswers(page, values)) errs[k] = s.answerRequired;
    if (!terms) errs.terms = messageFor('terms_required', lang);
    setErrors(errs);
    if (Object.keys(errs).length) { document.getElementById('booking-errors')?.focus(); return; }
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await publicBook(venue.slug, {
        serviceKey: choice!.serviceKey, date, time: choice!.time, party, zoneId: zone || null,
        name: text('name'), phone: text('phone'), email: shown('email') ? text('email') : '', requests: shown('requests') ? text('requests') : '', termsAccepted: true,
        ...(page && Object.keys(answersPayload(page, values)).length ? { customAnswers: answersPayload(page, values) } : {}),
      }, key.current, lang);
      setResult(r);
      setStep('result');
    } catch (err) {
      const te = err as TablesError;
      setSubmitError(te.isNetwork ? s.networkError : te.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'result' && result) {
    return <Result result={result} lang={lang} venue={venue} party={party} date={date} heading={heading} note={page?.copy.successNote}
      onPick={(c) => { setChoice({ ...c, approval: c.approval }); setResult(null); setStep('details'); }}
      onRestart={() => { setResult(null); setChoice(null); setStep('choose'); }} />;
  }

  if (step === 'details' && choice) {
    const errorList = Object.entries(errors);
    const longTerms = venue.terms.length > 180;
    return (
      <form onSubmit={submit} noValidate className="grid gap-5">
        <Stepper lang={lang} step={1} />
        <div>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none sm:text-3xl">{s.details}</h1>
          <div className="pp-card mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cloud-200 bg-white px-4 py-3">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-[var(--fz-accent)]" aria-hidden />{formatDate(date, lang, false)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-[var(--fz-accent)]" aria-hidden /><Ltr>{choice.time}</Ltr></span>
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-[var(--fz-accent)]" aria-hidden />{s.partyOf(party)}</span>
              <span className="sr-only">{s.summary(party, formatDate(date, lang, false), choice.time)}</span>
            </p>
            <button type="button" onClick={() => setStep('choose')} className="min-h-[44px] px-2 text-sm font-semibold text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.change}</button>
          </div>
          {choice.approval === 'request' && <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-800"><Hourglass className="h-4 w-4" aria-hidden />{s.requestNote}</p>}
        </div>
        {errorList.length > 0 && (
          <div id="booking-errors" tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 outline-none">
            <ul className="list-inside list-disc">{errorList.map(([k, v]) => <li key={k}><a href={`#bk-${k}`} className="underline">{v}</a></li>)}</ul>
          </div>
        )}
        <GuestFields kind="booking" page={page} lang={lang} values={values} errors={errors} prefix="bk"
          onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))} />
        <section aria-labelledby="terms-h" className="pp-card rounded-xl border border-cloud-200 bg-white p-4">
          <h2 id="terms-h" className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--fz-accent)]" aria-hidden />{s.terms}</h2>
          <p className="mt-2 flex items-start gap-1.5 text-sm font-medium">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {cancelDeadline ? <span>{s.cancelUntil} <span className="whitespace-nowrap">{formatInstant(cancelDeadline, venue.timezone, lang)}</span></span> : s.noCancelOnline}
          </p>
          {longTerms ? (
            <details className="mt-2 text-sm">
              <summary className="min-h-[32px] cursor-pointer font-medium text-[var(--fz-accent)]">{s.readTerms}</summary>
              <p className="mt-1 whitespace-pre-line text-ink-muted">{venue.terms}</p>
            </details>
          ) : <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{venue.terms}</p>}
          <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm">
            <input id="bk-terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={!!errors.terms} className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />
            {s.agree}
          </label>
        </section>
        {submitError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{submitError}</p>}
        <button type="submit" disabled={busy} className={accentButton}>
          {busy ? s.loading : choice.approval === 'request' ? s.sendRequest : page?.copy.submitLabel || s.confirm}
        </button>
        <button type="button" onClick={() => setStep('choose')} className="min-h-[44px] text-sm text-ink-muted underline-offset-2 hover:underline">{s.back}</button>
      </form>
    );
  }

  const slotCount = avail?.state === 'open' ? avail.services.reduce((n, sv) => n + sv.slots.length, 0) : 0;
  return (
    <div className="grid gap-7">
      <div>
        <Stepper lang={lang} step={0} />
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none sm:text-3xl">{page?.copy.title || s.bookTitle}</h1>
        {page?.copy.description && <p className="mt-1.5 whitespace-pre-line text-ink-muted">{page.copy.description}</p>}
      </div>
      {venue.paused && <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">{s.paused}</p>}
      <fieldset>
        <SectionTitle as="legend" icon={<Users className="h-4 w-4" />}>{s.party}</SectionTitle>
        <ScrollStrip className="pp-scroll -mx-5 flex gap-2 overflow-x-auto px-5 py-1 sm:-mx-7 sm:px-7" lang={lang}>
          {parties.map((n) => (
            <button key={n} type="button" aria-pressed={party === n} onClick={() => setParty(n)}
              className={cx('pp-chip h-12 w-12 shrink-0 rounded-full text-[17px] font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)] focus-visible:ring-offset-2', party === n && 'pp-chip-on')}>{n}</button>
          ))}
        </ScrollStrip>
        {venue.policy.maxParty > parties[parties.length - 1]! && (
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="party-more" className="text-sm text-ink-muted">{s.partyMore}:</label>
            <select id="party-more" value={party > parties[parties.length - 1]! ? party : ''} onChange={(e) => e.target.value && setParty(Number(e.target.value))} className="ui-select h-11 rounded-xl border border-cloud-300 bg-white px-3">
              <option value="">—</option>
              {Array.from({ length: venue.policy.maxParty - parties[parties.length - 1]! }, (_, i) => parties[parties.length - 1]! + 1 + i).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted">{s.largerParty}</p>
      </fieldset>
      <fieldset>
        <SectionTitle as="legend" icon={<CalendarDays className="h-4 w-4" />}>{s.date}</SectionTitle>
        <ScrollStrip className="pp-scroll -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7" lang={lang}>
          {days.map((d) => (
            <button key={d} type="button" aria-pressed={date === d} onClick={() => setDate(d)}
              className={cx('pp-chip relative flex h-[76px] w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)] focus-visible:ring-offset-2', date === d && 'pp-chip-on')}>
              <span className="text-[11px] font-medium">{dayLabel(d)}</span>
              <span className="text-xl font-semibold leading-none tabular-nums">{Number(d.slice(8))}</span>
              <span className="text-[11px]">{fmt(d, { month: 'short' })}</span>
              <span className="sr-only">, {formatDate(d, lang)}</span>
            </button>
          ))}
        </ScrollStrip>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="other-date" className="inline-flex items-center gap-1.5 text-sm text-ink-muted"><CalendarDays className="h-4 w-4" aria-hidden />{s.otherDate}:</label>
          <input id="other-date" type="date" dir="ltr" min={today} max={addDays(today, venue.policy.horizonDays)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="fz-input h-11 rounded-xl border border-cloud-300 bg-white px-2 text-sm" />
          <p className="text-sm font-medium">{formatDate(date, lang)}</p>
        </div>
      </fieldset>
      {venue.policy.zoneChoice && venue.zones.length > 1 && (
        <div>
          <label htmlFor="zone" className="mb-2 block text-base font-semibold">{s.zone}</label>
          <select id="zone" value={zone} onChange={(e) => setZone(e.target.value)} className="ui-select h-12 w-full rounded-xl border border-cloud-300 bg-white px-3">
            <option value="">{s.anyZone}</option>
            {venue.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      )}
      <section aria-labelledby="times-h" aria-busy={availLoading} className={cx('transition-opacity duration-150', availLoading && avail && 'pointer-events-none opacity-60')}>
        <SectionTitle id="times-h" icon={<Clock className="h-4 w-4" />}>{s.time}</SectionTitle>
        {availError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{availError}</p>
          : !avail ? (
            <div aria-hidden className="grid animate-pulse grid-cols-3 gap-2 sm:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <div key={i} className="h-12 rounded-xl bg-cloud-200" />)}</div>
          ) : avail.state !== 'open' && avail.state !== 'full' ? (
            <div role="status" className="pp-card rounded-xl border border-cloud-200 bg-white p-4">
              <p>{avail.state === 'closed' ? s.closed : avail.state === 'paused' ? s.paused : avail.state === 'party_size' ? s.partySize : s.outOfRange}</p>
              {avail.state === 'closed' && date < addDays(today, venue.policy.horizonDays) && (
                <button type="button" onClick={() => setDate(addDays(date, 1))} className="mt-2 min-h-[44px] font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.tryNextDay}</button>
              )}
            </div>
          ) : (
            <div className="grid gap-5">
              {(() => {
                // The guest asks for the time they want; free times around it follow. Times are
                // grouped by service (lunch / dinner / late) so the list stays short and scannable.
                const open: OpenSlot[] = avail.state === 'open' ? avail.services.flatMap((sv) => sv.slots.map((sl) => ({ serviceKey: sv.key, time: sl.time, approval: sl.approval }))) : [];
                const wanted = desiredTimes(venue.services, weekdayOf(date), open);
                const svcs = venue.services.filter((sv) => wanted.some((w) => w.serviceKey === sv.key));
                const current = svcs.find((sv) => sv.key === serviceTab) ?? svcs.find((sv) => wanted.some((w) => w.serviceKey === sv.key && open.some((o) => o.time === w.time))) ?? svcs[0];
                const list = current ? wanted.filter((w) => w.serviceKey === current.key) : wanted;
                const pick = (sl: OpenSlot) => { setChoice({ serviceKey: sl.serviceKey, time: sl.time, approval: sl.approval }); setStep('details'); };
                const found = desired ? nearestSlots(open, desired) : null;
                const canWait = venue.policy.waitlistPublic;
                const waitHref = `/t/${venue.slug}/waitlist?${new URLSearchParams({ date, party: String(party), ...(desired ? { time: desired } : {}), ...(lang === 'en' ? { lang: 'en' } : {}) }).toString()}`;
                const he = lang === 'he';
                return (
                  <>
                    <p className="sr-only" role="status">{lang === 'he' ? (slotCount === 1 ? 'שעה אחת פנויה' : `${slotCount} שעות פנויות`) : slotCount === 1 ? '1 time available' : `${slotCount} times available`}</p>
                    <p className="-mt-2 text-sm text-ink-muted">{he ? 'בחרו את השעה שאתם רוצים. אם היא תפוסה, נראה את השעות הפנויות הקרובות.' : 'Pick the time you want. If it is taken, we show the nearest free times.'}</p>
                    {svcs.length > 1 && (
                      <div role="tablist" aria-label={s.time} className="pp-seg flex gap-1 rounded-full p-1">
                        {svcs.map((sv) => (
                          <button key={sv.key} type="button" role="tab" aria-selected={sv.key === current?.key} onClick={() => { setServiceTab(sv.key); setDesired(null); }}
                            className="pp-seg-btn flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 text-sm font-semibold sm:gap-1.5 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)]">
                            <span aria-hidden className="hidden min-[360px]:inline-flex">{serviceIcon(sv.start)}</span><span className="min-w-0 truncate">{sv.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div role="group" aria-label={s.time} className="pp-slots grid grid-cols-3 gap-2 min-[380px]:grid-cols-4 sm:grid-cols-5">
                      {list.map((w) => {
                        const free = open.find((o) => o.time === w.time);
                        return (
                          <button key={w.time} type="button" {...(free ? { 'data-slot': '' } : { 'data-desired': '' })} aria-pressed={desired === w.time}
                            onClick={() => { if (free) pick(free); else setDesired(w.time); }}
                            aria-label={w.time + (free?.approval === 'request' ? ', ' + s.requestNote : '')}
                            className={cx('pp-chip flex h-12 flex-col items-center justify-center rounded-full font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)] focus-visible:ring-offset-2', desired === w.time && 'pp-chip-on')}>
                            <span dir="ltr" className="text-[15px] leading-none">{w.time}</span>
                            {free?.approval === 'request' && <span className="mt-0.5 text-[10px] font-normal leading-none text-amber-800">{he ? 'בקשה' : 'Request'}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {(found || avail.state === 'full') && (
                      <div role="status" aria-live="polite" className="pp-card grid gap-3 rounded-xl border border-cloud-200 bg-white p-4">
                        <p className="font-semibold">
                          {desired ? (he ? <>השעה <bdi dir="ltr">{desired}</bdi> תפוסה.</> : <><bdi dir="ltr">{desired}</bdi> is taken.</>) : s.full}
                        </p>
                        {found && found.near.length > 0 ? (
                          <>
                            <p className="text-sm text-ink-muted">{he ? 'השעות הפנויות הקרובות:' : 'The nearest free times:'}</p>
                            <div className="flex flex-wrap gap-2">
                              {found.near.map((sl) => (
                                <button key={sl.time} type="button" data-slot data-near onClick={() => pick(sl)}
                                  className="pp-chip flex h-12 min-w-[5.5rem] items-center justify-center rounded-full px-4 font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)] focus-visible:ring-offset-2">
                                  <span dir="ltr">{sl.time}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-ink-muted">{he ? 'אין שעה פנויה קרובה ביום הזה.' : 'No free time near it on this day.'}</p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {canWait && <Link to={waitHref} className={accentButton}>{desired ? (he ? `הצטרפות להמתנה ל־${desired}` : `Join the waitlist for ${desired}`) : (he ? 'הצטרפות לרשימת ההמתנה' : 'Join the waitlist')}</Link>}
                          {date < addDays(today, venue.policy.horizonDays) && (
                            <button type="button" onClick={() => { setDate(addDays(date, 1)); setDesired(null); }} className={softButton}>{s.tryNextDay}</button>
                          )}
                        </div>
                        {!canWait && venue.phone && (
                          <p className="text-sm text-ink-muted">{he ? 'רוצים בדיוק את השעה הזו? אפשר להתקשר: ' : 'Need exactly this time? Call: '}<a href={`tel:${venue.phone}`} className="font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline"><Ltr>{venue.phone}</Ltr></a></p>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
      </section>
    </div>
  );
}

/** The instant of a cutoff before a local date/time, computed in the venue timezone. */
export function deadline(date: string, time: string, tz: string, cutoffMinutes: number): string | null {
  if (cutoffMinutes <= 0) return null;
  const guess = new Date(`${date}T${time}:00Z`);
  // Find the UTC instant whose venue-local wall time equals date+time.
  const local = new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(guess).replace(' ', 'T') + ':00Z');
  const start = new Date(guess.getTime() - (local.getTime() - guess.getTime()));
  return new Date(start.getTime() - cutoffMinutes * 60_000).toISOString();
}

function downloadCalendar(venue: PublicVenue, startsAt: string, lang: Lang, reference?: string) {
  const s = tx(lang);
  const ics = calendarFile({ title: s.calendarTitle(venue.name), startsAt, minutes: 120, location: venue.address, details: reference ? `${s.reference}: ${reference}` : undefined });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${venue.slug}-${startsAt.slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Result({ result, lang, venue, party, date, heading, note, onPick, onRestart }: {
  result: BookResult; lang: Lang; venue: PublicVenue; party: number; date: string; heading: React.RefObject<HTMLHeadingElement>; note?: string;
  onPick: (c: Choice) => void; onRestart: () => void;
}) {
  const s = tx(lang);
  const [copied, setCopied] = useState(false);
  if (result.result === 'unavailable') {
    return (
      <div className="grid gap-4">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">{s.unavailableTitle}</h1>
        {result.alternatives?.length ? (
          <>
            <p className="text-ink-muted">{s.unavailableBody}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {result.alternatives.map((a) => (
                <button key={`${a.serviceKey}-${a.time}`} type="button" onClick={() => onPick({ serviceKey: a.serviceKey, time: a.time, approval: a.approval })}
                  className="pp-chip h-12 rounded-xl text-base font-semibold tabular-nums"><span dir="ltr">{a.time}</span></button>
              ))}
            </div>
          </>
        ) : <p className="text-ink-muted">{s.noAlternatives}</p>}
        <button type="button" onClick={onRestart} className="min-h-[44px] font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.pickOtherTime}</button>
      </div>
    );
  }
  const pending = result.result === 'pending';
  const url = result.token ? manageUrl(result.token, lang) : '';
  const time = result.reservation?.time ?? '';
  return (
    <div className="grid gap-5">
      <Stepper lang={lang} step={2} />
      <article className="pp-ticket overflow-hidden rounded-[var(--pp-r-lg,24px)] border border-cloud-200">
        <div className="pp-ticket-head px-5 py-5 sm:px-6">
          <h1 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-xl font-semibold outline-none sm:text-2xl">
            {pending ? <Hourglass className="h-6 w-6 shrink-0" aria-hidden /> : <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />}
            {pending ? s.pendingTitle : s.confirmedTitle}
          </h1>
          <p className="mt-1 text-sm text-white/85">{venue.name}</p>
        </div>
        <div className="grid gap-4 bg-[var(--pp-surface,#fff)] px-5 py-5 sm:px-6">
          <dl className="grid grid-cols-3 gap-3">
            <div className="min-w-0"><dt className="text-xs text-ink-muted">{lang === 'he' ? 'תאריך' : 'Date'}</dt><dd className="mt-0.5 font-semibold">{formatDate(date, lang, false)}</dd></div>
            <div><dt className="text-xs text-ink-muted">{lang === 'he' ? 'שעה' : 'Time'}</dt><dd className="mt-0.5 text-2xl font-semibold tabular-nums leading-none"><Ltr>{time}</Ltr></dd></div>
            <div><dt className="text-xs text-ink-muted">{lang === 'he' ? 'סועדים' : 'Guests'}</dt><dd className="mt-0.5 text-2xl font-semibold tabular-nums leading-none">{party}</dd></div>
          </dl>
          <p className="sr-only">{s.summary(party, formatDate(date, lang), time)}</p>
          <p className="text-sm text-ink-muted">{pending ? s.pendingBody : s.confirmedBody}</p>
          <div className="pp-ticket-cut flex flex-wrap items-center justify-between gap-2 pt-4">
            <p className="text-sm">{s.reference}: <Ltr className="rounded-md bg-[var(--pp-accent-soft,#f3ede6)] px-2 py-0.5 font-mono text-base font-semibold tracking-[0.18em]">{result.reference}</Ltr></p>
            {venue.address && <p className="text-sm text-ink-muted">{venue.address}</p>}
          </div>
          {note && <p className="whitespace-pre-line rounded-xl bg-[var(--pp-accent-soft,#f3ede6)] p-3 text-sm">{note}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {result.reservation?.startsAt && (
              <button type="button" className={softButton} onClick={() => downloadCalendar(venue, result.reservation!.startsAt, lang, result.reference)}>
                <CalendarPlus className="h-4 w-4" aria-hidden />{s.addToCalendar}
              </button>
            )}
            {venue.address && (
              <a href={mapsHref(venue.address)} target="_blank" rel="noopener noreferrer" className={softButton}>
                <Navigation className="h-4 w-4" aria-hidden />{s.directions}
              </a>
            )}
          </div>
        </div>
      </article>
      {url && (
        <section aria-labelledby="manage-h" className="pp-card rounded-2xl border border-cloud-200 bg-white p-5">
          <h2 id="manage-h" className="font-semibold">{s.manageTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{s.manageBody}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button type="button" className={cx(accentButton, 'min-h-[48px] text-sm')} onClick={async () => {
              try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
            }}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? s.copied : s.copy}
            </button>
            <a href={url} className={softButton}>
              <ExternalLink className="h-4 w-4" aria-hidden /> {s.openManage}
            </a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${venue.name}: ${url}`)}`} target="_blank" rel="noopener noreferrer" className={softButton}>
              <MessageCircle className="h-4 w-4" aria-hidden /> {s.shareSelf}
            </a>
          </div>
          <span role="status" className="sr-only">{copied ? s.copied : ''}</span>
        </section>
      )}
    </div>
  );
}
