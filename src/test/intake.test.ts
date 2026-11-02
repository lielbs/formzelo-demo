import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { DomainRuleError } from '../data/repository';
import { DEMO_ORG_IDS } from '../data/seed';
import type { Booking, WorkflowRun } from '../domain/schema';
import { bookingWindow, validateBooking } from '../engine/booking';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { contactKey, hasOpenRequestFrom, intakeCounts, intakeState } from '../engine/intake';
import { TEMPLATES } from '../engine/templates';

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

const NOW = new Date('2026-11-04T10:00:00'); // a Wednesday
const run = (id: string, submittedAt: string, status: WorkflowRun['status'] = 'submitted', contact = '') =>
  ({ id, status, submittedAt, customerContact: contact, answers: [] }) as unknown as WorkflowRun;

describe('intake rules', () => {
  const runs = [
    run('a', '2026-11-04T08:00:00'),
    run('b', '2026-11-03T08:00:00'),
    run('c', '2026-11-01T08:00:00'), // Sunday, same week
    run('d', '2026-10-31T08:00:00'), // Saturday, previous week
    run('e', '2026-11-04T09:00:00', 'rejected'),
  ];

  it('counts today, this week (from Sunday) and in total, without rejected requests', () => {
    expect(intakeCounts(runs, NOW)).toEqual({ today: 1, week: 3, total: 4 });
  });

  it('closes by hand, by dates and by each limit, with a reason the customer understands', () => {
    expect(intakeState(undefined, runs, NOW).open).toBe(true);
    expect(intakeState({ paused: true, onePerContact: false }, runs, NOW).reason).toBe('paused');
    expect(intakeState({ paused: false, onePerContact: false, opensOn: '2026-11-10' }, runs, NOW).message).toMatch(/10\.11\.2026/);
    expect(intakeState({ paused: false, onePerContact: false, closesOn: '2026-11-03' }, runs, NOW).reason).toBe('ended');
    expect(intakeState({ paused: false, onePerContact: false, closesOn: '2026-11-04' }, runs, NOW).open).toBe(true);
    expect(intakeState({ paused: false, onePerContact: false, maxPerDay: 1 }, runs, NOW).reason).toBe('day');
    expect(intakeState({ paused: false, onePerContact: false, maxPerDay: 2 }, runs, NOW).open).toBe(true);
    expect(intakeState({ paused: false, onePerContact: false, maxPerWeek: 3 }, runs, NOW).reason).toBe('week');
    expect(intakeState({ paused: false, onePerContact: false, maxTotal: 4 }, runs, NOW).reason).toBe('total');
    const holiday = intakeState({ paused: false, onePerContact: false, closedDates: ['2026-11-04', '2026-11-05'] }, runs, NOW);
    expect(holiday.reason).toBe('holiday');
    expect(holiday.message).toMatch(/6\.11\.2026/);
    expect(intakeState({ paused: false, onePerContact: false, closedDates: ['2026-11-05'] }, runs, NOW).open).toBe(true);
  });

  it('recognises the same phone or email written differently', () => {
    expect(contactKey('054-555 0100')).toBe(contactKey('+972545550100'));
    expect(contactKey('Dana@Mail.com')).toBe('dana@mail.com');
    const open = [run('x', '2026-11-04T08:00:00', 'in_review', '0545550100'), run('y', '2026-11-04T08:00:00', 'cancelled', '0501112222')];
    expect(hasOpenRequestFrom('+972 54-555-0100', open)).toBe(true);
    expect(hasOpenRequestFrom('050-111-2222', open)).toBe(false);
  });

  it('is enforced on new public requests, applies without publishing, and the link reports it', async () => {
    const repo = new LocalStorageRepository(new MemoryStore());
    await repo.init();
    const gen = generateWorkflowFromPrompt('הרשמה לסדנה עם 2 מועדים, ללא תשלום');
    const wf = await repo.createWorkflow(DEMO_ORG_IDS.bloom, { config: gen.config, templateKey: gen.templateKey, design: gen.theme });
    await repo.publishWorkflow(DEMO_ORG_IDS.bloom, wf.id);
    const track = gen.config.steps[0]!.fields.find((f) => f.key === 'track')!;
    const values = { track: track.options![0]!.value, name: 'דנה', phone: '050-555-0144' };

    await repo.updateIntake(DEMO_ORG_IDS.bloom, wf.id, { paused: false, onePerContact: true, maxPerDay: 2 });
    await repo.submitRun(wf.slug, { consent: true, values });
    await expect(repo.submitRun(wf.slug, { consent: true, values: { ...values, phone: '0505550144' } })).rejects.toThrow(/בקשה פתוחה/);
    await repo.submitRun(wf.slug, { consent: true, values: { ...values, phone: '050-555-0999' } });
    expect((await repo.getIntakeState(wf.slug)).reason).toBe('day');
    await expect(repo.submitRun(wf.slug, { consent: true, values: { ...values, phone: '050-555-0888' } })).rejects.toBeInstanceOf(DomainRuleError);

    await repo.updateIntake(DEMO_ORG_IDS.bloom, wf.id, { paused: true, onePerContact: false, closedMessage: 'נפתח שוב בחודש הבא' });
    await expect(repo.submitRun(wf.slug, { consent: true, values: { ...values, phone: '050-555-0777' } })).rejects.toThrow('נפתח שוב בחודש הבא');
    expect((await repo.getWorkflow(DEMO_ORG_IDS.bloom, wf.id))!.hasUnpublishedChanges).toBe(false);
  });
});

describe('booking window', () => {
  const cfg = TEMPLATES.table_booking.build();
  const base = cfg.booking!;
  const at = (b: Partial<Booking>) => ({ ...cfg, booking: { ...base, ...b, openWeekdays: [0, 1, 2, 3, 4, 5, 6] } });
  const v = (date: string, time = '20:00') => ({ [base.dateKey]: date, [base.timeKey!]: time, party_size: 2 });

  it('refuses past dates, closed dates, dates too far ahead and too little notice', () => {
    expect(validateBooking(at({}), v('2026-11-03'), [], undefined, NOW)).toHaveProperty(base.dateKey);
    expect(validateBooking(at({ closedDates: ['2026-11-06'] }), v('2026-11-06'), [], undefined, NOW)[base.dateKey]).toMatch(/סגור/);
    expect(validateBooking(at({ maxDaysAhead: 7 }), v('2026-11-12'), [], undefined, NOW)[base.dateKey]).toMatch(/7 ימים/);
    expect(validateBooking(at({ maxDaysAhead: 7 }), v('2026-11-11'), [], undefined, NOW)).toEqual({});
    expect(validateBooking(at({ minNoticeHours: 24 }), v('2026-11-05', '09:00'), [], undefined, NOW)[base.timeKey!]).toMatch(/24 שעות/);
    expect(validateBooking(at({ minNoticeHours: 24 }), v('2026-11-05', '20:00'), [], undefined, NOW)).toEqual({});
    expect(bookingWindow(at({ minNoticeHours: 48, maxDaysAhead: 30 }).booking, NOW)).toEqual({ min: '2026-11-06', max: '2026-12-04' });
  });

  it('caps a whole day across its slots', () => {
    const r = (time: string) =>
      ({ id: time, status: 'approved', answers: [{ fieldKey: base.dateKey, value: '2026-11-06' }, { fieldKey: base.timeKey, value: time }] }) as unknown as WorkflowRun;
    const c = at({ maxPerDay: 2, capacityUnit: 'bookings' });
    expect(validateBooking(c, v('2026-11-06', '18:00'), [r('19:00')], undefined, NOW)).toEqual({});
    expect(validateBooking(c, v('2026-11-06', '18:00'), [r('19:00'), r('20:00')], undefined, NOW)[base.dateKey]).toMatch(/מלא/);
  });
});
