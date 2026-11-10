import { Info, MessageSquareText, MoreHorizontal, Phone, Repeat2 } from 'lucide-react';
import { useState } from 'react';
import { Button, cx } from '../../components/ui';
import { decidePending, transition } from '../data/client';
import type { TablesError } from '../domain/errors';
import { ACTION_HE, isLate, nextAction, SOURCE_HE } from '../domain/status';
import type { ShiftReservation } from '../domain/types';
import { StatusChip } from '../ui';

/** One row: time · guest/party · status · table · note cue · the single next action. */
export function ReservationRow({ r, now, labels, selected, canAct, onSelect, onDone, onAssign }: {
  r: ShiftReservation; now: Date; labels: Map<string, string>; selected: boolean; canAct: boolean;
  onSelect: () => void; onDone: (message: string) => void; onAssign: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const action = nextAction(r, now);
  const late = isLate(r, now);
  const tables = r.tableIds.map((id) => labels.get(id) ?? '?').join('+');

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
    <li>
      <div className={cx('grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border bg-white px-3 py-2 sm:grid-cols-[3.5rem_minmax(0,1fr)_7.5rem_5rem_auto]',
        selected ? 'border-orange ring-2 ring-orange/40' : 'border-cloud-200', r.status === 'completed' || r.status === 'cancelled' || r.status === 'no_show' ? 'opacity-70' : '')}>
        <button type="button" onClick={onSelect} className="col-span-2 grid min-h-[44px] grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange rounded-lg sm:col-span-2"
>
          <span className="text-lg font-semibold tabular-nums text-ink" dir="ltr">{r.time}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">{r.guestName}</span>
              <span className="shrink-0 rounded-md bg-cloud px-1.5 text-sm font-semibold tabular-nums text-ink">{r.party}<span className="sr-only"> סועדים</span></span>
              {r.requests && <MessageSquareText className="h-4 w-4 shrink-0 text-orange-800" aria-label="יש בקשה מיוחדת" />}
              {r.notesCount > 0 && <span className="shrink-0 text-xs text-ink-muted" aria-label={`${r.notesCount} הערות`}>•{r.notesCount}</span>}
              {r.visits > 0 && <Repeat2 className="h-4 w-4 shrink-0 text-teal-700" aria-label={`ביקור חוזר (${r.visits})`} />}
              {r.noShows > 0 && <span className="shrink-0 text-xs font-medium text-red-700">לא הגיעו בעבר: {r.noShows}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
              <span>{SOURCE_HE[r.source]}</span>
              {r.guestPhone && <Phone className="h-3 w-3" aria-hidden />}
              <span className="sm:hidden">{tables ? `שולחן ${tables}` : 'בלי שולחן'}</span>
            </span>
            <span className="sr-only"> — פתיחת פרטים</span>
          </span>
        </button>
        <span className="col-start-3 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-start"><StatusChip status={r.status} late={late} /></span>
        <span className={cx('hidden text-sm font-semibold tabular-nums sm:block', tables ? 'text-ink' : 'text-red-700')}>{tables ? `שולחן ${tables}` : 'בלי שולחן'}</span>
        <span className={cx('col-span-3 items-center justify-end gap-1.5 sm:col-span-1 sm:flex', action && canAct ? 'flex' : 'hidden')}>
          {action && canAct && (
            <Button size="md" variant={action === 'approve' ? 'primary' : action === 'assign' ? 'secondary' : 'dark'} loading={busy} onClick={run} className="h-11 min-w-[6rem]">
              {ACTION_HE[action]}
            </Button>
          )}
          <Button size="md" variant="ghost" icon={MoreHorizontal} onClick={onSelect} aria-label={`עוד פעולות עבור ${r.guestName}`} className="h-11 w-11 px-0" />
        </span>
        {err && <p role="alert" className="col-span-full text-sm text-red-700">{err}</p>}
        {r.status === 'pending_approval' && r.pendingExpiresAt && (
          <p className="col-span-full text-xs text-amber-800">ממתין לאישור שלכם{r.approvalRule && r.approvalRule !== 'venue_default' ? ' (לפי כלל)' : ''}</p>
        )}
        {r.overrideReason && <p className="col-span-full text-xs text-ink-muted"><Info className="inline h-3 w-3" aria-hidden /> חריגה באישור מנהל: {r.overrideReason}</p>}
      </div>
    </li>
  );
}
