/** Reservation / table state labels, derived states and the host's next action. */
import type { ReservationStatus, Shift, ShiftReservation, TableLiveState } from './types';

export const STATUS_HE: Record<ReservationStatus, string> = {
  pending_approval: 'ממתין לאישור',
  confirmed: 'הוזמן',
  arrived: 'הגיעו',
  seated: 'הושבו',
  completed: 'הסתיים',
  cancelled: 'בוטל',
  rejected: 'נדחה',
  no_show: 'לא הגיעו',
  expired: 'פג תוקף',
};
export const STATUS_EN: Record<ReservationStatus, string> = {
  pending_approval: 'Pending approval',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  seated: 'Seated',
  completed: 'Finished',
  cancelled: 'Cancelled',
  rejected: 'Declined',
  no_show: 'No-show',
  expired: 'Expired',
};
export const LATE_HE = 'מאחרים';

export const TABLE_STATE_HE: Record<TableLiveState, string> = {
  ready: 'מוכן',
  reserved_soon: 'שמור בקרוב',
  occupied: 'תפוס',
  cleaning: 'בניקוי',
  unavailable: 'לא זמין',
};

export const SOURCE_HE: Record<ShiftReservation['source'], string> = {
  online: 'הזמנה באתר',
  phone: 'טלפון',
  walk_in: 'מזדמן',
  staff: 'צוות',
  waitlist: 'רשימת המתנה',
};

/** Minutes after the booked time at which a confirmed party counts as late. */
export const LATE_AFTER_MINUTES = 10;

export function isLate(r: Pick<ShiftReservation, 'status' | 'startsAt'>, now: Date): boolean {
  return r.status === 'confirmed' && now.getTime() - new Date(r.startsAt).getTime() > LATE_AFTER_MINUTES * 60_000;
}

export const ACTIVE: ReservationStatus[] = ['pending_approval', 'confirmed', 'arrived', 'seated'];
export const isActive = (s: ReservationStatus) => ACTIVE.includes(s);

export type HostAction = 'approve' | 'arrive' | 'seat' | 'complete' | 'assign';

/** The single recommended next action for a row (one tap). */
export function nextAction(r: ShiftReservation, now: Date): HostAction | null {
  switch (r.status) {
    case 'pending_approval': return 'approve';
    case 'confirmed':
      if (r.tableIds.length === 0) return 'assign';
      return new Date(r.startsAt).getTime() - now.getTime() <= 3 * 3600_000 ? 'seat' : null;
    case 'arrived': return r.tableIds.length === 0 ? 'assign' : 'seat';
    case 'seated': return 'complete';
    default: return null;
  }
}

export const ACTION_HE: Record<HostAction, string> = {
  approve: 'אישור',
  arrive: 'הגיעו',
  seat: 'הושבה',
  complete: 'סיום',
  assign: 'שיבוץ שולחן',
};

/** Live state of every table at `now`, derived from allocations plus explicit operational state. */
export function deriveTableStates(shift: Pick<Shift, 'tables' | 'reservations'>, now: Date, soonMinutes = 60) {
  const map = new Map<string, { state: TableLiveState; current?: ShiftReservation; next?: ShiftReservation }>();
  const t = now.getTime();
  for (const table of shift.tables) {
    const mine = shift.reservations.filter((r) => r.tableIds.includes(table.id));
    const current = mine.find((r) => r.status === 'seated');
    const upcoming = mine
      .filter((r) => (r.status === 'confirmed' || r.status === 'arrived' || r.status === 'pending_approval') && new Date(r.endsAt).getTime() > t)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const next = upcoming[0];
    let state: TableLiveState = 'ready';
    if (table.opState === 'unavailable') state = 'unavailable';
    else if (current) state = 'occupied';
    else if (table.opState === 'cleaning') state = 'cleaning';
    else if (next && new Date(next.startsAt).getTime() - t <= soonMinutes * 60_000) state = 'reserved_soon';
    map.set(table.id, { state, current, next });
  }
  return map;
}

export interface Counters { upcoming: number; pending: number; arrived: number; seated: number; late: number; completed: number; covers: number; unassigned: number }

export function counters(reservations: ShiftReservation[], now: Date): Counters {
  const c: Counters = { upcoming: 0, pending: 0, arrived: 0, seated: 0, late: 0, completed: 0, covers: 0, unassigned: 0 };
  for (const r of reservations) {
    if (r.status === 'confirmed') c.upcoming++;
    if (r.status === 'pending_approval') c.pending++;
    if (r.status === 'arrived') c.arrived++;
    if (r.status === 'seated') { c.seated++; c.covers += r.party; }
    if (r.status === 'completed') c.completed++;
    if (isLate(r, now)) c.late++;
    if ((r.status === 'confirmed' || r.status === 'arrived') && r.tableIds.length === 0) c.unassigned++;
  }
  return c;
}

/** List grouping: operational buckets in service order. */
export type Bucket = 'attention' | 'upcoming' | 'arrived' | 'seated' | 'done';
export function bucketOf(r: ShiftReservation, now: Date): Bucket {
  if (r.status === 'pending_approval' || isLate(r, now) || ((r.status === 'confirmed' || r.status === 'arrived') && r.tableIds.length === 0)) return 'attention';
  if (r.status === 'confirmed') return 'upcoming';
  if (r.status === 'arrived') return 'arrived';
  if (r.status === 'seated') return 'seated';
  return 'done';
}
export const BUCKET_HE: Record<Bucket, string> = {
  attention: 'דורש טיפול',
  upcoming: 'צפויים להגיע',
  arrived: 'הגיעו וממתינים',
  seated: 'יושבים',
  done: 'הסתיימו / בוטלו',
};
