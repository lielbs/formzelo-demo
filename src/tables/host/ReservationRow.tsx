import { AlertTriangle, Armchair, Info, MessageSquareText, NotebookPen, Repeat2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, cx } from '../../components/ui';
import { decidePending, transition } from '../data/client';
import type { TablesError } from '../domain/errors';
import { isDone } from '../domain/shiftList';
import { ACTION_HE, bucketOf, doorWait, DOOR_WAIT_WARN_MINUTES, hmText, isLate, nextAction, seatedProgress } from '../domain/status';
import type { ShiftReservation } from '../domain/types';
import { StatusChip } from '../ui';

const duration = (r: ShiftReservation) => {
  const m = Math.max(0, Math.round((new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime()) / 60_000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

function tone(r: ShiftReservation, now: Date) {
  if (isDone(r)) return 'done';
  if (bucketOf(r, now) === 'attention') return 'attention';
  if (r.status === 'arrived') return 'arrived';
  if (r.status === 'seated') return 'seated';
  return 'upcoming';
}

/**
 * One booking as a scannable row: time, guest, state, party and table, and the single next action
 * one tap away. Tapping the row opens the full details.
 */
export function ReservationRow({ r, now, labels, selected, canAct, next = false, order = 0, onSelect, onDone, onAssign }: {
  r: ShiftReservation; now: Date; labels: Map<string, string>; selected: boolean; canAct: boolean; next?: boolean; order?: number;
  onSelect: () => void; onDone: (message: string) => void; onAssign: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const lastStatus = useRef(r.status);
  useEffect(() => {
    if (lastStatus.current === r.status) return;
    lastStatus.current = r.status;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [r.status]);
  const action = nextAction(r, now);
  const late = isLate(r, now);
  const tables = r.tableIds.map((id) => labels.get(id) ?? '?').join('+');
  const needsTable = !isDone(r) && r.tableIds.length === 0;
  const progress = seatedProgress(r, now);
  const wait = doorWait(r, now);

  async function run() {
    if (!action) return;
    if (action === 'assign') { onAssign(); return; }
    setBusy(true);
    setErr(null);
    try {
      if (action === 'approve') await decidePending(r.id, 'approve', r.lockVersion);
      else await transition(r.id, action === 'seat' ? 'seat' : action === 'complete' ? 'complete' : 'arrive', r.lockVersion);
      onDone(`${r.guestName}: ${ACTION_HE[action]} — בוצע`);
    } catch (e) {
      const te = e as TablesError;
      setErr(te.message);
      if (te.isConflict || te.code === 'invalid_transition') onDone('');
    } finally {
      setBusy(false);
    }
  }

  const seatText = tables ? `שולחן ${tables}` : null;
  return (
    <li className={cx('hs-row', `hs-tone-${tone(r, now)}`)} data-flash={flash || undefined} data-next={next || undefined}
      data-selected={selected || undefined} data-dim={isDone(r) || undefined} style={{ animationDelay: `${Math.min(order, 8) * 20}ms` }}>
      <button type="button" onClick={onSelect} className="hs-row-main">
        {/* The button is named by what it shows (WCAG 2.5.3), with the words a screen reader needs added. */}
        <span className="hs-row-time">
          <b dir="ltr">{r.time}</b>
          {progress ? (
            <small dir="ltr" className="hs-sat" data-tone={progress.tone} aria-hidden>{hmText(progress.elapsed)}/{hmText(progress.planned)}
              <span className="hs-sat-bar"><span style={{ width: `${Math.min(100, Math.round((progress.elapsed / progress.planned) * 100))}%` }} /></span>
            </small>
          ) : <small dir="ltr" aria-hidden>{duration(r)}</small>}
        </span>
        <span className="hs-row-guest">
          {next && <span className="hs-nextlabel">הבאים בתור</span>}
          <span data-guest-name className="hs-row-name">{r.guestName}</span>
          <span className="hs-row-meta">
            <StatusChip status={r.status} late={late} />
            {wait != null && <span className="hs-wait" data-warn={wait >= DOOR_WAIT_WARN_MINUTES || undefined}>מחכים {wait} דק׳</span>}
            {progress && <span className="sr-only">{progress.tone === 'over' ? `עברו את הזמן ב־${-progress.remaining} דקות` : `יושבים ${progress.elapsed} דקות מתוך ${progress.planned}`}</span>}
            {progress?.tone === 'over' && <span className="hs-wait" data-warn aria-hidden>+{-progress.remaining} דק׳</span>}
            <span className="md:hidden" aria-hidden>·</span>
            <span className="md:hidden tabular-nums">{r.party} סועדים</span>
            <span className="md:hidden" aria-hidden>·</span>
            <span className={cx('md:hidden', needsTable && 'hs-warn')}>{seatText ?? 'בלי שולחן'}</span>
            {r.requests && <span className="hs-flag" data-tone="attention" title={r.requests}><MessageSquareText className="h-4 w-4" aria-hidden /><span className="sr-only">יש בקשה מיוחדת</span></span>}
            {r.notesCount > 0 && <span className="hs-flag" title={`${r.notesCount} הערות צוות`}><NotebookPen className="h-4 w-4" aria-hidden />{r.notesCount}<span className="sr-only"> הערות צוות</span></span>}
            {r.visits > 0 && <span className="hs-flag" title={`ביקור חוזר (${r.visits})`}><Repeat2 className="h-4 w-4" aria-hidden />{r.visits}<span className="sr-only"> ביקורים קודמים</span></span>}
            {r.noShows > 0 && <span className="hs-flag" data-tone="attention" title={`לא הגיעו בעבר: ${r.noShows}`}><AlertTriangle className="h-4 w-4" aria-hidden />{r.noShows}<span className="sr-only"> פעמים לא הגיעו בעבר</span></span>}
          </span>
        </span>
        <span className="hs-row-col hidden md:flex"><Users className="h-4 w-4" aria-hidden />{r.party}<span className="sr-only"> סועדים,</span></span>
        <span className={cx('hs-row-col hidden md:flex', needsTable && 'hs-warn')}><Armchair className="h-4 w-4" aria-hidden />{tables ? <><span className="sr-only">שולחן </span>{tables}</> : <><span aria-hidden>—</span><span className="sr-only">בלי שולחן</span></>}</span>
        <span className="sr-only"> — פתיחת פרטים</span>
      </button>
      <span className="hs-row-action">
        {action && canAct && (
          <Button size="md" variant={action === 'approve' ? 'primary' : 'secondary'} loading={busy} onClick={run}
            aria-label={`${ACTION_HE[action]} — ${r.guestName}`} className="h-11 min-w-[5.5rem] px-3.5">
            {ACTION_HE[action]}
          </Button>
        )}
      </span>
      {(err || (r.status === 'pending_approval' && r.pendingExpiresAt) || r.overrideReason) && (
        <div className="hs-row-extra">
          {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
          {r.status === 'pending_approval' && r.pendingExpiresAt && (
            <p className="text-amber-800">ממתין לאישור שלכם{r.approvalRule && r.approvalRule !== 'venue_default' ? ' (לפי כלל)' : ''}</p>
          )}
          {r.overrideReason && <p className="hs-muted"><Info className="inline h-3 w-3" aria-hidden /> חריגה באישור מנהל: {r.overrideReason}</p>}
        </div>
      )}
    </li>
  );
}
