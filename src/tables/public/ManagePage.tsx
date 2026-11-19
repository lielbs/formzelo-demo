import { CalendarClock, CheckCircle2, Clock, Hourglass, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cx, PageLoader } from '../../components/ui';
import { newKey, publicCancel, publicManage, publicModify, publicModifyOptions, publicVenue, type GuestReservation, type PublicAvailability, type PublicVenue } from '../data/client';
import type { TablesError } from '../domain/errors';
import { addDays, dateInTz, formatDate, formatInstant } from '../domain/time';
import { Ltr } from '../ui';
import { STATUS_GUEST, tx, type Lang } from './i18n';
import { lookFor } from './look';
import { accentButton, PublicShell, softButton, useDocumentLanguage, useLang } from './PublicShell';
import { PushReminder } from './PushReminder';
import { CalendarButtons, manageUrl } from './VenueInfo';

/** Reads the capability token from the URL fragment, then removes it from the address bar. */
export function useFragmentToken(kind: 'manage' | 'waitlist' = 'manage'): string | null {
  const key = `fz_tables_token_${kind}`;
  const read = () => {
    const m = /(?:^|[#&])t=([A-Za-z0-9_-]{20,64})/.exec(window.location.hash);
    if (m) {
      try { sessionStorage.setItem(key, m[1]!); } catch { /* storage unavailable */ }
      return m[1]!;
    }
    try { return sessionStorage.getItem(key); } catch { return null; }
  };
  const [token, setToken] = useState(read);
  useEffect(() => {
    // Opening another link in the same tab only changes the fragment: follow it.
    const onHash = () => {
      if (!/(?:^|[#&])t=/.test(window.location.hash)) return;
      setToken(read());
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return token;
}

export function ManagePage() {
  const lang = useLang();
  const s = tx(lang);
  const token = useFragmentToken();
  const [res, setRes] = useState<GuestReservation | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useDocumentLanguage(lang, res ? `${res.venue.name} · ${s.manageHeading}` : s.manageHeading);
  const load = useCallback(async () => {
    if (!token) { setRes(null); return; }
    try { setRes(await publicManage(token, lang)); setError(null); } catch (e) { setError((e as TablesError).message); }
  }, [token, lang]);
  useEffect(() => { void load(); }, [load]);
  // The venue's published booking-page look (if any); a failure keeps the standard look.
  const [venue, setVenue] = useState<PublicVenue | null>(null);
  const slug = res?.venue.slug;
  useEffect(() => { if (slug) publicVenue(slug, lang).then(setVenue).catch(() => setVenue(null)); }, [slug, lang]);
  const design = useMemo(() => (venue ? lookFor(venue, 'booking') : null), [venue]);

  if (error && res === undefined) return <PublicShell lang={lang} venue={null}><p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p></PublicShell>;
  if (res === undefined) return <PageLoader label={s.loading} />;
  if (res === null) return (
    <PublicShell lang={lang} venue={null}>
      <h1 className="text-xl font-semibold">{s.linkUnavailable}</h1>
      <p className="mt-2 text-ink-muted">{s.linkUnavailableBody}</p>
    </PublicShell>
  );
  return (
    <PublicShell lang={lang} venue={{ ...res.venue, brand: venue?.brand }} compact design={design}>
      <Manage res={res} token={token!} lang={lang} onChange={setRes} />
    </PublicShell>
  );
}

function Manage({ res, token, lang, onChange }: { res: GuestReservation; token: string; lang: Lang; onChange: (r: GuestReservation) => void }) {
  const s = tx(lang);
  const [mode, setMode] = useState<'view' | 'cancel' | 'modify'>('view');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [mode]);
  const icon = res.status === 'confirmed' ? CheckCircle2 : res.status === 'pending_approval' ? Hourglass : res.status === 'cancelled' || res.status === 'rejected' || res.status === 'expired' ? XCircle : CalendarClock;
  const Icon = icon;
  // The card follows the venue's own look (light or dark); the status shows in the edge and the icon.
  const tone = res.status === 'confirmed' ? 'border-s-4 border-s-teal-600' : res.status === 'pending_approval' ? 'border-s-4 border-s-amber-500' : '';
  const iconTone = res.status === 'confirmed' ? 'text-teal-600' : res.status === 'pending_approval' ? 'text-amber-600' : '';

  async function cancel() {
    setBusy(true);
    setError(null);
    try { onChange(await publicCancel(token, lang)); setMessage(s.cancelled); setMode('view'); } catch (e) { setError((e as TablesError).message); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-5">
      <div className={cx('pp-card rounded-2xl border border-cloud-200 bg-white p-5', tone)}>
        <h1 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-2xl font-semibold outline-none">
          <Icon className={cx("h-6 w-6", iconTone)} aria-hidden /> {STATUS_GUEST[lang][res.status] ?? res.status}
        </h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">{s.when}</dt><dd className="font-medium">{formatDate(res.date, lang)} · <bdi dir="ltr">{res.time}</bdi></dd>
          <dt className="text-ink-muted">{s.guests}</dt><dd className="font-medium tabular-nums">{res.party}</dd>
          <dt className="text-ink-muted">{s.reference}</dt><dd><Ltr className="font-semibold tracking-wider">{res.reference}</Ltr></dd>
        </dl>
        {res.status === 'pending_approval' && res.pendingExpiresAt && (
          <p className="mt-2 text-sm font-medium">{s.pendingUntil} {formatInstant(res.pendingExpiresAt, res.venue.timezone, lang)}</p>
        )}
      </div>
      {message && <p role="status" className="rounded-xl bg-teal-50 p-3 text-teal-900">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}

      {res.open && (
        <section className="rounded-2xl border border-cloud-200 bg-white p-5 text-sm">
          <p className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {res.canCancel ? <span>{s.cancelUntil} <strong className="whitespace-nowrap">{formatInstant(res.status === 'pending_approval' ? res.startsAt : res.cancelUntil, res.venue.timezone, lang)}</strong></span> : s.deadlinePassed}
          </p>
          {res.canModify && <p className="mt-1 ps-6">{s.modifyUntil} <strong className="whitespace-nowrap">{formatInstant(res.modifyUntil, res.venue.timezone, lang)}</strong></p>}
          <details className="mt-3">
            <summary className="cursor-pointer font-medium">{s.terms}</summary>
            <p className="mt-1 whitespace-pre-line text-ink-muted">{res.terms}</p>
          </details>
        </section>
      )}

      {mode === 'view' && res.open && (res.status === 'confirmed' || res.status === 'pending_approval') && (
        <div className="grid gap-1.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <CalendarButtons lang={lang} className={softButton} filename={`${res.venue.slug}-${res.date}.ics`} event={{
              title: s.calendarTitle(res.venue.name), startsAt: res.startsAt, minutes: 120, location: res.venue.address,
              details: `${s.reference}: ${res.reference}`, privateUrl: manageUrl(token, lang), privateLabel: s.calendarManage, uid: res.reference,
            }} />
          </div>
          <p className="text-xs text-ink-muted">{s.calendarReminders}</p>
          <PushReminder lang={lang} className={softButton} booking={{ token, venue: res.venue.name, time: res.time, party: res.party, reference: res.reference, startsAt: res.startsAt, url: manageUrl(token, lang) }} />
        </div>
      )}

      {mode === 'view' && (res.canModify || res.canCancel) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {res.canModify && <button type="button" className={accentButton} onClick={() => { setMode('modify'); setMessage(null); }}>{s.changeBooking}</button>}
          {res.canCancel && <button type="button" onClick={() => { setMode('cancel'); setMessage(null); }} className="min-h-[48px] rounded-xl border border-red-200 bg-white px-4 font-semibold text-red-700 hover:bg-red-50">{s.cancelBooking}</button>}
        </div>
      )}
      {mode === 'cancel' && (
        <div role="alertdialog" aria-labelledby="cancel-q" className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p id="cancel-q" className="font-medium text-red-900">{s.cancelConfirm}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={cancel} className="min-h-[48px] rounded-xl bg-red-700 px-4 font-semibold text-white disabled:opacity-60">{busy ? s.loading : s.yesCancel}</button>
            <button type="button" onClick={() => setMode('view')} className="min-h-[48px] rounded-xl border border-cloud-300 bg-white px-4 font-semibold">{s.keep}</button>
          </div>
        </div>
      )}
      {mode === 'modify' && <Modify res={res} token={token} lang={lang} onDone={(r) => { onChange(r); setMessage(s.changed); setMode('view'); }} onCancel={() => setMode('view')} />}
    </div>
  );
}

function Modify({ res, token, lang, onDone, onCancel }: { res: GuestReservation; token: string; lang: Lang; onDone: (r: GuestReservation) => void; onCancel: () => void }) {
  const s = tx(lang);
  const today = dateInTz(new Date(res.serverNow), res.venue.timezone);
  const [date, setDate] = useState(res.date);
  const [party, setParty] = useState(res.party);
  const [avail, setAvail] = useState<PublicAvailability | null>(null);
  const [pick, setPick] = useState<{ serviceKey: string; time: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());
  useEffect(() => {
    let alive = true;
    setAvail(null);
    setPick(null);
    publicModifyOptions(token, date, party, lang).then((a) => alive && setAvail(a)).catch((e) => alive && setError((e as TablesError).message));
    return () => { alive = false; };
  }, [token, date, party, lang]);
  async function save() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const r = await publicModify(token, { serviceKey: pick.serviceKey, date, time: pick.time, party }, res.lockVersion, lang);
      if (r.result === 'modified') onDone(r.reservation);
      else setError(s.unavailableTitle);
    } catch (e) {
      setError((e as TablesError).message);
    } finally {
      setBusy(false);
      key.current = newKey();
    }
  }
  const parties = Array.from({ length: Math.max(1, res.policy.maxParty - res.policy.minParty + 1) }, (_, i) => res.policy.minParty + i).slice(0, 12);
  return (
    <section aria-labelledby="mod-h" className="grid gap-4 rounded-2xl border border-cloud-200 bg-white p-5">
      <h2 id="mod-h" className="text-lg font-semibold">{s.changeBooking}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="m-date" className="mb-1 block text-sm font-medium">{s.date}</label>
          <input id="m-date" type="date" dir="ltr" min={today} max={addDays(today, res.policy.horizonDays)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="fz-input h-12 w-full rounded-xl border border-cloud-300 px-3" />
          <p className="mt-1 text-sm">{formatDate(date, lang)}</p>
        </div>
        <div>
          <label htmlFor="m-party" className="mb-1 block text-sm font-medium">{s.party}</label>
          <select id="m-party" value={party} onChange={(e) => setParty(Number(e.target.value))} className="ui-select h-12 w-full rounded-xl border border-cloud-300 bg-white px-3">
            {parties.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div aria-busy={!avail}>
        <p className="mb-1.5 text-sm font-medium">{s.time}</p>
        {!avail ? <div aria-hidden className="h-14 animate-pulse rounded-xl bg-cloud-200" /> : avail.services.every((x) => !x.slots.length) ? <p className="text-sm text-ink-muted">{s.full}</p> : (
          avail.services.filter((x) => x.slots.length).map((sv) => (
            <div key={sv.key} className="mb-2">
              <p className="mb-1 text-xs text-ink-muted">{sv.name}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {sv.slots.map((sl) => {
                  const on = pick?.time === sl.time && pick.serviceKey === sv.key;
                  return (
                    <button key={sl.time} type="button" aria-pressed={on} onClick={() => setPick({ serviceKey: sv.key, time: sl.time })}
                      className={cx('h-12 rounded-xl border font-semibold tabular-nums', on ? 'border-[var(--fz-accent)] bg-[var(--fz-accent)] text-[var(--fz-on-accent)]' : 'border-cloud-300 bg-white')}>
                      <span dir="ltr">{sl.time}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!pick || busy} onClick={save} className={accentButton}>{busy ? s.loading : s.saveChange}</button>
        <button type="button" onClick={onCancel} className="min-h-[48px] rounded-xl border border-cloud-300 px-4 font-semibold">{s.back}</button>
      </div>
    </section>
  );
}
