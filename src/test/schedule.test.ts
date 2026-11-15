import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { ValidationFailedError } from '../data/repository';
import { DEMO_ORG_IDS } from '../data/seed';
import { WorkflowConfigSchema, type Booking } from '../domain/schema';
import { validateBooking, weekdayOf, withSchedule } from '../engine/booking';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { logicIssues } from '../engine/logic';
import { readAppointment } from '../engine/rules';
import { appointmentMinutes, dayTimes, peak, startsFor, timeProblem, weekHours, type Busy } from '../engine/schedule';
import { TEMPLATES } from '../engine/templates';
import { isoDay } from '../lib/format';

class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  key = (i: number) => [...this.m.keys()][i] ?? null;
  get length() {
    return this.m.size;
  }
}

/** Next date (from `from` days ahead) whose weekday is in `days`. */
function nextDay(days: number[], from = 2): string {
  for (let i = from; i < from + 14; i++) if (days.includes(weekdayOf(isoDay(i))!)) return isoDay(i);
  throw new Error('no day');
}

const base = TEMPLATES.table_booking.build().booking!;
const barber = (staff = 1, buffer = 0): Booking =>
  withSchedule(
    { ...base, guestsKey: undefined, capacityUnit: 'bookings', capacityPerSlot: staff },
    {
      days: [[{ from: '09:00', to: '13:00' }, { from: '16:00', to: '19:00' }], ...weekHours([1, 2, 3, 4], '09:00', '19:00').slice(1, 5), [{ from: '08:00', to: '14:00' }], []],
      step: 15,
      duration: 30,
      serviceKey: 'service',
      durations: { cut: 30, beard: 45 },
      buffer,
    },
  );
const at = (start: string, minutes: number, units = 1): Busy => {
  const [h, m] = start.split(':').map(Number);
  const s = h! * 60 + m!;
  return { start: s, end: s + minutes, units };
};

describe('appointment hours', () => {
  it('offers start times inside each opening range, for the length of the service', () => {
    const s = barber().schedule!;
    const sunday = startsFor(s, 0, 45).map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
    expect(sunday[0]).toBe('9:00');
    expect(sunday).toContain('12:15'); // 12:15 + 45 = 13:00, still inside
    expect(sunday).not.toContain('12:30'); // would end after the break starts
    expect(sunday).toContain('16:00');
    expect(startsFor(s, 6, 30)).toEqual([]); // Saturday closed
    expect(appointmentMinutes(s, { service: 'beard' })).toBe(45);
    expect(appointmentMinutes(s, {})).toBe(30);
  });

  it('a taken time blocks every start that would overlap it, and frees the rest', () => {
    const b = barber(1);
    const busy = [at('10:00', 45)];
    expect(timeProblem(b, '2030-01-06', '10:00', { service: 'cut' }, busy)).toBe('full');
    expect(timeProblem(b, '2030-01-06', '09:30', { service: 'cut' }, busy)).toBeNull(); // 9:30–10:00 ends as it starts
    expect(timeProblem(b, '2030-01-06', '09:30', { service: 'beard' }, busy)).toBe('full'); // 9:30–10:15 overlaps
    expect(timeProblem(b, '2030-01-06', '10:30', { service: 'cut' }, busy)).toBe('full');
    expect(timeProblem(b, '2030-01-06', '10:45', { service: 'cut' }, busy)).toBeNull();
    expect(timeProblem(b, '2030-01-06', '13:30', { service: 'cut' }, busy)).toBe('outside'); // break
    expect(timeProblem(b, '2030-01-06', '10:10', { service: 'cut' }, busy)).toBe('outside'); // not on the 15-minute grid
  });

  it('several staff: a time is free while fewer than all of them are busy at every moment', () => {
    const b = barber(2);
    expect(peak([at('10:00', 30), at('10:15', 30)], 10, 11)).toBe(0);
    expect(timeProblem(b, '2030-01-06', '10:15', { service: 'cut' }, [at('10:00', 30)])).toBeNull();
    // Back-to-back appointments never overlap each other, so one chair stays free throughout.
    expect(timeProblem(b, '2030-01-06', '10:15', { service: 'cut' }, [at('10:00', 30), at('10:30', 30)])).toBeNull();
    // 10:00–10:45 and 10:30–11:00 both run at 10:30: both staff are busy there.
    expect(timeProblem(b, '2030-01-06', '10:15', { service: 'cut' }, [at('10:00', 45), at('10:30', 30)])).toBe('full');
    expect(timeProblem(b, '2030-01-06', '11:00', { service: 'cut' }, [at('10:00', 45), at('10:30', 30)])).toBeNull();
  });

  it('keeps the buffer after each appointment free', () => {
    const b = barber(1, 15);
    // 10:00 + 30 + 15 buffer → busy until 10:45
    expect(timeProblem(b, '2030-01-06', '10:30', { service: 'cut' }, [at('10:00', 45)])).toBe('full');
    expect(timeProblem(b, '2030-01-06', '10:45', { service: 'cut' }, [at('10:00', 45)])).toBeNull();
  });

  it('leaves out times that have passed today and the notice period', () => {
    const b = { ...barber(1), minNoticeHours: 2 };
    const now = new Date('2030-01-06T10:05:00'); // a Sunday
    const times = dayTimes(b, '2030-01-06', { service: 'cut' }, [], now).map((t) => t.time);
    expect(times[0]).toBe('12:15');
    expect(dayTimes(b, '2030-01-07', { service: 'cut' }, [], now)[0]!.time).toBe('09:00');
  });

  it('validateBooking speaks of the time field in Hebrew', () => {
    const config = TEMPLATES.table_booking.build();
    config.booking = barber(1);
    const day = '2030-01-06';
    const run = { id: 'r1', status: 'submitted', answers: [{ fieldKey: 'booking_date', value: day }, { fieldKey: 'booking_time', value: '10:00' }, { fieldKey: 'service', value: 'cut' }] } as never;
    const now = new Date('2030-01-01T08:00:00');
    expect(validateBooking(config, { booking_date: day, booking_time: '10:15', service: 'cut' }, [run], undefined, now).booking_time).toMatch(/נתפס/);
    expect(validateBooking(config, { booking_date: day, booking_time: '13:15', service: 'cut' }, [run], undefined, now).booking_time).toMatch(/לא פנויה/);
    expect(validateBooking(config, { booking_date: day, booking_time: '10:30', service: 'cut' }, [run], undefined, now)).toEqual({});
  });
});

describe('reading the owner’s words', () => {
  it('hours per day, split days, services with lengths and staff', () => {
    const a = readAppointment('מספרה לגברים. תספורת 30 דקות, תספורת וזקן 45 דקות. עובדים בימים א-ה 9 עד 19 ובשישי 8 עד 14. שני ספרים.');
    expect(a.days![0]).toEqual([{ from: '09:00', to: '19:00' }]);
    expect(a.days![5]).toEqual([{ from: '08:00', to: '14:00' }]);
    expect(a.days![6]).toEqual([]);
    expect(a.services).toEqual([{ name: 'תספורת', minutes: 30 }, { name: 'תספורת וזקן', minutes: 45 }]);
    expect(a.staff).toBe(2);
    expect(readAppointment('פתוחים א׳-ה׳ 9:00-13:00 ו-16:00-20:00').days![2]).toEqual([{ from: '09:00', to: '13:00' }, { from: '16:00', to: '20:00' }]);
    expect(readAppointment('ראשון עד חמישי בין 10 ל-20, שישי 9:30-13:30, 3 מטפלות')).toMatchObject({ staff: 3, days: expect.arrayContaining([[{ from: '09:30', to: '13:30' }]]) });
    expect(readAppointment('אימון אישי שעה, אימון זוגי שעה וחצי').services).toEqual([{ name: 'אימון אישי', minutes: 60 }, { name: 'אימון זוגי', minutes: 90 }]);
  });

  it('a gym, a beauty salon and a clinic all get an appointment form with hours and lengths', () => {
    for (const p of [
      'סטודיו אימונים פונקציונליים. אימון אישי שעה, אימון זוגי שעה. ימים א-ה 6 עד 21.',
      'מכון יופי. טיפול פנים 60 דקות, הסרת שיער 30 דקות, ימים א-ו 9 עד 18.',
      'קליניקה לפיזיותרפיה, טיפול 45 דקות, ימים א-ה 8 עד 20.',
      'מספרה לגברים. תספורת 30 דקות, תספורת וזקן 45 דקות. עובדים בימים א-ה 9 עד 19 ובשישי 8 עד 14. שני ספרים.',
    ]) {
      const g = generateWorkflowFromPrompt(p);
      expect(g.templateKey, p).toBe('table_booking');
      const b = g.config.booking!;
      expect(b.schedule, p).toBeDefined();
      expect(WorkflowConfigSchema.safeParse(g.config).success, p).toBe(true);
      expect(logicIssues(g.config).filter((i) => i.level === 'error'), p).toEqual([]);
      expect(b.openWeekdays.every((d) => b.schedule!.days[d]!.length > 0), p).toBe(true);
    }
    const barberFlow = generateWorkflowFromPrompt('מספרה לגברים. תספורת 30 דקות, תספורת וזקן 45 דקות. עובדים בימים א-ה 9 עד 19 ובשישי 8 עד 14. שני ספרים.');
    expect(barberFlow.config.booking).toMatchObject({ capacityPerSlot: 2, openWeekdays: [0, 1, 2, 3, 4, 5] });
    expect(barberFlow.config.booking!.schedule!.durations).toEqual({ service_1: 30, service_2: 45 });
    expect(barberFlow.theme.extras?.badge).not.toMatch(/מטבח/);
  });
});

describe('no double booking (local store)', () => {
  let repo: LocalStorageRepository;
  beforeEach(async () => {
    repo = new LocalStorageRepository(new MemoryStore());
    await repo.init();
  });

  it('a taken time disappears from the form and a second request for it is refused', async () => {
    const g = generateWorkflowFromPrompt('מספרה. תספורת 30 דקות, צבע 90 דקות. ימים א-ה 9 עד 17.');
    const wf = await repo.createWorkflow(DEMO_ORG_IDS.autocare, { config: g.config, templateKey: g.templateKey, sourcePrompt: 'x', design: g.theme });
    await repo.publishWorkflow(DEMO_ORG_IDS.autocare, wf.id);
    const day = nextDay(g.config.booking!.openWeekdays);
    const values = (time: string, service: string, phone: string) => ({ booking_date: day, booking_time: time, service, guest_name: 'לקוחה', guest_phone: phone });

    const before = await repo.getBookingAvailability(wf.slug, day, { service: 'service_1' });
    expect(before.find((t) => t.time === '10:00')?.state).toBe('available');

    await repo.submitRun(wf.slug, { consent: true, values: values('10:00', 'service_2', '050-555-0101') }); // colour, 10:00–11:30
    const after = await repo.getBookingAvailability(wf.slug, day, { service: 'service_1' });
    for (const t of ['10:00', '10:30', '11:00']) expect(after.find((x) => x.time === t)?.state, t).toBe('full');
    expect(after.find((x) => x.time === '11:30')?.state).toBe('available');

    await expect(repo.submitRun(wf.slug, { consent: true, values: values('11:00', 'service_1', '050-555-0102') })).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(repo.submitRun(wf.slug, { consent: true, values: values('11:30', 'service_1', '050-555-0103') })).resolves.toBeDefined();
  });
});
