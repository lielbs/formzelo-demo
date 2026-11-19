import { describe, expect, it } from 'vitest';
import { whatsappHref } from './phone';
import { firstName, reminderText } from './reminders';

describe('guest reminders', () => {
  const r = { guestName: '  דנה  כהן ', time: '19:30', party: 4, reference: 'AB23CD', status: 'confirmed' };

  it('writes a warm reminder with the day, time, party and code', () => {
    const text = reminderText(r, 'זיגל בר', '2026-11-20', 'tomorrow');
    expect(text.split('\n')[0]).toBe('שלום דנה, תזכורת להזמנה שלך בזיגל בר מחר, יום שישי, 20 בנובמבר, בשעה 19:30 ל־4 סועדים.');
    expect(text).toContain('קוד הזמנה: AB23CD');
    expect(text).not.toContain('ממתינה');
  });

  it('handles one guest, a pending booking and a missing name', () => {
    const text = reminderText({ ...r, guestName: ' ', party: 1, status: 'pending_approval' }, 'זיגל בר', '2026-11-19', 'today');
    expect(text.startsWith('שלום, תזכורת להזמנה שלך בזיגל בר היום,')).toBe(true);
    expect(text).toContain('לסועד אחד');
    expect(text).toContain('ממתינה לאישור');
    expect(firstName('Dana Cohen')).toBe('Dana');
  });

  it('travels safely inside a WhatsApp link', () => {
    const href = whatsappHref('+972501234567', reminderText(r, 'בר & מטבח', '2026-11-20', 'tomorrow'));
    const url = new URL(href);
    expect(url.pathname).toBe('/972501234567');
    expect(url.searchParams.get('text')).toContain('בר & מטבח');
  });
});
