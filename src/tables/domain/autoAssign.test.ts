import { describe, expect, it } from 'vitest';
import { bestTable, candidateTables, proposeAssignments } from './autoAssign';
import type { ShiftReservation, ShiftTable } from './types';

const table = (label: string, min: number, max: number, extra: Partial<ShiftTable> = {}): ShiftTable => ({
  id: `t${label}`, label, zoneId: 'z', shape: 'square', minCovers: min, maxCovers: max, accessible: false, x: 0, y: 0, w: 60, h: 60, rotation: 0, opState: null, opReason: null, ...extra,
});
const res = (id: string, party: number, from: string, to: string, extra: Partial<ShiftReservation> = {}): ShiftReservation => ({
  id, reference: id, serviceKey: 'night', time: from.slice(11, 16), startsAt: from, endsAt: to, party, status: 'confirmed', source: 'online', approval: 'auto',
  approvalRule: null, guestName: id, guestPhone: null, requests: null, lockVersion: 1, pendingExpiresAt: null, arrivedAt: null, seatedAt: null, completedAt: null,
  overrideReason: null, tableIds: [], notesCount: 0, visits: 0, noShows: 0, ...extra,
});
const NOW = Date.parse('2027-07-01T17:00:00Z');

describe('auto-assign', () => {
  const tables = [table('1', 1, 2), table('2', 2, 4), table('3', 4, 6), table('4', 2, 4, { opState: 'unavailable' })];

  it('picks the snug table for the party size', () => {
    expect(bestTable(tables.slice(0, 3), 2)?.label).toBe('1');
    expect(bestTable(tables.slice(0, 3), 3)?.label).toBe('2');
    expect(bestTable(tables.slice(1, 3), 2)?.label).toBe('2'); // 4-seater made for 2+ before a 6-seater for 4+
  });

  it('never proposes a table that is taken, out of service, or proposed for an overlapping party', () => {
    const shift = { tables, reservations: [
      res('seated', 2, '2027-07-01T16:30:00Z', '2027-07-01T19:00:00Z', { status: 'seated', tableIds: ['t2'], seatedAt: '2027-07-01T16:30:00Z' }),
      res('a', 3, '2027-07-01T18:00:00Z', '2027-07-01T20:00:00Z'),
      res('b', 3, '2027-07-01T18:30:00Z', '2027-07-01T20:30:00Z'),
      res('c', 8, '2027-07-01T18:30:00Z', '2027-07-01T20:30:00Z'),
    ] };
    const { proposals, unplaced } = proposeAssignments(shift, NOW);
    expect(proposals.map((p) => `${p.reservation.id}→${p.label}`)).toEqual(['a→3']);
    expect(unplaced.map((r) => r.id)).toEqual(['b', 'c']); // table 2 busy, 3 proposed to a, 4 unavailable, nothing for 8
  });

  it('reuses a table once the earlier party is gone', () => {
    const shift = { tables: [table('1', 1, 2)], reservations: [
      res('early', 2, '2027-07-01T17:00:00Z', '2027-07-01T18:00:00Z'),
      res('late', 2, '2027-07-01T18:00:00Z', '2027-07-01T19:00:00Z'),
    ] };
    expect(proposeAssignments(shift, NOW).proposals.map((p) => p.reservation.id)).toEqual(['early', 'late']);
  });

  it('candidate tables exclude the current table and too-small ones', () => {
    const r = res('x', 4, '2027-07-01T18:00:00Z', '2027-07-01T20:00:00Z', { tableIds: ['t3'] });
    expect([...candidateTables({ tables, reservations: [r] }, r, NOW)]).toEqual(['t2']);
  });
});
