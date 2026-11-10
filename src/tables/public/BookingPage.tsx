import { CalendarDays, CheckCircle2, Clock, Copy, ExternalLink, Hourglass, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cx } from '../../components/ui';
import { publicBaseUrl } from '../../lib/links';
import { newKey, publicAvailability, publicBook, publicVenue, type BookResult, type PublicAvailability, type PublicVenue } from '../data/client';
import { messageFor, type TablesError } from '../domain/errors';
import { normalizePhone } from '../domain/phone';
import { addDays, dateInTz, formatDate, formatInstant } from '../domain/time';
import { Ltr } from '../ui';
import { tx, type Lang } from './i18n';
import { accentButton, PublicShell, useDocumentLanguage, useLang } from './PublicShell';

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

  if (loadError) return <PublicShell lang={lang} venue={null}><p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{loadError}</p></PublicShell>;
  if (venue === undefined) return <PublicShell lang={lang} venue={null}><BookingSkeleton /></PublicShell>;
  if (venue === null) return (
    <PublicShell lang={lang} venue={null}>
      <h1 className="text-xl font-semibold">{s.notFound}</h1>
      <p className="mt-2 text-ink-muted">{s.notFoundBody}</p>
    </PublicShell>
  );
  return <PublicShell lang={lang} venue={venue}><Booking venue={venue} lang={lang} /></PublicShell>;
}

function BookingSkeleton() {
  return (
    <div aria-hidden className="grid animate-pulse gap-4">
      <div className="h-6 w-40 rounded bg-cloud-200" />
      <div className="grid grid-cols-5 gap-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-12 rounded-xl bg-cloud-200" />)}</div>
      <div className="h-6 w-32 rounded bg-cloud-200" />
      <div className="grid grid-cols-3 gap-2">{Array.from({ length: 9 }, (_, i) => <div key={i} className="h-14 rounded-xl bg-cloud-200" />)}</div>
    </div>
  );
}

function Booking({ venue, lang }: { venue: PublicVenue; lang: Lang }) {
  const s = tx(lang);
  const today = dateInTz(new Date(venue.serverNow), venue.timezone);
  const [step, setStep] = useState<Step>('choose');
  const [party, setParty] = useState(Math.min(Math.max(2, venue.policy.minParty), venue.policy.maxParty));
  const [date, setDate] = useState(today);
  const [zone, setZone] = useState<string>('');
  const [avail, setAvail] = useState<PublicAvailability | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', requests: '', terms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BookResult | null>(null);
  const key = useRef(newKey());
  const heading = useFocusOnChange(step);

  useEffect(() => {
    let alive = true;
    setAvail(null);
    setAvailError(null);
    const timer = setTimeout(() => {
      publicAvailability(venue.slug, date, party, zone || null, lang).then((a) => alive && setAvail(a)).catch((e) => alive && setAvailError((e as TablesError).message));
    }, 150);
    return () => { alive = false; clearTimeout(timer); };
  }, [venue.slug, date, party, zone, lang]);

  // Any change to the request makes a new idempotency key; a retry of the same request reuses it.
  useEffect(() => { key.current = newKey(); }, [choice, date, party, zone, form.name, form.phone, form.email, form.requests]);

  const days = useMemo(() => Array.from({ length: Math.min(14, venue.policy.horizonDays + 1) }, (_, i) => addDays(today, i)), [today, venue.policy.horizonDays]);
  const dayLabel = (d: string) => (d === today ? s.today : d === addDays(today, 1) ? s.tomorrow : new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${d}T12:00:00Z`)));
  const parties = Array.from({ length: Math.min(10, venue.policy.maxParty - venue.policy.minParty + 1) }, (_, i) => venue.policy.minParty + i);
  const cancelDeadline = choice ? deadline(date, choice.time, venue.timezone, venue.policy.cancelCutoffMinutes) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = messageFor('name_required', lang);
    if (!normalizePhone(form.phone)) errs.phone = messageFor('phone_invalid', lang);
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errs.email = messageFor('email_invalid', lang);
    if (!form.terms) errs.terms = messageFor('terms_required', lang);
    setErrors(errs);
    if (Object.keys(errs).length) { document.getElementById('booking-errors')?.focus(); return; }
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await publicBook(venue.slug, {
        serviceKey: choice!.serviceKey, date, time: choice!.time, party, zoneId: zone || null,
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), requests: form.requests.trim(), termsAccepted: true,
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
    return <Result result={result} lang={lang} venue={venue} party={party} date={date} heading={heading}
      onPick={(c) => { setChoice({ ...c, approval: c.approval }); setResult(null); setStep('details'); }}
      onRestart={() => { setResult(null); setChoice(null); setStep('choose'); }} />;
  }

  if (step === 'details' && choice) {
    const errorList = Object.entries(errors);
    return (
      <form onSubmit={submit} noValidate className="grid gap-5">
        <div>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">{s.details}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cloud-200 bg-white px-3 py-2.5">
            <p className="font-medium">{s.summary(party, formatDate(date, lang, false), choice.time)}</p>
            <button type="button" onClick={() => setStep('choose')} className="min-h-[44px] px-2 text-sm font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.change}</button>
          </div>
          {choice.approval === 'request' && <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-800"><Hourglass className="h-4 w-4" aria-hidden />{s.requestNote}</p>}
        </div>
        {errorList.length > 0 && (
          <div id="booking-errors" tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 outline-none">
            <ul className="list-inside list-disc">{errorList.map(([k, v]) => <li key={k}><a href={`#bk-${k}`} className="underline">{v}</a></li>)}</ul>
          </div>
        )}
        <Field id="bk-name" label={s.name} error={errors.name} required>
          <input id="bk-name" autoComplete="name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-invalid={!!errors.name} aria-describedby={errors.name ? 'bk-name-err' : undefined} className={inputCls(!!errors.name)} />
        </Field>
        <Field id="bk-phone" label={s.phone} error={errors.phone} hint={s.phoneHint} required>
          <input id="bk-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={form.phone} maxLength={24} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            aria-invalid={!!errors.phone} aria-describedby={`bk-phone-hint${errors.phone ? ' bk-phone-err' : ''}`} className={cx(inputCls(!!errors.phone), 'text-start')} />
        </Field>
        <Field id="bk-email" label={s.email} error={errors.email}>
          <input id="bk-email" type="email" autoComplete="email" dir="ltr" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-invalid={!!errors.email} className={cx(inputCls(!!errors.email), 'text-start')} />
        </Field>
        <Field id="bk-requests" label={s.requests} hint={s.requestsHint}>
          <textarea id="bk-requests" value={form.requests} maxLength={500} onChange={(e) => setForm({ ...form, requests: e.target.value })} aria-describedby="bk-requests-hint"
            className={cx(inputCls(false), 'min-h-[88px] py-2.5')} />
        </Field>
        <section aria-labelledby="terms-h" className="rounded-xl border border-cloud-200 bg-white p-4">
          <h2 id="terms-h" className="font-semibold">{s.terms}</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{venue.terms}</p>
          <p className="mt-2 flex items-start gap-1.5 text-sm font-medium">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {cancelDeadline ? <span>{s.cancelUntil} <span className="whitespace-nowrap">{formatInstant(cancelDeadline, venue.timezone, lang)}</span></span> : s.noCancelOnline}
          </p>
          <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm">
            <input id="bk-terms" type="checkbox" checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} aria-invalid={!!errors.terms} className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />
            {s.agree}
          </label>
        </section>
        {submitError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{submitError}</p>}
        <button type="submit" disabled={busy} className={accentButton}>
          {busy ? s.loading : choice.approval === 'request' ? s.sendRequest : s.confirm}
        </button>
        <button type="button" onClick={() => setStep('choose')} className="min-h-[44px] text-sm text-ink-muted underline-offset-2 hover:underline">{s.back}</button>
      </form>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">{s.bookTitle}</h1>
        {venue.intro && <p className="mt-1 whitespace-pre-line text-ink-muted">{venue.intro}</p>}
      </div>
      {venue.paused && <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">{s.paused}</p>}
      <fieldset>
        <legend className="mb-2 text-base font-semibold">{s.party}</legend>
        <div className="grid grid-cols-5 gap-2">
          {parties.map((n) => (
            <button key={n} type="button" aria-pressed={party === n} onClick={() => setParty(n)}
              className={cx('h-12 rounded-xl border text-base font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)]',
                party === n ? 'border-[var(--fz-accent)] bg-[var(--fz-accent)] text-[var(--fz-on-accent)]' : 'border-cloud-300 bg-white')}>{n}</button>
          ))}
        </div>
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
        <legend className="mb-2 text-base font-semibold">{s.date}</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group">
          {days.map((d) => (
            <button key={d} type="button" aria-pressed={date === d} onClick={() => setDate(d)}
              className={cx('relative flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)]',
                date === d ? 'border-[var(--fz-accent)] bg-[var(--fz-accent)] text-[var(--fz-on-accent)]' : 'border-cloud-300 bg-white')}>
              <span className="text-xs">{dayLabel(d)}</span>
              <span className="text-lg font-semibold tabular-nums">{Number(d.slice(8))}</span>
              <span className="sr-only">, {formatDate(d, lang)}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-ink-muted" aria-hidden />
          <label htmlFor="other-date" className="text-sm text-ink-muted">{s.otherDate}:</label>
          <input id="other-date" type="date" dir="ltr" min={today} max={addDays(today, venue.policy.horizonDays)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="fz-input h-11 rounded-xl border border-cloud-300 bg-white px-2 text-sm" />
        </div>
        <p className="mt-1 text-sm font-medium">{formatDate(date, lang)}</p>
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
      <section aria-labelledby="times-h" aria-busy={!avail && !availError}>
        <h2 id="times-h" className="mb-2 text-base font-semibold">{s.time}</h2>
        {availError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{availError}</p>
          : !avail ? (
            <div aria-hidden className="grid animate-pulse grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-14 rounded-xl bg-cloud-200" />)}</div>
          ) : avail.state !== 'open' ? (
            <div role="status" className="rounded-xl border border-cloud-200 bg-white p-4">
              <p>{avail.state === 'closed' ? s.closed : avail.state === 'full' ? s.full : avail.state === 'paused' ? s.paused : avail.state === 'party_size' ? s.partySize : s.outOfRange}</p>
              {(avail.state === 'closed' || avail.state === 'full') && date < addDays(today, venue.policy.horizonDays) && (
                <button type="button" onClick={() => setDate(addDays(date, 1))} className="mt-2 min-h-[44px] font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.tryNextDay}</button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {avail.services.filter((sv) => sv.slots.length).map((sv) => (
                <div key={sv.key}>
                  <p className="mb-1.5 text-sm text-ink-muted">{sv.name}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {sv.slots.map((sl) => (
                      <button key={sl.time} type="button" onClick={() => { setChoice({ serviceKey: sv.key, time: sl.time, approval: sl.approval }); setStep('details'); }}
                        aria-label={`${sl.time}${sl.approval === 'request' ? `, ${s.requestNote}` : ''}`}
                        className="flex h-14 flex-col items-center justify-center rounded-xl border border-cloud-300 bg-white font-semibold tabular-nums hover:border-[var(--fz-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)]">
                        <span dir="ltr" className="text-lg">{sl.time}</span>
                        {sl.approval === 'request' && <span className="text-[11px] font-normal text-amber-800">{lang === 'he' ? 'בקשה' : 'Request'}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </section>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={lang === 'he' ? 'עוד באתר' : 'More'}>
        <Link to={`/t/${venue.slug}/menu${lang === 'en' ? '?lang=en' : ''}`} className="min-h-[44px] py-2 font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.viewMenu}</Link>
        {venue.policy.waitlistPublic && <Link to={`/t/${venue.slug}/waitlist${lang === 'en' ? '?lang=en' : ''}`} className="min-h-[44px] py-2 font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">{s.joinWaitlist}</Link>}
      </nav>
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

function inputCls(invalid: boolean) {
  return cx('fz-input h-12 w-full rounded-xl border bg-white px-3.5 text-[16px] text-ink', invalid ? 'border-red-400' : 'border-cloud-300');
}

function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}{required && <span aria-hidden className="ms-1 text-[var(--fz-accent)]">*</span>}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Result({ result, lang, venue, party, date, heading, onPick, onRestart }: {
  result: BookResult; lang: Lang; venue: PublicVenue; party: number; date: string; heading: React.RefObject<HTMLHeadingElement>;
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
            <div className="grid grid-cols-3 gap-2">
              {result.alternatives.map((a) => (
                <button key={`${a.serviceKey}-${a.time}`} type="button" onClick={() => onPick({ serviceKey: a.serviceKey, time: a.time, approval: a.approval })}
                  className="h-14 rounded-xl border border-cloud-300 bg-white text-lg font-semibold tabular-nums hover:border-[var(--fz-accent)]"><span dir="ltr">{a.time}</span></button>
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
  return (
    <div className="grid gap-5">
      <div className={cx('rounded-2xl border p-5', pending ? 'border-amber-300 bg-amber-50' : 'border-teal-200 bg-teal-50')}>
        <h1 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-2xl font-semibold outline-none">
          {pending ? <Hourglass className="h-6 w-6 text-amber-800" aria-hidden /> : <CheckCircle2 className="h-6 w-6 text-teal-700" aria-hidden />}
          {pending ? s.pendingTitle : s.confirmedTitle}
        </h1>
        <p className="mt-2 text-lg font-medium">{s.summary(party, formatDate(date, lang), result.reservation?.time ?? '')}</p>
        <p className="mt-1 text-ink-muted">{pending ? s.pendingBody : s.confirmedBody}</p>
        <p className="mt-2 text-sm">{s.reference}: <Ltr className="font-semibold tracking-wider">{result.reference}</Ltr></p>
        {venue.address && <p className="mt-1 text-sm text-ink-muted">{venue.address}</p>}
      </div>
      {url && (
        <section aria-labelledby="manage-h" className="rounded-2xl border border-cloud-200 bg-white p-5">
          <h2 id="manage-h" className="font-semibold">{s.manageTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{s.manageBody}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button type="button" className={cx(accentButton, 'text-sm')} onClick={async () => {
              try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
            }}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? s.copied : s.copy}
            </button>
            <a href={url} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-cloud-300 px-3 text-sm font-medium">
              <ExternalLink className="h-4 w-4" aria-hidden /> {s.openManage}
            </a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${venue.name}: ${url}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-cloud-300 px-3 text-sm font-medium">
              <MessageCircle className="h-4 w-4" aria-hidden /> {s.shareSelf}
            </a>
          </div>
          <span role="status" className="sr-only">{copied ? s.copied : ''}</span>
        </section>
      )}
    </div>
  );
}

