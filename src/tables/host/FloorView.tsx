import { ChevronDown, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, cx } from '../../components/ui';
import { moveReservation } from '../data/client';
import type { TablesError } from '../domain/errors';
import { TABLE_STATE_HE } from '../domain/status';
import type { Shift, ShiftReservation, TableLiveState } from '../domain/types';
import { FloorCanvas, floorBounds, StateLegend, TABLE_STATE_SYMBOL } from '../ui';
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  // Fit the room to the screen, but never let the smallest table drop under a finger's width (46 px):
  // when it would, the map grows and the host pans it. Zoom enlarges the map itself (and pans too).
  const bounds = floorBounds(visible);
  const minSide = visible.length ? Math.min(...visible.map((t) => Math.min(t.w, t.h))) : 60;
  const baseW = boxW ? Math.max(boxW, Math.ceil(bounds.w * (46 / minSide))) : 0;
  const mapW = baseW * zoom;
  const zones = shift.zones;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        {zones.length > 1 && (
          <label className="hs-datepill relative flex h-11 items-center rounded-xl focus-within:ring-2 focus-within:ring-orange">
            <span className="sr-only">אזור</span>
            <select aria-label="אזור" value={zone} onChange={(e) => setZone(e.target.value)} className="h-11 appearance-none rounded-xl bg-transparent ps-3 pe-8 text-[15px] font-semibold focus:outline-none">
              <option value="all">כל האזורים</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-ink-muted" aria-hidden />
          </label>
        )}
        <div className="ms-auto flex gap-1" role="group" aria-label="גודל המפה">
          <Button size="sm" variant="secondary" icon={ZoomOut} aria-label="הקטנה" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="h-11 w-11 rounded-full px-0" />
          <Button size="sm" variant="secondary" icon={ZoomIn} aria-label="הגדלה" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} className="h-11 w-11 rounded-full px-0" />
          {zoom !== 1 && <Button size="sm" variant="secondary" icon={Maximize2} aria-label="התאמה למסך" onClick={() => setZoom(1)} className="h-11 w-11 rounded-full px-0" />}
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div ref={boxRef} className="hs-floor-box">
        <div className="hs-floor-scroll" dir="ltr" style={{ maxHeight: 'max(320px, calc(100dvh - 290px))' }}>
          <div style={{ width: mapW ? `${mapW}px` : '100%' }}>
            <FloorCanvas items={items} zoom={1} pannable selectedId={selection?.kind === 'table' ? selection.id : null} onSelect={(id) => void pick(id)}
              label={assigning ? `בחירת שולחן עבור ${assigning.guestName}` : 'מפת המקום. בחירה בשולחן פותחת את הפרטים שלו'} maxHeight="none" minHeight={0} />
          </div>
        </div>
      </div>
      <div className="hs-scroll overflow-x-auto px-1"><StateLegend /></div>
      <details className="rounded-2xl border border-cloud-200 bg-white p-3" open={false}>
        <summary className="cursor-pointer text-sm font-semibold">השולחנות כרשימה</summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const live = states.get(t.id);
            return (
              <li key={t.id}>
                <button type="button" onClick={() => void pick(t.id)} disabled={!!assigning && !canAct}
                  className={cx('flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 text-start text-sm hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                    candidates.has(t.id) ? 'border-orange-400' : 'border-cloud-200')}>
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
