/** Reminder messages the staff send from their own WhatsApp (no paid messaging service). */
import { formatDate } from './time';

export interface ReminderInput { guestName: string; time: string; party: number; reference: string; status: string }

/** The first name, for a warmer message ("דנה כהן" → "דנה"). */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

export function reminderText(r: ReminderInput, venue: string, date: string, when: 'today' | 'tomorrow' | 'other'): string {
  const name = firstName(r.guestName);
  const day = when === 'today' ? 'היום' : when === 'tomorrow' ? 'מחר' : '';
  const dateText = formatDate(date, 'he', false);
  const party = r.party === 1 ? 'לסועד אחד' : `ל־${r.party} סועדים`;
  return [
    `${name ? `שלום ${name}, ` : 'שלום, '}תזכורת להזמנה שלך ב${venue}${day ? ` ${day}` : ''}, ${dateText}, בשעה ${r.time} ${party}.`,
    r.status === 'pending_approval' ? 'ההזמנה עדיין ממתינה לאישור שלנו, ונעדכן בהקדם.' : '',
    `קוד הזמנה: ${r.reference}`,
    'אם משהו השתנה, אפשר פשוט להשיב להודעה הזו. נתראה!',
  ].filter(Boolean).join('\n');
}
