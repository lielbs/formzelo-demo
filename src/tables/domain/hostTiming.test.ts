import { describe, expect, it } from 'vitest';
import { bucketOf, doorWait, hmText, needsTableNow, quoteTone, seatedProgress, tableReadyText } from './status';
import type { ShiftReservation } from './types';

const res = (extra: Partial<ShiftReservation>): ShiftReservation => ({
  id: 'r', reference: 'ABCDEF', serviceKey: 'dinner', time: '20:00', startsAt: '2027-07-01T17:00:00Z', endsAt: '2027-07-01T19:00:00Z',
  party: 2, status: 'confirmed', source: 'online', approval: 'auto', approvalRule: null, guestName: 'דנה', guestPhone: null, requests: null,
  lockVersion: 0, pendingExpiresAt: null, arrivedAt: null, seatedAt: null, completedAt: null, overrideReason: null, tableIds: ['t1'],
  notesCount: 0, visits: 0, noShows: 0, ...extra,
});
const t = (hhmm: string) => new Date(`2027-07-01T${hhmm}:00Z`);

describe('seated progress', () => {
  it('counts from seating against the planned stay', () => {
    const r = res({ status: 'seated', seatedAt: '2027-07-01T17:05:00Z' }); // 2 h planned
    expect(seatedProgress(r, t('18:25'))).toMatchObject({ elapsed: 80, planned: 120, remaining: 40, tone: 'ok' });
    expect(seatedProgress(r, t('18:56'))?.tone).toBe('soon');
    expect(seatedProgress(r, t('19:10'))).toMatchObject({ remaining: -5, tone: 'over' });
    expect(seatedProgress(r, t('18:00'))?.freesAt.toISOString()).toBe('2027-07-01T19:05:00.000Z');
  });
  it('is null when not seated', () => {
    expect(seatedProgress(res({}), t('18:00'))).toBeNull();
    expect(seatedProgress(res({ status: 'seated', seatedAt: null }), t('18:00'))).toBeNull();
  });
});

describe('door wait', () => {
  it('counts minutes since arrival for parties not yet seated', () => {
    expect(doorWait(res({ status: 'arrived', arrivedAt: '2027-07-01T17:01:00Z' }), t('17:07'))).toBe(6);
    expect(doorWait(res({ status: 'seated', arrivedAt: '2027-07-01T17:01:00Z' }), t('17:07'))).toBeNull();
  });
});

describe('no table yet', () => {
  it('is urgent only at the door or within the hour', () => {
    const later = res({ tableIds: [], startsAt: '2027-07-01T19:30:00Z' });
    expect(needsTableNow(later, t('17:00'))).toBe(false);
    expect(bucketOf(later, t('17:00'))).toBe('upcoming');
    expect(needsTableNow(later, t('18:45'))).toBe(true);
    expect(bucketOf(later, t('18:45'))).toBe('attention');
    expect(needsTableNow(res({ status: 'arrived', tableIds: [] }), t('15:00'))).toBe(true);
  });
  it('formats minutes as h:mm', () => {
    expect(hmText(80)).toBe('1:20');
    expect(hmText(-5)).toBe('0:05');
  });
});

describe('waitlist against the quote', () => {
  it('turns amber from 80% of the upper estimate and red past it', () => {
    expect(quoteTone(10, 20)).toBe('ok');
    expect(quoteTone(16, 20)).toBe('near');
    expect(quoteTone(21, 20)).toBe('over');
    expect(quoteTone(50, null)).toBe('ok');
  });
  it('writes the table-ready message with the venue and table', () => {
    expect(tableReadyText('ענבל', 'Indigo 8', '530')).toBe('שלום ענבל, כאן Indigo 8. השולחן שלכם מוכן (שולחן 530) — מחכים לכם בכניסה.');
    expect(tableReadyText('ענבל', 'Indigo 8', null)).not.toContain('(שולחן');
  });
});
