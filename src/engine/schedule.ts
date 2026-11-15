/**
 * Appointments by opening hours: which start times a day offers for a given length, and which of
 * them are still free given the appointments already holding a place.
 *
 * A time is free when, at every moment of [start, start + length + buffer), fewer than
 * `capacityPerSlot` appointments overlap (interchangeable staff / chairs / rooms). The same rule runs
 * on the server (private.booking_peak / private.guard_scheduled_booking), which has the last word.
 */
import type { Booking, RunStatus, Schedule, WorkflowRun } from '../domain/schema';
import type { Values } from './conditions';

export const HOLDS_PLACE: RunStatus[] = ['submitted', 'in_review', 'approved', 'completed', 'changes_requested'];

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** A week with the same hours on the given days. */
export function weekHours(days: number[], from: string, to: string): Schedule['days'] {
  return Array.from({ length: 7 }, (_, d) => (days.includes(d) ? [{ from, to }] : []));
}

export const openDays = (s: Schedule) => s.days.map((r, d) => (r.length ? d : -1)).filter((d) => d >= 0);

/** Length of the appointment the customer is asking for, minutes. */
export function appointmentMinutes(s: Schedule, values: Values): number {
  const choice = s.serviceKey ? values[s.serviceKey] : undefined;
  return (typeof choice === 'string' && s.durations?.[choice]) || s.duration;
}

/** Places one booking takes (guests when the business counts guests). */
export function bookingUnits(b: Booking, values: Values): number {
  return b.capacityUnit === 'guests' ? Math.max(1, Number(values[b.guestsKey ?? '']) || 1) : 1;
}

/** Start times (minutes) a weekday offers for an appointment of `minutes`. */
export function startsFor(s: Schedule, weekday: number, minutes: number): number[] {
  const out: number[] = [];
  for (const r of s.days[weekday] ?? []) {
    const from = toMin(r.from);
    const to = toMin(r.to);
    for (let at = from; at + minutes <= to && out.length < 400; at += s.step) out.push(at);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface Busy {
  start: number;
  /** End including the buffer. */
  end: number;
  units: number;
}

/** Most places in use at any moment of [from, to). */
export function peak(busy: Busy[], from: number, to: number): number {
  const points = [from, ...busy.map((b) => b.start).filter((p) => p > from && p < to)];
  let max = 0;
  for (const p of points) {
    const used = busy.reduce((n, b) => (b.start <= p && b.end > p ? n + b.units : n), 0);
    if (used > max) max = used;
  }
  return max;
}

const answerOf = (run: WorkflowRun, key?: string) => (key ? run.answers.find((a) => a.fieldKey === key)?.value : undefined);

/** Appointments on `date` that hold a place, from runs (the demo keeps them in the browser). */
export function busyFromRuns(b: Booking, runs: WorkflowRun[], date: string, excludeRunId?: string): Busy[] {
  const s = b.schedule;
  if (!s || !b.timeKey) return [];
  const buffer = s.buffer ?? 0;
  return runs
    .filter((r) => r.id !== excludeRunId && HOLDS_PLACE.includes(r.status) && answerOf(r, b.dateKey) === date)
    .flatMap((r) => {
      const time = answerOf(r, b.timeKey);
      if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return [];
      const values: Values = Object.fromEntries(r.answers.map((a) => [a.fieldKey, a.value]));
      const start = toMin(time);
      return [{ start, end: start + appointmentMinutes(s, values) + buffer, units: bookingUnits(b, values) }];
    });
}

export interface TimeOption {
  time: string;
  used: number;
  capacity: number;
  state: 'available' | 'limited' | 'full';
}

/** Every start time of the day with its state; times already past (or inside the notice) are left out. */
export function dayTimes(b: Booking, date: string, values: Values, busy: Busy[], now = new Date()): TimeOption[] {
  const s = b.schedule;
  if (!s) return [];
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (Number.isNaN(weekday)) return [];
  const minutes = appointmentMinutes(s, values);
  const units = bookingUnits(b, values);
  const cap = b.capacityPerSlot;
  const earliest = now.getTime() + (b.minNoticeHours ?? 0) * 3600_000;
  return startsFor(s, weekday, minutes)
    .filter((m) => new Date(`${date}T${hhmm(m)}:00`).getTime() >= earliest)
    .map((m) => {
      const used = peak(busy, m, m + minutes + (s.buffer ?? 0));
      const left = cap - used - units;
      return { time: hhmm(m), used, capacity: cap, state: left < 0 ? 'full' : cap > 1 && left === 0 ? 'limited' : 'available' };
    });
}

/** Why a chosen time can't be booked, or null when it can. */
export function timeProblem(b: Booking, date: string, time: string, values: Values, busy: Busy[]): 'outside' | 'full' | null {
  const s = b.schedule;
  if (!s) return null;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const minutes = appointmentMinutes(s, values);
  const start = toMin(time);
  if (!startsFor(s, weekday, minutes).includes(start)) return 'outside';
  return peak(busy, start, start + minutes + (s.buffer ?? 0)) + bookingUnits(b, values) > b.capacityPerSlot ? 'full' : null;
}

/** "45 דק׳", "שעה", "שעה וחצי", "2 שעות". */
export function minutesLabel(m: number): string {
  if (m === 60) return 'שעה';
  if (m === 90) return 'שעה וחצי';
  if (m === 120) return 'שעתיים';
  if (m > 60 && m % 60 === 0) return `${m / 60} שעות`;
  return `${m} דק׳`;
}
