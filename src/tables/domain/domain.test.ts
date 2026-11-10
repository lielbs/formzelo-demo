import { describe, expect, it } from 'vitest';
import { percent, summarize, type AnalyticsResult } from './analytics';
import { newDraft, nextLabel, normalizeDraft, problemText, starterLayout, stepOfProblem, totalSeats } from './draft';
import { messageFor, toTablesError } from './errors';
import { displayPhone, normalizePhone, whatsappHref } from './phone';
import { daysText, minutesText, previewApproval, ruleSentence } from './policy';
import { acceptProjection, initialSync, syncReducer } from './revision';
import { bucketOf, counters, deriveTableStates, isLate, nextAction } from './status';
import { addDays, crossesMidnight, currentServiceDate, dateInTz, formatInstant, slotTimes, timeInTz, weekdayOf } from './time';
import type { Shift, ShiftReservation, ShiftTable } from './types';

describe('time model', () => {
  it('builds the same slot grid as the server, including cross-midnight services', () => {
    expect(slotTimes({ start: '18:00', lastSeating: '22:00' }, 30)).toHaveLength(9);
    expect(slotTimes({ start: '22:30', lastSeating: '01:00' }, 30)).toEqual(['22:30', '23:00', '23:30', '00:00', '00:30', '01:00']);
    expect(crossesMidnight({ start: '22:30', lastSeating: '01:00' })).toBe(true);
    expect(crossesMidnight({ start: '12:00', lastSeating: '15:00' })).toBe(false);
  });

  it('uses the venue timezone, not the device', () => {
    const instant = new Date('2027-07-01T21:30:00Z'); // 00:30 next day in Israel (UTC+3)
    expect(dateInTz(instant, 'Asia/Jerusalem')).toBe('2027-07-02');
    expect(timeInTz(instant, 'Asia/Jerusalem')).toBe('00:30');
    expect(timeInTz(instant, 'America/New_York')).toBe('17:30');
  });

  it('keeps early-morning hours on the previous service date while a cross-midnight service runs', () => {
    const services = [{ start: '22:00', lastSeating: '01:00', durationMinutes: 60 }];
    expect(currentServiceDate(new Date('2027-07-01T21:30:00Z'), 'Asia/Jerusalem', services)).toBe('2027-07-01');
    expect(currentServiceDate(new Date('2027-07-02T09:00:00Z'), 'Asia/Jerusalem', services)).toBe('2027-07-02');
  });

  it('handles DST transitions in date arithmetic and formatting', () => {
    expect(addDays('2027-03-25', 1)).toBe('2027-03-26');
    expect(addDays('2027-10-30', 2)).toBe('2027-11-01');
    expect(weekdayOf('2027-03-26')).toBe(5);
    // Israel springs forward 2027-03-26 02:00 → 03:00; 00:30Z is 03:30 local (IDT).
    expect(timeInTz('2027-03-26T00:30:00Z', 'Asia/Jerusalem')).toBe('03:30');
    expect(timeInTz('2027-03-25T23:30:00Z', 'Asia/Jerusalem')).toBe('01:30');
    expect(formatInstant('2027-03-26T12:00:00Z', 'Asia/Jerusalem', 'en')).toContain('15:00');
  });
});

const table = (id: string, extra: Partial<ShiftTable> = {}): ShiftTable => ({
  id, label: id, zoneId: 'z', shape: 'square', minCovers: 1, maxCovers: 4, accessible: false, x: 0, y: 0, w: 60, h: 60, rotation: 0,
  opState: null, opReason: null, ...extra,
});
const res = (extra: Partial<ShiftReservation>): ShiftReservation => ({
  id: 'r', reference: 'ABCDEF', serviceKey: 'dinner', time: '19:00', startsAt: '2027-07-01T16:00:00Z', endsAt: '2027-07-01T18:00:00Z',
  party: 2, status: 'confirmed', source: 'online', approval: 'auto', approvalRule: null, guestName: 'דנה', guestPhone: null, requests: null,
  lockVersion: 0, pendingExpiresAt: null, arrivedAt: null, seatedAt: null, completedAt: null, overrideReason: null, tableIds: ['t1'],
  notesCount: 0, visits: 0, noShows: 0, ...extra,
});

describe('host states', () => {
  const now = new Date('2027-07-01T15:30:00Z');
  it('derives table states with occupied over cleaning and unavailable over everything', () => {
    const shift: Pick<Shift, 'tables' | 'reservations'> = {
      tables: [table('t1'), table('t2', { opState: 'cleaning' }), table('t3', { opState: 'unavailable' }), table('t4')],
      reservations: [res({ id: 'a', tableIds: ['t1'] }), res({ id: 'b', tableIds: ['t2'], status: 'seated' }), res({ id: 'c', tableIds: ['t3'], status: 'seated' })],
    };
    const s = deriveTableStates(shift, now);
    expect(s.get('t1')!.state).toBe('reserved_soon');
    expect(s.get('t2')!.state).toBe('occupied');
    expect(s.get('t3')!.state).toBe('unavailable');
    expect(s.get('t4')!.state).toBe('ready');
  });
  it('late is derived from time, not stored', () => {
    expect(isLate(res({}), new Date('2027-07-01T16:05:00Z'))).toBe(false);
    expect(isLate(res({}), new Date('2027-07-01T16:11:00Z'))).toBe(true);
    expect(isLate(res({ status: 'arrived' }), new Date('2027-07-01T16:30:00Z'))).toBe(false);
  });
  it('recommends exactly one next action', () => {
    expect(nextAction(res({ status: 'pending_approval' }), now)).toBe('approve');
    expect(nextAction(res({ tableIds: [] }), now)).toBe('assign');
    expect(nextAction(res({}), now)).toBe('seat');
    expect(nextAction(res({ status: 'seated' }), now)).toBe('complete');
    expect(nextAction(res({ status: 'completed' }), now)).toBeNull();
  });
  it('counts and buckets the shift', () => {
    const list = [res({ status: 'pending_approval' }), res({ status: 'seated', party: 4 }), res({ tableIds: [] })];
    const c = counters(list, now);
    expect(c).toMatchObject({ pending: 1, seated: 1, covers: 4, unassigned: 1 });
    expect(bucketOf(list[0]!, now)).toBe('attention');
    expect(bucketOf(list[1]!, now)).toBe('seated');
  });
});

describe('realtime revision reducer', () => {
  it('ignores stale or duplicate revisions and refetches on newer ones', () => {
    let s = syncReducer(initialSync(), { type: 'fetchStart' });
    s = syncReducer(s, { type: 'fetched', revision: 5 });
    expect(s.needsFetch).toBe(false);
    s = syncReducer(s, { type: 'revision', revision: 4 });
    expect(s.needsFetch).toBe(false);
    s = syncReducer(s, { type: 'revision', revision: 5 });
    expect(s.needsFetch).toBe(false);
    s = syncReducer(s, { type: 'revision', revision: 7 });
    expect(s.needsFetch).toBe(true);
  });
  it('a gap observed during a fetch triggers another fetch', () => {
    let s = syncReducer(initialSync(3), { type: 'fetchStart' });
    s = syncReducer(s, { type: 'revision', revision: 6 });
    s = syncReducer(s, { type: 'fetched', revision: 4 });
    expect(s.needsFetch).toBe(true);
  });
  it('out-of-order projections never replace newer ones; reconnect refetches', () => {
    const s = syncReducer(initialSync(), { type: 'fetched', revision: 9 });
    expect(acceptProjection(s, 8)).toBe(false);
    expect(acceptProjection(s, 9)).toBe(true);
    expect(syncReducer(s, { type: 'reconnect' }).needsFetch).toBe(true);
  });
});

describe('approval preview mirrors server precedence', () => {
  const rules = [
    { id: 'big', priority: 1, when: { partyAtLeast: 8, weekdays: [5, 6] as (5 | 6)[] }, then: 'require_manual' as const },
    { id: 'evening', priority: 2, when: { fromTime: '18:00' }, then: 'auto' as const },
  ];
  it('require_manual beats auto, date rule beats all, default otherwise', () => {
    expect(previewApproval({ approvalMode: 'conditional', rules }, { party: 8, weekday: 5, time: '19:00' })).toEqual({ manual: true, rule: 'big' });
    expect(previewApproval({ approvalMode: 'conditional', rules }, { party: 8, weekday: 2, time: '19:00' })).toEqual({ manual: false, rule: 'evening' });
    expect(previewApproval({ approvalMode: 'conditional', rules }, { party: 2, weekday: 2, time: '12:00' })).toEqual({ manual: false, rule: 'venue_default' });
    expect(previewApproval({ approvalMode: 'auto', rules }, { party: 2, weekday: 2, time: '12:00', dateRule: true }).manual).toBe(true);
    expect(previewApproval({ approvalMode: 'manual', rules: [] }, { party: 2, weekday: 2, time: '12:00' }).manual).toBe(true);
  });
  it('writes rules as readable Hebrew sentences', () => {
    expect(ruleSentence(rules[0]!)).toBe('קבוצות של 8 סועדים ומעלה בימי שישי, שבת דורשות אישור שלכם.');
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe('בכל יום');
    expect(minutesText(240)).toBe('4 שעות לפני');
    expect(minutesText(1440)).toBe('יום לפני');
  });
});

describe('draft helpers', () => {
  it('starts with a complete, publishable-shaped draft', () => {
    const d = newDraft('ביסטרו');
    expect(d.tables).toHaveLength(10);
    expect(totalSeats(d.tables)).toBe(4 * 2 + 4 * 4 + 2 * 6);
    expect(new Set(d.tables.map((t) => t.label)).size).toBe(10);
    expect(d.tables.every((t) => t.zoneId === d.zones[0]!.id && t.minCovers <= t.maxCovers)).toBe(true);
    expect(d.guest.terms.length).toBeGreaterThan(10);
  });
  it('fills older drafts and picks free labels', () => {
    const d = normalizeDraft({ basics: { name: 'x', timezone: 'Asia/Jerusalem' } }, 'x');
    expect(d.policy.slotMinutes).toBe(30);
    expect(nextLabel([{ label: '1' }, { label: '2' }, { label: '4' }])).toBe('3');
    expect(starterLayout(1, 0, 0).tables[0]!.maxCovers).toBe(2);
  });
  it('explains server problems in plain words and routes them to a step', () => {
    expect(problemText({ code: 'table_label_duplicate', path: 'tables.3' })).toContain('אותו מספר');
    expect(problemText({ code: 'something_new', path: '' })).toBe('משהו בהגדרות לא תקין.');
    expect(stepOfProblem({ code: 'x', path: 'services.0' })).toBe('hours');
    expect(stepOfProblem({ code: 'x', path: 'policy.maxParty' })).toBe('rules');
  });
});

describe('phone and errors', () => {
  it('normalizes like the server', () => {
    expect(normalizePhone('050-123 4567')).toBe('+972501234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('12')).toBeNull();
    expect(displayPhone('+972501234567')).toBe('050-1234567');
    expect(displayPhone('+97235551234')).toBe('03-5551234');
    expect(whatsappHref('+972501234567', 'שלום')).toBe('https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D');
  });
  it('maps server errors without leaking SQL', () => {
    const e = toTablesError({ code: 'P0001', message: 'tables:no_table' });
    expect(e.code).toBe('no_table');
    expect(e.message).toBe(messageFor('no_table'));
    expect(toTablesError({ code: '40001', message: 'tables:stale', details: '{"status":"seated","lockVersion":3}' }).detail).toEqual({ status: 'seated', lockVersion: 3 });
    expect(toTablesError({ message: 'Failed to fetch' }).isNetwork).toBe(true);
    expect(toTablesError({ code: 'XX000', message: 'relation "x" does not exist' }).message).not.toContain('relation');
  });
});

describe('analytics definitions', () => {
  const a: AnalyticsResult = {
    timezone: 'Asia/Jerusalem', from: '2027-07-01', to: '2027-07-02',
    days: [
      { date: '2027-07-01', reservations: 10, coversBooked: 30, coversServed: 20, cancelled: 2, noShows: 1, completed: 7, seatMinutesUsed: 1000, seatMinutesAvailable: 4000 },
      { date: '2027-07-02', reservations: 0, coversBooked: 0, coversServed: 0, cancelled: 0, noShows: 0, completed: 0, seatMinutesUsed: 0, seatMinutesAvailable: 4000 },
    ],
    sources: { online: 6 }, approvals: {}, seated: { avgMinutes: 80, sample: 7 }, waitlist: { closed: 0, seated: 0, abandoned: 0 },
  };
  it('uses the documented denominators and refuses to divide by zero', () => {
    const s = summarize(a);
    expect(percent(s.cancellationRate)).toBe(20);
    expect(percent(s.noShowRate)).toBe(12.5);
    expect(percent(s.seatUtilization)).toBe(12.5);
    expect(s.waitlistConversion.value).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/revenue|₪/);
  });
});
