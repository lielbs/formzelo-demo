/**
 * Guest booking by desired time: the guest says when they want to come, then sees whether that
 * time is free and the nearest free times around it. Pure functions; availability always comes
 * from the server (tables_public_availability), never decided here.
 */

export interface ServiceHours { key: string; name: string; weekdays: number[]; start: string; lastSeating: string }
export interface OpenSlot { serviceKey: string; time: string; approval: 'instant' | 'request' }

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h! * 60 + m!; };
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Minutes from the service day start; a time after midnight in a late service counts as later. */
function dayMinutes(time: string, serviceStart: string): number {
  const m = toMin(time);
  return m < toMin(serviceStart) - 6 * 60 ? m + 24 * 60 : m;
}

/**
 * Every time a guest may ask for on this weekday: each service from its start to its last seating,
 * every `step` minutes, plus any free slot the server returned (so a 15-minute venue keeps its slots).
 */
/**
 * `notBefore` (HH:MM, today only): times the guest can no longer ask for — the current time plus
 * the booking lead — are left out. Free slots the server returned are always kept.
 */
export function desiredTimes(services: ServiceHours[], weekday: number, open: OpenSlot[], step = 30, notBefore?: string): { serviceKey: string; time: string }[] {
  const out = new Map<string, { serviceKey: string; time: string; order: number }>();
  for (const sv of services) {
    if (sv.weekdays.length && !sv.weekdays.includes(weekday)) continue;
    const start = toMin(sv.start);
    let last = toMin(sv.lastSeating);
    if (last < start) last += 24 * 60;
    const earliest = notBefore ? toMin(notBefore) : -1; // calendar minutes: times after midnight (m >= 1440) are always ahead
    for (let m = start; m <= last; m += step) if (m >= earliest) out.set(toTime(m), { serviceKey: sv.key, time: toTime(m), order: m });
  }
  for (const s of open) {
    if (out.has(s.time)) continue;
    const sv = services.find((x) => x.key === s.serviceKey);
    out.set(s.time, { serviceKey: s.serviceKey, time: s.time, order: dayMinutes(s.time, sv?.start ?? '00:00') });
  }
  return [...out.values()].sort((a, b) => a.order - b.order).map(({ serviceKey, time }) => ({ serviceKey, time }));
}

/**
 * The free slot at the desired time (if any) and the nearest other free slots, closest first
 * (ties: the earlier one), within `windowMinutes` either side.
 */
export function nearestSlots(open: OpenSlot[], desired: string, limit = 4, windowMinutes = 150): { exact: OpenSlot | null; near: OpenSlot[] } {
  const exact = open.find((s) => s.time === desired) ?? null;
  const d = toMin(desired);
  const dist = (t: string) => { const raw = Math.abs(toMin(t) - d); return Math.min(raw, 24 * 60 - raw); };
  const near = open
    .filter((s) => s.time !== desired && dist(s.time) <= windowMinutes)
    .sort((a, b) => dist(a.time) - dist(b.time) || toMin(a.time) - toMin(b.time))
    .slice(0, limit)
    .sort((a, b) => toMin(a.time) - toMin(b.time));
  return { exact, near };
}
