const currencyFmt = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});
const currencyFmtPrecise = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});
const numberFmt = new Intl.NumberFormat('he-IL');
const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });

export const formatCurrency = (n: number) =>
  Number.isInteger(n) ? currencyFmt.format(n) : currencyFmtPrecise.format(n);
export const formatNumber = (n: number) => numberFmt.format(n);

function toDate(value: string | Date): Date | null {
  // Plain YYYY-MM-DD strings are calendar dates: parse as local, not UTC.
  const d =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDate = (v: string | Date) => {
  const d = toDate(v);
  return d ? dateFmt.format(d) : '';
};
export const formatShortDate = (v: string | Date) => {
  const d = toDate(v);
  return d ? shortDateFmt.format(d) : '';
};
export const formatDateTime = (v: string | Date) => {
  const d = toDate(v);
  return d ? dateTimeFmt.format(d) : '';
};

export function formatRelative(v: string | Date, now = new Date()): string {
  const d = toDate(v);
  if (!d) return '';
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'עכשיו';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(d);
}

/** YYYY-MM-DD in local time, offset by N days. */
export function isoDay(offsetDays = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
