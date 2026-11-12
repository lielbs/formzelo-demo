/**
 * The host's reservation list: quick tiles, filters, and a time-ordered timeline with a
 * "now" marker. Pure functions so the screen stays thin and the behaviour is tested.
 */
import { bucketOf, isActive } from './status';
import type { ReservationSource, ReservationStatus, ShiftReservation, ShiftTable } from './types';

export type TileKey = 'active' | 'attention' | 'upcoming' | 'arrived' | 'seated' | 'done';
export type FlagKey = 'requests' | 'notes' | 'returning' | 'no_show_history' | 'no_table';
export type SortKey = 'time' | 'status';

export interface ShiftFilters {
  statuses: ReservationStatus[];
  zones: string[];
  /** Party sizes; 8 stands for "8 or more". */
  party: number[];
  sources: ReservationSource[];
  flags: FlagKey[];
}

export const NO_FILTERS: ShiftFilters = { statuses: [], zones: [], party: [], sources: [], flags: [] };
export const PARTY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const PARTY_MAX = 8;

export const TILE_HE: Record<TileKey, string> = {
  active: 'הכול',
  attention: 'דורש טיפול',
  upcoming: 'צפויים',
  arrived: 'הגיעו',
  seated: 'יושבים',
  done: 'הסתיימו',
};
export const FLAG_HE: Record<FlagKey, string> = {
  requests: 'עם בקשה מיוחדת',
  notes: 'עם הערות צוות',
  returning: 'אורחים חוזרים',
  no_show_history: 'לא הגיעו בעבר',
  no_table: 'בלי שולחן',
};
export const SORT_HE: Record<SortKey, string> = { time: 'לפי שעה', status: 'לפי מצב' };

const DONE: ReservationStatus[] = ['completed', 'cancelled', 'rejected', 'no_show', 'expired'];
export const isDone = (r: Pick<ShiftReservation, 'status'>) => DONE.includes(r.status);

export function inTile(r: ShiftReservation, tile: TileKey, now: Date): boolean {
  if (tile === 'done') return isDone(r);
  if (!isActive(r.status)) return false;
  if (tile === 'active') return true;
  const b = bucketOf(r, now);
  if (tile === 'attention') return b === 'attention';
  if (tile === 'upcoming') return r.status === 'confirmed' && b !== 'attention';
  if (tile === 'arrived') return r.status === 'arrived';
  return r.status === 'seated';
}

export interface TileCount { count: number; covers: number }
export function tileCounts(reservations: ShiftReservation[], now: Date): Record<TileKey, TileCount> {
  const out = Object.fromEntries((Object.keys(TILE_HE) as TileKey[]).map((k) => [k, { count: 0, covers: 0 }])) as Record<TileKey, TileCount>;
  for (const r of reservations) {
    for (const k of Object.keys(out) as TileKey[]) {
      if (inTile(r, k, now)) { out[k].count++; out[k].covers += r.party; }
    }
  }
  return out;
}

export function hasFlag(r: ShiftReservation, flag: FlagKey): boolean {
  switch (flag) {
    case 'requests': return Boolean(r.requests?.trim());
    case 'notes': return r.notesCount > 0;
    case 'returning': return r.visits > 0;
    case 'no_show_history': return r.noShows > 0;
    case 'no_table': return isActive(r.status) && r.tableIds.length === 0;
  }
}

export const partyBucket = (party: number) => Math.min(party, PARTY_MAX);

/** Zones a reservation sits in (through its tables). */
export function zonesOf(r: ShiftReservation, tables: Map<string, Pick<ShiftTable, 'zoneId'>>): string[] {
  return [...new Set(r.tableIds.map((id) => tables.get(id)?.zoneId).filter((z): z is string => Boolean(z)))];
}

/** Within a dimension any selected value matches; across dimensions all must match. */
export function matchesFilters(r: ShiftReservation, f: ShiftFilters, tables: Map<string, Pick<ShiftTable, 'zoneId'>>): boolean {
  if (f.statuses.length && !f.statuses.includes(r.status)) return false;
  if (f.sources.length && !f.sources.includes(r.source)) return false;
  if (f.party.length && !f.party.includes(partyBucket(r.party))) return false;
  if (f.zones.length && !zonesOf(r, tables).some((z) => f.zones.includes(z))) return false;
  if (f.flags.length && !f.flags.every((flag) => hasFlag(r, flag))) return false;
  return true;
}

export function matchesQuery(r: ShiftReservation, query: string, tableLabels: Map<string, string>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return r.guestName.toLowerCase().includes(q)
    || r.reference.toLowerCase().includes(q)
    || (digits.length >= 2 && (r.guestPhone ?? '').replace(/\D/g, '').includes(digits))
    || r.tableIds.some((id) => tableLabels.get(id)?.toLowerCase() === q);
}

export const filterCount = (f: ShiftFilters) => f.statuses.length + f.zones.length + f.party.length + f.sources.length + f.flags.length;

export type TimelineItem =
  | { kind: 'slot'; key: string; label: string; count: number; covers: number }
  | { kind: 'now'; key: string; time: string }
  | { kind: 'row'; key: string; r: ShiftReservation; next: boolean };

/** Hour label of a local "HH:MM" time ("19:45" → "19:00"). */
export const slotOf = (time: string) => `${time.slice(0, 2)}:00`;

/**
 * Time-ordered rows grouped by hour, with a "now" marker before the first booking that starts
 * after `now` (only when the list is for today), and the next party still to arrive flagged.
 */
export function timeline(rows: ShiftReservation[], now: Date, nowLabel: string | null): TimelineItem[] {
  const sorted = [...rows].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.guestName.localeCompare(b.guestName));
  const t = now.getTime();
  const nextId = nowLabel === null ? null
    : sorted.find((r) => r.status === 'confirmed' && new Date(r.startsAt).getTime() >= t - 15 * 60_000)?.id ?? null;
  const items: TimelineItem[] = [];
  let placedNow = nowLabel === null;
  let slot: Extract<TimelineItem, { kind: 'slot' }> | null = null;
  for (const r of sorted) {
    if (!placedNow && new Date(r.startsAt).getTime() > t) {
      items.push({ kind: 'now', key: 'now', time: nowLabel! });
      placedNow = true;
      slot = null; // the next booking repeats its hour under the marker
    }
    const label = slotOf(r.time);
    if (!slot || slot.label !== label) {
      slot = { kind: 'slot', key: `slot-${items.length}-${label}`, label, count: 0, covers: 0 };
      items.push(slot);
    }
    slot.count++;
    slot.covers += r.party;
    items.push({ kind: 'row', key: r.id, r, next: r.id === nextId });
  }
  if (!placedNow && sorted.length) items.push({ kind: 'now', key: 'now', time: nowLabel! });
  return items;
}

/** Option counts shown next to each filter choice (out of the reservations in view). */
export function optionCounts(rows: ShiftReservation[], tables: Map<string, Pick<ShiftTable, 'zoneId'>>) {
  const statuses = new Map<ReservationStatus, number>();
  const sources = new Map<ReservationSource, number>();
  const party = new Map<number, number>();
  const zones = new Map<string, number>();
  const flags = new Map<FlagKey, number>();
  const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const r of rows) {
    bump(statuses, r.status);
    bump(sources, r.source);
    bump(party, partyBucket(r.party));
    for (const z of zonesOf(r, tables)) bump(zones, z);
    for (const f of Object.keys(FLAG_HE) as FlagKey[]) if (hasFlag(r, f)) bump(flags, f);
  }
  return { statuses, sources, party, zones, flags };
}
