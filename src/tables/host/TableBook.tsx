import { CalendarClock, Footprints } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { cx, FieldLabel, Input } from '../../components/ui';
import { newKey, staffAvailability, staffCreate, venueBufferMinutes } from '../data/client';
import type { TablesError } from '../domain/errors';
import { normalizePhone } from '../domain/phone';
import { TABLE_TIME_HE, tableTimes, walkInWindow, type TableTime } from '../domain/tableBooking';
import type { Shift, ShiftTable, TableLiveState } from '../domain/types';
import { Sheet } from './Sheet';

export type TableBookMode = 'now' | 'later';

/** Natural Hebrew for a stay length: "שעה וחצי", "שעתיים", "45 דקות". */
export function minutesText(m: number): string {
  const named: Record<number, string> = { 30: 'חצי שעה', 60: 'שעה', 90: 'שעה וחצי', 120: 'שעתיים', 150: 'שעתיים וחצי', 180: 'שלוש שעות' };
  if (named[m]) return named[m]!;
  if (m < 60) return `${m} דקות`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return rest ? `${hours} ו-${rest} דקות` : hours;
}

/**
 * Add a booking to one table from the floor: seat walk-ins now (for the usual length or until the
 * table's next booking) or book a later time that is free on this table today.
 */
export function TableBook({ shift, table, state, now, initial, onClose, onDone }: {
  shift: Shift; table: ShiftTable; state: TableLiveState | undefined; now: Date; initial: TableBookMode;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<TableBookMode>(initial);
  const [party, setParty] = useState(() => Math.min(Math.max(2, table.minCovers), table.maxCovers));
  const [time, setTime] = useState<{ key: string; time: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [requests, setRequests] = useState('');
  const [slots, setSlots] = useState<{ key: string; name: string; times: TableTime[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());
  const errorRef = useRef<HTMLParagraphElement>(null);
  // A refusal from the server is shown where the host is looking, not below the fold.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  const [buffer, setBuffer] = useState(0);
  useEffect(() => { let alive = true; void venueBufferMinutes(shift.venue.id).then((m) => alive && setBuffer(m)); return () => { alive = false; }; }, [shift.venue.id]);
  const usual = shift.services[0]?.durationMinutes ?? 90;
  const walk = useMemo(() => walkInWindow(shift, table.id, state, now, usual, 30, buffer), [shift, table.id, state, now, usual, buffer]);
  const phoneOk = !phone.trim() || normalizePhone(phone) != null;
  const sizes = Array.from({ length: Math.max(table.maxCovers, 1) }, (_, i) => i + 1);

  useEffect(() => { key.current = newKey(); setError(null); }, [mode, party, time, name, phone, requests]);
  useEffect(() => {
    if (mode !== 'later') return;
    let alive = true;
    setSlots(null);
    staffAvailability(shift.venue.id, shift.serviceDate, party)
      .then((s) => alive && setSlots(tableTimes(s, shift, table.id, new Date(), buffer)))
      .catch(() => alive && setSlots([]));
    return () => { alive = false; };
  }, [mode, party, shift, table.id, buffer]);
  useEffect(() => { setTime(null); }, [party]);

  const free = slots?.flatMap((s) => s.times).filter((t) => t.ok).length ?? 0;
  const upcoming = slots?.flatMap((s) => s.times).filter((t) => t.reason !== 'passed').length ?? 0;
  const canSubmit = mode === 'now' ? walk.ok : Boolean(time) && name.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!phoneOk) { setError('מספר הטלפון לא נראה תקין.'); return; }
    if (mode === 'later' && !time) { setError('בחרו שעה.'); return; }
    if (mode === 'later' && !name.trim()) { setError('חסר שם להזמנה.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'now') {
        if (!walk.ok) return;
        await staffCreate(shift.venue.id, {
          source: 'walk_in', date: shift.serviceDate, party, name: name.trim() || 'אורחים מזדמנים', phone: phone.trim(), requests: requests.trim(),
          seatNow: true, tableIds: [table.id], durationMinutes: walk.minutes,
        }, key.current);
        onDone(`הושבו בשולחן ${table.label}`);
      } else {
        await staffCreate(shift.venue.id, {
          source: 'phone', serviceKey: time!.key, date: shift.serviceDate, time: time!.time, party, name: name.trim(), phone: phone.trim(),
          requests: requests.trim(), tableIds: [table.id],
        }, key.current);
        onDone(`הזמנה ל${name.trim()} ב-${time!.time} בשולחן ${table.label} נשמרה`);
      }
    } catch (err) {
      setError((err as TablesError).message);
    } finally {
      setBusy(false);
    }
  }

  const walkNote = walk.ok
    ? (walk.until ? `פנוי עד ${walk.until} (${minutesText(walk.minutes)}) — אחר כך יש הזמנה בשולחן.` : `לזמן הישיבה הרגיל (${minutesText(walk.minutes)}).`)
    : walk.reason === 'occupied' ? 'השולחן תפוס עכשיו.'
      : walk.reason === 'cleaning' ? 'השולחן מסומן בניקוי. סמנו אותו כמוכן כדי להושיב.'
        : walk.reason === 'unavailable' ? 'השולחן מסומן כלא זמין.'
          : `ההזמנה הבאה בשולחן מתחילה ב-${walk.until} — אין מספיק זמן להושבה.`;

  return (
    <Sheet title={`שולחן ${table.label}`} subtitle={`${table.minCovers}–${table.maxCovers} מקומות · ${shift.zones.find((z) => z.id === table.zoneId)?.name ?? ''}`} onClose={onClose}
      footer={(
        <button type="submit" form="table-book" disabled={!canSubmit || busy}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--hs-accent)] px-4 text-[15px] font-semibold text-[var(--hs-on-accent)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--hs-accent)]">
          {busy ? 'שומר…' : mode === 'now' ? `הושבה עכשיו בשולחן ${table.label}` : time ? `שמירת הזמנה ל-${time.time}` : 'בחרו שעה'}
        </button>
      )}>
      <form id="table-book" onSubmit={submit} className="grid gap-5" noValidate>
        <div role="radiogroup" aria-label="מתי" className="grid grid-cols-2 gap-2">
          {([['now', 'עכשיו', 'אורחים בדלת', Footprints], ['later', 'לשעה אחרת', 'היום, בשולחן הזה', CalendarClock]] as const).map(([m, label, hint, Icon]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} data-autofocus={m === initial || undefined} onClick={() => setMode(m)}
              className={cx('flex min-h-[64px] items-center gap-3 rounded-2xl border px-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hs-accent)]',
                mode === m ? 'border-[var(--hs-ink)] bg-[var(--hs-ink)] text-[var(--hs-surface)]' : 'border-[var(--hs-line-strong)] bg-[var(--hs-surface)]')}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0"><span className="block font-semibold">{label}</span><span className="block text-xs opacity-80">{hint}</span></span>
            </button>
          ))}
        </div>

        {mode === 'now' && (
          <p role="status" className={cx('rounded-xl px-3 py-2 text-sm', walk.ok ? 'bg-[var(--hs-surface-2)]' : 'border border-amber-300 bg-amber-50 text-amber-900')}>{walkNote}</p>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">כמה סועדים</legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((n) => (
              <button key={n} type="button" className="hs-pill min-w-[48px] justify-center" aria-pressed={party === n} onClick={() => setParty(n)}>
                <span className="font-semibold tabular-nums">{n}</span>
              </button>
            ))}
          </div>
          {party < table.minCovers && <p className="hs-muted mt-1.5 text-xs">פחות מהמינימום של השולחן ({table.minCovers}) — מותר, רק שימו לב.</p>}
        </fieldset>

        {mode === 'later' && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">שעה פנויה בשולחן הזה</legend>
            {!slots ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-busy="true" aria-label="בודק שעות פנויות">
                {Array.from({ length: 8 }, (_, i) => <span key={i} className="h-12 animate-pulse rounded-xl bg-[var(--hs-surface-2)]" />)}
              </div>
            ) : slots.length === 0 || upcoming === 0 ? (
              <p className="hs-muted text-sm">{slots.length === 0 ? 'אין משמרות פתוחות ביום הזה.' : 'כל השעות של היום כבר עברו.'}</p>
            ) : free === 0 ? (
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">אין היום שעה פנויה בשולחן הזה לגודל הזה. נסו שולחן אחר או מספר סועדים אחר.</p>
            ) : null}
            {slots && slots.map((s) => ({ ...s, times: s.times.filter((t) => t.reason !== 'passed') })).filter((s) => s.times.length).map((s) => (
              <div key={s.key} className="mb-3 last:mb-0">
                {slots.length > 1 && <p className="hs-muted mb-1.5 text-xs font-medium">{s.name}</p>}
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {s.times.map((t) => {
                    const on = time?.key === s.key && time.time === t.time;
                    return (
                      <button key={t.time} type="button" disabled={!t.ok} aria-pressed={on} onClick={() => setTime({ key: s.key, time: t.time })}
                        aria-label={t.ok ? `${t.time} פנוי` : `${t.time} — ${TABLE_TIME_HE[t.reason ?? 'other']}`}
                        className={cx('flex h-12 flex-col items-center justify-center rounded-xl border text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hs-accent)]',
                          on ? 'border-[var(--hs-accent)] bg-[var(--hs-accent)] text-[var(--hs-on-accent)]'
                            : t.ok ? 'border-[var(--hs-line-strong)] bg-[var(--hs-surface)]' : 'border-transparent bg-[var(--hs-surface-2)] text-[var(--hs-muted)]')}>
                        <span dir="ltr" className={cx('font-semibold', !t.ok && 'line-through')}>{t.time}</span>
                        {!t.ok && <span className="text-[10px] leading-none">{TABLE_TIME_HE[t.reason ?? 'other']}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="tb-name" required={mode === 'later'}>שם</FieldLabel>
            <Input id="tb-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder={mode === 'now' ? 'אורחים מזדמנים' : ''} />
          </div>
          <div>
            <FieldLabel htmlFor="tb-phone">טלפון</FieldLabel>
            <Input id="tb-phone" type="tel" dir="ltr" inputMode="tel" value={phone} maxLength={24} invalid={!phoneOk} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" autoComplete="off" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="tb-req">בקשות (רשות)</FieldLabel>
          <Input id="tb-req" value={requests} maxLength={300} onChange={(e) => setRequests(e.target.value)} />
        </div>
        {error && <p ref={errorRef} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </form>
    </Sheet>
  );
}
