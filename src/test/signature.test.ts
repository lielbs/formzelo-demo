import { describe, expect, it } from 'vitest';
import signatureCss from '../theme/signature.css?raw';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { migrateOrgData } from '../data/migrations';
import { DEMO_EXTRAS } from '../data/demoExtras';
import { DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { SCHEMA_VERSION, type WorkflowField } from '../domain/schema';
import { FLOWS, PATTERNS, THEME_PRESET_IDS, ThemeExtrasSchema, WorkflowThemeSchema, type WorkflowTheme } from '../domain/theme';
import { focusPosition, focusScreens } from '../engine/focus';
import { buildTheme, PRESETS, SIGNATURES } from '../theme/presets';
import { patternImage, themeTokens } from '../theme/tokens';

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
const fresh = async () => {
  const repo = new LocalStorageRepository(new MemoryStore());
  await repo.init();
  return repo;
};
const f = (key: string, type: WorkflowField['type']): WorkflowField => ({ id: `fld_${key}`, key, label: key, type, required: false }) as WorkflowField;

describe('fill experiences', () => {
  it('a design saved before experiences existed still parses and renders as the classic card', () => {
    const old = structuredClone(buildTheme('floral_boutique')) as Partial<WorkflowTheme>;
    delete old.flow;
    delete old.extras;
    const parsed = WorkflowThemeSchema.parse(old);
    expect(parsed.flow).toBeUndefined();
    expect(themeTokens(parsed).attrs['data-flow']).toBe('card');
    expect(themeTokens(parsed).attrs['data-pattern']).toBe('none');
  });

  it('every design has an experience, and the library spans all five families', () => {
    for (const id of THEME_PRESET_IDS) expect(FLOWS).toContain(PRESETS[id].theme.flow);
    const counts = Object.fromEntries(FLOWS.map((fl) => [fl, THEME_PRESET_IDS.filter((id) => SIGNATURES[id].flow === fl).length]));
    for (const fl of FLOWS.filter((x) => x !== 'card')) expect(counts[fl], fl).toBeGreaterThanOrEqual(5);
  });

  it('switching style keeps the business add-ons and links; the texture follows the new style', () => {
    const before = buildTheme('automotive_precision');
    before.extras = { ...before.extras, ribbon: 'פתוח עד 18:00', promises: [{ icon: 'wrench', text: 'רק מה שאישרתם' }] };
    before.presence = { visibility: 'all', selected: [], placement: 'completion', style: 'cards', reviewCta: true };
    const after = buildTheme('kids_play', { keep: { hero: before.hero, logo: before.logo, extras: before.extras, presence: before.presence } });
    expect(after.extras?.ribbon).toBe('פתוח עד 18:00');
    expect(after.extras?.promises?.[0]?.text).toBe('רק מה שאישרתם');
    expect(after.extras?.pattern).toBe('confetti');
    expect(after.presence?.reviewCta).toBe(true);
    expect(after.flow).toBe('playful');
  });
});

describe('focus screens', () => {
  it('gives each question its own screen and keeps presentation blocks with the next question', () => {
    const screens = focusScreens([f('intro', 'info'), f('name', 'text'), f('pic', 'image'), f('style', 'radio'), f('phone', 'phone'), f('note', 'terms')]);
    expect(screens.map((s) => s.map((x) => x.key))).toEqual([['intro', 'name'], ['pic', 'style'], ['phone', 'note']]);
  });

  it('a step of presentation only is one screen, and an empty step still has one', () => {
    expect(focusScreens([f('a', 'heading'), f('b', 'highlights')]).length).toBe(1);
    expect(focusScreens([])).toEqual([[]]);
  });

  it('counts questions across steps', () => {
    expect(focusPosition([2, 3, 1], 0, 0)).toEqual({ n: 1, total: 6 });
    expect(focusPosition([2, 3, 1], 1, 2)).toEqual({ n: 5, total: 6 });
    expect(focusPosition([2, 3, 1], 2, 9)).toEqual({ n: 6, total: 6 });
  });
});

describe('business add-ons', () => {
  it('limits owner text and the number of promises', () => {
    expect(ThemeExtrasSchema.safeParse({ ribbon: 'א'.repeat(91) }).success).toBe(false);
    expect(ThemeExtrasSchema.safeParse({ badge: 'א'.repeat(25) }).success).toBe(false);
    expect(ThemeExtrasSchema.safeParse({ promises: Array.from({ length: 5 }, () => ({ icon: 'star', text: 'x' })) }).success).toBe(false);
    expect(ThemeExtrasSchema.safeParse({ welcome: { name: 'נועה', message: 'שלום', photoAssetId: 'https://evil.example/x.png' } }).success).toBe(false);
    // Half-typed text is allowed while editing; the renderer shows nothing for it.
    expect(ThemeExtrasSchema.safeParse({ welcome: { name: '', message: '' } }).success).toBe(true);
  });

  it('textures are built only from palette colours', () => {
    const t = buildTheme('modern_minimal');
    expect(patternImage(t)).toBeUndefined();
    for (const p of PATTERNS.filter((x) => x !== 'none')) {
      const url = patternImage({ ...t, extras: { pattern: p } })!;
      expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
      const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
      const colours = svg.match(/#[0-9A-Fa-f]{6}/g) ?? [];
      expect(colours.length).toBeGreaterThan(0);
      expect(svg).not.toMatch(/<script|on\w+=|href/i);
    }
  });

  it('fresh demo workspaces show each business its own add-ons and experience', async () => {
    const repo = await fresh();
    const garage = (await repo.resolvePublic(DEMO_SLUGS.garage))!.version.design;
    expect(garage.flow).toBe('console');
    expect(garage.extras?.badge).toBe(DEMO_EXTRAS[DEMO_SLUGS.garage]!.badge);
    const flowers = (await repo.resolvePublic(DEMO_SLUGS.flowers))!.version.design;
    expect(flowers.flow).toBe('editorial');
    expect(flowers.extras?.welcome?.name).toBe('נועה');
  });
});

describe('migration v5 -> v6', () => {
  it('upgrades demo designs (draft and published) and leaves business data alone', async () => {
    const repo = await fresh();
    const data = structuredClone(await repo.exportWorkspace(DEMO_ORG_IDS.autocare)) as unknown as {
      schemaVersion: number;
      workflows: { design: Partial<WorkflowTheme>; draft: unknown; slug: string }[];
      versions: { design: Partial<WorkflowTheme>; config: unknown }[];
      runs: unknown[];
    };
    data.schemaVersion = 5;
    for (const d of [...data.workflows.map((w) => w.design), ...data.versions.map((v) => v.design)]) {
      delete d.flow;
      delete d.extras;
    }
    const business = JSON.stringify({ drafts: data.workflows.map((w) => w.draft), configs: data.versions.map((v) => v.config), runs: data.runs });
    const { value } = migrateOrgData(data);
    const v = value as typeof data;
    expect(v.schemaVersion).toBe(SCHEMA_VERSION);
    const garage = v.workflows.find((w) => w.slug === DEMO_SLUGS.garage)!;
    expect(garage.design.flow).toBe('console');
    expect(garage.design.extras?.ribbon).toBeTruthy();
    expect(v.versions.every((ver) => ver.design.flow)).toBe(true);
    expect(JSON.stringify({ drafts: v.workflows.map((w) => w.draft), configs: v.versions.map((x) => x.config), runs: v.runs })).toBe(business);
  });

  it('real workspaces keep their exact look: only the version moves', async () => {
    const repo = await fresh();
    const data = structuredClone(await repo.exportWorkspace(DEMO_ORG_IDS.bloom)) as unknown as { schemaVersion: number; organization: { isDemo: boolean }; workflows: { design: Partial<WorkflowTheme> }[] };
    data.schemaVersion = 5;
    data.organization.isDemo = false;
    for (const w of data.workflows) {
      delete w.design.flow;
      delete w.design.extras;
    }
    const before = JSON.stringify(data.workflows);
    const { value } = migrateOrgData(data);
    expect(JSON.stringify((value as typeof data).workflows)).toBe(before);
  });
});

describe('signature motion', () => {
  it('animates only inside the reduced-motion guard, and only transform and opacity', () => {
    const guard = '@media (prefers-reduced-motion: no-preference) {';
    const at = signatureCss.indexOf(guard);
    expect(at).toBeGreaterThan(0);
    for (const line of signatureCss.slice(0, at).split('\n').filter((l) => /^\s*animation(-name)?\s*:/.test(l))) expect(line).toMatch(/animation:\s*none/);
    for (const rule of signatureCss.slice(at).match(/\.fz[^{]*\{[^}]*animation/g) ?? []) expect(rule).toContain(":not([data-motion='none'])");
    const frames = signatureCss.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? [];
    expect(frames.length).toBeGreaterThanOrEqual(4);
    for (const fr of frames) for (const [, p] of fr.matchAll(/^\s+([a-z-]+):/gm)) expect(['transform', 'opacity']).toContain(p);
  });
});
