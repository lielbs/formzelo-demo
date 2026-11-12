import { RotateCcw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { FLAG_HE, filterCount, matchesFilters, NO_FILTERS, optionCounts, PARTY_MAX, PARTY_OPTIONS, SORT_HE, type FlagKey, type ShiftFilters, type SortKey } from '../domain/shiftList';
import { SOURCE_HE, STATUS_HE } from '../domain/status';
import type { ReservationSource, ReservationStatus, Shift, ShiftReservation } from '../domain/types';
import { Sheet } from './Sheet';

const STATUS_ORDER: ReservationStatus[] = ['pending_approval', 'confirmed', 'arrived', 'seated', 'completed', 'no_show', 'cancelled'];
const SOURCE_ORDER: ReservationSource[] = ['online', 'phone', 'walk_in', 'waitlist', 'staff'];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-[var(--hs-line)] py-4 first:border-t-0 first:pt-1">
      <legend className="float-start mb-3 w-full text-sm font-semibold">{title}</legend>
      <div className="clear-both flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Pill({ on, count, onClick, children, disabled }: { on: boolean; count?: number; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="hs-pill" aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
      {count !== undefined && <span className="hs-count">{count}</span>}
    </button>
  );
}

/**
 * Filters are edited as a draft; the footer says how many bookings will show before applying,
 * so nobody lands on an empty list by surprise.
 */
export function FilterSheet({ shift, rows, filters, sort, onApply, onClose }: {
  shift: Shift; rows: ShiftReservation[]; filters: ShiftFilters; sort: SortKey;
  onApply: (f: ShiftFilters, sort: SortKey) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [draftSort, setDraftSort] = useState(sort);
  const tables = useMemo(() => new Map(shift.tables.map((t) => [t.id, t])), [shift.tables]);
  const counts = useMemo(() => optionCounts(rows, tables), [rows, tables]);
  const result = useMemo(() => rows.filter((r) => matchesFilters(r, draft, tables)).length, [rows, draft, tables]);
  const set = <K extends keyof ShiftFilters>(key: K, value: ShiftFilters[K][number]) =>
    setDraft((d) => ({ ...d, [key]: toggle(d[key] as ShiftFilters[K][number][], value) }));
  const dirty = filterCount(draft) > 0 || draftSort !== 'time';

  return (
    <Sheet title="סינון וסידור" subtitle={`${rows.length} הזמנות ביום הזה`} onClose={onClose}
      footer={(
        <>
          <button type="button" data-autofocus onClick={() => onApply(draft, draftSort)}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-[var(--hs-accent)] px-4 text-[15px] font-semibold text-[var(--hs-on-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--hs-accent)]">
            {result === 0 ? 'אין הזמנות שמתאימות' : `הצגת ${result} הזמנות`}
          </button>
          <button type="button" onClick={() => { setDraft(NO_FILTERS); setDraftSort('time'); }} disabled={!dirty}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-[var(--hs-line-strong)] px-4 text-sm font-medium disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hs-accent)]">
            <RotateCcw className="h-4 w-4" aria-hidden /> איפוס
          </button>
        </>
      )}>
      <Group title="סידור הרשימה">
        {(Object.keys(SORT_HE) as SortKey[]).map((k) => <Pill key={k} on={draftSort === k} onClick={() => setDraftSort(k)}>{SORT_HE[k]}</Pill>)}
      </Group>
      <Group title="מצב ההזמנה">
        {STATUS_ORDER.map((s) => (
          <Pill key={s} on={draft.statuses.includes(s)} count={counts.statuses.get(s) ?? 0} onClick={() => set('statuses', s)}
            disabled={!counts.statuses.get(s) && !draft.statuses.includes(s)}>{STATUS_HE[s]}</Pill>
        ))}
      </Group>
      <Group title="מספר סועדים">
        {PARTY_OPTIONS.map((n) => (
          <Pill key={n} on={draft.party.includes(n)} count={counts.party.get(n) ?? 0} onClick={() => set('party', n)}
            disabled={!counts.party.get(n) && !draft.party.includes(n)}>
            <span className="font-semibold tabular-nums">{n === PARTY_MAX ? `${n}+` : n}</span>
          </Pill>
        ))}
      </Group>
      {shift.zones.length > 1 && (
        <Group title="אזור">
          {shift.zones.map((z) => (
            <Pill key={z.id} on={draft.zones.includes(z.id)} count={counts.zones.get(z.id) ?? 0} onClick={() => set('zones', z.id)}
              disabled={!counts.zones.get(z.id) && !draft.zones.includes(z.id)}>{z.name}</Pill>
          ))}
        </Group>
      )}
      <Group title="מקור ההזמנה">
        {SOURCE_ORDER.map((s) => (
          <Pill key={s} on={draft.sources.includes(s)} count={counts.sources.get(s) ?? 0} onClick={() => set('sources', s)}
            disabled={!counts.sources.get(s) && !draft.sources.includes(s)}>{SOURCE_HE[s]}</Pill>
        ))}
      </Group>
      <Group title="סימונים">
        {(Object.keys(FLAG_HE) as FlagKey[]).map((f) => (
          <Pill key={f} on={draft.flags.includes(f)} count={counts.flags.get(f) ?? 0} onClick={() => set('flags', f)}
            disabled={!counts.flags.get(f) && !draft.flags.includes(f)}>{FLAG_HE[f]}</Pill>
        ))}
      </Group>
    </Sheet>
  );
}
