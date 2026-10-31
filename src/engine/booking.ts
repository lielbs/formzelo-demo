/**
 * Booking requests. A submitted booking is a REQUEST until the business
 * approves it; only then is it a confirmed booking.
 *
 * Availability here is computed from requests stored in THIS browser. It is a
 * demo aid, not a guarantee: it cannot prevent two devices from requesting the
 * same slot. Production would enforce capacity transactionally behind the
 * AvailabilityProvider seam below (e.g. a Postgres exclusion constraint or a
 * calendar provider), never in the client.
 */
import type { Booking, RunStatus, WorkflowConfig, WorkflowRun } from '../domain/schema';
import type { Values } from './conditions';
import type { FieldErrors } from './validation';

export const WEEKDAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

/** Statuses that hold capacity. Rejected / cancelled requests free the slot. */
export const HOLDS_CAPACITY: RunStatus[] = ['submitted', 'in_review', 'approved', 'completed', 'changes_requested'];

export type SlotState = 'available' | 'limited' | 'full';

export interface SlotAvailability {
  time: string;
  used: number;
  capacity: number;
  state: SlotState;
}

export interface AvailabilityProvider {
  /** Remaining capacity per slot for a date. Production: server-side, transactional. */
  slotsFor(date: string): Promise<SlotAvailability[]>;
  /** Production only: atomically hold a slot; the demo never claims to do this. */
  hold?(date: string, time: string, units: number): Promise<{ held: boolean }>;
}

const answerOf = (run: WorkflowRun, key?: string) => (key ? run.answers.find((a) => a.fieldKey === key)?.value : undefined);

export function weekdayOf(isoDate: string): number | null {
  const d = new Date(`${isoDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

/** Capacity used per slot on a date, from local runs of the same workflow. */
export function slotAvailability(booking: Booking, date: string, runs: WorkflowRun[], excludeRunId?: string): SlotAvailability[] {
  const relevant = runs.filter((r) => r.id !== excludeRunId && HOLDS_CAPACITY.includes(r.status) && answerOf(r, booking.dateKey) === date);
  return booking.slots.map((time) => {
    const inSlot = booking.timeKey ? relevant.filter((r) => answerOf(r, booking.timeKey) === time) : relevant;
    const used = inSlot.reduce((n, r) => n + (booking.capacityUnit === 'guests' ? Math.max(1, Number(answerOf(r, booking.guestsKey)) || 1) : 1), 0);
    const left = booking.capacityPerSlot - used;
    return { time, used, capacity: booking.capacityPerSlot, state: left <= 0 ? 'full' : left <= Math.ceil(booking.capacityPerSlot * 0.25) ? 'limited' : 'available' };
  });
}

/** Booking-specific validation on top of field validation. */
export function validateBooking(config: WorkflowConfig, values: Values, runs: WorkflowRun[], excludeRunId?: string): FieldErrors {
  const b = config.booking;
  if (!b?.enabled) return {};
  const errors: FieldErrors = {};
  const date = values[b.dateKey];
  if (typeof date !== 'string' || !date) return errors; // required-ness is handled by field validation
  const wd = weekdayOf(date);
  if (wd === null || !b.openWeekdays.includes(wd)) {
    errors[b.dateKey] = `אין קבלת הזמנות ביום ${wd === null ? 'זה' : WEEKDAY_LABELS[wd]}. ימי פעילות: ${b.openWeekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
    return errors;
  }
  if (b.timeKey) {
    const time = values[b.timeKey];
    if (typeof time === 'string' && time) {
      if (b.slots.length && !b.slots.includes(time)) errors[b.timeKey] = 'השעה שנבחרה אינה זמינה להזמנה';
      else {
        const slot = slotAvailability(b, date, runs, excludeRunId).find((s) => s.time === time);
        const units = b.capacityUnit === 'guests' ? Math.max(1, Number(values[b.guestsKey ?? '']) || 1) : 1;
        if (slot && slot.used + units > slot.capacity) errors[b.timeKey] = 'המועד מלא לפי הבקשות שנשמרו בדפדפן זה. בחרו שעה אחרת.';
      }
    }
  }
  return errors;
}

export type BookingStage = 'requested' | 'pending' | 'changes' | 'confirmed' | 'rejected' | 'cancelled';

/** Lifecycle of a booking run. It stays a request until the business approves it. */
export function bookingState(status: RunStatus): { stage: BookingStage; label: string; confirmed: boolean } {
  switch (status) {
    case 'approved':
    case 'completed':
      return { stage: 'confirmed', label: 'הזמנה מאושרת', confirmed: true };
    case 'rejected':
      return { stage: 'rejected', label: 'בקשת ההזמנה נדחתה', confirmed: false };
    case 'cancelled':
      return { stage: 'cancelled', label: 'ההזמנה בוטלה', confirmed: false };
    case 'in_review':
      return { stage: 'pending', label: 'ממתינה לאישור העסק', confirmed: false };
    case 'changes_requested':
      return { stage: 'changes', label: 'העסק ביקש לעדכן את הבקשה', confirmed: false };
    default:
      return { stage: 'requested', label: 'בקשת הזמנה — טרם אושרה', confirmed: false };
  }
}

/** Ordered stages for the customer-facing progress strip. */
export const BOOKING_STAGES: { stage: BookingStage; label: string }[] = [
  { stage: 'requested', label: 'נשלחה' },
  { stage: 'pending', label: 'בבדיקה' },
  { stage: 'confirmed', label: 'מאושרת' },
];

/** Statuses from which the customer may withdraw a booking request. */
export const CUSTOMER_CANCELLABLE: RunStatus[] = ['submitted', 'in_review', 'changes_requested', 'approved'];

/** Demo implementation over local runs; makes no cross-device promise. */
export class LocalAvailabilityProvider implements AvailabilityProvider {
  constructor(
    private readonly booking: Booking,
    private readonly loadRuns: () => Promise<WorkflowRun[]>,
  ) {}
  async slotsFor(date: string) {
    return slotAvailability(this.booking, date, await this.loadRuns());
  }
}
