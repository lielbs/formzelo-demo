import { AlertTriangle, Armchair, Info, MessageSquareText, MoreHorizontal, NotebookPen, Repeat2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, cx } from '../../components/ui';
import { decidePending, transition } from '../data/client';
import type { TablesError } from '../domain/errors';
import { displayPhone } from '../domain/phone';
import { isDone } from '../domain/shiftList';
import { ACTION_HE, bucketOf, isLate, nextAction, SOURCE_HE } from '../domain/status';
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
 * One booking card: time and length, guest and phone, table and party, what to know, and the
 * single next action one tap away. The card body opens the full details.
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

  return (
    <li className={cx('hs-item', `hs-tone-${tone(r, now)}`)} style={{ animationDelay: `${Math.min(order, 8) * 35}ms` }}>
      <div className="hs-card" data-flash={flash || undefined} data-next={next || undefined} data-selected={selected || undefined} data-dim={isDone(r) || undefined}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
          <button type="button" onClick={onSelect}
            className="flex min-h-[48px] min-w-0 flex-1 basis-[55%] items-center gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hs-accent)]">
            <span className="flex w-[3.4rem] shrink-0 flex-col">
              <span className="hs-time" dir="ltr">{r.time}</span>
              <span className="hs-muted text-xs tabular-nums" dir="ltr" aria-label={`משך ${duration(r)} שעות`}>{duration(r)}</span>
            </span>
            <span className="min-w-0 flex-1">
              {next && <span className="hs-nextlabel block">הבאים בתור</span>}
              <span data-guest-name className="block truncate text-[15px] font-semibold">{r.guestName}</span>
              <span className="hs-muted flex min-w-0 items-center gap-1.5 text-[13px]">
                {r.guestPhone && <bdi dir="ltr" className="truncate tabular-nums">{displayPhone(r.guestPhone)}</bdi>}
                {r.guestPhone && <span aria-hidden>·</span>}
                <span className="shrink-0">{SOURCE_HE[r.source]}</span>
              </span>
              <span className="sr-only"> — פתיחת פרטים</span>
            </span>
          </button>

          <span className="hs-seat shrink-0" data-warn={needsTable || undefined}>
            <span title={tables ? `שולחן ${tables}` : 'עוד לא שובץ שולחן'}>
              <Armchair className="h-3.5 w-3.5" aria-hidden />
              {tables ? <span><span className="sr-only">שולחן </span>{tables}</span> : <span>בלי שולחן</span>}
            </span>
            <span title={`${r.party} סועדים`}>
              <Users className="h-3.5 w-3.5" aria-hidden />{r.party}<span className="sr-only"> סועדים</span>
            </span>
          </span>

          <span className="flex w-full items-center gap-2 sm:w-auto">
            <StatusChip status={r.status} late={late} />
            <span className="hs-muted flex min-w-0 items-center gap-2 text-xs">
              {r.requests && <span className="inline-flex items-center gap-0.5 text-[var(--hs-attention)]" title={r.requests}><MessageSquareText className="h-4 w-4" aria-hidden /><span className="sr-only">יש בקשה מיוחדת</span></span>}
              {r.notesCount > 0 && <span className="inline-flex items-center gap-0.5" title={`${r.notesCount} הערות צוות`}><NotebookPen className="h-4 w-4" aria-hidden />{r.notesCount}<span className="sr-only"> הערות צוות</span></span>}
              {r.visits > 0 && <span className="inline-flex items-center gap-0.5 text-[var(--hs-seated)]" title={`ביקור חוזר (${r.visits})`}><Repeat2 className="h-4 w-4" aria-hidden />{r.visits}<span className="sr-only"> ביקורים קודמים</span></span>}
              {r.noShows > 0 && <span className="inline-flex items-center gap-0.5 font-medium text-red-700" title={`לא הגיעו בעבר: ${r.noShows}`}><AlertTriangle className="h-4 w-4" aria-hidden />{r.noShows}<span className="sr-only"> פעמים לא הגיעו בעבר</span></span>}
            </span>
            <span className="ms-auto flex items-center gap-1.5">
              {action && canAct && (
                <Button size="md" variant={action === 'approve' ? 'primary' : action === 'assign' ? 'secondary' : 'dark'} loading={busy} onClick={run} className="h-11 min-w-[6rem]">
                  {ACTION_HE[action]}
                </Button>
              )}
              <Button size="md" variant="ghost" icon={MoreHorizontal} onClick={onSelect} aria-label={`עוד פעולות עבור ${r.guestName}`} className="h-11 w-11 px-0" />
            </span>
          </span>
        </div>
        {(err || (r.status === 'pending_approval' && r.pendingExpiresAt) || r.overrideReason) && (
          <div className="grid gap-1 border-t border-[var(--hs-line)] px-4 py-2 text-xs">
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
            {r.status === 'pending_approval' && r.pendingExpiresAt && (
              <p className="text-amber-800">ממתין לאישור שלכם{r.approvalRule && r.approvalRule !== 'venue_default' ? ' (לפי כלל)' : ''}</p>
            )}
            {r.overrideReason && <p className="hs-muted"><Info className="inline h-3 w-3" aria-hidden /> חריגה באישור מנהל: {r.overrideReason}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
