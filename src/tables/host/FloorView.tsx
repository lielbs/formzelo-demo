import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, cx } from '../../components/ui';
import { moveReservation } from '../data/client';
import type { TablesError } from '../domain/errors';
import { TABLE_STATE_HE } from '../domain/status';
import type { Shift, ShiftReservation, TableLiveState } from '../domain/types';
import { FloorCanvas, Segmented, StateLegend, TABLE_STATE_SYMBOL } from '../ui';
import type { Selection } from './DetailPanel';

type States = Map<string, { state: TableLiveState; current?: ShiftReservation; next?: ShiftReservation }>;

/** Tables a reservation could move to: active, big enough, no other active booking overlapping. */
export function candidateTables(shift: Shift, r: ShiftReservation): Set<string> {
  const start = new Date(r.status === 'seated' ? Date.now() : r.startsAt).getTime();
  const end = new Date(r.endsAt).getTime();
  const busy = new Set<string>();
  for (const o of shift.reservations) {
    if (o.id === r.id || !['pending_approval', 'confirmed', 'arrived', 'seated'].includes(o.status)) continue;
    const os = new Date(o.startsAt).getTime();
    const oe = o.status === 'seated' ? Math.max(new Date(o.endsAt).getTime(), Date.now()) : new Date(o.endsAt).getTime();
    if (os < end && start < oe) o.tableIds.forEach((t) => busy.add(t));
  }
  return new Set(shift.tables.filter((t) => t.maxCovers >= r.party && t.opState !== 'unavailable' && !busy.has(t.id) && !r.tableIds.includes(t.id)).map((t) => t.id));
}

export function FloorView({ shift, states, now, selection, assigning, canAct, onSelectTable, onAssigned }: {
  shift: Shift; states: States; now: Date; selection: Selection; assigning: ShiftReservation | null; canAct: boolean;
  onSelectTable: (id: string) => void; onAssigned: (message: string) => void;
}) {
  const [zone, setZone] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => (assigning ? candidateTables(shift, assigning) : new Set<string>()), [shift, assigning]);
  const visible = shift.tables.filter((t) => zone === 'all' || t.zoneId === zone);
  const items = visible.map((t) => {
    const live = states.get(t.id);
    const r = live?.current ?? live?.next;
    // Numbers only on the map (no names): mixed-direction text and guest data stay in the list/detail.
    const caption = live?.current ? `● ${live.current.party}` : live?.next ? `${live.next.time} · ${live.next.party}` : String(t.maxCovers);
    const spoken = live?.current ? `יושבים ${live.current.guestName}, ${live.current.party} סועדים` : live?.next ? `הבאים ${live.next.guestName} ב-${live.next.time}, ${live.next.party} סועדים` : undefined;
    return { ...t, state: live?.state ?? 'ready', caption: r ? caption : String(t.maxCovers), spoken, highlight: candidates.has(t.id), dim: !!assigning && !candidates.has(t.id) };
  });

  async function pick(id: string) {
    if (!assigning) { onSelectTable(id); return; }
    if (!canAct || busy) return;
    const label = shift.tables.find((t) => t.id === id)?.label;
    setBusy(true);
    setError(null);
    try {
      await moveReservation(assigning.id, [id], assigning.lockVersion);
      onAssigned(`${assigning.guestName} שובצו לשולחן ${label}`);
    } catch (e) {
      setError((e as TablesError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {shift.zones.length > 1 && (
          <Segmented label="אזור" value={zone} onChange={setZone} options={[{ value: 'all', label: 'כל האזורים' }, ...shift.zones.map((z) => ({ value: z.id, label: z.name }))]} />
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" icon={ZoomIn} aria-label="הגדלה" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} className="h-11 w-11 px-0" />
          <Button size="sm" variant="secondary" icon={ZoomOut} aria-label="הקטנה" onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))} className="h-11 w-11 px-0" />
          <Button size="sm" variant="secondary" icon={Maximize2} aria-label="התאמה למסך" onClick={() => setZoom(1)} className="h-11 w-11 px-0" />
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="rounded-2xl border border-cloud-200 bg-white p-2">
        <div>
          <FloorCanvas items={items} zoom={zoom} selectedId={selection?.kind === 'table' ? selection.id : null} onSelect={(id) => void pick(id)}
            label={assigning ? `בחירת שולחן עבור ${assigning.guestName}` : 'מפת המקום. בחירה בשולחן פותחת את הפרטים שלו'} maxHeight="62vh" />
        </div>
        <div className="px-2 pb-1 pt-2"><StateLegend /></div>
      </div>
      <details className="rounded-2xl border border-cloud-200 bg-white p-3" open={false}>
        <summary className="cursor-pointer text-sm font-semibold">השולחנות כרשימה</summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const live = states.get(t.id);
            return (
              <li key={t.id}>
                <button type="button" onClick={() => void pick(t.id)} disabled={!!assigning && !canAct}
                  className={cx('flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 text-start text-sm hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                    candidates.has(t.id) ? 'border-sky-400' : 'border-cloud-200')}>
                  <span aria-hidden className="w-4 text-center">{TABLE_STATE_SYMBOL[live?.state ?? 'ready']}</span>
                  <span className="font-semibold tabular-nums">{t.label}</span>
                  <span className="text-ink-muted">{t.maxCovers} מק׳</span>
                  <span className="ms-auto">{TABLE_STATE_HE[live?.state ?? 'ready']}</span>
                  {live?.current && <span className="truncate text-ink-muted">· {live.current.guestName}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
      <p className="sr-only">השעה {now.toLocaleTimeString('he-IL')}</p>
    </div>
  );
}
