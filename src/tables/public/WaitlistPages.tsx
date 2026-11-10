import { BellRing, Clock, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cx } from '../../components/ui';
import { newKey, publicVenue, publicWaitlistJoin, publicWaitlistLeave, publicWaitlistStatus, type PublicVenue, type WaitlistStatus } from '../data/client';
import { messageFor, type TablesError } from '../domain/errors';
import { normalizePhone } from '../domain/phone';
import { formatInstant } from '../domain/time';
import { tx } from './i18n';
import { useFragmentToken } from './ManagePage';
import { accentButton, PublicShell, useDocumentLanguage, useLang } from './PublicShell';

export function WaitlistJoinPage() {
  const { slug = '' } = useParams();
  const lang = useLang();
  const s = tx(lang);
  const navigate = useNavigate();
  const [venue, setVenue] = useState<PublicVenue | null | undefined>(undefined);
  const [form, setForm] = useState({ name: '', phone: '', party: 2, consent: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  useDocumentLanguage(lang, venue ? `${venue.name} · ${s.waitlistTitle}` : s.waitlistTitle);
  useEffect(() => { publicVenue(slug, lang).then(setVenue).catch(() => setVenue(null)); }, [slug, lang]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError(messageFor('name_required', lang)); return; }
    if (!normalizePhone(form.phone)) { setError(messageFor('phone_invalid', lang)); return; }
    if (!form.consent) { setError(messageFor('terms_required', lang)); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await publicWaitlistJoin(slug, { name: form.name.trim(), phone: form.phone.trim(), party: form.party, consent: true }, key.current, lang);
      navigate(`/t/w${lang === 'en' ? '?lang=en' : ''}#t=${r.token}`);
    } catch (err) {
      setError((err as TablesError).message);
    } finally {
      setBusy(false);
    }
  }

  if (venue === undefined) return <PublicShell lang={lang} venue={null}><div aria-hidden className="h-40 animate-pulse rounded-2xl bg-cloud-200" /></PublicShell>;
  if (!venue || !venue.policy.waitlistPublic) return (
    <PublicShell lang={lang} venue={venue ?? null}><h1 className="text-xl font-semibold">{s.notFound}</h1><p className="mt-2 text-ink-muted">{s.notFoundBody}</p></PublicShell>
  );
  return (
    <PublicShell lang={lang} venue={venue}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <h1 className="text-2xl font-semibold">{s.waitlistTitle}</h1>
        <p className="text-ink-muted">{s.waitlistIntro}</p>
        <fieldset>
          <legend className="mb-2 font-semibold">{s.party}</legend>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: Math.min(10, venue.policy.maxParty) }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={form.party === n} onClick={() => setForm({ ...form, party: n })}
                className={cx('h-12 rounded-xl border font-semibold tabular-nums', form.party === n ? 'border-[var(--fz-accent)] bg-[var(--fz-accent)] text-[var(--fz-on-accent)]' : 'border-cloud-300 bg-white')}>{n}</button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="wl-name" className="mb-1.5 block text-sm font-medium">{s.name}</label>
          <input id="wl-name" autoComplete="name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className="fz-input h-12 w-full rounded-xl border border-cloud-300 bg-white px-3.5 text-[16px]" />
        </div>
        <div>
          <label htmlFor="wl-phone" className="mb-1.5 block text-sm font-medium">{s.phone}</label>
          <input id="wl-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={form.phone} maxLength={24} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-describedby="wl-phone-hint" className="fz-input h-12 w-full rounded-xl border border-cloud-300 bg-white px-3.5 text-start text-[16px]" />
          <p id="wl-phone-hint" className="mt-1 text-xs text-ink-muted">{s.phoneHint}</p>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />
          {s.waitlistConsent}
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy} className={accentButton}>{busy ? s.loading : s.join}</button>
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
  useDocumentLanguage(lang, st ? `${st.venue.name} · ${s.waitlistTitle}` : s.waitlistTitle);
  const load = useCallback(async () => {
    if (!token) { setSt(null); return; }
    try { setSt(await publicWaitlistStatus(token, lang)); } catch { /* keep the last known status */ }
  }, [token, lang]);
  useEffect(() => { void load(); const t = setInterval(() => { void load(); setNow(new Date()); }, 20_000); return () => clearInterval(t); }, [load]);

  if (st === undefined) return <PublicShell lang={lang} venue={null}><div aria-hidden className="h-40 animate-pulse rounded-2xl bg-cloud-200" /></PublicShell>;
  if (st === null) return <PublicShell lang={lang} venue={null}><h1 className="text-xl font-semibold">{s.linkUnavailable}</h1><p className="mt-2 text-ink-muted">{s.linkUnavailableBody}</p></PublicShell>;
  const offered = st.status === 'offered' && st.offerExpiresAt && new Date(st.offerExpiresAt) > now;
  return (
    <PublicShell lang={lang} venue={{ name: st.venue.name }}>
      <div className="grid gap-4">
        {offered ? (
          <div role="alert" className="rounded-2xl border border-teal-300 bg-teal-50 p-5">
            <h1 className="flex items-center gap-2 text-2xl font-semibold"><BellRing className="h-6 w-6" aria-hidden /> {s.tableReady}</h1>
            <p className="mt-2">{s.holdUntil} <strong>{formatInstant(st.offerExpiresAt!, st.venue.timezone, lang)}</strong></p>
          </div>
        ) : st.status === 'waiting' || st.status === 'offered' ? (
          <div className="rounded-2xl border border-cloud-200 bg-white p-5">
            <h1 className="text-2xl font-semibold">{s.youAreWaiting}</h1>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="flex items-center gap-1 text-ink-muted"><Users className="h-4 w-4" aria-hidden />{s.guests}</dt><dd className="font-semibold tabular-nums">{st.party}</dd>
              {st.position != null && <><dt className="text-ink-muted">{s.position}</dt><dd className="font-semibold tabular-nums">{st.position}</dd></>}
            </dl>
            {st.estimate && <p className="mt-3 flex items-start gap-1.5 text-sm text-ink-muted"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{s.estimate(st.estimate.min, st.estimate.max)}</p>}
          </div>
        ) : (
          <div role="status" className="rounded-2xl border border-cloud-200 bg-white p-5">
            <h1 className="text-xl font-semibold">{st.status === 'seated' ? s.seated : st.status === 'cancelled' ? s.left : s.waitlistClosed}</h1>
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

