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
/** Short source labels for tight spots (the detail facts row); the full label goes in the title. */
export const SOURCE_SHORT_HE: Record<ShiftReservation['source'], string> = {
  online: 'אתר', phone: 'טלפון', walk_in: 'מזדמן', staff: 'צוות', waitlist: 'המתנה',
};

/** Minutes after the booked time at which a confirmed party counts as late. */
export const LATE_AFTER_MINUTES = 10;

export function isLate(r: Pick<ShiftReservation, 'status' | 'startsAt'>, now: Date): boolean {
  return r.status === 'confirmed' && now.getTime() - new Date(r.startsAt).getTime() > LATE_AFTER_MINUTES * 60_000;
}

export const ACTIVE: ReservationStatus[] = ['pending_approval', 'confirmed', 'arrived', 'seated'];
export const isActive = (s: ReservationStatus) => ACTIVE.includes(s);

export type HostAction = 'approve' | 'arrive' | 'seat' | 'complete' | 'assign';

/** Same window as the server (tables_transition 'seat'): seating opens 3 hours before the booking. */
export const canSeatNow = (r: Pick<ShiftReservation, 'startsAt'>, now: Date) => new Date(r.startsAt).getTime() - now.getTime() <= 3 * 3600_000;

/** The single recommended next action for a row (one tap). */
export function nextAction(r: ShiftReservation, now: Date): HostAction | null {
  switch (r.status) {
    case 'pending_approval': return 'approve';
    case 'confirmed':
      if (r.tableIds.length === 0) return 'assign';
      return canSeatNow(r, now) ? 'seat' : null;
    // A party that arrived very early still waits for the seating window (the server refuses earlier).
    case 'arrived': return r.tableIds.length === 0 ? 'assign' : canSeatNow(r, now) ? 'seat' : null;
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

/**
 * A booking without a table needs the host only once it is close: when the party is at the door,
 * or its time is within this many minutes. Later ones stay in "expected" (still marked "no table").
 */
export const ASSIGN_SOON_MINUTES = 60;
export function needsTableNow(r: Pick<ShiftReservation, 'status' | 'tableIds' | 'startsAt'>, now: Date): boolean {
  if (r.tableIds.length > 0) return false;
  if (r.status === 'arrived') return true;
  return r.status === 'confirmed' && new Date(r.startsAt).getTime() - now.getTime() <= ASSIGN_SOON_MINUTES * 60_000;
}

/** List grouping: operational buckets in service order. */
export type Bucket = 'attention' | 'upcoming' | 'arrived' | 'seated' | 'done';
export function bucketOf(r: ShiftReservation, now: Date): Bucket {
  if (r.status === 'pending_approval' || isLate(r, now) || needsTableNow(r, now)) return 'attention';
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

const minutesBetween = (from: number, to: number) => Math.floor((to - from) / 60_000);
/** "1:05" from minutes. */
export const hmText = (minutes: number) => `${Math.floor(Math.abs(minutes) / 60)}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;

/**
 * How long a seated party has been at the table against the planned stay: `soon` in the last
 * 10 minutes, `over` once past it. `freesAt` is when the table is expected to free up.
 */
export interface SeatedProgress { elapsed: number; planned: number; remaining: number; tone: 'ok' | 'soon' | 'over'; freesAt: Date }
export const SOON_TO_FREE_MINUTES = 10;
export function seatedProgress(r: Pick<ShiftReservation, 'status' | 'seatedAt' | 'startsAt' | 'endsAt'>, now: Date): SeatedProgress | null {
  if (r.status !== 'seated' || !r.seatedAt) return null;
  const planned = Math.max(1, minutesBetween(new Date(r.startsAt).getTime(), new Date(r.endsAt).getTime()));
  const seated = new Date(r.seatedAt).getTime();
  const elapsed = Math.max(0, minutesBetween(seated, now.getTime()));
  const remaining = planned - elapsed;
  return { elapsed, planned, remaining, tone: remaining < 0 ? 'over' : remaining <= SOON_TO_FREE_MINUTES ? 'soon' : 'ok', freesAt: new Date(seated + planned * 60_000) };
}

/** Minutes an arrived party has been waiting at the door (null when not waiting). Warn from 5. */
export const DOOR_WAIT_WARN_MINUTES = 5;
export function doorWait(r: Pick<ShiftReservation, 'status' | 'arrivedAt'>, now: Date): number | null {
  if (r.status !== 'arrived' || !r.arrivedAt) return null;
  return Math.max(0, minutesBetween(new Date(r.arrivedAt).getTime(), now.getTime()));
}

/**
 * Waiting time against what the party was told (UX audit A5.1): `near` from 80% of the upper
 * estimate, `over` once past it. Without an estimate there is nothing to compare: `ok`.
 */
export function quoteTone(waited: number, quotedMax: number | null | undefined): 'ok' | 'near' | 'over' {
  if (quotedMax == null || quotedMax <= 0) return 'ok';
  if (waited > quotedMax) return 'over';
  return waited >= quotedMax * 0.8 ? 'near' : 'ok';
}

/** The WhatsApp text a host sends when the table is ready (the host presses send; nothing is automatic). */
export function tableReadyText(guestName: string, venueName: string, table: string | null): string {
  return `שלום ${guestName}, כאן ${venueName}. השולחן שלכם מוכן${table ? ` (שולחן ${table})` : ''} — מחכים לכם בכניסה.`;
}
