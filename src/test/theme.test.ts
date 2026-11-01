import { beforeEach, describe, expect, it } from 'vitest';
import { migrateOrgData } from '../data/migrations';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { DomainRuleError } from '../data/repository';
import { buildSeed, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { OrgDataSchema, SCHEMA_VERSION, type WorkflowField } from '../domain/schema';
import { THEME_PRESET_IDS, WorkflowThemeSchema } from '../domain/theme';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { field, option } from '../engine/templates';
import { isoDay } from '../lib/format';
import { resolveAppearance } from '../renderer/appearance';
import { inferArt } from '../theme/art';
import { contrastRatio, ensureContrast } from '../theme/color';
import { buildTheme, CORE_PRESET_IDS, PRESET_CATEGORIES, PRESET_LIST, PRESETS } from '../theme/presets';
import { KeywordThemeResolver, themeResolver } from '../theme/resolver';
import { themeTokens } from '../theme/tokens';

class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  key = (i: number) => [...this.m.keys()][i] ?? null;
  get length() {
    return this.m.size;
  }
  keys() {
    return [...this.m.keys()];
  }
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
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

describe('theme resolver (local, deterministic)', () => {
  const r = new KeywordThemeResolver();
  it.each([
    ['חנות פרחים שרוצה הזמנות זרים', 'floral_boutique'],
    ['מוסך שרוצה אישור תיקונים ברכב', 'automotive_precision'],
    ['מסעדה שמקבלת בקשות לאירועים עם תפריט', 'hospitality_premium'],
    ['משרד רואה חשבון שאוסף מסמכים', 'corporate_modern'],
    ['סטודיו לצילום ועיצוב גרפי', 'creative_studio'],
    ['אני רוצה לקבל פניות', 'modern_minimal'],
  ])('%s → %s', (prompt, preset) => {
    expect(r.resolve({ prompt }).presetId).toBe(preset);
  });

  it('weights the source template and explains the choice in Hebrew', () => {
    const rec = r.resolve({ templateKey: 'garage_repairs', title: 'טופס' });
    expect(rec.presetId).toBe('automotive_precision');
    expect(rec.reason).toContain('סוג התהליך');
  });

  it('does not match short stems inside unrelated words', () => {
    // "ברכה" (greeting) must not trigger hospitality via a bare "בר" stem.
    expect(r.resolve({ prompt: 'זר עם ברכה' }).presetId).toBe('floral_boutique');
  });

  it('falls back to modern minimal with low confidence', () => {
    const rec = themeResolver.resolve({});
    expect(rec).toMatchObject({ presetId: 'modern_minimal', confidence: 'low' });
  });

  it('is exposed through the generator without changing the business config', () => {
    const gen = generateWorkflowFromPrompt('מסעדה שמקבלת אירועים פרטיים');
    expect(gen.theme.presetId).toBe('hospitality_premium');
    expect(gen.config).not.toHaveProperty('design');
  });
});

describe('presets and theme schema', () => {
  it('keeps the six core personalities structurally different', () => {
    const core = CORE_PRESET_IDS.map((id) => buildTheme(id));
    expect(new Set(core.map((t) => t.hero.layout)).size).toBe(6);
    expect(new Set(core.map((t) => t.typography)).size).toBe(6);
  });

  it('builds a large library of valid, structurally distinct designs', () => {
    const themes = THEME_PRESET_IDS.map((id) => buildTheme(id));
    expect(themes.length).toBeGreaterThanOrEqual(24);
    themes.forEach((t) => expect(WorkflowThemeSchema.safeParse(t).success, t.presetId).toBe(true));
    // No two designs share the same structure (composition, hero, type, option, button, decoration, radius)…
    const signature = (t: (typeof themes)[number]) => [t.composition, t.hero.layout, t.typography, t.components.option, t.components.button, t.decoration, t.radius].join('|');
    expect(new Set(themes.map(signature)).size).toBe(themes.length);
    // …or the same palette.
    expect(new Set(themes.map((t) => t.palette.primary + t.palette.background)).size).toBe(themes.length);
    expect(new Set(themes.map((t) => t.typography)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(themes.map((t) => t.decoration)).size).toBeGreaterThanOrEqual(12);
    // Every category offers a real choice, and every design is named and described.
    for (const c of PRESET_CATEGORIES) expect(PRESET_LIST.filter((p) => p.category === c.id).length, c.id).toBeGreaterThanOrEqual(2);
    for (const p of PRESET_LIST) {
      expect(p.experience.length).toBeGreaterThan(1);
      expect(p.description.length).toBeGreaterThan(30);
      expect(p.bestFor.length).toBeGreaterThan(5);
    }
    // Dark designs keep light text on dark surfaces.
    for (const id of ['luxury_noir', 'nightlife_neon'] as const) expect(contrastRatio(PRESETS[id].theme.palette.text, PRESETS[id].theme.palette.background)).toBeGreaterThanOrEqual(12);
  });

  it('rejects invalid colors, presets and remote image references', () => {
    const t = buildTheme('modern_minimal');
    expect(WorkflowThemeSchema.safeParse({ ...t, palette: { ...t.palette, primary: 'red' } }).success).toBe(false);
    expect(WorkflowThemeSchema.safeParse({ ...t, presetId: 'neon' }).success).toBe(false);
    expect(WorkflowThemeSchema.safeParse({ ...t, logo: { ...t.logo, assetId: 'https://example.com/logo.png' } }).success).toBe(false);
  });

  it('keeps button and link text readable for every preset', () => {
    for (const id of THEME_PRESET_IDS) {
      const style = themeTokens(buildTheme(id)).style as Record<string, string>;
      const p = PRESETS[id].theme.palette;
      expect(contrastRatio(style['--fz-on-primary']!, p.primary), id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(style['--fz-primary-ink']!, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(7);
    }
  });

  it('repairs low-contrast owner colors instead of rendering them unreadable', () => {
    const fixed = ensureContrast('#FFE08A', '#FFFFFF');
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    const t = buildTheme('modern_minimal');
    t.palette.primary = '#FFE08A';
    expect(themeTokens(t).warnings.length).toBeGreaterThan(0);
  });
});

describe('presentation inference', () => {
  const f = (over: Partial<WorkflowField>) => ({ ...field('x', 'שדה', 'radio'), ...over });
  it('picks rich controls from field data', () => {
    expect(resolveAppearance(f({ options: [option('a', 'א', { swatch: '#FF0000' })] }), true)).toBe('swatches');
    expect(resolveAppearance(f({ options: [option('a', 'בוקר'), option('b', 'ערב')] }), true)).toBe('chips');
    expect(resolveAppearance(f({ type: 'number', min: 10, max: 80 }), true)).toBe('stepper');
    expect(resolveAppearance(f({ type: 'textarea', label: 'ברכה לכרטיס' }), true)).toBe('card_preview');
    expect(resolveAppearance(f({ appearance: 'list', options: [option('a', 'בוקר')] }), true)).toBe('list');
  });

  it('infers bouquet sizes by rank and labels without changing data', () => {
    const budget = f({ label: 'תקציב לזר', key: 'budget', options: ['150', '250', '350', '500'].map((v) => option(v, `זר ${v}`, { price: Number(v) })) });
    expect(budget.options!.map((o, i) => inferArt(budget, o, i, 4))).toEqual(['bouquet_s', 'bouquet_m', 'bouquet_l', 'bouquet_xl']);
    expect(inferArt(f({ label: 'תוספות' }), option('cake', 'עוגה מעוצבת'))).toBe('cake');
  });
});

describe('storage migration v1 → v2', () => {
  const asV1 = (orgIndex: number) => {
    const data = structuredClone(buildSeed()[orgIndex]!) as unknown as Record<string, unknown> & { workflows: Record<string, unknown>[]; versions: Record<string, unknown>[] };
    data.schemaVersion = 1;
    data.workflows.forEach((w) => delete w.design);
    data.versions.forEach((v) => delete v.design);
    return data;
  };

  it('adds a design to every workflow and version without touching business data', () => {
    const v1 = asV1(1);
    const { value, migrated } = migrateOrgData(v1);
    expect(migrated).toBe(true);
    const parsed = OrgDataSchema.parse(value);
    expect(parsed.workflows.every((w) => w.design.presetId === 'automotive_precision')).toBe(true);
    expect(parsed.versions.every((v) => v.design)).toBe(true);
    expect(parsed.runs).toEqual(v1.runs);
  });

  it('leaves current and unknown payloads untouched', () => {
    const current = buildSeed()[0]!;
    expect(migrateOrgData(current).migrated).toBe(false);
    expect(migrateOrgData({ schemaVersion: 99 }).migrated).toBe(false);
    expect(migrateOrgData('garbage').migrated).toBe(false);
  });

  it('migrates real stored data in place, keeps a backup and preserves runs', async () => {
    const store = new MemoryStore();
    await new LocalStorageRepository(store).init();
    const key = `formzelo:v1:org:${DEMO_ORG_IDS.urban}`;
    const before = JSON.parse(store.getItem(key)!);
    const v1 = { ...before, schemaVersion: 1, workflows: before.workflows.map(({ design: _d, ...w }: Record<string, unknown>) => w), versions: before.versions.map(({ design: _d, ...v }: Record<string, unknown>) => v) };
    store.setItem(key, JSON.stringify(v1));
    store.setItem('formzelo:v1:meta', JSON.stringify({ ...JSON.parse(store.getItem('formzelo:v1:meta')!), schemaVersion: 1 }));

    const repo = new LocalStorageRepository(store);
    await repo.init(); // the app always initialises the repository on start-up
    const runs = await repo.listRuns(DEMO_ORG_IDS.urban);
    expect(runs).toHaveLength(before.runs.length);
    expect((await repo.listWorkflows(DEMO_ORG_IDS.urban))[0]!.design.presetId).toBe('hospitality_premium');
    expect(JSON.parse(store.getItem(key)!).schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.parse(store.getItem('formzelo:v1:meta')!).schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.keys().some((k) => k.startsWith(`formzelo:v1:pre-v${SCHEMA_VERSION}:org:org_urban`))).toBe(true);
    expect((await repo.storageReport()).warnings).toHaveLength(0);
  });
});

describe('design persistence and version immutability', () => {
  let store: MemoryStore;
  let repo: LocalStorageRepository;
  beforeEach(async () => {
    store = new MemoryStore();
    repo = new LocalStorageRepository(store);
    await repo.init();
  });

  it('seeds topic-appropriate designs for the three demo flows', async () => {
    expect((await repo.resolvePublic(DEMO_SLUGS.flowers))!.version.design.presetId).toBe('floral_boutique');
    expect((await repo.resolvePublic(DEMO_SLUGS.garage))!.version.design.presetId).toBe('automotive_precision');
    expect((await repo.resolvePublic(DEMO_SLUGS.events))!.version.design.presetId).toBe('hospitality_premium');
  });

  it('persists a draft design across repository instances without touching the published version', async () => {
    const pub = (await repo.resolvePublic(DEMO_SLUGS.flowers))!;
    const design = buildTheme('creative_studio', { source: 'manual' });
    await repo.saveDraft(DEMO_ORG_IDS.bloom, pub.workflow.id, pub.workflow.draft, design);
    const reopened = new LocalStorageRepository(store);
    expect((await reopened.getWorkflow(DEMO_ORG_IDS.bloom, pub.workflow.id))!.design).toEqual(design);
    expect((await reopened.resolvePublic(DEMO_SLUGS.flowers))!.version.design.presetId).toBe('floral_boutique');
  });

  it('freezes the design per version; old runs keep their original look', async () => {
    const pub = (await repo.resolvePublic(DEMO_SLUGS.flowers))!;
    const oldRun = await repo.submitRun(DEMO_SLUGS.flowers, { values: flowerValues, consent: true });
    const design = buildTheme('modern_minimal', { source: 'manual' });
    design.palette.primary = '#123456';
    await repo.saveDraft(DEMO_ORG_IDS.bloom, pub.workflow.id, pub.workflow.draft, design);
    const v2 = await repo.publishWorkflow(DEMO_ORG_IDS.bloom, pub.workflow.id);

    expect(v2.design.palette.primary).toBe('#123456');
    expect((await repo.getVersion(DEMO_ORG_IDS.bloom, pub.version.id))!.design).toEqual(pub.version.design);
    const bound = await repo.getPublicRun(DEMO_SLUGS.flowers, oldRun.id);
    expect(bound!.version.design.presetId).toBe('floral_boutique');
    expect(oldRun.total).toBe(400);

    // Editing the draft again never reaches the published snapshot.
    design.palette.primary = '#654321';
    await repo.saveDraft(DEMO_ORG_IDS.bloom, pub.workflow.id, pub.workflow.draft, design);
    expect((await repo.getVersion(DEMO_ORG_IDS.bloom, v2.id))!.design.palette.primary).toBe('#123456');

    const restored = await repo.restoreVersionToDraft(DEMO_ORG_IDS.bloom, pub.workflow.id, pub.version.id);
    expect(restored.design.presetId).toBe('floral_boutique');
  });

  it('enforces local asset limits and reference integrity', async () => {
    const wf = (await repo.listWorkflows(DEMO_ORG_IDS.bloom)).find((w) => w.slug === DEMO_SLUGS.flowers)!;
    const huge = `data:image/png;base64,${'A'.repeat(200 * 1024)}`;
    await expect(repo.saveAsset(DEMO_ORG_IDS.bloom, { kind: 'logo', name: 'big.png', mime: 'image/png', dataUrl: huge, width: 10, height: 10 })).rejects.toBeInstanceOf(DomainRuleError);

    const design = structuredClone(wf.design);
    design.logo.assetId = 'ast_missing';
    await expect(repo.saveDraft(DEMO_ORG_IDS.bloom, wf.id, wf.draft, design)).rejects.toBeInstanceOf(DomainRuleError);

    const logo = await repo.saveAsset(DEMO_ORG_IDS.bloom, { kind: 'logo', name: 'logo.png', mime: 'image/png', dataUrl: TINY_PNG, width: 1, height: 1 });
    design.logo.assetId = logo.id;
    await repo.saveDraft(DEMO_ORG_IDS.bloom, wf.id, wf.draft, design);
    await repo.publishWorkflow(DEMO_ORG_IDS.bloom, wf.id);
    await expect(repo.deleteAsset(DEMO_ORG_IDS.bloom, logo.id)).rejects.toBeInstanceOf(DomainRuleError);
    expect(await repo.getAssetUrls(DEMO_ORG_IDS.bloom, [logo.id])).toEqual({ [logo.id]: TINY_PNG });
    // Assets are workspace-scoped.
    expect(await repo.getAssetUrls(DEMO_ORG_IDS.autocare, [logo.id])).toEqual({});
  });

  it('ignores corrupt asset entries so the renderer can fall back to illustrations', async () => {
    store.setItem(`formzelo:v1:assets:${DEMO_ORG_IDS.bloom}`, JSON.stringify({ assets: [{ id: 'ast_x', dataUrl: 'javascript:alert(1)' }] }));
    expect(await repo.getAssetUrls(DEMO_ORG_IDS.bloom, ['ast_x'])).toEqual({});
    expect((await repo.listAssets(DEMO_ORG_IDS.bloom)).filter((a) => !a.id.startsWith('ast_sh'))).toEqual([]);
  });
});
