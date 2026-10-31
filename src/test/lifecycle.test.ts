import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { DomainRuleError, ValidationFailedError } from '../data/repository';
import { DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import type { WorkflowRun } from '../domain/schema';
import { bookingState } from '../engine/booking';
import { optionUsage, validateOptionCapacity } from '../engine/capacity';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { objectiveOf, simulatedMoney, workflowOutcome } from '../engine/metrics';
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

/** First date from `from` days ahead whose weekday is open. */
function openDay(days: number[], from = 2): string {
  for (let i = from; i < from + 14; i++) {
    const iso = isoDay(i);
    if (days.includes(new Date(`${iso}T12:00:00`).getDay())) return iso;
  }
  throw new Error('no open day');
}

async function freshRepo() {
  const repo = new LocalStorageRepository(new MemoryStore());
  await repo.init();
  return repo;
}

describe('booking lifecycle', () => {
  it('maps every run status to a distinct booking stage', () => {
    expect(bookingState('submitted').stage).toBe('requested');
    expect(bookingState('in_review').stage).toBe('pending');
    expect(bookingState('changes_requested').stage).toBe('changes');
    expect(bookingState('approved')).toMatchObject({ stage: 'confirmed', confirmed: true });
    expect(bookingState('rejected').stage).toBe('rejected');
    expect(bookingState('cancelled').stage).toBe('cancelled');
  });

  let repo: LocalStorageRepository;
  beforeEach(async () => {
    repo = await freshRepo();
  });

  const book = async (time: string, size: number) => {
    const day = openDay([1, 2, 3, 4, 5, 6], 9);
    const run = await repo.submitRun(DEMO_SLUGS.booking, { consent: true, values: { booking_date: day, booking_time: time, party_size: size, guest_name: 'נועה', guest_phone: '050-555-0101' } });
    return { day, run };
  };
  const used = async (day: string, time: string) => (await repo.getBookingAvailability(DEMO_SLUGS.booking, day)).find((s) => s.time === time)!.used;

  it('requested -> pending -> confirmed -> cancelled by the owner', async () => {
    const { run } = await book('19:00', 2);
    expect(bookingState(run.status).stage).toBe('requested');
    expect(bookingState((await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'in_review')).status).stage).toBe('pending');
    expect(bookingState((await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'approved')).status).stage).toBe('confirmed');
    expect(bookingState((await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'cancelled')).status).stage).toBe('cancelled');
  });

  it('rejected requests free their places', async () => {
    const { day, run } = await book('20:00', 6);
    const before = await used(day, '20:00');
    await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'rejected');
    expect(await used(day, '20:00')).toBe(before - 6);
  });

  it('the customer can cancel their own booking request once, through the public link', async () => {
    const { day, run } = await book('18:00', 3);
    const before = await used(day, '18:00');
    const cancelled = await repo.cancelRunByCustomer(DEMO_SLUGS.booking, run.id);
    expect(cancelled.status).toBe('cancelled');
    expect(await used(day, '18:00')).toBe(before - 3);
    const events = await repo.listEvents(DEMO_ORG_IDS.urban, run.id);
    expect(events.some((e) => e.actor === 'customer' && e.to === 'cancelled')).toBe(true);
    await expect(repo.cancelRunByCustomer(DEMO_SLUGS.booking, run.id)).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('customers cannot cancel non-booking runs through the link', async () => {
    const run = await repo.submitRun(DEMO_SLUGS.flowers, {
      consent: true,
      values: { budget: '250', palette: 'pastel', occasion: 'birthday', sender: 'א', sender_phone: '050-555-0199', recipient: 'ב', recipient_phone: '050-555-0198', address: 'הרצל 1', delivery_date: isoDay(3) },
    });
    await expect(repo.cancelRunByCustomer(DEMO_SLUGS.flowers, run.id)).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('limited places per option', () => {
  it('counts only runs that hold a place and rejects a full option', () => {
    const { config } = generateWorkflowFromPrompt('הרשמה לסדנה עם 2 מועדים, עד 2 משתתפים');
    const track = config.steps[0]!.fields.find((f) => f.key === 'track')!;
    const v = track.options![0]!.value;
    const runAt = (id: string, status: WorkflowRun['status']) =>
      ({ id, status, answers: [{ fieldId: track.id, fieldKey: 'track', label: '', value: v, displayValue: '' }] }) as unknown as WorkflowRun;
    const usage = optionUsage(config, [runAt('a', 'submitted'), runAt('b', 'approved'), runAt('c', 'rejected')]);
    expect(usage.track![v]).toBe(2);
    expect(validateOptionCapacity(config, { track: v }, usage).track).toMatch(/מלא/);
    expect(validateOptionCapacity(config, { track: track.options![1]!.value }, usage)).toEqual({});
  });

  it('is enforced on submit and surfaces through getOptionUsage', async () => {
    const repo = await freshRepo();
    const gen = generateWorkflowFromPrompt('הרשמה לסדנה עם 2 מועדים, עד 1 משתתפים, ללא תשלום');
    const wf = await repo.createWorkflow(DEMO_ORG_IDS.bloom, { config: gen.config, templateKey: gen.templateKey, design: gen.theme });
    await repo.publishWorkflow(DEMO_ORG_IDS.bloom, wf.id);
    const track = gen.config.steps[0]!.fields.find((f) => f.key === 'track')!;
    const values = { track: track.options![0]!.value, name: 'דנה', phone: '050-555-0144' };
    await repo.submitRun(wf.slug, { consent: true, values });
    expect((await repo.getOptionUsage(wf.slug)).track![values.track]).toBe(1);
    await expect(repo.submitRun(wf.slug, { consent: true, values })).rejects.toBeInstanceOf(ValidationFailedError);
    const other = await repo.submitRun(wf.slug, { consent: true, values: { ...values, track: track.options![1]!.value } });
    expect(other.payment.status).toBe('none');
  });
});

describe('objective-aware metrics', () => {
  it('classifies each demo flow by its objective', () => {
    expect(objectiveOf(TEMPLATES.garage_repairs.build())).toBe('approval');
    expect(objectiveOf(TEMPLATES.table_booking.build())).toBe('booking');
    expect(objectiveOf(TEMPLATES.flower_order.build())).toBe('payment');
    expect(objectiveOf(TEMPLATES.quote_request.build())).toBe('quote');
  });

  it('never reports garage approvals as payments', async () => {
    const repo = await freshRepo();
    const runs = await repo.listRuns(DEMO_ORG_IDS.autocare);
    const garage = (await repo.listWorkflows(DEMO_ORG_IDS.autocare)).find((w) => w.templateKey === 'garage_repairs')!;
    const own = runs.filter((r) => r.workflowId === garage.id);
    const outcome = workflowOutcome(garage.draft, own);
    expect(outcome.objective).toBe('approval');
    expect(outcome.secondary.some((m) => m.value.includes('₪'))).toBe(false);
    expect(simulatedMoney(own).paid).toBe(0);
  });
});
