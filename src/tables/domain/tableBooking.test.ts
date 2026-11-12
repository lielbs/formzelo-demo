import { describe, expect, it } from 'vitest';
import { localInstant, tableTimes, walkInWindow } from './tableBooking';
import type { Shift, ShiftReservation } from './types';

const res = (extra: Partial<ShiftReservation>): ShiftReservation => ({
  id: 'r', reference: 'ABCDEF', serviceKey: 'dinner', time: '19:00', startsAt: '2027-07-01T16:00:00Z', endsAt: '2027-07-01T18:00:00Z',
  party: 2, status: 'confirmed', source: 'online', approval: 'auto', approvalRule: null, guestName: 'דנה', guestPhone: null, requests: null,
  lockVersion: 0, pendingExpiresAt: null, arrivedAt: null, seatedAt: null, completedAt: null, overrideReason: null, tableIds: ['t1'],
  notesCount: 0, visits: 0, noShows: 0, ...extra,
});
// Asia/Jerusalem in July is UTC+3.
const shift = (reservations: ShiftReservation[]) => ({
  venue: { id: 'v', name: 'v', slug: 'v', timezone: 'Asia/Jerusalem', status: 'published' },
  serviceDate: '2027-07-01',
  services: [{ key: 'dinner', name: 'ערב', start: '18:00', lastSeating: '00:30', durationMinutes: 120, weekdays: [0, 1, 2, 3, 4, 5, 6] }],
  reservations,
}) as unknown as Shift;

describe('booking from a table', () => {
  it('converts local wall-clock times to instants, across midnight too', () => {
    expect(localInstant('2027-07-01', '19:00', 'Asia/Jerusalem').toISOString()).toBe('2027-07-01T16:00:00.000Z');
    expect(localInstant('2027-07-02', '00:30', 'Asia/Jerusalem').toISOString()).toBe('2027-07-01T21:30:00.000Z');
    expect(localInstant('2027-01-15', '19:00', 'Asia/Jerusalem').toISOString()).toBe('2027-01-15T17:00:00.000Z');
  });

  it('seats walk-ins for the usual length, or only until the next booking', () => {
    const now = new Date('2027-07-01T15:00:00Z'); // 18:00 local
    expect(walkInWindow(shift([]), 't1', 'ready', now, 90)).toEqual({ ok: true, minutes: 90, until: null });
    // Next booking at 19:00 local → one hour free.
    expect(walkInWindow(shift([res({})]), 't1', 'reserved_soon', now, 90)).toEqual({ ok: true, minutes: 60, until: '19:00' });
    // Next booking in 20 minutes → too short.
    expect(walkInWindow(shift([res({ startsAt: '2027-07-01T15:20:00Z', endsAt: '2027-07-01T17:20:00Z' })]), 't1', 'reserved_soon', now, 90))
      .toMatchObject({ ok: false, reason: 'too_short' });
    expect(walkInWindow(shift([res({ status: 'seated', startsAt: '2027-07-01T14:30:00Z' })]), 't1', 'occupied', now, 90)).toMatchObject({ ok: false, reason: 'occupied' });
    expect(walkInWindow(shift([]), 't1', 'cleaning', now, 90)).toMatchObject({ ok: false, reason: 'cleaning' });
    expect(walkInWindow(shift([]), 't1', 'unavailable', now, 90)).toMatchObject({ ok: false, reason: 'unavailable' });
    // Cancelled bookings and other tables do not count.
    expect(walkInWindow(shift([res({ status: 'cancelled' }), res({ tableIds: ['t2'] })]), 't1', 'ready', now, 90)).toEqual({ ok: true, minutes: 90, until: null });
  });

  it('offers the times when this table is free for the full length', () => {
    const now = new Date('2027-07-01T14:00:00Z'); // 17:00 local
    const svc = [{ key: 'dinner', name: 'ערב', slots: [
      { time: '18:00', ok: true, reason: null },
      { time: '18:30', ok: false, reason: 'no_table' },
      { time: '19:00', ok: true, reason: null },
      { time: '20:00', ok: false, reason: 'pacing_full' },
      { time: '21:00', ok: true, reason: null },
      { time: '00:30', ok: true, reason: null },
    ] }];
    // Booked 19:00–21:00 on this table.
    const [dinner] = tableTimes(svc, shift([res({})]), 't1', now);
    expect(dinner!.times.map((x) => `${x.time}:${x.ok ? 'ok' : x.reason}`)).toEqual([
      '18:00:taken', // 18:00–20:00 overlaps 19:00
      '18:30:taken',
      '19:00:taken',
      '20:00:pacing_full',
      '21:00:ok', // ends exactly when the earlier booking ends
      '00:30:ok', // after midnight, on the next calendar day
    ]);
  });

  it('marks times that already passed', () => {
    const now = new Date('2027-07-01T16:30:00Z'); // 19:30 local
    const [dinner] = tableTimes([{ key: 'dinner', name: 'ערב', slots: [{ time: '19:00', ok: true, reason: null }, { time: '20:00', ok: true, reason: null }] }], shift([]), 't1', now);
    expect(dinner!.times.map((x) => x.reason)).toEqual(['passed', null]);
  });
});

describe('turnover buffer', () => {
  it('keeps the buffer free after each booking on the table', () => {
    const now = new Date('2027-07-01T14:00:00Z'); // 17:00 local
    const svc = [{ key: 'dinner', name: 'ערב', slots: [{ time: '17:00', ok: true, reason: null }, { time: '21:00', ok: true, reason: null }, { time: '21:15', ok: true, reason: null }] }];
    // Booked 19:00–21:00 local; 2-hour stays; 10-minute buffer.
    const reservations = [res({})];
    const [dinner] = tableTimes(svc, { ...shift(reservations), services: [{ ...shift([]).services[0]!, start: '17:00' }] } as Shift, 't1', now, 10);
    expect(dinner!.times.map((x) => `${x.time}:${x.ok ? 'ok' : x.reason}`)).toEqual(['17:00:taken', '21:00:taken', '21:15:ok']);
    expect(walkInWindow(shift(reservations), 't1', 'ready', new Date('2027-07-01T15:00:00Z'), 90, 30, 10)).toEqual({ ok: true, minutes: 50, until: '19:00' });
  });
});

describe('stay length wording', () => {
  it('reads naturally in Hebrew', async () => {
    const { minutesText } = await import('../host/TableBook');
    expect(minutesText(90)).toBe('שעה וחצי');
    expect(minutesText(120)).toBe('שעתיים');
    expect(minutesText(45)).toBe('45 דקות');
    expect(minutesText(100)).toBe('שעה ו-40 דקות');
    expect(minutesText(240)).toBe('4 שעות');
  });
});
