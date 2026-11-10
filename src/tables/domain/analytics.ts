/** Analytics definitions (grain: venue service date, venue timezone). No revenue, ever. */

export interface AnalyticsDay {
  date: string;
  reservations: number;
  coversBooked: number;
  coversServed: number;
  cancelled: number;
  noShows: number;
  completed: number;
  seatMinutesUsed: number;
  seatMinutesAvailable: number;
}
export interface AnalyticsResult {
  timezone: string;
  from: string;
  to: string;
  days: AnalyticsDay[];
  sources: Record<string, number>;
  approvals: Record<string, number>;
  seated: { avgMinutes: number | null; sample: number };
  waitlist: { closed: number; seated: number; abandoned: number };
}

/** A rate with its denominator; null when the denominator is zero (shown as "not enough data"). */
export interface Rate { value: number | null; numerator: number; denominator: number }
const rate = (n: number, d: number): Rate => ({ value: d > 0 ? n / d : null, numerator: n, denominator: d });

export function summarize(a: AnalyticsResult) {
  const sum = (k: keyof AnalyticsDay) => a.days.reduce((s, d) => s + (d[k] as number), 0);
  const reservations = sum('reservations');
  return {
    reservations,
    coversBooked: sum('coversBooked'),
    coversServed: sum('coversServed'),
    cancellationRate: rate(sum('cancelled'), reservations),
    noShowRate: rate(sum('noShows'), sum('completed') + sum('noShows')),
    seatUtilization: rate(sum('seatMinutesUsed'), sum('seatMinutesAvailable')),
    waitlistConversion: rate(a.waitlist.seated, a.waitlist.closed),
    avgSeated: a.seated,
  };
}

export const DEFINITIONS_HE = {
  reservations: 'הזמנות לתאריכי השירות בטווח, בלי בקשות שנדחו או שפג תוקפן.',
  coversServed: 'סך הסועדים בהזמנות שהושבו בפועל (יושבים או שסיימו).',
  cancellationRate: 'הזמנות שבוטלו ÷ כל ההזמנות בטווח.',
  noShowRate: 'הזמנות שסומנו "לא הגיעו" ÷ (ביקורים שהסתיימו + "לא הגיעו").',
  seatUtilization: 'דקות-כיסא שבהן ישבו אורחים ÷ דקות-כיסא זמינות (מקומות בשולחנות × שעות פתיחה של המשמרות).',
  waitlistConversion: 'ממתינים שהושבו ÷ כל הממתינים שהטיפול בהם הסתיים.',
  avgSeated: 'ממוצע הזמן מההושבה ועד הסיום, רק בביקורים שהסתיימו.',
} as const;

export const percent = (r: Rate) => (r.value == null ? null : Math.round(r.value * 1000) / 10);
