import { describe, expect, it } from 'vitest';
import { calendarFile, hoursOn, mapsHref, weekdayOf } from './VenueInfo';

const services = [
  { key: 'lunch', name: 'צהריים', weekdays: [0, 1, 2, 3, 4], start: '12:00', lastSeating: '15:00' },
  { key: 'dinner', name: 'ערב', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', lastSeating: '22:00' },
];

describe('venue info', () => {
  it('weekday of a local date (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-08')).toBe(0);
    expect(weekdayOf('2026-11-14')).toBe(6);
  });

  it('booking hours span the services of the day', () => {
    expect(hoursOn(services, 0)).toBe('12:00–22:00');
    expect(hoursOn(services, 6)).toBe('18:00–22:00');
    expect(hoursOn([], 2)).toBeNull();
    expect(hoursOn(undefined, 2)).toBeNull();
  });

  it('maps link encodes the address', () => {
    expect(mapsHref('הרצל 1, תל אביב')).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('הרצל 1, תל אביב')}`);
  });

  it('calendar entry is a valid single event with escaped text', () => {
    const ics = calendarFile({ title: 'שולחן, בבר; הנמל', startsAt: '2026-11-12T17:30:00.000Z', minutes: 120, location: 'הרצל 1', details: 'קוד הזמנה: AB12CD' });
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    expect(lines).toContain('DTSTART:20261112T173000Z');
    expect(lines).toContain('DTEND:20261112T193000Z');
    expect(lines).toContain('SUMMARY:שולחן\\, בבר\\; הנמל');
    expect(lines).toContain('LOCATION:הרצל 1');
  });
});
