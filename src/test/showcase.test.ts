import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { migrateOrgData } from '../data/migrations';
import { DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { applyShowcase, isShowcaseId, showcaseAssets } from '../data/showcase';
import { OrgDataSchema, SCHEMA_VERSION, type OrgData } from '../domain/schema';
import { AssetSchema } from '../domain/theme';
import { referencedAssets } from '../renderer/media';

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

// Files that actually ship in public/showcase (keys like ../../public/showcase/bloom/logo.svg).
const shipped = new Set(Object.keys(import.meta.glob('../../public/showcase/**/*.{jpg,svg}')).map((k) => k.replace('../../public/', '')));
const fresh = async () => {
  const repo = new LocalStorageRepository(new MemoryStore());
  await repo.init();
  return repo;
};

describe('demo showcase identity', () => {
  it('every library entry is a valid asset whose file ships with the site', () => {
    for (const org of Object.values(DEMO_ORG_IDS)) {
      const list = showcaseAssets(org);
      expect(list.length).toBeGreaterThan(4);
      for (const a of list) {
        expect(AssetSchema.safeParse(a).success).toBe(true);
        expect(shipped.has(a.dataUrl)).toBe(true);
      }
    }
    expect(showcaseAssets('org_someone_real')).toEqual([]);
  });

  it('every demo form references only showcase images that exist, and they resolve to same-origin paths', async () => {
    const repo = await fresh();
    for (const slug of Object.values(DEMO_SLUGS)) {
      const pub = (await repo.resolvePublic(slug))!;
      const ids = referencedAssets(pub.version.design, pub.version.config);
      expect(ids.some(isShowcaseId)).toBe(true);
      const urls = await repo.getAssetUrls(pub.organization.id, ids);
      for (const id of ids) expect(urls[id]).toMatch(/^\/showcase\/[a-z-]+\/[a-z-]+\.(jpg|svg)$/);
      expect(pub.version.design.logo.assetId).toBeDefined();
    }
  });

  it('dresses demo workspaces only, idempotently, and showcase images cannot be deleted', async () => {
    const repo = await fresh();
    const demo = await repo.exportWorkspace(DEMO_ORG_IDS.bloom);
    expect(JSON.stringify(applyShowcase(structuredClone(demo)))).toBe(JSON.stringify(demo));
    const real = { ...structuredClone(demo), organization: { ...demo.organization, isDemo: false } } as OrgData;
    real.brandKit.logoAssetId = undefined;
    expect(applyShowcase(structuredClone(real)).brandKit.logoAssetId).toBeUndefined();
    await expect(repo.deleteAsset(DEMO_ORG_IDS.bloom, showcaseAssets(DEMO_ORG_IDS.bloom)[0]!.id)).rejects.toThrow();
  });

  it('links of the demo businesses carry realistic contact details', async () => {
    const repo = await fresh();
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.autocare);
    const waze = kit.links.find((l) => l.platform === 'waze');
    expect(waze?.description).toMatch(/רח׳/);
    expect(waze?.sample).toBe(true);
  });

  it('migration v7 -> v8 dresses demo versions and leaves runs and real workspaces alone', async () => {
    const repo = await fresh();
    const data = structuredClone(await repo.exportWorkspace(DEMO_ORG_IDS.urban)) as unknown as Record<string, unknown> & OrgData;
    (data as unknown as { schemaVersion: number }).schemaVersion = 7;
    for (const v of data.versions) delete v.design.logo.assetId;
    const runs = JSON.stringify(data.runs);
    const out = migrateOrgData(data).value as OrgData;
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(OrgDataSchema.safeParse(out).success).toBe(true);
    expect(out.versions.every((v) => v.design.logo.assetId && isShowcaseId(v.design.logo.assetId))).toBe(true);
    expect(JSON.stringify(out.runs)).toBe(runs);

    const real = structuredClone(data);
    real.organization.isDemo = false;
    const r = migrateOrgData(real).value as OrgData;
    expect(r.versions.every((v) => !v.design.logo.assetId)).toBe(true);
  });
});
