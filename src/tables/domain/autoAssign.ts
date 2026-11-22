/**
 * Auto-assign (UX audit 2026-11, A3.7): one proposal per booking that has no table yet, so the host
 * reviews the whole evening in one sheet instead of assigning each party by hand. The server still
 * decides every move (moveReservation); this only proposes.
 */
import type { Shift, ShiftReservation, ShiftTable } from './types';

const ACTIVE = ['pending_approval', 'confirmed', 'arrived', 'seated'];

/** Tables a reservation could move to: active, big enough, no other active booking overlapping. */
export function candidateTables(shift: Pick<Shift, 'tables' | 'reservations'>, r: ShiftReservation, nowMs = Date.now()): Set<string> {
  const start = new Date(r.status === 'seated' ? nowMs : r.startsAt).getTime();
  const end = new Date(r.endsAt).getTime();
  const busy = new Set<string>();
  for (const o of shift.reservations) {
    if (o.id === r.id || !ACTIVE.includes(o.status)) continue;
    const os = new Date(o.startsAt).getTime();
    const oe = o.status === 'seated' ? Math.max(new Date(o.endsAt).getTime(), nowMs) : new Date(o.endsAt).getTime();
    if (os < end && start < oe) o.tableIds.forEach((t) => busy.add(t));
  }
  return new Set(shift.tables.filter((t) => t.maxCovers >= r.party && t.opState !== 'unavailable' && !busy.has(t.id) && !r.tableIds.includes(t.id)).map((t) => t.id));
}

/** Best fit: a table made for this size (minCovers ≤ party), then the fewest spare seats, then by label. */
export function bestTable(tables: ShiftTable[], party: number): ShiftTable | undefined {
  return tables.filter((t) => t.maxCovers >= party).sort((a, b) =>
    Number(a.minCovers > party) - Number(b.minCovers > party)
    || (a.maxCovers - party) - (b.maxCovers - party)
    || a.label.localeCompare(b.label, 'he', { numeric: true }))[0];
}

export interface Proposal { reservation: ShiftReservation; tableId: string; label: string }

/**
 * Bookings still without a table (confirmed or at the door), earliest first; each takes the best
 * free table, and later proposals respect earlier ones. Bookings with no free table are left out.
 */
export function proposeAssignments(shift: Pick<Shift, 'tables' | 'reservations'>, nowMs = Date.now()): { proposals: Proposal[]; unplaced: ShiftReservation[] } {
  const working = shift.reservations.map((r) => ({ ...r, tableIds: [...r.tableIds] }));
  const todo = working.filter((r) => (r.status === 'confirmed' || r.status === 'arrived') && r.tableIds.length === 0)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const proposals: Proposal[] = [];
  const unplaced: ShiftReservation[] = [];
  for (const w of todo) {
    const fits = candidateTables({ tables: shift.tables, reservations: working }, w, nowMs);
    const table = bestTable(shift.tables.filter((t) => fits.has(t.id)), w.party);
    const original = shift.reservations.find((r) => r.id === w.id)!;
    if (!table) { unplaced.push(original); continue; }
    w.tableIds = [table.id];
    proposals.push({ reservation: original, tableId: table.id, label: table.label });
  }
  return { proposals, unplaced };
}
