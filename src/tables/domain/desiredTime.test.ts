import { describe, expect, it } from 'vitest';
import { desiredTimes, nearestSlots, type OpenSlot } from './desiredTime';

const services = [
  { key: 'lunch', name: 'צהריים', weekdays: [0, 1, 2, 3, 4], start: '12:00', lastSeating: '14:00' },
  { key: 'dinner', name: 'ערב', weekdays: [], start: '18:00', lastSeating: '22:00' },
];
const slot = (time: string, serviceKey = 'dinner'): OpenSlot => ({ serviceKey, time, approval: 'instant' });

describe('desired time', () => {
  it('lists every half hour of the services open that weekday, plus extra free slots', () => {
    const sunday = desiredTimes(services, 0, [slot('18:15')]).map((t) => t.time);
    expect(sunday).toEqual(['12:00', '12:30', '13:00', '13:30', '14:00', '18:00', '18:15', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']);
    const friday = desiredTimes(services, 5, []).map((t) => t.time);
    expect(friday[0]).toBe('18:00');
  });

  it('keeps a late service in order past midnight', () => {
    const late = [{ key: 'late', name: 'לילה', weekdays: [], start: '23:00', lastSeating: '00:30' }];
    expect(desiredTimes(late, 3, []).map((t) => t.time)).toEqual(['23:00', '23:30', '00:00', '00:30']);
  });

  it('finds the exact time and the nearest free ones, closest first, shown in time order', () => {
    const open = ['18:00', '18:30', '20:30', '21:00', '22:00'].map((t) => slot(t));
    const r = nearestSlots(open, '20:00');
    expect(r.exact).toBeNull();
    expect(r.near.map((s) => s.time)).toEqual(['18:00', '18:30', '20:30', '21:00']); // 22:00 and 18:00 tie at 2 h: the earlier wins
    expect(nearestSlots(open, '18:30').exact?.time).toBe('18:30');
  });

  it('returns nothing near when the day is full around the time', () => {
    expect(nearestSlots([slot('12:00', 'lunch')], '21:00').near).toEqual([]);
  });
});
