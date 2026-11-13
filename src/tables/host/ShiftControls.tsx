import type { ReactNode } from 'react';
import { ClipboardList, Footprints, LayoutGrid, List, PhoneCall, Plus, X } from 'lucide-react';
import { GlassDock } from '../../components/GlassDock';
import { cx } from '../../components/ui';
import { FLAG_HE, PARTY_MAX, TILE_HE, type ShiftFilters, type ShiftSummary, type TileCount, type TileKey } from '../domain/shiftList';
import { SOURCE_HE, STATUS_HE } from '../domain/status';
import type { Shift } from '../domain/types';
import type { View } from './HostShift';
import type { QuickAddMode } from './QuickAdd';
import { Sheet } from './Sheet';

const TABS: TileKey[] = ['active', 'attention', 'upcoming', 'arrived', 'seated', 'done'];

/**
 * The shift right now, one unit per figure (diners or tables, said in words), then the bookings
 * by state as tabs. Figures are facts; tabs filter the list below.
 */
export function ShiftSummaryBar({ summary, counts, tile, onTile, showTabs = true, tools, below }: {
  summary: ShiftSummary; counts: Record<TileKey, TileCount>; tile: TileKey; onTile: (t: TileKey) => void; showTabs?: boolean;
  /** Search and filter, at the end of the tabs row (they act on the same list). */
  tools?: ReactNode;
  /** Shown under the tabs row (e.g. the opened search field on phones). */
  below?: ReactNode;
}) {
  return (
    <section className="hs-summary" aria-label="המשמרת עכשיו">
      <dl className="hs-kpis">
        <div><dt>יושבים עכשיו</dt><dd><b>{summary.seatedCovers}</b> סועדים</dd></div>
        <div><dt>עוד צפויים</dt><dd><b>{summary.expectedCovers}</b> סועדים</dd></div>
        <div><dt>שולחנות פנויים</dt><dd><b>{summary.freeTables}</b> מתוך {summary.openTables}</dd></div>
        {summary.late > 0 && <div data-tone="attention"><dt>מאחרים</dt><dd><b>{summary.late}</b> {summary.late === 1 ? 'הזמנה' : 'הזמנות'}</dd></div>}
      </dl>
      {showTabs && (
        <div className="hs-tabsrow">
        <div role="group" aria-label="הזמנות לפי מצב" className="hs-tabs hs-scroll">
          {TABS.map((k) => {
            const c = counts[k];
            const on = tile === k;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => onTile(on && k !== 'active' ? 'active' : k)}
                aria-label={`${TILE_HE[k]}: ${c.count} הזמנות${on ? ' (מוצג)' : ''}`}
                className={cx('hs-tab', `hs-tone-${k}`)} data-empty={c.count === 0 || undefined}>
                {k !== 'active' && <span className="hs-status-dot" aria-hidden />}
                {TILE_HE[k]}
                <span className="hs-tab-n">{c.count}</span>
              </button>
            );
          })}
        </div>
        {tools && <div className="hs-tabtools">{tools}</div>}
        </div>
      )}
      {showTabs && below}
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

/** Phone dock for the shift: the three views (drag or tap) and the add button. */
export function ShiftDock({ view, onView, waiting, onAdd, canAdd }: { view: View; onView: (v: View) => void; waiting: number; onAdd: () => void; canAdd: boolean }) {
  const views: View[] = ['list', 'floor', 'waitlist'];
  return (
    <GlassDock label="תצוגות המשמרת" mode="radio" hideFrom="md" active={views.indexOf(view)} onChoose={(i) => onView(views[i]!)}
      items={[
        { key: 'list', label: 'רשימה', icon: List },
        { key: 'floor', label: 'מפה', icon: LayoutGrid },
        { key: 'waitlist', label: 'המתנה', icon: ClipboardList, badge: waiting, badgeLabel: `${waiting} ממתינים` },
      ]}
      action={{ label: 'הוספה', icon: Plus, onClick: onAdd, disabled: !canAdd }} />
  );
}
