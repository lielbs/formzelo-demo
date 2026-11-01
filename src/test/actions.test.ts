import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { migrateOrgData } from '../data/migrations';
import { DomainRuleError } from '../data/repository';
import { DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { CustomerActionSchema, OrgDataSchema, SCHEMA_VERSION, type CustomerAction, type WorkflowRun } from '../domain/schema';
import { actionsByRun, actionStatus, buildAction, cancel, countActions, isDuplicate, respond } from '../engine/actions';

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

const AT = '2026-11-01T10:00:00.000Z';
const run = { id: 'run_1', orgId: 'org_x', workflowId: 'wf_1', versionId: 'ver_1', versionNumber: 3, status: 'in_review' } as WorkflowRun;
const approval = () => buildAction({ kind: 'approval', title: 'החלפת רפידות בלם', description: 'האם לאשר?', amount: 480 }, run, { id: 'act_1' }, AT);

describe('Formangle Actions — rules', () => {
  it('approval and choice carry exactly two frozen options; an update carries none', () => {
    const a = approval();
    expect(a.options).toEqual([
      { id: 'a', label: 'מאשר' },
      { id: 'b', label: 'לא מאשר' },
    ]);
    expect(a).toMatchObject({ status: 'pending', versionId: 'ver_1', versionNumber: 3, runId: 'run_1', amount: 480 });
    const c = buildAction({ kind: 'choice', title: 'איך לקבל?', options: ['משלוח', 'איסוף עצמי'] }, run, { id: 'act_2' }, AT);
    expect(c.options.map((o) => o.label)).toEqual(['משלוח', 'איסוף עצמי']);
    const u = buildAction({ kind: 'update', title: 'מוכן לאיסוף' }, run, { id: 'act_3' }, AT);
    expect(u).toMatchObject({ status: 'posted', options: [] });

    expect(CustomerActionSchema.safeParse({ ...a, options: [a.options[0]] }).success).toBe(false);
    expect(CustomerActionSchema.safeParse({ ...a, options: [...a.options, { id: 'a', label: 'שלישי' }] }).success).toBe(false);
    expect(CustomerActionSchema.safeParse({ ...u, options: a.options }).success).toBe(false);
  });

  it('validates owner input at the boundary', () => {
    expect(() => buildAction({ kind: 'choice', title: 'בחירה' }, run, { id: 'x' }, AT)).toThrow();
    expect(() => buildAction({ kind: 'choice', title: 'בחירה', options: ['כן', 'כן'] }, run, { id: 'x' }, AT)).toThrow();
    expect(() => buildAction({ kind: 'approval', title: '   ' }, run, { id: 'x' }, AT)).toThrow();
    expect(() => buildAction({ kind: 'approval', title: 'x', expiresAt: '2026-10-01T00:00:00.000Z' }, run, { id: 'x' }, AT)).toThrow(/עבר/);
    expect(() => buildAction({ kind: 'approval', title: 'x' }, { ...run, status: 'cancelled' }, { id: 'x' }, AT)).toThrow(/בוטלה/);
  });

  it('is answered once, with the original terms preserved', () => {
    const answered = respond(approval(), 'a', '2026-11-01T11:00:00.000Z');
    expect(answered).toMatchObject({ status: 'responded', response: { optionId: 'a', label: 'מאשר' }, amount: 480, title: 'החלפת רפידות בלם' });
    expect(() => respond(answered, 'b', '2026-11-01T12:00:00.000Z')).toThrow(/כבר התקבלה/);
    expect(() => cancel(answered, '2026-11-01T12:00:00.000Z')).toThrow();
    expect(() => respond(approval(), 'c', AT)).toThrow(/לא קיימת/);
    expect(() => respond(buildAction({ kind: 'update', title: 'מוכן' }, run, { id: 'u' }, AT), 'a', AT)).toThrow(/אינו דורש/);
  });

  it('expires by time and cannot be answered after cancellation', () => {
    const a = buildAction({ kind: 'approval', title: 'x', expiresAt: '2026-11-02T10:00:00.000Z' }, run, { id: 'e' }, AT);
    expect(actionStatus(a, Date.parse('2026-11-01T12:00:00.000Z'))).toBe('pending');
    expect(actionStatus(a, Date.parse('2026-11-03T00:00:00.000Z'))).toBe('expired');
    expect(() => respond(a, 'a', '2026-11-03T00:00:00.000Z')).toThrow(/פג/);
    const c = cancel(approval(), '2026-11-01T10:30:00.000Z');
    expect(c.status).toBe('cancelled');
    expect(() => respond(c, 'a', '2026-11-01T10:40:00.000Z')).toThrow(/ביטל/);
  });

  it('detects double submissions and counts what waits for the customer', () => {
    const a = approval();
    expect(isDuplicate([a], { ...approval(), id: 'act_9' }, Date.parse(AT))).toBe(true);
    expect(isDuplicate([a], { ...approval(), id: 'act_9', amount: 520 }, Date.parse(AT))).toBe(false);
    const all: CustomerAction[] = [a, respond({ ...approval(), id: 'act_5' }, 'b', AT), buildAction({ kind: 'update', title: 'u' }, run, { id: 'u' }, AT)];
    const counts = countActions(all, Date.parse(AT));
    expect([counts.awaiting, counts.answered, [...counts.awaitingRuns]]).toEqual([1, 1, ['run_1']]);
    // Dashboard / inbox grouping per request: cancelled and posted updates are not decisions.
    const other = buildAction({ kind: 'approval', title: 'y' }, { ...run, id: 'run_2' }, { id: 'act_7' }, AT);
    const byRun = actionsByRun([...all, cancel(other, AT)], Date.parse(AT));
    expect(byRun.get('run_1')).toEqual({ awaiting: 1, answered: 1 });
    expect(byRun.has('run_2')).toBe(false);
  });
});

describe('Formangle Actions — local repository', () => {
  let store: MemoryStore;
  let repo: LocalStorageRepository;
  beforeEach(async () => {
    store = new MemoryStore();
    repo = new LocalStorageRepository(store);
    await repo.init();
  });

  const anyRun = async () => (await repo.listRuns(DEMO_ORG_IDS.bloom)).find((r) => r.status === 'in_review' || r.status === 'submitted')!;

  it('owner creates, customer answers through the request link, the timeline records both', async () => {
    const r = await anyRun();
    const action = await repo.createAction(DEMO_ORG_IDS.bloom, r.id, { kind: 'choice', title: 'צבע העטיפה', options: ['ורוד', 'לבן'] });
    expect(action.status).toBe('pending');
    await expect(repo.createAction(DEMO_ORG_IDS.bloom, r.id, { kind: 'choice', title: 'צבע העטיפה', options: ['ורוד', 'לבן'] })).rejects.toBeInstanceOf(DomainRuleError);

    const visible = await repo.getPublicActions(DEMO_SLUGS.flowers, r.id);
    expect(visible.map((a) => a.id)).toContain(action.id);
    const answered = await repo.respondToAction(DEMO_SLUGS.flowers, r.id, action.id, 'b');
    expect(answered.response?.label).toBe('לבן');
    await expect(repo.respondToAction(DEMO_SLUGS.flowers, r.id, action.id, 'a')).rejects.toThrow(/כבר התקבלה/);

    // A different workflow's slug cannot reach this request.
    await expect(repo.respondToAction(DEMO_SLUGS.events, r.id, action.id, 'a')).rejects.toThrow();

    const events = await repo.listEvents(DEMO_ORG_IDS.bloom, r.id);
    const mine = events.filter((e) => e.actionId === action.id).map((e) => [e.type, e.actor]);
    expect(mine).toEqual(expect.arrayContaining([['action_created', 'owner'], ['action_responded', 'customer']]));

    // Persisted: a new repository on the same storage (a page refresh) reads the same answer.
    const again = new LocalStorageRepository(store);
    expect((await again.listActions(DEMO_ORG_IDS.bloom, r.id)).find((a) => a.id === action.id)?.response?.optionId).toBe('b');
  });

  it('cancels open actions only, and logs the cancellation', async () => {
    const r = await anyRun();
    const a = await repo.createAction(DEMO_ORG_IDS.bloom, r.id, { kind: 'approval', title: 'תוספת אגרטל', amount: 60 });
    const c = await repo.cancelAction(DEMO_ORG_IDS.bloom, a.id);
    expect(c.status).toBe('cancelled');
    await expect(repo.cancelAction(DEMO_ORG_IDS.bloom, a.id)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(repo.respondToAction(DEMO_SLUGS.flowers, r.id, a.id, 'a')).rejects.toThrow(/ביטל/);
    expect((await repo.listEvents(DEMO_ORG_IDS.bloom, r.id)).some((e) => e.type === 'action_cancelled' && e.actionId === a.id)).toBe(true);
  });

  it('the demo seeds open and answered decisions', async () => {
    const actions = await repo.listActions(DEMO_ORG_IDS.autocare);
    const counts = countActions(actions);
    expect(counts.awaiting).toBeGreaterThanOrEqual(1);
    expect(counts.answered).toBeGreaterThanOrEqual(2);
  });
});

describe('migration v6 -> v7', () => {
  it('adds an empty actions list to real workspaces and sample actions to demo ones', async () => {
    const repo = new LocalStorageRepository(new MemoryStore());
    await repo.init();
    const demo = structuredClone(await repo.exportWorkspace(DEMO_ORG_IDS.autocare)) as unknown as Record<string, unknown>;
    demo.schemaVersion = 6;
    delete demo.actions;
    demo.events = (demo.events as { type: string }[]).filter((e) => !e.type.startsWith('action_'));
    const runs = JSON.stringify(demo.runs);
    const out = migrateOrgData(demo).value as Record<string, unknown>;
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(OrgDataSchema.safeParse(out).success).toBe(true);
    expect((out.actions as unknown[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(out.runs)).toBe(runs);

    const real = structuredClone(demo);
    (real.organization as { isDemo: boolean }).isDemo = false;
    const r = migrateOrgData(real).value as Record<string, unknown>;
    expect(r.actions).toEqual([]);
    expect(OrgDataSchema.safeParse(r).success).toBe(true);
  });
});
