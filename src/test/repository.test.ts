import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { ValidationFailedError } from '../data/repository';
import { DEMO_GARAGE_CASE_ID, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { generateWorkflowFromPrompt } from '../engine/generator';
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

let store: MemoryStore;
let repo: LocalStorageRepository;
beforeEach(async () => {
  store = new MemoryStore();
  repo = new LocalStorageRepository(store);
  await repo.init();
});

const flowerValues = {
  budget: '350',
  palette: 'pastel',
  occasion: 'birthday',
  sender: 'בודק',
  sender_phone: '050-555-0199',
  gift_wrap: true,
  recipient: 'מקבל',
  recipient_phone: '050-555-0198',
  address: 'הרצל 1, תל אביב',
  delivery_date: isoDay(3),
};

describe('LocalStorageRepository', () => {
  it('isolates workspaces under separate keys', async () => {
    const bloomRuns = await repo.listRuns(DEMO_ORG_IDS.bloom);
    const garageRuns = await repo.listRuns(DEMO_ORG_IDS.autocare);
    expect(bloomRuns.every((r) => r.orgId === DEMO_ORG_IDS.bloom)).toBe(true);
    expect(garageRuns.every((r) => r.orgId === DEMO_ORG_IDS.autocare)).toBe(true);
    expect(store.getItem(`formzelo:v1:org:${DEMO_ORG_IDS.bloom}`)).not.toContain(DEMO_ORG_IDS.autocare);
  });

  it('submits a flower order that persists across repository instances', async () => {
    const run = await repo.submitRun(DEMO_SLUGS.flowers, { values: flowerValues, consent: true });
    expect(run.total).toBe(400);
    const reopened = new LocalStorageRepository(store);
    expect((await reopened.getRun(DEMO_ORG_IDS.bloom, run.id))?.status).toBe('submitted');
    expect((await reopened.listRuns(DEMO_ORG_IDS.autocare)).find((r) => r.id === run.id)).toBeUndefined();
  });

  it('rejects submissions without consent or with invalid values', async () => {
    await expect(repo.submitRun(DEMO_SLUGS.flowers, { values: flowerValues, consent: false })).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(repo.submitRun(DEMO_SLUGS.flowers, { values: { budget: '999' }, consent: true })).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('records garage decisions on the open case with an exact total', async () => {
    const run = await repo.submitRun(DEMO_SLUGS.garage, {
      runId: DEMO_GARAGE_CASE_ID,
      consent: true,
      values: { brake_pads: 'approved', cabin_filter: 'approved', wipers: 'declined' },
    });
    expect(run.total).toBe(830);
    expect(run.answers.find((a) => a.fieldKey === 'wipers')?.value).toBe('declined');
    expect(run.caseAnswers.find((a) => a.fieldKey === 'car_plate')?.value).toBe('84-219-63');
  });

  it('keeps runs bound to their version after a re-publish', async () => {
    const pub = (await repo.resolvePublic(DEMO_SLUGS.flowers))!;
    const run = await repo.submitRun(DEMO_SLUGS.flowers, { values: flowerValues, consent: true });
    const cfg = structuredClone(pub.workflow.draft);
    cfg.title = 'כותרת חדשה';
    await repo.saveDraft(DEMO_ORG_IDS.bloom, pub.workflow.id, cfg);
    const v2 = await repo.publishWorkflow(DEMO_ORG_IDS.bloom, pub.workflow.id);
    expect(v2.version).toBe(2);
    const stored = await repo.getRun(DEMO_ORG_IDS.bloom, run.id);
    expect(stored?.versionId).toBe(pub.version.id);
    expect((await repo.getVersion(DEMO_ORG_IDS.bloom, pub.version.id))?.config.title).toBe(pub.version.config.title);
  });

  it('runs the restaurant approval and simulated deposit', async () => {
    const run = await repo.submitRun(DEMO_SLUGS.events, {
      consent: true,
      values: {
        event_date: isoDay(20),
        guests: 10,
        event_type: 'family',
        slot: 'dinner',
        menu: 'classic',
        contact_name: 'בודק',
        contact_phone: '050-555-0111',
        contact_email: 't@example.com',
      },
    });
    expect(run.payment.amount).toBe(360);
    const approved = await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'approved');
    expect(approved.payment.status).toBe('deposit_requested');
    const paid = await repo.markDepositPaid(DEMO_ORG_IDS.urban, run.id);
    expect(paid.payment.status).toBe('deposit_paid_simulated');
    await expect(repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'submitted')).rejects.toThrow();
  });

  it('creates, publishes and serves a generated workflow', async () => {
    const gen = generateWorkflowFromPrompt('סטודיו לצילום שרוצה טופס פנייה');
    const wf = await repo.createWorkflow(DEMO_ORG_IDS.bloom, { config: gen.config, templateKey: gen.templateKey, sourcePrompt: 'x' });
    expect(await repo.resolvePublic(wf.slug)).toBeNull();
    await repo.publishWorkflow(DEMO_ORG_IDS.bloom, wf.id);
    expect((await repo.resolvePublic(wf.slug))?.workflow.id).toBe(wf.id);
  });

  it('recovers from corrupt localStorage by quarantining and re-seeding', async () => {
    store.setItem(`formzelo:v1:org:${DEMO_ORG_IDS.urban}`, '{"not":"valid"');
    const fresh = new LocalStorageRepository(store);
    expect((await fresh.listRuns(DEMO_ORG_IDS.urban)).length).toBeGreaterThan(0);
    expect((await fresh.storageReport()).warnings.length).toBe(1);
  });
});
