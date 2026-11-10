/**
 * Floor builder: drag tables on a grid, or edit everything from the list (the accessible
 * equivalent of every spatial action). Coordinates are physical and never mirrored in RTL.
 */
import { Copy, LayoutGrid, Link2, List, Minus, Plus, Redo2, RotateCw, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Card, cx, Input, Select } from '../../components/ui';
import { makeTable, nextLabel, totalSeats, uuid } from '../domain/draft';
import type { CombinationDef, TableDef, TableShape, VenueDraft, ZoneDef } from '../domain/types';
import { FloorCanvas, Hint, Segmented } from '../ui';

type Floor = Pick<VenueDraft, 'zones' | 'tables' | 'combinations'>;

const SHAPE_HE: Record<TableShape, string> = { square: 'מרובע', round: 'עגול', rect: 'מלבני', bar: 'כיסא בר' };
const SIZES: Record<TableShape, { w: number; h: number }> = { round: { w: 70, h: 70 }, square: { w: 70, h: 70 }, rect: { w: 120, h: 70 }, bar: { w: 50, h: 50 } };
const SNAP = 10;
const snap = (v: number) => Math.max(0, Math.min(1900, Math.round(v / SNAP) * SNAP));

export function FloorEditor({ floor, onChange }: { floor: Floor; onChange: (f: Floor) => void }) {
  const [view, setView] = useState<'map' | 'list'>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'map'));
  const [zoneId, setZoneId] = useState<string>(floor.zones[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const past = useRef<Floor[]>([]);
  const future = useRef<Floor[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; start: Floor; moved: boolean } | null>(null);
  const [, force] = useState(0);

  const zone = floor.zones.find((z) => z.id === zoneId) ?? floor.zones[0];
  const zoneTables = floor.tables.filter((t) => t.zoneId === zone?.id);
  const sel = floor.tables.find((t) => t.id === selected) ?? null;

  const commit = useCallback((next: Floor, record = true) => {
    if (record) { past.current.push(floor); if (past.current.length > 50) past.current.shift(); future.current = []; }
    onChange(next);
    force((n) => n + 1);
  }, [floor, onChange]);

  const updateTable = (id: string, patch: Partial<TableDef>, record = true) =>
    commit({ ...floor, tables: floor.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) }, record);

  const undo = () => { const p = past.current.pop(); if (p) { future.current.push(floor); onChange(p); force((n) => n + 1); } };
  const redo = () => { const f = future.current.pop(); if (f) { past.current.push(floor); onChange(f); force((n) => n + 1); } };

  function addTable(seats: number) {
    if (!zone) return;
    const occupied = new Set(zoneTables.map((t) => `${t.x},${t.y}`));
    let x = 30;
    let y = 30;
    for (let i = 0; i < 400; i++) {
      x = 30 + (i % 6) * 140;
      y = 30 + Math.floor(i / 6) * 120;
      if (!occupied.has(`${x},${y}`)) break;
    }
    const t = makeTable(zone.id, nextLabel(floor.tables), seats, x, y);
    commit({ ...floor, tables: [...floor.tables, t] });
    setSelected(t.id);
  }

  function removeTable(id: string) {
    commit({
      ...floor,
      tables: floor.tables.filter((t) => t.id !== id),
      combinations: floor.combinations.map((c) => ({ ...c, tableIds: c.tableIds.filter((x) => x !== id) })).filter((c) => c.tableIds.length >= 2),
    });
    if (selected === id) setSelected(null);
  }

  function duplicate(t: TableDef) {
    const copy = { ...t, id: uuid(), label: nextLabel(floor.tables), x: snap(t.x + t.w + 20), y: t.y };
    commit({ ...floor, tables: [...floor.tables, copy] });
    setSelected(copy.id);
  }

  function toSvgPoint(e: { clientX: number; clientY: number }) {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ctm.inverse());
  }

  const onPointerDownTable = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    const t = floor.tables.find((x) => x.id === id);
    const p = toSvgPoint(e);
    if (!t || !p) return;
    setSelected(id);
    drag.current = { id, dx: p.x - t.x, dy: p.y - t.y, start: floor, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvgPoint(e);
    if (!p) return;
    const x = snap(p.x - d.dx);
    const y = snap(p.y - d.dy);
    const t = floor.tables.find((z) => z.id === d.id);
    if (t && (t.x !== x || t.y !== y)) { d.moved = true; updateTable(d.id, { x, y }, false); }
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (d?.moved) { past.current.push(d.start); future.current = []; }
    drag.current = null;
  };

  const onKeyDownCanvas = (e: React.KeyboardEvent) => {
    if (!sel) return;
    const step = e.shiftKey ? 50 : SNAP;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    const m = moves[e.key];
    if (m) { e.preventDefault(); updateTable(sel.id, { x: snap(sel.x + m[0]), y: snap(sel.y + m[1]) }); }
    if (e.key === 'Delete') { e.preventDefault(); removeTable(sel.id); }
  };

  // ---------- Zones ----------
  function addZone() {
    const z: ZoneDef = { id: uuid(), name: `אזור ${floor.zones.length + 1}`, sort: floor.zones.length };
    commit({ ...floor, zones: [...floor.zones, z] });
    setZoneId(z.id);
  }
  function renameZone(id: string, name: string) { commit({ ...floor, zones: floor.zones.map((z) => (z.id === id ? { ...z, name } : z)) }, false); }
  function removeZone(id: string) {
    if (floor.tables.some((t) => t.zoneId === id)) return;
    const zones = floor.zones.filter((z) => z.id !== id);
    commit({ ...floor, zones });
    setZoneId(zones[0]?.id ?? '');
  }

  const items = useMemo(() => zoneTables.map((t) => ({ ...t, caption: t.minCovers === t.maxCovers ? String(t.maxCovers) : `${t.minCovers}–${t.maxCovers}`, spoken: `${t.minCovers} עד ${t.maxCovers} סועדים` })), [zoneTables]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="תצוגת עריכה" value={view} onChange={setView} options={[{ value: 'map', label: 'מפה', icon: LayoutGrid }, { value: 'list', label: 'רשימה', icon: List }]} />
        <p className="text-sm text-ink-muted">
          {floor.tables.length} שולחנות · {totalSeats(floor.tables)} מקומות ישיבה
        </p>
      </div>

      {/* Zones */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="אזורי ישיבה">
        {floor.zones.map((z) => (
          <button key={z.id} type="button" aria-pressed={z.id === zone?.id} onClick={() => { setZoneId(z.id); setSelected(null); }}
            className={cx('h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', z.id === zone?.id ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink hover:bg-cloud')}>
            {z.name} <span className="opacity-70">({floor.tables.filter((t) => t.zoneId === z.id).length})</span>
          </button>
        ))}
        <Button size="sm" variant="ghost" icon={Plus} onClick={addZone}>אזור חדש</Button>
      </div>
      {zone && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 sm:max-w-xs">
            <label htmlFor="zone-name" className="mb-1 block text-xs font-medium text-ink-muted">שם האזור</label>
            <Input id="zone-name" value={zone.name} maxLength={60} onChange={(e) => renameZone(zone.id, e.target.value)} />
          </div>
          <Button size="sm" variant="ghost" icon={Trash2} disabled={zoneTables.length > 0 || floor.zones.length === 1} onClick={() => removeZone(zone.id)}
            title={zoneTables.length > 0 ? 'אפשר למחוק אזור רק אחרי שמעבירים או מוחקים את השולחנות שבו' : undefined}>
            מחיקת האזור
          </Button>
          {zoneTables.length > 0 && <p className="w-full text-xs text-ink-muted">כדי למחוק אזור, קודם העבירו או מחקו את השולחנות שבו.</p>}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="כלי עריכת שולחנות">
        <span className="text-sm font-medium text-ink">הוספת שולחן:</span>
        {[2, 4, 6, 8].map((n) => (
          <Button key={n} size="sm" variant="secondary" icon={Plus} onClick={() => addTable(n)} className="h-10">{n} מקומות</Button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-cloud-300 sm:block" aria-hidden />
        {view === 'map' && <>
          <Button size="sm" variant="secondary" icon={ZoomIn} aria-label="הגדלת המפה" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} className="h-10 w-10 px-0" />
          <Button size="sm" variant="secondary" icon={ZoomOut} aria-label="הקטנת המפה" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="h-10 w-10 px-0" />
        </>}
        <Button size="sm" variant="ghost" icon={Undo2} onClick={undo} disabled={!past.current.length} aria-label="ביטול פעולה אחרונה" className="h-10" />
        <Button size="sm" variant="ghost" icon={Redo2} onClick={redo} disabled={!future.current.length} aria-label="שחזור פעולה" className="h-10" />
      </div>

      {view === 'map' ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="relative overflow-hidden p-2">
            <div className="min-h-[14rem]" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDownCanvas}>
              {zoneTables.length ? (
                <FloorCanvas svgRef={svg} editable zoom={zoom} items={items} selectedId={selected} onSelect={setSelected} onPointerDownTable={onPointerDownTable}
                  label={`מפת ${zone?.name ?? ''}: גררו שולחן כדי להזיז, או בחרו ועברו עם החיצים`} maxHeight="60vh" />
              ) : (
                <div className="flex h-56 items-center justify-center p-6 text-center text-sm text-ink-muted">אין עדיין שולחנות באזור הזה. הוסיפו שולחן מהכפתורים למעלה.</div>
              )}
            </div>
            <p className="px-2 pb-1 pt-2 text-xs text-ink-muted">המספר הגדול הוא מספר השולחן; המספר הקטן — כמה סועדים אפשר להושיב בו (מינימום–מקסימום). גררו שולחן כדי להזיז אותו, או בחרו אותו ועברו עם החיצים במקלדת.</p>
          </Card>
          <Card className="p-4">
            {sel ? (
              <TableInspector table={sel} zones={floor.zones} onChange={(p) => updateTable(sel.id, p)} onDelete={() => removeTable(sel.id)} onDuplicate={() => duplicate(sel)}
                labelTaken={(label) => floor.tables.some((t) => t.id !== sel.id && t.label.trim() === label.trim())} />
            ) : (
              <p className="text-sm text-ink-muted">בחרו שולחן במפה כדי לשנות מספר, מקומות, צורה, מיקום — או כדי למחוק אותו.</p>
            )}
          </Card>
        </div>
      ) : (
        <TableList floor={floor} zoneFilter={zone?.id ?? null} onUpdate={updateTable} onRemove={removeTable} />
      )}

      <Combinations floor={floor} onChange={(combinations) => commit({ ...floor, combinations })} />
    </div>
  );
}

function TableInspector({ table, zones, onChange, onDelete, onDuplicate, labelTaken }: {
  table: TableDef; zones: ZoneDef[]; onChange: (p: Partial<TableDef>) => void; onDelete: () => void; onDuplicate: () => void; labelTaken: (l: string) => boolean;
}) {
  const id = `t-${table.id.slice(0, 8)}`;
  const taken = labelTaken(table.label);
  return (
    <div className="grid gap-3">
      <h3 className="font-semibold text-ink">שולחן {table.label}</h3>
      <div>
        <label htmlFor={`${id}-label`} className="mb-1 block text-sm font-medium">מספר / שם השולחן</label>
        <Input id={`${id}-label`} value={table.label} maxLength={20} invalid={taken || !table.label.trim()} aria-describedby={taken ? `${id}-taken` : undefined}
          onChange={(e) => onChange({ label: e.target.value })} />
        {taken && <p id={`${id}-taken`} className="mt-1 text-xs text-red-700">כבר יש שולחן עם המספר הזה.</p>}
      </div>
      <SeatsFields table={table} onChange={onChange} id={id} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-shape`} className="mb-1 block text-sm font-medium">צורה</label>
          <Select id={`${id}-shape`} value={table.shape} onChange={(e) => { const s = e.target.value as TableShape; onChange({ shape: s, ...SIZES[s] }); }}>
            {(Object.keys(SHAPE_HE) as TableShape[]).map((s) => <option key={s} value={s}>{SHAPE_HE[s]}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-zone`} className="mb-1 block text-sm font-medium">אזור</label>
          <Select id={`${id}-zone`} value={table.zoneId} onChange={(e) => onChange({ zoneId: e.target.value })}>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </Select>
        </div>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1 text-sm font-medium">מיקום במפה</legend>
        <CoordField id={`${id}-x`} label="מימין לשמאל במפה (X)" value={table.x} onChange={(x) => onChange({ x })} />
        <CoordField id={`${id}-y`} label="מלמעלה למטה (Y)" value={table.y} onChange={(y) => onChange({ y })} />
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={!!table.accessible} onChange={(e) => onChange({ accessible: e.target.checked })} />
        נגיש לכיסא גלגלים
      </label>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="secondary" icon={RotateCw} onClick={() => onChange({ rotation: ((table.rotation ?? 0) + 90) % 360 })}>סיבוב</Button>
        <Button size="sm" variant="secondary" icon={Copy} onClick={onDuplicate}>שכפול</Button>
        <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete}>מחיקה</Button>
      </div>
    </div>
  );
}

function CoordField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-ink-muted">{label}</label>
      <input id={id} type="number" min={0} max={1900} step={10} value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(snap(n)); }}
        className="fz-input h-10 w-full rounded-xl border border-cloud-300 px-3 text-sm tabular-nums" dir="ltr" />
    </div>
  );
}

function Stepper({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span id={`${id}-l`} className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-labelledby={`${id}-l`}>
        <Button size="sm" variant="secondary" icon={Minus} aria-label={`פחות — ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="h-10 w-10 px-0" />
        <output id={id} aria-live="polite" className="w-10 text-center text-base font-semibold tabular-nums">{value}</output>
        <Button size="sm" variant="secondary" icon={Plus} aria-label={`יותר — ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="h-10 w-10 px-0" />
      </div>
    </div>
  );
}

function SeatsFields({ table, onChange, id }: { table: TableDef; onChange: (p: Partial<TableDef>) => void; id: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stepper id={`${id}-max`} label="עד כמה סועדים" value={table.maxCovers} min={1} max={60} onChange={(v) => onChange({ maxCovers: v, minCovers: Math.min(table.minCovers, v) })} />
      <Stepper id={`${id}-min`} label="לפחות" value={table.minCovers} min={1} max={table.maxCovers} onChange={(v) => onChange({ minCovers: v })} />
    </div>
  );
}

function TableList({ floor, zoneFilter, onUpdate, onRemove }: { floor: Floor; zoneFilter: string | null; onUpdate: (id: string, p: Partial<TableDef>) => void; onRemove: (id: string) => void }) {
  const rows = floor.tables.filter((t) => !zoneFilter || t.zoneId === zoneFilter);
  if (!rows.length) return <Hint>אין עדיין שולחנות באזור הזה. הוסיפו שולחן מהכפתורים למעלה.</Hint>;
  return (
    <ul className="grid gap-3" aria-label="רשימת שולחנות">
      {rows.map((t) => {
        const id = `row-${t.id.slice(0, 8)}`;
        const taken = floor.tables.some((o) => o.id !== t.id && o.label.trim() === t.label.trim());
        return (
          <li key={t.id}>
            <Card className="grid gap-3 p-3 sm:grid-cols-[6rem_1fr_1fr_9rem_auto] sm:items-end">
              <div>
                <label htmlFor={`${id}-label`} className="mb-1 block text-xs font-medium text-ink-muted">מספר</label>
                <Input id={`${id}-label`} value={t.label} maxLength={20} invalid={taken || !t.label.trim()} onChange={(e) => onUpdate(t.id, { label: e.target.value })} />
              </div>
              <Stepper id={`${id}-max`} label="עד כמה סועדים" value={t.maxCovers} min={1} max={60} onChange={(v) => onUpdate(t.id, { maxCovers: v, minCovers: Math.min(t.minCovers, v) })} />
              <Stepper id={`${id}-min`} label="לפחות" value={t.minCovers} min={1} max={t.maxCovers} onChange={(v) => onUpdate(t.id, { minCovers: v })} />
              <div>
                <label htmlFor={`${id}-zone`} className="mb-1 block text-xs font-medium text-ink-muted">אזור</label>
                <Select id={`${id}-zone`} value={t.zoneId} onChange={(e) => onUpdate(t.id, { zoneId: e.target.value })}>
                  {floor.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </Select>
              </div>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => onRemove(t.id)} aria-label={`מחיקת שולחן ${t.label}`} className="h-10 justify-self-start" />
              {taken && <p className="text-xs text-red-700 sm:col-span-5">כבר יש שולחן עם המספר הזה.</p>}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function Combinations({ floor, onChange }: { floor: Floor; onChange: (c: CombinationDef[]) => void }) {
  const [picking, setPicking] = useState<string[] | null>(null);
  const byId = new Map(floor.tables.map((t) => [t.id, t]));
  const save = () => {
    if (!picking || picking.length < 2) return;
    const members = picking.map((id) => byId.get(id)!).filter(Boolean);
    const max = members.reduce((s, t) => s + t.maxCovers, 0);
    const min = Math.max(...members.map((t) => t.maxCovers)) + 1;
    onChange([...floor.combinations, { id: uuid(), label: members.map((t) => t.label).join('+'), tableIds: picking, minCovers: Math.min(min, max), maxCovers: max, priority: 0 }]);
    setPicking(null);
  };
  return (
    <Card as="section" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-ink"><Link2 className="h-4 w-4" aria-hidden /> שולחנות שאפשר לחבר (רשות)</h3>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">לקבוצות גדולות: הגדירו אילו שולחנות מחברים יחד. המערכת תשתמש בצירוף רק כשאין שולחן יחיד מתאים, ותשמור את כל השולחנות שבו יחד.</p>
        </div>
        {!picking && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setPicking([])} disabled={floor.tables.length < 2}>צירוף חדש</Button>}
      </div>
      {picking && (
        <div className="mt-4 rounded-xl border border-cloud-300 p-3">
          <p id="combo-pick" className="text-sm font-medium">בחרו 2 שולחנות או יותר:</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="combo-pick">
            {floor.tables.map((t) => {
              const on = picking.includes(t.id);
              return (
                <button key={t.id} type="button" aria-pressed={on} onClick={() => setPicking(on ? picking.filter((x) => x !== t.id) : [...picking, t.id].slice(0, 8))}
                  className={cx('h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', on ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white')}>
                  {t.label} <span className="font-normal opacity-70">({t.maxCovers})</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={save} disabled={picking.length < 2}>שמירת הצירוף</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicking(null)}>ביטול</Button>
          </div>
        </div>
      )}
      {floor.combinations.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {floor.combinations.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-cloud-200 p-3">
              <span className="font-semibold tabular-nums">{c.tableIds.map((id) => byId.get(id)?.label ?? '?').join(' + ')}</span>
              <span className="text-sm text-ink-muted">לקבוצות של <bdi dir="ltr">{c.minCovers}–{c.maxCovers}</bdi></span>
              <span className="ms-auto flex items-center gap-2">
                <label className="text-xs text-ink-muted" htmlFor={`cmin-${c.id}`}>החל מ-</label>
                <input id={`cmin-${c.id}`} type="number" min={1} max={c.maxCovers} value={c.minCovers} dir="ltr"
                  onChange={(e) => onChange(floor.combinations.map((x) => (x.id === c.id ? { ...x, minCovers: Math.max(1, Math.min(x.maxCovers, Number(e.target.value) || 1)) } : x)))}
                  className="fz-input h-10 w-16 rounded-lg border border-cloud-300 px-2 text-sm tabular-nums" />
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={`מחיקת הצירוף ${c.label}`} onClick={() => onChange(floor.combinations.filter((x) => x.id !== c.id))} className="h-10" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
