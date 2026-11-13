import { Ban, CalendarClock, CheckCircle2, Footprints, LogIn, MessageCircle, Phone, Sparkles, Undo2, UserX, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cx, Textarea } from '../../components/ui';
import { addNote, decidePending, reservationDetail, setTableState, transition, type ReservationDetail, type TransitionAction } from '../data/client';
import type { TablesError } from '../domain/errors';
import { displayPhone, telHref, whatsappHref } from '../domain/phone';
import { canSeatNow, isLate, SOURCE_HE, STATUS_HE, TABLE_STATE_HE } from '../domain/status';
import { walkInWindow } from '../domain/tableBooking';
import { timeInTz } from '../domain/time';
import type { Shift, ShiftReservation, TableLiveState } from '../domain/types';
import { Ltr, StatusChip } from '../ui';
import { CustomAnswers } from './CustomAnswers';
import { TableBook, type TableBookMode } from './TableBook';

export type Selection = { kind: 'reservation'; id: string } | { kind: 'table'; id: string } | null;
type States = Map<string, { state: TableLiveState; current?: ShiftReservation; next?: ShiftReservation }>;

const EVENT_HE: Record<string, string> = {
  created: 'נוצרה', modified: 'שונתה', cancelled: 'בוטלה', approved: 'אושרה', rejected: 'נדחתה', expired: 'פג תוקף',
  arrive: 'סומנו שהגיעו', seat: 'הושבו', complete: 'סיימו', no_show: 'סומנו שלא הגיעו', cancel: 'בוטלה', undo: 'בוטלה הפעולה האחרונה',
  moved: 'הועברו שולחן', details_updated: 'עודכנו פרטים',
};

/** Side panel on wide screens, bottom sheet on narrow ones. Never stacks dialogs. */
export function DetailPanel({ shift, selection, selected, states, now, canAct, onClose, onDone, onSelect, onAssign }: {
  shift: Shift; selection: NonNullable<Selection>; selected: ShiftReservation | null; states: States; now: Date; canAct: boolean;
  onClose: () => void; onDone: (m: string) => void; onSelect: (s: Selection) => void; onAssign: (r: ShiftReservation) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [selection.kind, selection.id, onClose]);
  return (
    <>
    <div aria-hidden="true" onClick={onClose} className="hs-panel-scrim fixed inset-0 z-40 lg:hidden" />
    <aside ref={ref} tabIndex={-1} aria-label="פרטים"
      className={cx('hs-panel z-50 flex flex-col overflow-hidden bg-[var(--hs-surface)] text-[var(--hs-ink)] outline-none',
        'fixed inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[20px] shadow-lift',
        'lg:sticky lg:top-[7.5rem] lg:inset-auto lg:z-auto lg:max-h-[calc(100vh-9rem)] lg:w-[24rem] lg:shrink-0 lg:self-start lg:rounded-2xl lg:border lg:border-[var(--hs-line)] lg:shadow-none')}>
      <div className="relative flex h-6 items-center justify-center lg:h-2">
        <span className="h-1 w-10 rounded-full bg-[var(--hs-line-strong)] lg:hidden" aria-hidden />
      </div>
      <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label="סגירת הפרטים" className="absolute end-2 top-2 z-10 h-11 w-11 rounded-full px-0" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5">
        {selection.kind === 'reservation' && selected && <ReservationDetailView r={selected} shift={shift} now={now} canAct={canAct} onDone={onDone} onAssign={onAssign} />}
        {selection.kind === 'reservation' && !selected && <p className="py-6 text-sm text-ink-muted">ההזמנה לא נמצאת יותר במשמרת הזו.</p>}
        {selection.kind === 'table' && <TableDetail shift={shift} tableId={selection.id} states={states} now={now} canAct={canAct} onDone={onDone} onSelect={onSelect} />}
        <p className="hs-muted mt-6 text-center text-xs">הפרטים האישיים של האורחים מיועדים לשירות בלבד.</p>
      </div>
    </aside>
    </>
  );
}

function ActionButton({ label, icon, onClick, busy, variant = 'secondary', disabled, primary }: { label: string; icon: typeof Ban; onClick: () => void; busy: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'dark'; disabled?: boolean; primary?: boolean }) {
  return <Button variant={variant} icon={icon} loading={busy} disabled={disabled} onClick={onClick} className={cx('w-full', primary ? 'h-14 text-[16px]' : 'h-12')}>{label}</Button>;
}

/** Destructive or corrective actions: quiet text rows, separated from the work actions. */
function QuietAction({ label, icon: Icon, onClick, busy, danger }: { label: string; icon: typeof Ban; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={cx('flex min-h-[48px] w-full items-center gap-3 px-1 text-start text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50', danger ? 'text-[var(--hs-attention)]' : 'text-[var(--hs-ink)]')}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden />{label}
    </button>
  );
}

/** Words for where a booking stands in time ("in 2 h 10 min", "12 min late", "seated at 19:40"). */
function whenText(r: ShiftReservation, now: Date, tz: string): string {
  const mins = Math.round((new Date(r.startsAt).getTime() - now.getTime()) / 60_000);
  const span = (m: number) => (m >= 1440 ? `${Math.round(m / 1440)} ימים` : m >= 60 ? `${Math.floor(m / 60)} ש׳${m % 60 ? ` ${m % 60} דק׳` : ''}` : `${m} דק׳`);
  if (r.status === 'seated' && r.seatedAt) return `הושבו ב־${timeInTz(r.seatedAt, tz)}`;
  if (r.status === 'arrived' && r.arrivedAt) return `הגיעו ב־${timeInTz(r.arrivedAt, tz)}`;
  if (r.status !== 'confirmed' && r.status !== 'pending_approval') return '';
  if (mins > 0) return `בעוד ${span(mins)}`;
  if (mins > -10) return 'עכשיו';
  return `מאחרים ${span(-mins)}`;
}

function ReservationDetailView({ r, shift, now, canAct, onDone, onAssign }: {
  r: ShiftReservation; shift: Shift; now: Date; canAct: boolean; onDone: (m: string) => void; onAssign: (r: ShiftReservation) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<TransitionAction | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const late = isLate(r, now);
  const tables = r.tableIds.map((id) => shift.tables.find((t) => t.id === id)?.label ?? '?').join(' + ');

  useEffect(() => {
    let alive = true;
    setDetail(null);
    reservationDetail(r.id).then((d) => alive && setDetail(d)).catch(() => alive && setDetail(null));
    return () => { alive = false; };
  }, [r.id, r.lockVersion, r.notesCount]);
  useEffect(() => { setError(null); setConfirm(null); setReason(''); }, [r.id]);

  async function act(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setConfirm(null);
      setReason('');
      onDone(message);
    } catch (e) {
      const te = e as TablesError;
      setError({ text: te.message, conflict: te.isConflict });
      if (te.isConflict || te.code === 'invalid_transition') onDone('');
    } finally {
      setBusy(null);
    }
  }
  const t = (a: TransitionAction, msg: string) => act(a, () => transition(r.id, a, r.lockVersion, reason || undefined), `${r.guestName}: ${msg}`);
  const startsPassed = now.getTime() >= new Date(r.startsAt).getTime();

  const tz = shift.venue.timezone;
  const open = r.status === 'confirmed' || r.status === 'arrived';
  const live = open || r.status === 'pending_approval' || r.status === 'seated';
  const when = whenText(r, now, tz);
  const opensAt = timeInTz(new Date(new Date(r.startsAt).getTime() - 3 * 3600_000).toISOString(), tz);
  const far = new Date(r.startsAt).getTime() - now.getTime() > 24 * 3600_000;

  // One primary action for the state the booking is in; the rest is secondary or tucked away.
  let primary: ReactNode = null;
  if (r.status === 'pending_approval') {
    primary = <ActionButton primary label="אישור ההזמנה" icon={CheckCircle2} variant="primary" busy={busy === 'approve'} onClick={() => act('approve', () => decidePending(r.id, 'approve', r.lockVersion), `${r.guestName}: אושרה`)} />;
  } else if (open && r.tableIds.length === 0) {
    primary = <ActionButton primary label="שיבוץ שולחן" icon={Sparkles} variant="dark" busy={false} onClick={() => onAssign(r)} />;
  } else if (open && canSeatNow(r, now)) {
    primary = <ActionButton primary label={`הושבה בשולחן ${tables}`} icon={CheckCircle2} variant="dark" busy={busy === 'seat'} onClick={() => t('seat', `הושבו בשולחן ${tables}`)} />;
  } else if (open) {
    // Seating opens 3 hours before the booking (the server refuses earlier): show it, with when.
    primary = (
      <div className="grid gap-1.5">
        <ActionButton primary label={`הושבה בשולחן ${tables}`} icon={CheckCircle2} variant="dark" busy={false} disabled onClick={() => undefined} />
        <p className="hs-muted text-xs">ההושבה נפתחת ב־<bdi dir="ltr">{opensAt}</bdi>{far ? ' ביום ההזמנה' : ''} — 3 שעות לפני ההזמנה.</p>
      </div>
    );
  } else if (r.status === 'seated') {
    primary = <ActionButton primary label="סיום הביקור — השולחן מתפנה" icon={CheckCircle2} variant="dark" busy={busy === 'complete'} onClick={() => t('complete', 'סיימו')} />;
  }
  const secondary: ReactNode[] = [];
  if (r.status === 'confirmed') secondary.push(<ActionButton key="arrive" label="הגיעו (ממתינים לשולחן)" icon={LogIn} busy={busy === 'arrive'} onClick={() => t('arrive', 'הגיעו')} />);
  if (live && r.tableIds.length > 0) secondary.push(<ActionButton key="move" label="העברה לשולחן אחר" icon={Sparkles} busy={false} onClick={() => onAssign(r)} />);

  const quiet: ReactNode[] = [];
  if (r.status === 'pending_approval') quiet.push(<QuietAction key="reject" danger label="דחיית הבקשה" icon={Ban} onClick={() => setConfirm('reject')} />);
  if (r.status === 'confirmed' && startsPassed) quiet.push(<QuietAction key="ns" danger label="לא הגיעו" icon={UserX} onClick={() => setConfirm('no_show')} />);
  if (['pending_approval', 'confirmed', 'arrived'].includes(r.status)) quiet.push(<QuietAction key="cancel" danger label="ביטול ההזמנה" icon={Ban} onClick={() => setConfirm('cancel')} />);
  if (['arrived', 'seated', 'no_show', 'completed', 'cancelled'].includes(r.status)) quiet.push(<QuietAction key="undo" label="ביטול הפעולה האחרונה" icon={Undo2} busy={busy === 'undo'} onClick={() => t('undo', 'הפעולה האחרונה בוטלה')} />);
  if (confirm) quiet.push(
    <div key="confirm" className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
      <p className="text-sm font-medium">
        {confirm === 'cancel' ? 'לבטל את ההזמנה? השולחן ישתחרר מיד.' : confirm === 'no_show' ? 'לסמן שלא הגיעו? השולחן ישתחרר, וזה יירשם בהיסטוריה של האורח.' : 'לדחות את הבקשה?'}
      </p>
      <label htmlFor="act-reason" className="mt-2 block text-xs font-medium">סיבה (רשות)</label>
      <input id="act-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="fz-input mt-1 h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm text-ink" />
      <div className="mt-2 flex gap-2">
        <Button variant="danger" loading={!!busy} onClick={() => confirm === 'reject'
          ? act('reject', () => decidePending(r.id, 'reject', r.lockVersion, reason || undefined), `${r.guestName}: נדחתה`)
          : t(confirm, confirm === 'cancel' ? 'בוטלה' : 'סומנו שלא הגיעו')} className="h-11">כן, לאשר</Button>
        <Button variant="ghost" onClick={() => setConfirm(null)} className="h-11">חזרה</Button>
      </div>
    </div>,
  );

  return (
    <div className="grid gap-4">
      <div className="pe-12">
        <h2 className="text-[22px] font-semibold leading-tight">{r.guestName}</h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <StatusChip status={r.status} late={late} />
          {when && <span className="hs-muted">· {when}</span>}
        </p>
      </div>
      <dl className="hs-facts">
        <div><dt>שעה</dt><dd><bdi dir="ltr">{r.time}</bdi></dd></div>
        <div><dt>סועדים</dt><dd>{r.party}</dd></div>
        <div><dt>שולחן</dt><dd className={cx(!tables && open && 'hs-warn')}>{tables || '—'}</dd></div>
        <div><dt>מקור</dt><dd>{SOURCE_HE[r.source]}</dd></div>
      </dl>
      {!live && <p className="hs-final">ההזמנה במצב סופי: {STATUS_HE[r.status]}.</p>}

      {error && (
        <div role="alert" className={cx('rounded-xl border px-3 py-2 text-sm', error.conflict ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800')}>
          {error.conflict ? <><span className="font-semibold">שונה על ידי איש צוות אחר. </span>{`המצב העדכני: ${STATUS_HE[r.status]}. בדקו ונסו שוב אם צריך.`}</> : error.text}
        </div>
      )}

      {canAct && (primary || secondary.length > 0) && (
        <div className="grid gap-2">
          {primary}
          {secondary.length > 0 && <div className={cx('grid gap-2', secondary.length > 1 && 'sm:grid-cols-2')}>{secondary}</div>}
        </div>
      )}

      {(r.requests || detail?.customAnswers?.length || r.visits > 0 || r.noShows > 0) && (
        <div className="grid gap-2">
          {r.requests && <p className="rounded-xl bg-[var(--hs-accent-soft)] px-3 py-2 text-sm"><span className="font-semibold">בקשה: </span>{r.requests}</p>}
          <CustomAnswers answers={detail?.customAnswers} />
          {(r.visits > 0 || r.noShows > 0) && (
            <p className="hs-muted text-sm">ביקורים קודמים: {r.visits}{r.noShows ? ` · לא הגיעו: ${r.noShows}` : ''}</p>
          )}
        </div>
      )}

      {r.guestPhone && (
        <div className="grid grid-cols-2 gap-2">
          <a href={telHref(r.guestPhone)} className="hs-contact">
            <Phone className="h-4 w-4" aria-hidden /> <Ltr>{displayPhone(r.guestPhone)}</Ltr>
          </a>
          <a href={whatsappHref(r.guestPhone, `שלום ${r.guestName}, כאן ${shift.venue.name}. `)} target="_blank" rel="noopener noreferrer" className="hs-contact">
            <MessageCircle className="h-4 w-4" aria-hidden /> וואטסאפ
          </a>
          <p className="hs-muted col-span-2 text-xs">פותח שיחה או וואטסאפ אצלכם — ההודעה נשלחת רק אם תשלחו אותה. קוד ההזמנה: <Ltr>{r.reference}</Ltr></p>
        </div>
      )}

      <section aria-labelledby="notes-h" className="grid gap-2">
        <h3 id="notes-h" className="text-sm font-semibold">הערות צוות</h3>
        {detail?.notes.length ? (
          <ul className="grid gap-1.5">
            {detail.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-cloud px-3 py-2 text-sm">
                {n.visibility === 'manager' && <span className="me-1 rounded bg-midnight px-1.5 text-xs text-white">למנהלים</span>}
                {n.body}
                <span className="ms-2 text-xs text-ink-muted"><bdi dir="ltr">{timeInTz(n.at, shift.venue.timezone)}</bdi></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-muted">אין הערות.</p>}
        {canAct && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void act('note', () => addNote(r.id, note.trim(), 'host'), 'ההערה נשמרה').then(() => setNote('')); }}>
            <label htmlFor="new-note" className="sr-only">הערה חדשה</label>
            <Textarea id="new-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="למשל: יום הולדת, מעדיפים פינה שקטה" className="min-h-[60px]" />
            <div><Button size="sm" type="submit" loading={busy === 'note'} disabled={!note.trim()} className="h-10">שמירת ההערה</Button></div>
          </form>
        )}
      </section>

      {detail && detail.events.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">היסטוריית ההזמנה ({detail.events.length})</summary>
          <ol className="mt-2 grid gap-1 text-ink-muted">
            {detail.events.map((e, i) => (
              <li key={i}><bdi dir="ltr">{timeInTz(e.at, shift.venue.timezone)}</bdi> — {EVENT_HE[e.type] ?? e.type}{e.actor === 'guest' ? ' (על ידי האורח)' : ''}{e.reason ? ` · ${e.reason}` : ''}</li>
            ))}
          </ol>
        </details>
      )}
      {detail?.history && detail.history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">ביקורים קודמים ({detail.history.length})</summary>
          <ul className="mt-2 grid gap-1 text-ink-muted">
            {detail.history.map((h, i) => <li key={i}>{h.date} · <bdi dir="ltr">{h.time}</bdi> · {h.party} · {STATUS_HE[h.status as keyof typeof STATUS_HE] ?? h.status}</li>)}
          </ul>
        </details>
      )}
      {canAct && quiet.length > 0 && (
        <section aria-label="פעולות נוספות" className="border-t border-[var(--hs-line)] pt-2">
          {quiet}
        </section>
      )}
    </div>
  );
}

function TableDetail({ shift, tableId, states, now, canAct, onDone, onSelect }: {
  shift: Shift; tableId: string; states: States; now: Date; canAct: boolean; onDone: (m: string) => void; onSelect: (s: Selection) => void;
}) {
  const table = shift.tables.find((t) => t.id === tableId);
  const live = states.get(tableId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<TableBookMode | null>(null);
  if (!table || !live) return <p className="py-6 text-sm text-ink-muted">השולחן לא נמצא.</p>;
  const upcoming = shift.reservations.filter((r) => r.tableIds.includes(tableId) && ['pending_approval', 'confirmed', 'arrived', 'seated'].includes(r.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  async function setState(s: 'ready' | 'cleaning' | 'unavailable') {
    setBusy(s);
    setError(null);
    try {
      await setTableState(shift.venue.id, tableId, s, null, shift.serviceDate);
      onDone(`שולחן ${table!.label}: ${s === 'ready' ? 'מוכן' : s === 'cleaning' ? 'בניקוי' : 'לא זמין'}`);
    } catch (e) {
      setError((e as TablesError).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="grid gap-4">
      <div className="pe-10">
        <h2 className="text-xl font-semibold">שולחן {table.label}</h2>
        <p className="text-sm text-ink-muted"><bdi dir="ltr">{table.minCovers}–{table.maxCovers}</bdi> מקומות · {shift.zones.find((z) => z.id === table.zoneId)?.name} · <span className="font-medium text-ink">{TABLE_STATE_HE[live.state]}</span>{table.opReason ? ` (${table.opReason})` : ''}</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {canAct && (() => {
        const walk = walkInWindow(shift, tableId, live.state, now, shift.services[0]?.durationMinutes ?? 90);
        return (
          <section aria-labelledby="tbl-add" className="grid gap-2">
            <h3 id="tbl-add" className="text-sm font-semibold">הוספה לשולחן הזה</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button icon={Footprints} onClick={() => setBook('now')} disabled={!walk.ok} className="h-12">הושבה עכשיו</Button>
              <Button variant="secondary" icon={CalendarClock} onClick={() => setBook('later')} className="h-12">הזמנה לשעה</Button>
            </div>
            <p className="text-xs text-ink-muted">
              {walk.ok ? (walk.until ? `פנוי עכשיו עד ${walk.until}.` : 'פנוי עכשיו.')
                : walk.reason === 'occupied' ? 'תפוס עכשיו — אפשר להזמין לשעה מאוחרת יותר.'
                  : walk.reason === 'too_short' ? `ההזמנה הבאה ב-${walk.until} — קצר מדי להושבה עכשיו.`
                    : walk.reason === 'cleaning' ? 'בניקוי — סמנו כמוכן כדי להושיב.' : 'מסומן כלא זמין.'}
            </p>
          </section>
        );
      })()}
      {canAct && (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="מצב השולחן">
          <Button variant={live.state === 'cleaning' ? 'dark' : 'secondary'} icon={Sparkles} loading={busy === 'cleaning'} onClick={() => void setState('cleaning')} className="h-12">ניקוי</Button>
          <Button variant={table.opState == null ? 'dark' : 'secondary'} icon={CheckCircle2} loading={busy === 'ready'} onClick={() => void setState('ready')} className="h-12">מוכן</Button>
          <Button variant={live.state === 'unavailable' ? 'dark' : 'secondary'} icon={Wrench} loading={busy === 'unavailable'} onClick={() => void setState('unavailable')} className="h-12">לא זמין</Button>
        </div>
      )}
      <section aria-labelledby="tbl-res">
        <h3 id="tbl-res" className="text-sm font-semibold">הזמנות היום בשולחן הזה</h3>
        {upcoming.length === 0 ? <p className="mt-1 text-sm text-ink-muted">אין.</p> : (
          <ul className="mt-2 grid gap-2">
            {upcoming.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onSelect({ kind: 'reservation', id: r.id })}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-cloud-200 px-3 text-start hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                  <bdi dir="ltr" className="font-semibold tabular-nums">{r.time}</bdi>
                  <span className="line-clamp-2 min-w-0 flex-1 break-words">{r.guestName} · {r.party}</span>
                  <StatusChip status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {book && <TableBook shift={shift} table={table} state={live.state} now={now} initial={book} onClose={() => setBook(null)} onDone={(m) => { setBook(null); onDone(m); }} />}
    </div>
  );
}
