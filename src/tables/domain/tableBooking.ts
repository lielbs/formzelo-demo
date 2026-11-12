/**
 * Booking straight from a table on the floor: is the table free to seat walk-ins now (and for
 * how long), and which of today's times are free on this particular table. The server checks
 * everything again (buffer, pacing, size, conflicts); this only shapes what the host is offered.
 */
import { addDays, dateInTz, timeInTz, toMinutes } from './time';
import type { Shift, ShiftReservation, TableLiveState } from './types';

const HOLDS: ShiftReservation['status'][] = ['pending_approval', 'confirmed', 'arrived', 'seated'];
const MIN = 60_000;

/** Bookings that hold this table, in time order. */
export function tableBookings(shift: Pick<Shift, 'reservations'>, tableId: string): ShiftReservation[] {
  return shift.reservations.filter((r) => r.tableIds.includes(tableId) && HOLDS.includes(r.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * True when [start, end) plus the venue's turnover buffer overlaps none of the table's bookings
 * (each booking also keeps its buffer; a seated party holds the table until it leaves).
 */
export function tableFree(bookings: ShiftReservation[], start: number, end: number, now: number, bufferMinutes = 0): boolean {
  const buffer = bufferMinutes * MIN;
  return bookings.every((r) => {
    const s = new Date(r.startsAt).getTime();
    const e = (r.status === 'seated' ? Math.max(new Date(r.endsAt).getTime(), now + 15 * MIN) : new Date(r.endsAt).getTime()) + buffer;
    return end + buffer <= s || start >= e;
  });
}

export type WalkIn =
  | { ok: true; minutes: number; until: string | null }
  | { ok: false; reason: 'occupied' | 'unavailable' | 'cleaning' | 'too_short'; until: string | null };

/** Seat walk-ins on this table now: for the usual length, or until the next booking arrives. */
export function walkInWindow(shift: Pick<Shift, 'reservations' | 'venue'>, tableId: string, state: TableLiveState | undefined, now: Date, usualMinutes: number, minMinutes = 30, bufferMinutes = 0): WalkIn {
  if (state === 'unavailable') return { ok: false, reason: 'unavailable', until: null };
  if (state === 'occupied') return { ok: false, reason: 'occupied', until: null };
  if (state === 'cleaning') return { ok: false, reason: 'cleaning', until: null };
  const t = now.getTime();
  const bookings = tableBookings(shift, tableId);
  if (bookings.some((r) => r.status === 'seated')) return { ok: false, reason: 'occupied', until: null };
  const next = bookings.find((r) => new Date(r.endsAt).getTime() > t);
  if (!next) return { ok: true, minutes: usualMinutes, until: null };
  const until = timeInTz(next.startsAt, shift.venue.timezone);
  const gap = Math.floor((new Date(next.startsAt).getTime() - t) / MIN) - bufferMinutes;
  if (gap >= usualMinutes) return { ok: true, minutes: usualMinutes, until: null };
  if (gap < minMinutes) return { ok: false, reason: 'too_short', until };
  return { ok: true, minutes: gap, until };
}

/** The instant of a local wall-clock time in a time zone (DST-safe to the minute). */
export function localInstant(date: string, time: string, tz: string): Date {
  const want = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const d = new Date(guess);
    const local = Date.UTC(Number(dateInTz(d, tz).slice(0, 4)), Number(dateInTz(d, tz).slice(5, 7)) - 1, Number(dateInTz(d, tz).slice(8, 10)),
      Number(timeInTz(d, tz).slice(0, 2)), Number(timeInTz(d, tz).slice(3, 5)));
    guess += want - local;
  }
  return new Date(guess);
}

export interface ServiceSlots { key: string; name: string; slots: { time: string; ok: boolean; reason: string | null }[] }
export type TableTimeReason = 'taken' | 'passed' | 'pacing_full' | 'closed' | 'too_far' | 'other';
export interface TableTime { time: string; ok: boolean; reason: TableTimeReason | null }

/**
 * Today's times for this table: a time is offered when the venue accepts a booking then (a
 * "no free table" answer is fine — we are choosing this table) and this table is free for the
 * service's usual length. Times after midnight belong to the evening service that started them.
 */
export function tableTimes(services: ServiceSlots[], shift: Pick<Shift, 'reservations' | 'services' | 'serviceDate' | 'venue'>, tableId: string, now: Date, bufferMinutes = 0): { key: string; name: string; times: TableTime[] }[] {
  const bookings = tableBookings(shift, tableId);
  const t = now.getTime();
  return services.map((svc) => {
    const def = shift.services.find((s) => s.key === svc.key);
    const length = (def?.durationMinutes ?? 90) * MIN;
    const startMin = def ? toMinutes(def.start) : 0;
    return {
      key: svc.key,
      name: svc.name,
      times: svc.slots.map((sl) => {
        const date = toMinutes(sl.time) < startMin ? addDays(shift.serviceDate, 1) : shift.serviceDate;
        const start = localInstant(date, sl.time, shift.venue.timezone).getTime();
        if (start < t - 5 * MIN) return { time: sl.time, ok: false, reason: 'passed' as const };
        if (!sl.ok && sl.reason !== 'no_table') {
          const reason: TableTimeReason = sl.reason === 'pacing_full' ? 'pacing_full' : sl.reason === 'closed' ? 'closed' : sl.reason === 'too_soon' ? 'passed' : sl.reason === 'too_far' ? 'too_far' : 'other';
          return { time: sl.time, ok: false, reason };
        }
        return tableFree(bookings, start, start + length, t, bufferMinutes) ? { time: sl.time, ok: true, reason: null } : { time: sl.time, ok: false, reason: 'taken' as const };
      }),
    };
  });
}

export const TABLE_TIME_HE: Record<TableTimeReason, string> = {
  taken: 'תפוס',
  passed: 'עבר',
  pacing_full: 'מלא בקצב',
  closed: 'סגור',
  too_far: 'רחוק מדי',
  other: 'לא זמין',
};
