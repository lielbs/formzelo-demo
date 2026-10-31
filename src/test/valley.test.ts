import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { ValidationFailedError } from '../data/repository';
import { buildSeed, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { OrgDataSchema, SCHEMA_VERSION } from '../domain/schema';
import { visibleSteps } from '../engine/conditions';
import { workflowOutcome } from '../engine/metrics';

class MemoryStore implements KeyValueStore {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  key = (i: number) => [...this.m.keys()][i] ?? null;
  get length() {
    return this.m.size;
  }
}

const runner = (track: string, age: number) => ({
  track,
  name: 'רץ בדיקה',
  age,
  phone: '050-555-0150',
  health: true,
  ...(age < 18 ? { parent_name: 'הורה', parent_phone: '050-555-0151', parent_consent: true } : {}),
});

describe('Valley Run contest showcase', () => {
  it('seeds a valid workspace with places already taken', async () => {
    const valley = buildSeed().find((d) => d.organization.id === DEMO_ORG_IDS.valley)!;
    expect(OrgDataSchema.safeParse(valley).success).toBe(true);
    const repo = new LocalStorageRepository(new MemoryStore());
    await repo.init();
    const usage = await repo.getOptionUsage(DEMO_SLUGS.contest);
    // 8 holding half-marathon runs (the rejected one frees its place) out of 10.
    expect(usage.track!.half_21k).toBe(8);
    const pub = (await repo.resolvePublic(DEMO_SLUGS.contest))!;
    expect(pub.version.design.presetId).toBe('creative_studio');
    expect(workflowOutcome(pub.version.config, await repo.listRuns(DEMO_ORG_IDS.valley)).objective).toBe('payment');
  });

  it('asks for parental consent only below 18 and enforces it', async () => {
    const repo = new LocalStorageRepository(new MemoryStore());
    await repo.init();
    const cfg = (await repo.resolvePublic(DEMO_SLUGS.contest))!.version.config;
    expect(visibleSteps(cfg, { age: 15 }).map((s) => s.title)).toContain('אישור הורה');
    expect(visibleSteps(cfg, { age: 30 }).map((s) => s.title)).not.toContain('אישור הורה');
    const minorWithoutParent = { ...runner('family_3k', 12), parent_consent: false };
    await expect(repo.submitRun(DEMO_SLUGS.contest, { consent: true, values: minorWithoutParent })).rejects.toBeInstanceOf(ValidationFailedError);
    const ok = await repo.submitRun(DEMO_SLUGS.contest, { consent: true, values: runner('family_3k', 12), payNow: false });
    expect(ok.payment.status).toBe('payment_requested');
    expect(ok.total).toBe(40);
  });

  it('closes a track when its last places are taken', async () => {
    const repo = new LocalStorageRepository(new MemoryStore());
    await repo.init();
    await repo.submitRun(DEMO_SLUGS.contest, { consent: true, values: runner('half_21k', 30), payNow: true });
    await repo.submitRun(DEMO_SLUGS.contest, { consent: true, values: runner('half_21k', 31), payNow: true });
    await expect(repo.submitRun(DEMO_SLUGS.contest, { consent: true, values: runner('half_21k', 32) })).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe('migration v3 -> v4', () => {
  it('adds the Valley Run workspace to an existing v3 browser without touching other data', async () => {
    const store = new MemoryStore();
    const first = new LocalStorageRepository(store);
    await first.init();
    // Rewind the browser to a v3 state that never had Valley Run.
    const meta = JSON.parse(store.getItem('formzelo:v1:meta')!);
    meta.schemaVersion = 3;
    meta.orgIds = meta.orgIds.filter((id: string) => id !== DEMO_ORG_IDS.valley);
    delete meta.slugIndex[DEMO_SLUGS.contest];
    store.setItem('formzelo:v1:meta', JSON.stringify(meta));
    store.removeItem(`formzelo:v1:org:${DEMO_ORG_IDS.valley}`);
    const bloomKey = `formzelo:v1:org:${DEMO_ORG_IDS.bloom}`;
    const bloom = JSON.parse(store.getItem(bloomKey)!);
    bloom.schemaVersion = 3;
    store.setItem(bloomKey, JSON.stringify(bloom));
    const bloomRuns = bloom.runs.length;

    const repo = new LocalStorageRepository(store);
    await repo.init();
    expect((await repo.listOrganizations()).map((o) => o.id)).toContain(DEMO_ORG_IDS.valley);
    expect(await repo.resolvePublic(DEMO_SLUGS.contest)).not.toBeNull();
    expect((await repo.listRuns(DEMO_ORG_IDS.bloom)).length).toBe(bloomRuns);
    expect(JSON.parse(store.getItem(bloomKey)!).schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.parse(store.getItem('formzelo:v1:meta')!).schemaVersion).toBe(SCHEMA_VERSION);
  });
});
