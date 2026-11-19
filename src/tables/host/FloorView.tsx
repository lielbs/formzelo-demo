import { ChevronDown, Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, cx } from '../../components/ui';
import { moveReservation } from '../data/client';
import type { TablesError } from '../domain/errors';
import { TABLE_STATE_HE } from '../domain/status';
import type { Shift, ShiftReservation, TableLiveState } from '../domain/types';
import { FloorCanvas, floorBounds, StateLegend, TABLE_STATE_SYMBOL } from '../ui';
import type { Selection } from './DetailPanel';
import { MAX_SCALE, useMapView } from './useMapView';

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
  // Full screen: the map alone over the shift (best on a phone held sideways). The details sheet
  // still opens above it. Wide screens keep the details beside the map, so they don't offer it.
  const [full, setFull] = useState(false);
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

  // The map starts with the whole room in view; pinch, Ctrl+wheel, double-tap or the buttons zoom in.
  const room = floorBounds(visible);
  const { boxRef, rect, scale, zoomBy, reset, size } = useMapView(room, zone);
  const zoomed = scale > 1.01;

  // Height in the page: the whole room at the box's width, but never taller than the screen leaves
  // under the shift header and above the dock. Full screen takes everything below its toolbar.
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const natural = size.w ? (size.w * room.h) / room.w : 320;
  const inPage = Math.round(Math.min(Math.max(natural, 240), Math.max(240, vh - 290)));

  useEffect(() => {
    if (!full) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    const wide = window.matchMedia('(min-width: 1024px)');
    // Escape leaves full screen, unless the details sheet is open (Escape closes that first).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.hs-panel')) setFull(false); };
    const onWide = () => { if (wide.matches) setFull(false); };
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    // Real full screen also hides the browser's bars where the browser allows it (not on iPhone);
    // everywhere else the overlay alone fills the window.
    let real = false;
    let gone = false;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        real = true;
        if (gone) void document.exitFullscreen().catch(() => undefined);
        else document.addEventListener('fullscreenchange', onFs);
      }).catch(() => { /* overlay only */ });
    }
    return () => {
      gone = true;
      root.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
      document.removeEventListener('fullscreenchange', onFs);
      if (real && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [full]);

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

  const zones = shift.zones;
  const round = 'h-11 w-11 rounded-full px-0';

  return (
    <div className="grid gap-2">
      <div className={full ? 'hs-map-full fixed inset-0 z-[35] flex flex-col gap-2' : 'grid gap-2'}>
        <div className="flex items-center gap-2">
          {zones.length > 1 && (
            <label className="hs-datepill relative flex h-11 min-w-0 items-center rounded-xl focus-within:ring-2 focus-within:ring-orange">
              <span className="sr-only">אזור</span>
              <select aria-label="אזור" value={zone} onChange={(e) => setZone(e.target.value)} className="h-11 min-w-0 max-w-[10rem] appearance-none truncate rounded-xl bg-transparent ps-3 pe-8 text-[15px] font-semibold focus:outline-none sm:max-w-none">
                <option value="all">כל האזורים</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-ink-muted" aria-hidden />
            </label>
          )}
          {/* On wider screens the legend sits beside the controls, where the eye already is. */}
          <div className="hidden min-w-0 md:block"><StateLegend /></div>
          <div className="ms-auto flex shrink-0 gap-1" role="group" aria-label="גודל המפה">
            <Button size="sm" variant="secondary" icon={ZoomOut} aria-label="הקטנה" disabled={!zoomed} onClick={() => zoomBy(1 / 1.6)} className={round} />
            <Button size="sm" variant="secondary" icon={ZoomIn} aria-label="הגדלה" disabled={scale >= MAX_SCALE - 0.01} onClick={() => zoomBy(1.6)} className={round} />
            {zoomed && <Button size="sm" variant="secondary" onClick={reset} title="חזרה לכל המפה" className="h-11 rounded-full px-3.5">כל המפה</Button>}
            <Button size="sm" variant="secondary" icon={full ? Minimize : Maximize} aria-pressed={full} onClick={() => setFull((f) => !f)}
              aria-label={full ? 'יציאה ממסך מלא' : 'מפה במסך מלא'} title={full ? 'יציאה ממסך מלא' : 'מפה במסך מלא'}
              className={cx(round, 'lg:hidden', full && 'ring-2 ring-orange/40')} />
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {/* While the whole room shows, one finger scrolls the page (pan-y); zoomed in, it moves the map. */}
        <div ref={boxRef} dir="ltr" className={cx('hs-floor-box relative', full && 'min-h-0 flex-1', zoomed && 'cursor-grab active:cursor-grabbing')}
          style={{ height: full ? undefined : inPage, touchAction: zoomed ? 'none' : 'pan-y' }}>
          <FloorCanvas items={items} view={rect} selectedId={selection?.kind === 'table' ? selection.id : null} onSelect={(id) => void pick(id)}
            label={assigning ? `בחירת שולחן עבור ${assigning.guestName}` : 'מפת המקום. בחירה בשולחן פותחת את הפרטים שלו'} />
          {zoomed && <span aria-hidden className="hs-map-scale">{Math.round(scale * 100)}%</span>}
        </div>
        <div className="flex items-center gap-3 px-1">
          <div className="hs-scroll min-w-0 overflow-x-auto md:hidden"><StateLegend /></div>
          <p className="hs-muted ms-auto hidden shrink-0 text-xs sm:block">
            <span className="hs-hint-touch">צביטה או הקשה כפולה להגדלה</span>
            <span className="hs-hint-mouse">גלגלת עם <bdi>Ctrl</bdi> להגדלה, גרירה להזזה</span>
          </p>
        </div>
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
