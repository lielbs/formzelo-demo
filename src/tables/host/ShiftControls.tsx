import { ClipboardList, Footprints, LayoutGrid, List, PhoneCall, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../components/ui';
import { FLAG_HE, PARTY_MAX, TILE_HE, type ShiftFilters, type TileCount, type TileKey } from '../domain/shiftList';
import { SOURCE_HE, STATUS_HE } from '../domain/status';
import type { Shift } from '../domain/types';
import type { View } from './HostShift';
import type { QuickAddMode } from './QuickAdd';
import { Sheet } from './Sheet';

const CHIPS: TileKey[] = ['active', 'attention', 'upcoming', 'arrived', 'seated', 'done'];
const BAR: { key: TileKey; label: string }[] = [
  { key: 'seated', label: 'יושבים' },
  { key: 'arrived', label: 'הגיעו' },
  { key: 'upcoming', label: 'צפויים' },
  { key: 'attention', label: 'לטיפול' },
];

/**
 * The shift at a glance: covers expected today, one bar of where those covers are now
 * (seated, arrived, still to come, needing attention), and the same states as quick filters.
 */
/** A number that eases to its new value (instant for reduced-motion users). */
function useEased(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 500);
      const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export function ShiftPulse({ counts, tile, onTile }: { counts: Record<TileKey, TileCount>; tile: TileKey; onTile: (t: TileKey) => void }) {
  const covers = useEased(counts.active.covers);
  const total = BAR.reduce((n, b) => n + counts[b.key].covers, 0);
  const summary = BAR.map((b) => `${b.label} ${counts[b.key].covers}`).join(', ');
  return (
    <section className="hs-pulse" aria-labelledby="hs-pulse-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hs-pulse-title" className="flex items-baseline gap-2">
          <span className="hs-pulse-number" aria-hidden>{covers}</span><span className="sr-only">{counts.active.covers}</span>
          <span className="text-sm font-medium">סועדים במשמרת</span>
          <span className="hs-muted text-sm">· {counts.active.count} הזמנות</span>
        </h2>
        <p className="hs-muted text-xs">{counts.seated.covers} יושבים עכשיו{counts.attention.count ? ` · ${counts.attention.count} דורשים טיפול` : ''}</p>
      </div>
      <div className="hs-pulse-bar" role="img" aria-label={`חלוקת הסועדים: ${summary}`}>
        {total > 0 ? BAR.filter((b) => counts[b.key].covers > 0).map((b) => (
          <span key={b.key} className={`hs-tone-${b.key}`} style={{ flexGrow: counts[b.key].covers }} />
        )) : <span className="hs-tone-done" style={{ flexGrow: 1, opacity: 0.35 }} />}
      </div>
      <div role="group" aria-label="סינון מהיר לפי מצב" className="hs-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {CHIPS.map((k) => {
          const c = counts[k];
          const on = tile === k;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onTile(on && k !== 'active' ? 'active' : k)}
              aria-label={`${TILE_HE[k]}: ${c.count} הזמנות, ${c.covers} סועדים${on ? ' (מוצג)' : ''}`}
              className={cx('hs-qchip shrink-0', `hs-tone-${k}`)}>
              <span className="hs-qchip-dot" aria-hidden />
              {TILE_HE[k]}
              <span className="hs-qchip-n">{c.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Removable tags for the filters in force, plus one clear-all. */
export function ActiveFilters({ filters, shift, onChange }: { filters: ShiftFilters; shift: Shift; onChange: (f: ShiftFilters) => void }) {
  const zones = new Map(shift.zones.map((z) => [z.id, z.name]));
  const tags: { key: string; label: string; remove: () => void }[] = [
    ...filters.statuses.map((s) => ({ key: `s-${s}`, label: STATUS_HE[s], remove: () => onChange({ ...filters, statuses: filters.statuses.filter((x) => x !== s) }) })),
    ...filters.party.map((n) => ({ key: `p-${n}`, label: `${n === PARTY_MAX ? `${n}+` : n} סועדים`, remove: () => onChange({ ...filters, party: filters.party.filter((x) => x !== n) }) })),
    ...filters.zones.map((z) => ({ key: `z-${z}`, label: zones.get(z) ?? 'אזור', remove: () => onChange({ ...filters, zones: filters.zones.filter((x) => x !== z) }) })),
    ...filters.sources.map((s) => ({ key: `o-${s}`, label: SOURCE_HE[s], remove: () => onChange({ ...filters, sources: filters.sources.filter((x) => x !== s) }) })),
    ...filters.flags.map((f) => ({ key: `f-${f}`, label: FLAG_HE[f], remove: () => onChange({ ...filters, flags: filters.flags.filter((x) => x !== f) }) })),
  ];
  if (!tags.length) return null;
  return (
    <div className="hs-scroll -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="מסננים פעילים">
      {tags.map((t) => (
        <span key={t.key} className="hs-tag shrink-0">
          {t.label}
          <button type="button" onClick={t.remove} aria-label={`הסרת הסינון ${t.label}`}><X className="h-4 w-4" aria-hidden /></button>
        </span>
      ))}
      <button type="button" onClick={() => onChange({ statuses: [], zones: [], party: [], sources: [], flags: [] })}
        className="h-9 shrink-0 rounded-full px-3 text-sm font-medium text-[var(--hs-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hs-accent)]">
        ניקוי הכול
      </button>
    </div>
  );
}

const CHOICES: { mode: QuickAddMode; label: string; hint: string; icon: typeof PhoneCall }[] = [
  { mode: 'walk_in', label: 'מזדמנים עכשיו', hint: 'אורחים בדלת — מושיבים מיד בשולחן פנוי', icon: Footprints },
  { mode: 'phone', label: 'הזמנה חדשה', hint: 'בטלפון או בעל פה — לשעה פנויה היום', icon: PhoneCall },
  { mode: 'waitlist', label: 'לרשימת ההמתנה', hint: 'כשאין שולחן מתאים כרגע', icon: ClipboardList },
];

/** What to add: three large, described choices (one tap each). */
export function AddChooser({ onPick, onClose }: { onPick: (m: QuickAddMode) => void; onClose: () => void }) {
  return (
    <Sheet title="מה מוסיפים?" onClose={onClose}>
      <div className="grid gap-2.5 pb-1">
        {CHOICES.map(({ mode, label, hint, icon: Icon }, i) => (
          <button key={mode} type="button" data-autofocus={i === 0 || undefined} onClick={() => onPick(mode)} className="hs-choice">
            <span className="hs-choice-icon"><Icon className="h-6 w-6" aria-hidden /></span>
            <span className="min-w-0 text-start">
              <span className="block text-[16px] font-semibold">{label}</span>
              <span className="hs-muted block text-sm">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Phone dock: a floating glass capsule with the three views. Tap a view, or drag a finger along
 * the capsule — the highlight follows and settles on the nearest view when released. Arrow keys
 * move between views. A round glass add button sits beside it.
 */
export function ShiftDock({ view, onView, waiting, onAdd, canAdd }: { view: View; onView: (v: View) => void; waiting: number; onAdd: () => void; canAdd: boolean }) {
  const tabs: { v: View; label: string; icon: typeof List }[] = [
    { v: 'list', label: 'רשימה', icon: List },
    { v: 'floor', label: 'מפה', icon: LayoutGrid },
    { v: 'waitlist', label: 'המתנה', icon: ClipboardList },
  ];
  const index = Math.max(0, tabs.findIndex((t) => t.v === view));
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; x: number; dragging: boolean } | null>(null);
  const [drag, setDrag] = useState<{ x: number; hot: number } | null>(null);
  const [bump, setBump] = useState(0);

  /** Distance of the finger from the capsule's start edge (right in RTL), as a highlight offset. */
  const measure = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const rtl = getComputedStyle(box.current!).direction === 'rtl';
    const tab = (r.width - 10) / tabs.length;
    const fromStart = rtl ? r.right - 5 - clientX : clientX - r.left - 5;
    const offset = Math.min(Math.max(fromStart - tab / 2, 0), tab * (tabs.length - 1));
    return { x: rtl ? -offset : offset, hot: Math.round(offset / tab) };
  };
  const choose = (i: number) => { if (tabs[i] && tabs[i]!.v !== view) { onView(tabs[i]!.v); setBump((b) => b + 1); } };

  return (
    <nav aria-label="תצוגות המשמרת" className="hs-dock md:hidden">
      <div ref={box} role="radiogroup" aria-label="תצוגה" className="hs-glass hs-dock-tabs" data-dragging={drag ? '' : undefined}
        onPointerDown={(e) => { if (e.button === 0) press.current = { id: e.pointerId, x: e.clientX, dragging: false }; }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          if (!p.dragging && Math.abs(e.clientX - p.x) < 8) return;
          if (!p.dragging) { p.dragging = true; box.current?.setPointerCapture(e.pointerId); }
          const m = measure(e.clientX);
          setDrag((d) => {
            if (d && d.hot !== m.hot) navigator.vibrate?.(6);
            return { x: m.x, hot: m.hot };
          });
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          if (!p || !p.dragging) return;
          choose(measure(e.clientX).hot);
          setDrag(null);
        }}
        onPointerCancel={() => { press.current = null; setDrag(null); }}
        onKeyDown={(e) => {
          const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
          const step = e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'ArrowRight' ? (rtl ? -1 : 1) : 0;
          if (!step) return;
          e.preventDefault();
          const next = (index + step + tabs.length) % tabs.length;
          choose(next);
          box.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus();
        }}>
        {/* RTL: the first view is on the right, so the next one is further left. */}
        <span className="hs-dock-glow" aria-hidden
          style={{ transform: drag ? `translateX(${drag.x}px) scale(1.06, 1.08)` : `translateX(${-100 * index}%)` }} />
        {tabs.map(({ v, label, icon: Icon }, i) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} tabIndex={view === v ? 0 : -1}
            data-hot={drag?.hot === i ? '' : undefined} onClick={() => choose(i)} className="hs-tab">
            <Icon key={view === v ? `on-${bump}` : 'off'} className="hs-tab-icon h-[22px] w-[22px]" aria-hidden />
            <span>{label}</span>
            {v === 'waitlist' && waiting > 0 && <span className="hs-badge" aria-label={`${waiting} ממתינים`}>{waiting}</span>}
          </button>
        ))}
      </div>
      <button type="button" onClick={onAdd} disabled={!canAdd} aria-label="הוספה" title="הוספה" className="hs-glass hs-dock-add">
        <Plus className="h-7 w-7" aria-hidden />
      </button>
    </nav>
  );
}
