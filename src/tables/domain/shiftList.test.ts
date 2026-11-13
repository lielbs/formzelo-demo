import { describe, expect, it } from 'vitest';
import { filterCount, matchesFilters, matchesQuery, NO_FILTERS, optionCounts, shiftSummary, slotOf, tileCounts, timeline } from './shiftList';
import type { ShiftReservation } from './types';

const res = (extra: Partial<ShiftReservation>): ShiftReservation => ({
  id: 'r', reference: 'ABCDEF', serviceKey: 'dinner', time: '19:00', startsAt: '2027-07-01T16:00:00Z', endsAt: '2027-07-01T18:00:00Z',
  party: 2, status: 'confirmed', source: 'online', approval: 'auto', approvalRule: null, guestName: 'דנה', guestPhone: null, requests: null,
  lockVersion: 0, pendingExpiresAt: null, arrivedAt: null, seatedAt: null, completedAt: null, overrideReason: null, tableIds: ['t1'],
  notesCount: 0, visits: 0, noShows: 0, ...extra,
});
const at = (hhmm: string, extra: Partial<ShiftReservation> = {}) => {
  const [h, m] = hhmm.split(':').map(Number);
  const utc = `2027-07-01T${String(h! - 3).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`; // Asia/Jerusalem summer = UTC+3
  return res({ id: `r-${hhmm}-${extra.guestName ?? ''}`, time: hhmm, startsAt: utc, ...extra });
};
const tables = new Map([['t1', { zoneId: 'in' }], ['t2', { zoneId: 'out' }]]);

describe('shift list', () => {
  const now = new Date('2027-07-01T17:10:00Z'); // 20:10 local

  it('counts tiles with covers; attention wins over upcoming', () => {
    const rows = [
      at('19:00', { status: 'seated', party: 4 }),
      at('19:55', { status: 'confirmed', party: 2 }), // late (15 min)
      at('21:00', { status: 'confirmed', party: 3 }),
      at('21:30', { status: 'pending_approval', party: 8 }),
      at('18:00', { status: 'completed', party: 2 }),
      at('21:15', { status: 'arrived', party: 2, tableIds: [] }),
    ];
    const c = tileCounts(rows, now);
    expect(c.active).toEqual({ count: 5, covers: 19 });
    expect(c.seated).toEqual({ count: 1, covers: 4 });
    expect(c.attention.count).toBe(2 + 1); // pending, late and the arrived party without a table
    expect(c.upcoming.count).toBe(1);
    expect(c.arrived.count).toBe(1);
    expect(c.done.count).toBe(1);
  });

  it('groups by hour, places the now marker and flags the next arrival', () => {
    const items = timeline([at('21:30'), at('19:30', { status: 'seated' }), at('20:45'), at('20:05', { status: 'seated' })], now, '20:10');
    expect(items.map((i) => (i.kind === 'slot' ? `[${i.label}]` : i.kind === 'now' ? 'NOW' : i.r.time + (i.next ? '*' : '')))).toEqual(
      ['[19:00]', '19:30', '[20:00]', '20:05', 'NOW', '[20:00]', '20:45*', '[21:00]', '21:30']);
    const slot = items.find((i) => i.kind === 'slot' && i.label === '21:00');
    expect(slot).toMatchObject({ count: 1, covers: 2 });
  });

  it('puts the marker at the end when everything already started, and omits it on other days', () => {
    const tail = timeline([at('19:00')], now, '20:10');
    expect(tail[tail.length - 1]?.kind).toBe('now');
    expect(timeline([at('19:00')], now, null).some((i) => i.kind === 'now')).toBe(false);
    expect(timeline([at('21:00')], now, null).some((i) => i.kind === 'row' && i.next)).toBe(false);
    expect(timeline([], now, '20:10')).toEqual([]);
  });

  it('keeps cross-midnight bookings after the evening ones', () => {
    const late = res({ id: 'late', time: '00:30', startsAt: '2027-07-01T21:30:00Z' });
    const items = timeline([late, at('23:00')], now, null).filter((i) => i.kind === 'row');
    expect(items.map((i) => (i.kind === 'row' ? i.r.time : ''))).toEqual(['23:00', '00:30']);
    expect(slotOf('00:30')).toBe('00:00');
  });

  it('filters: any value within a dimension, all dimensions together', () => {
    const big = at('20:00', { party: 10, source: 'phone', tableIds: ['t2'], requests: 'כיסא תינוק' });
    const small = at('20:00', { party: 2, source: 'online', tableIds: ['t1'] });
    expect(matchesFilters(big, { ...NO_FILTERS, party: [8] }, tables)).toBe(true);
    expect(matchesFilters(small, { ...NO_FILTERS, party: [8] }, tables)).toBe(false);
    expect(matchesFilters(big, { ...NO_FILTERS, sources: ['phone', 'online'] }, tables)).toBe(true);
    expect(matchesFilters(big, { ...NO_FILTERS, zones: ['out'], flags: ['requests'] }, tables)).toBe(true);
    expect(matchesFilters(small, { ...NO_FILTERS, zones: ['out'] }, tables)).toBe(false);
    expect(matchesFilters(small, { ...NO_FILTERS, flags: ['requests'] }, tables)).toBe(false);
    expect(matchesFilters(at('20:00', { tableIds: [] }), { ...NO_FILTERS, flags: ['no_table'] }, tables)).toBe(true);
    expect(filterCount({ ...NO_FILTERS, party: [2, 8], flags: ['notes'] })).toBe(3);
  });

  it('searches name, code, phone digits and exact table label', () => {
    const r = at('20:00', { guestName: 'Maya Levi', reference: 'KY3273', guestPhone: '+972 50-123-4567', tableIds: ['t1'] });
    const labels = new Map([['t1', '12']]);
    expect(matchesQuery(r, 'maya', labels)).toBe(true);
    expect(matchesQuery(r, 'ky32', labels)).toBe(true);
    expect(matchesQuery(r, '050-123', labels)).toBe(false); // local 0 prefix is not stored
    expect(matchesQuery(r, '123-45', labels)).toBe(true);
    expect(matchesQuery(r, '12', labels)).toBe(true);
    expect(matchesQuery(r, '1', labels)).toBe(false);
    expect(matchesQuery(r, '  ', labels)).toBe(true);
  });

  it('counts options for the filter sheet', () => {
    const c = optionCounts([at('20:00', { party: 9, tableIds: ['t2'] }), at('20:30', { party: 2, notesCount: 1 })], tables);
    expect(c.party.get(8)).toBe(1);
    expect(c.zones.get('out')).toBe(1);
    expect(c.flags.get('notes')).toBe(1);
    expect(c.statuses.get('confirmed')).toBe(2);
  });
});

describe('shift summary', () => {
  const now = new Date('2027-07-01T17:10:00Z'); // 20:10 local
  it('states diners seated, diners expected, late parties and free tables in one unit each', () => {
    const rows = [
      at('19:00', { status: 'seated', party: 4 }),
      at('19:55', { status: 'confirmed', party: 2 }), // late
      at('21:00', { status: 'confirmed', party: 3 }),
      at('21:15', { status: 'arrived', party: 2 }),
      at('21:30', { status: 'pending_approval', party: 5 }),
      at('18:00', { status: 'completed', party: 6 }),
      at('18:30', { status: 'cancelled', party: 6 }),
    ];
    const states = new Map([['a', { state: 'ready' }], ['b', { state: 'occupied' }], ['c', { state: 'reserved_soon' }], ['d', { state: 'unavailable' }], ['e', { state: 'ready' }]]);
    expect(shiftSummary(rows, states, now)).toEqual({ seatedCovers: 4, expectedCovers: 12, late: 1, freeTables: 2, openTables: 4 });
  });
});
