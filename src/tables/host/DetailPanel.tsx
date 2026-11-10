import { Ban, CheckCircle2, LogIn, MessageCircle, Phone, Sparkles, Undo2, UserX, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, cx, Textarea } from '../../components/ui';
import { addNote, decidePending, reservationDetail, setTableState, transition, type ReservationDetail, type TransitionAction } from '../data/client';
import type { TablesError } from '../domain/errors';
import { displayPhone, telHref, whatsappHref } from '../domain/phone';
import { isLate, SOURCE_HE, STATUS_HE, TABLE_STATE_HE } from '../domain/status';
import { timeInTz } from '../domain/time';
import type { Shift, ShiftReservation, TableLiveState } from '../domain/types';
import { Ltr, StatusChip } from '../ui';

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
    <aside ref={ref} tabIndex={-1} aria-label="פרטים"
      className={cx('z-40 flex flex-col overflow-hidden bg-white outline-none',
        'fixed inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl border-t border-cloud-300 shadow-lift',
        'lg:sticky lg:top-[8.5rem] lg:inset-auto lg:max-h-[calc(100vh-10rem)] lg:w-[23rem] lg:shrink-0 lg:self-start lg:rounded-2xl lg:border lg:shadow-card')}>
      <div className="flex items-center justify-between gap-2 border-b border-cloud-200 px-4 py-2">
        <span className="mx-auto h-1 w-10 rounded-full bg-cloud-300 lg:hidden" aria-hidden />
        <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label="סגירת הפרטים" className="absolute end-2 top-1.5 h-10 w-10 px-0" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">
        {selection.kind === 'reservation' && selected && <ReservationDetailView r={selected} shift={shift} now={now} canAct={canAct} onDone={onDone} onAssign={onAssign} />}
        {selection.kind === 'reservation' && !selected && <p className="py-6 text-sm text-ink-muted">ההזמנה לא נמצאת יותר במשמרת הזו.</p>}
        {selection.kind === 'table' && <TableDetail shift={shift} tableId={selection.id} states={states} canAct={canAct} onDone={onDone} onSelect={onSelect} />}
      </div>
    </aside>
  );
}

function ActionButton({ label, icon, onClick, busy, variant = 'secondary', disabled }: { label: string; icon: typeof Ban; onClick: () => void; busy: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'dark'; disabled?: boolean }) {
  return <Button variant={variant} icon={icon} loading={busy} disabled={disabled} onClick={onClick} className="h-12 w-full justify-start">{label}</Button>;
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

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 pe-10">
          <h2 className="text-xl font-semibold text-ink">{r.guestName}</h2>
          <StatusChip status={r.status} late={late} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          <bdi dir="ltr" className="font-semibold text-ink">{r.time}</bdi> · {r.party} סועדים · {tables ? `שולחן ${tables}` : 'בלי שולחן'} · {SOURCE_HE[r.source]} · קוד <Ltr>{r.reference}</Ltr>
        </p>
        {r.requests && <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900"><span className="font-medium">בקשה: </span>{r.requests}</p>}
        {(r.visits > 0 || r.noShows > 0) && (
          <p className="mt-2 text-sm text-ink-muted">ביקורים קודמים: {r.visits}{r.noShows ? ` · לא הגיעו: ${r.noShows}` : ''}</p>
        )}
      </div>

      {r.guestPhone && (
        <div className="flex flex-wrap gap-2">
          <a href={telHref(r.guestPhone)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-cloud-300 px-3 text-sm font-medium hover:bg-cloud">
            <Phone className="h-4 w-4" aria-hidden /> <Ltr>{displayPhone(r.guestPhone)}</Ltr>
          </a>
          <a href={whatsappHref(r.guestPhone, `שלום ${r.guestName}, כאן ${shift.venue.name}. `)} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-cloud-300 px-3 text-sm font-medium hover:bg-cloud">
            <MessageCircle className="h-4 w-4" aria-hidden /> וואטסאפ
          </a>
        </div>
      )}
      {r.guestPhone && <p className="-mt-2 text-xs text-ink-muted">פותח שיחה או וואטסאפ אצלכם — ההודעה נשלחת רק אם תשלחו אותה.</p>}

      {error && (
        <div role="alert" className={cx('rounded-xl border px-3 py-2 text-sm', error.conflict ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800')}>
          {error.conflict ? <><span className="font-semibold">שונה על ידי איש צוות אחר. </span>{`המצב העדכני: ${STATUS_HE[r.status]}. בדקו ונסו שוב אם צריך.`}</> : error.text}
        </div>
      )}

      {canAct && (
        <div className="grid gap-2">
          {r.status === 'pending_approval' && <>
            <ActionButton label="אישור ההזמנה" icon={CheckCircle2} variant="primary" busy={busy === 'approve'} onClick={() => act('approve', () => decidePending(r.id, 'approve', r.lockVersion), `${r.guestName}: אושרה`)} />
            <ActionButton label="דחייה" icon={Ban} busy={false} onClick={() => setConfirm('reject')} />
          </>}
          {r.status === 'confirmed' && <ActionButton label="הגיעו (ממתינים לשולחן)" icon={LogIn} busy={busy === 'arrive'} onClick={() => t('arrive', 'הגיעו')} />}
          {(r.status === 'confirmed' || r.status === 'arrived') && new Date(r.startsAt).getTime() - now.getTime() <= 3 * 3600_000 && (r.tableIds.length
            ? <ActionButton label={`הושבה בשולחן ${tables}`} icon={CheckCircle2} variant="dark" busy={busy === 'seat'} onClick={() => t('seat', `הושבו בשולחן ${tables}`)} />
            : <ActionButton label="שיבוץ שולחן" icon={Sparkles} variant="dark" busy={false} onClick={() => onAssign(r)} />)}
          {r.status === 'seated' && <ActionButton label="סיום הביקור — השולחן מתפנה" icon={CheckCircle2} variant="dark" busy={busy === 'complete'} onClick={() => t('complete', 'סיימו')} />}
          {['pending_approval', 'confirmed', 'arrived', 'seated'].includes(r.status) && r.tableIds.length > 0 && (
            <ActionButton label="העברה לשולחן אחר" icon={Sparkles} busy={false} onClick={() => onAssign(r)} />
          )}
          {r.status === 'confirmed' && startsPassed && <ActionButton label="לא הגיעו" icon={UserX} variant="danger" busy={false} onClick={() => setConfirm('no_show')} />}
          {['pending_approval', 'confirmed', 'arrived'].includes(r.status) && <ActionButton label="ביטול ההזמנה" icon={Ban} variant="danger" busy={false} onClick={() => setConfirm('cancel')} />}
          {['arrived', 'seated', 'no_show', 'completed', 'cancelled'].includes(r.status) && (
            <ActionButton label="ביטול הפעולה האחרונה" icon={Undo2} busy={busy === 'undo'} onClick={() => t('undo', 'הפעולה האחרונה בוטלה')} />
          )}
        </div>
      )}
      {confirm && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-900">
            {confirm === 'cancel' ? 'לבטל את ההזמנה? השולחן ישתחרר מיד.' : confirm === 'no_show' ? 'לסמן שלא הגיעו? השולחן ישתחרר, וזה יירשם בהיסטוריה של האורח.' : 'לדחות את הבקשה?'}
          </p>
          <label htmlFor="act-reason" className="mt-2 block text-xs font-medium text-red-900">סיבה (רשות)</label>
          <input id="act-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="fz-input mt-1 h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm" />
          <div className="mt-2 flex gap-2">
            <Button variant="danger" loading={!!busy} onClick={() => confirm === 'reject'
              ? act('reject', () => decidePending(r.id, 'reject', r.lockVersion, reason || undefined), `${r.guestName}: נדחתה`)
              : t(confirm, confirm === 'cancel' ? 'בוטלה' : 'סומנו שלא הגיעו')} className="h-11">כן, לאשר</Button>
            <Button variant="ghost" onClick={() => setConfirm(null)} className="h-11">חזרה</Button>
          </div>
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
    </div>
  );
}

function TableDetail({ shift, tableId, states, canAct, onDone, onSelect }: {
  shift: Shift; tableId: string; states: States; canAct: boolean; onDone: (m: string) => void; onSelect: (s: Selection) => void;
}) {
  const table = shift.tables.find((t) => t.id === tableId);
  const live = states.get(tableId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
                  <span className="min-w-0 flex-1 truncate">{r.guestName} · {r.party}</span>
                  <StatusChip status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
