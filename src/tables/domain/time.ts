/** Venue-local time helpers. Every display uses the venue's IANA timezone, never the device's. */
import type { ServiceDef } from './types';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (v: string) => TIME_RE.test(v);
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m: number) => {
  const n = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

/** A service crosses midnight when its last seating is earlier than its start. */
export const crossesMidnight = (s: Pick<ServiceDef, 'start' | 'lastSeating'>) => toMinutes(s.lastSeating) < toMinutes(s.start);

/** All seating times of a service (mirrors private.tables_slot_times). */
export function slotTimes(s: Pick<ServiceDef, 'start' | 'lastSeating'>, slotMinutes: number): string[] {
  const start = toMinutes(s.start);
  let end = toMinutes(s.lastSeating);
  if (end < start) end += 1440;
  const out: string[] = [];
  for (let m = start; m <= end; m += slotMinutes) out.push(fromMinutes(m));
  return out;
}

/** Service closes at last seating + duration (local minutes since service-date midnight, may exceed 1440). */
export function serviceEndMinutes(s: Pick<ServiceDef, 'start' | 'lastSeating' | 'durationMinutes'>) {
  let end = toMinutes(s.lastSeating);
  if (end < toMinutes(s.start)) end += 1440;
  return end + s.durationMinutes;
}

/** Calendar date "YYYY-MM-DD" in a timezone. */
export function dateInTz(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** "HH:MM" of an instant in a timezone, 24-hour. */
export function timeInTz(instant: Date | string, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Human date in the venue language, unambiguous (weekday, day, month, year). */
export function formatDate(date: string, lang: 'he' | 'en' = 'he', withYear = true): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Short date for tight places: "שישי, 13.11" / "Fri 13/11". */
export function formatDateShort(date: string, lang: 'he' | 'en' = 'he'): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(y, m - 1, d)));
  return lang === 'he' ? `${wd.replace(/^יום /, '')}, ${d}.${m}` : `${wd} ${d}/${m}`;
}

/** Exact local date and time of an instant, for deadlines ("until Thursday 12 March, 15:00"). */
export function formatInstant(instant: string, tz: string, lang: 'he' | 'en' = 'he'): string {
  return `${formatDate(dateInTz(new Date(instant), tz), lang, false)}, ${timeInTz(instant, tz)}`;
}

/** Minutes between two instants (b - a), rounded down. */
export const minutesBetween = (a: string | Date, b: string | Date) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

/**
 * The service date a host should see now: during a cross-midnight service the early-morning hours
 * still belong to the previous evening's service date.
 */
export function currentServiceDate(now: Date, tz: string, services: Pick<ServiceDef, 'start' | 'lastSeating' | 'durationMinutes'>[]): string {
  const today = dateInTz(now, tz);
  const nowMin = toMinutes(timeInTz(now, tz));
  const yesterdayRunsInto = services.some((s) => crossesMidnight(s) && nowMin < serviceEndMinutes(s) - 1440);
  return yesterdayRunsInto ? addDays(today, -1) : today;
}
