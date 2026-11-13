import { BellRing, Clock, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { cx, PageLoader } from '../../components/ui';
import { newKey, publicVenue, publicWaitlistJoin, publicWaitlistLeave, publicWaitlistStatus, type PublicVenue, type WaitlistStatus } from '../data/client';
import { messageFor, type TablesError } from '../domain/errors';
import { answersPayload, missingAnswers } from '../domain/publicPages';
import { normalizePhone } from '../domain/phone';
import { dateInTz, formatDate, formatInstant } from '../domain/time';
import { GuestFields, type GuestValues } from './GuestFields';
import { tx } from './i18n';
import { lookFor, pageOf } from './look';
import { useFragmentToken } from './ManagePage';
import { accentButton, PublicShell, useDocumentLanguage, useLang } from './PublicShell';

export function WaitlistJoinPage() {
  const { slug = '' } = useParams();
  const lang = useLang();
  const s = tx(lang);
  const navigate = useNavigate();
  // From the booking page: the day and time the guest wanted (and their party size).
  const [params] = useSearchParams();
  const wantDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : null;
  const wantTime = /^\d{2}:\d{2}$/.test(params.get('time') ?? '') ? params.get('time')! : null;
  const wantParty = Number(params.get('party')) || 2;
  const [venue, setVenue] = useState<PublicVenue | null | undefined>(undefined);
  const [form, setForm] = useState({ party: wantParty, consent: false });
  const [values, setValues] = useState<GuestValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  useDocumentLanguage(lang, venue ? `${venue.name} · ${s.waitlistTitle}` : s.waitlistTitle);
  useEffect(() => { publicVenue(slug, lang).then(setVenue).catch(() => setVenue(null)); }, [slug, lang]);
  const design = useMemo(() => (venue ? lookFor(venue, 'waitlist') : null), [venue]);
  const page = pageOf(design, 'waitlist');
  const text = (k: string) => (typeof values[k] === 'string' ? (values[k] as string).trim() : '');
  // Any change to the request makes a new idempotency key; a retry of the same request reuses it.
  useEffect(() => { key.current = newKey(); }, [values, form.party]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!text('name')) errs.name = messageFor('name_required', lang);
    if (!normalizePhone(text('phone'))) errs.phone = messageFor('phone_invalid', lang);
    if (page) for (const k of missingAnswers(page, values)) errs[k] = s.answerRequired;
    setErrors(errs);
    const first = Object.values(errs)[0];
    if (first) { setError(first); return; }
    if (!form.consent) { setError(messageFor('terms_required', lang)); return; }
    setBusy(true);
    setError(null);
    try {
      const notes = page?.fields.some((f) => f.key === 'notes' && !f.hidden) ? text('notes') : '';
      const answers = page ? answersPayload(page, values) : {};
      const r = await publicWaitlistJoin(slug, {
        name: text('name'), phone: text('phone'), party: form.party, consent: true,
        ...(wantDate ? { date: wantDate } : {}), ...(wantTime ? { time: wantTime } : {}),
        ...(notes ? { notes } : {}), ...(Object.keys(answers).length ? { customAnswers: answers } : {}),
      }, key.current, lang);
      navigate(`/t/w${lang === 'en' ? '?lang=en' : ''}#t=${r.token}`);
    } catch (err) {
      setError((err as TablesError).message);
    } finally {
      setBusy(false);
    }
  }

  if (venue === undefined) return <PageLoader label={s.loading} />;
  if (!venue || !venue.policy.waitlistPublic) return (
    <PublicShell lang={lang} venue={venue ?? null}><h1 className="text-xl font-semibold">{s.notFound}</h1><p className="mt-2 text-ink-muted">{s.notFoundBody}</p></PublicShell>
  );
  return (
    <PublicShell lang={lang} venue={{ ...venue, today: dateInTz(new Date(venue.serverNow), venue.timezone) }} design={design}>
      <form onSubmit={submit} noValidate className="grid gap-5">
        <h1 className="text-2xl font-semibold sm:text-3xl">{page?.copy.title || s.waitlistTitle}</h1>
        {wantDate || wantTime ? (
          <p className="pp-card flex items-center gap-2 rounded-xl border border-cloud-200 bg-white px-4 py-3 font-semibold">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {lang === 'en' ? 'Waitlist for ' : 'רשימת המתנה ל'}{wantDate ? formatDate(wantDate, lang, false) : (lang === 'en' ? 'today' : 'היום')}{wantTime && <>{lang === 'en' ? ' at ' : ' בשעה '}<bdi dir="ltr">{wantTime}</bdi></>}
          </p>
        ) : null}
        <p className="whitespace-pre-line text-ink-muted">{wantDate || wantTime ? (lang === 'en' ? 'If a table frees up at that time, the venue will contact you to confirm a booking.' : 'אם יתפנה שולחן בשעה הזו, המקום ייצור אתכם קשר כדי לקבוע את ההזמנה.') : page?.copy.description || s.waitlistIntro}</p>
        <fieldset>
          <legend className="mb-3 text-base font-semibold">{s.party}</legend>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: Math.min(10, venue.policy.maxParty) }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={form.party === n} onClick={() => setForm({ ...form, party: n })}
                className={cx('pp-chip h-12 rounded-xl font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fz-accent)] focus-visible:ring-offset-2', form.party === n && 'pp-chip-on')}>{n}</button>
            ))}
          </div>
        </fieldset>
        <GuestFields kind="waitlist" page={page} lang={lang} values={values} errors={errors} prefix="wl"
          onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))} />
        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />
          {s.waitlistConsent}
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy} className={accentButton}>{busy ? s.loading : page?.copy.submitLabel || s.join}</button>
      </form>
    </PublicShell>
  );
}

export function WaitlistStatusPage() {
  const lang = useLang();
  const s = tx(lang);
  const token = useFragmentToken('waitlist');
  const [st, setSt] = useState<WaitlistStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [venue, setVenue] = useState<PublicVenue | null>(null);
  useDocumentLanguage(lang, st ? `${st.venue.name} · ${s.waitlistTitle}` : s.waitlistTitle);
  const load = useCallback(async () => {
    if (!token) { setSt(null); return; }
    try { setSt(await publicWaitlistStatus(token, lang)); } catch { /* keep the last known status */ }
  }, [token, lang]);
  useEffect(() => { void load(); const t = setInterval(() => { void load(); setNow(new Date()); }, 20_000); return () => clearInterval(t); }, [load]);
  const venueSlug = st?.venue.slug;
  useEffect(() => { if (venueSlug) publicVenue(venueSlug, lang).then(setVenue).catch(() => setVenue(null)); }, [venueSlug, lang]);
  const design = useMemo(() => (venue ? lookFor(venue, 'waitlist') : null), [venue]);

  if (st === undefined) return <PageLoader label={s.loading} />;
  if (st === null) return <PublicShell lang={lang} venue={null}><h1 className="text-xl font-semibold">{s.linkUnavailable}</h1><p className="mt-2 text-ink-muted">{s.linkUnavailableBody}</p></PublicShell>;
  const offered = st.status === 'offered' && st.offerExpiresAt && new Date(st.offerExpiresAt) > now;
  return (
    <PublicShell lang={lang} venue={{ name: st.venue.name, brand: venue?.brand }} compact design={design}>
      <div className="grid gap-4">
        {offered ? (
          <div role="alert" className="rounded-2xl border border-teal-300 bg-teal-50 p-5">
            <h1 className="flex items-center gap-2 text-2xl font-semibold"><BellRing className="h-6 w-6" aria-hidden /> {s.tableReady}</h1>
            <p className="mt-2">{s.holdUntil} <strong>{formatInstant(st.offerExpiresAt!, st.venue.timezone, lang)}</strong></p>
          </div>
        ) : st.status === 'waiting' || st.status === 'offered' ? (
          <div className="pp-card rounded-2xl border border-cloud-200 bg-white p-5">
            <h1 className="text-2xl font-semibold">{s.youAreWaiting}</h1>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="flex items-center gap-1 text-ink-muted"><Users className="h-4 w-4" aria-hidden />{s.guests}</dt><dd className="font-semibold tabular-nums">{st.party}</dd>
              {st.date && <><dt className="text-ink-muted">{lang === 'en' ? 'Day' : 'יום'}</dt><dd className="font-semibold">{formatDate(st.date, lang, false)}{st.desiredTime && <>{' · '}<bdi dir="ltr">{st.desiredTime}</bdi></>}</dd></>}
              {st.position != null && <><dt className="text-ink-muted">{s.position}</dt><dd className="font-semibold tabular-nums">{st.position}</dd></>}
            </dl>
            {st.estimate && <p className="mt-3 flex items-start gap-1.5 text-sm text-ink-muted"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{s.estimate(st.estimate.min, st.estimate.max)}</p>}
            {design?.pages.waitlist.copy.successNote && <p className="mt-3 whitespace-pre-line border-t border-cloud-200 pt-3 text-sm">{design.pages.waitlist.copy.successNote}</p>}
          </div>
        ) : (
          <div role="status" className="pp-card rounded-2xl border border-cloud-200 bg-white p-5">
            <h1 className="text-xl font-semibold">{st.status === 'booked' ? (lang === 'en' ? 'You have a booking' : 'נקבעה לכם הזמנה') : st.status === 'seated' ? s.seated : st.status === 'cancelled' ? s.left : s.waitlistClosed}</h1>
            {st.status === 'booked' && st.booking && <p className="mt-2">{formatDate(st.booking.date, lang, false)} · <bdi dir="ltr" className="font-semibold">{st.booking.time}</bdi></p>}
          </div>
        )}
        {(st.status === 'waiting' || st.status === 'offered') && (
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await publicWaitlistLeave(token!, lang); await load(); } finally { setBusy(false); }
          }} className="min-h-[48px] rounded-xl border border-cloud-300 bg-white px-4 font-semibold">{s.leave}</button>
        )}
        <p className="text-xs text-ink-muted">{lang === 'he' ? 'הדף מתעדכן לבד כל 20 שניות.' : 'This page refreshes every 20 seconds.'}</p>
      </div>
    </PublicShell>
  );
}

