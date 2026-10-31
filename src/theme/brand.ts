/**
 * Brand kit → workflow theme. A workflow that inherits the brand takes the
 * workspace colors, type, button shape, density, logo and cover; its own
 * preset still decides layout, hero and component personality.
 * Publishing stores the RESOLVED theme, so later brand edits never reach
 * published versions.
 */
import type { BrandKit, WorkflowTheme } from '../domain/theme';
import { WorkflowThemeSchema } from '../domain/theme';
import { mix } from './color';
import { presenceOf } from '../engine/presence';
import { PRESETS } from './presets';

/**
 * Business links belong to the business, not to the colour scheme: a draft shows
 * the kit's current links whether or not it inherits the brand look. Only a
 * draft that already has presence settings, or a kit that has links, changes.
 */
function withKitLinks(design: WorkflowTheme, kit: BrandKit): WorkflowTheme {
  if (!design.presence && !kit.links.length) return design;
  const next = structuredClone(design);
  next.presence = { ...presenceOf(design.presence), links: structuredClone(kit.links) };
  return next;
}

export function effectiveTheme(design: WorkflowTheme, kit: BrandKit | null | undefined): WorkflowTheme {
  if (!kit) return design;
  if (design.inheritBrand !== true) return withKitLinks(design, kit);
  const next = withKitLinks(structuredClone(design), kit);
  next.palette = {
    ...next.palette,
    primary: kit.palette.primary,
    secondary: kit.palette.secondary,
    accent: kit.palette.accent,
    background: kit.palette.background,
    // Keep surfaces in the same family as the brand background.
    surfaceAlt: mix(kit.palette.background, kit.palette.primary, 0.06),
  };
  next.typography = kit.typography;
  next.components = { ...next.components, button: kit.button };
  next.density = kit.density;
  next.logo = { ...next.logo, assetId: kit.logoAssetId ?? next.logo.assetId, placement: kit.logoPlacement };
  next.hero = { ...next.hero, coverAssetId: next.hero.coverAssetId ?? kit.coverAssetId };
  if (!kit.decorations) next.decoration = 'none';
  return next;
}

/** Theme frozen into a published version: brand resolved, inheritance switched off. */
export function freezeTheme(design: WorkflowTheme, kit: BrandKit | null | undefined): WorkflowTheme {
  const resolved = effectiveTheme(design, kit);
  return WorkflowThemeSchema.parse({ ...structuredClone(resolved), inheritBrand: false });
}

/** Initial brand kit for a workspace, seeded from an existing workflow design. */
export function brandKitFromTheme(name: string, description: string, design: WorkflowTheme, at: string): BrandKit {
  return {
    displayName: name.slice(0, 60) || 'העסק שלי',
    description: description.slice(0, 240),
    logoAssetId: design.logo.assetId,
    coverAssetId: design.hero.coverAssetId,
    palette: {
      primary: design.palette.primary,
      secondary: design.palette.secondary,
      accent: design.palette.accent,
      background: design.palette.background,
    },
    typography: design.typography,
    button: design.components.button,
    density: design.density,
    logoPlacement: design.logo.placement ?? 'start',
    decorations: design.decoration !== 'none',
    personality: design.presetId,
    links: [],
    updatedAt: at,
  };
}

export function defaultBrandKit(name: string, at: string): BrandKit {
  return brandKitFromTheme(name, '', { ...PRESETS.modern_minimal.theme, source: 'auto' } as WorkflowTheme, at);
}
