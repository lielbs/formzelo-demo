import { ClipboardList, Footprints, LayoutGrid, List, PhoneCall, Plus, X } from 'lucide-react';
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
export function ShiftPulse({ counts, tile, onTile }: { counts: Record<TileKey, TileCount>; tile: TileKey; onTile: (t: TileKey) => void }) {
  const total = BAR.reduce((n, b) => n + counts[b.key].covers, 0);
  const summary = BAR.map((b) => `${b.label} ${counts[b.key].covers}`).join(', ');
  return (
    <section className="hs-pulse" aria-labelledby="hs-pulse-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hs-pulse-title" className="flex items-baseline gap-2">
          <span className="hs-pulse-number">{counts.active.covers}</span>
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
 * Phone dock: a floating glass capsule with the three views and a highlight that slides to the
 * chosen one, plus a round glass add button. Motion is skipped for reduced-motion users.
 */
export function ShiftDock({ view, onView, waiting, onAdd, canAdd }: { view: View; onView: (v: View) => void; waiting: number; onAdd: () => void; canAdd: boolean }) {
  const tabs: { v: View; label: string; icon: typeof List }[] = [
    { v: 'list', label: 'רשימה', icon: List },
    { v: 'floor', label: 'מפה', icon: LayoutGrid },
    { v: 'waitlist', label: 'המתנה', icon: ClipboardList },
  ];
  const index = Math.max(0, tabs.findIndex((t) => t.v === view));
  return (
    <nav aria-label="תצוגות המשמרת" className="hs-dock md:hidden">
      <div role="radiogroup" aria-label="תצוגה" className="hs-glass hs-dock-tabs">
        {/* RTL: the first tab is on the right, so moving to the next one goes left. */}
        <span className="hs-dock-glow" aria-hidden style={{ transform: `translateX(${-100 * index}%)` }} />
        {tabs.map(({ v, label, icon: Icon }) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => onView(v)} className="hs-tab">
            <Icon className="hs-tab-icon h-[22px] w-[22px]" aria-hidden />
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
