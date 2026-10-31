/**
 * Workflow design (theme) schema. Design is stored next to — never inside —
 * the business WorkflowConfig: Workflow.design is the editable draft and
 * WorkflowVersion.design is frozen at publish time together with the config.
 *
 * Everything here is plain data interpreted by the renderer through CSS
 * custom properties and data attributes. Nothing is ever eval'd.
 */
import { z } from 'zod';

export const THEME_PRESET_IDS = [
  'floral_boutique',
  'automotive_precision',
  'hospitality_premium',
  'corporate_modern',
  'creative_studio',
  'modern_minimal',
] as const;
export const ThemePresetIdSchema = z.enum(THEME_PRESET_IDS);
export type ThemePresetId = z.infer<typeof ThemePresetIdSchema>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'צבע חייב להיות בפורמט #RRGGBB');

export const ThemePaletteSchema = z.object({
  primary: hex,
  secondary: hex,
  accent: hex,
  /** Page background behind the cards. */
  background: hex,
  /** Cards and inputs. */
  surface: hex,
  /** Subtle panels, summaries and selected rows. */
  surfaceAlt: hex,
  text: hex,
  muted: hex,
});
export type ThemePalette = z.infer<typeof ThemePaletteSchema>;

export const TYPOGRAPHY_PRESETS = ['editorial', 'technical', 'warm', 'corporate', 'display', 'neutral'] as const;
export const HERO_LAYOUTS = ['split', 'banner', 'immersive', 'compact', 'poster', 'centered', 'none'] as const;
export const COMPOSITIONS = ['centered', 'editorial_split', 'product_grid', 'decision'] as const;
export const DECORATIONS = ['organic', 'technical', 'atmospheric', 'structured', 'expressive', 'minimal', 'none'] as const;
export const CARD_VARIANTS = ['soft', 'outlined', 'elevated', 'bold', 'flat'] as const;
export const INPUT_VARIANTS = ['outlined', 'filled', 'underline'] as const;
export const OPTION_VARIANTS = ['tile', 'row', 'chip', 'bold'] as const;
export const BUTTON_VARIANTS = ['pill', 'solid', 'sharp', 'brutal'] as const;
export const RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export const SHADOWS = ['none', 'soft', 'medium', 'hard'] as const;
export const DENSITIES = ['compact', 'comfortable', 'airy'] as const;
export const PROGRESS_STYLES = ['bar', 'steps', 'dots', 'numbered'] as const;
export const MOTION_LEVELS = ['none', 'subtle', 'expressive'] as const;

export const ThemeAssetRefSchema = z.string().regex(/^ast_[a-z0-9]+$/);

export const WorkflowThemeSchema = z.object({
  /** Bumped only if the theme shape changes; lets old frozen versions be read safely. */
  themeVersion: z.literal(1),
  presetId: ThemePresetIdSchema,
  /** auto = chosen by the local resolver; manual = the owner picked or edited it. */
  source: z.enum(['auto', 'manual']),
  palette: ThemePaletteSchema,
  typography: z.enum(TYPOGRAPHY_PRESETS),
  hero: z.object({
    layout: z.enum(HERO_LAYOUTS),
    /** Short line above the title, e.g. the business tagline. Optional. */
    eyebrow: z.string().max(60).optional(),
    /** Local cover image (asset id in the workspace asset store). Never a remote URL. */
    coverAssetId: ThemeAssetRefSchema.optional(),
  }),
  composition: z.enum(COMPOSITIONS),
  decoration: z.enum(DECORATIONS),
  components: z.object({
    card: z.enum(CARD_VARIANTS),
    input: z.enum(INPUT_VARIANTS),
    option: z.enum(OPTION_VARIANTS),
    button: z.enum(BUTTON_VARIANTS),
  }),
  radius: z.enum(RADII),
  shadow: z.enum(SHADOWS),
  density: z.enum(DENSITIES),
  progress: z.enum(PROGRESS_STYLES),
  motion: z.enum(MOTION_LEVELS),
  /** Infer local illustrations for options (bouquet, plate, cake…) when a field has none. */
  optionArt: z.boolean(),
  mobile: z.object({
    /** Shrink the hero to a compact header on narrow screens. */
    compactHero: z.boolean(),
    /** Sticky running total at the bottom on narrow screens (otherwise inline). */
    stickySummary: z.boolean(),
  }),
  logo: z.object({
    assetId: ThemeAssetRefSchema.optional(),
    /** Show the business name next to (or instead of) the logo image. */
    showName: z.boolean(),
  }),
});
export type WorkflowTheme = z.infer<typeof WorkflowThemeSchema>;

/** Uploaded local image. Stored in its own localStorage key per workspace, never inside versions. */
export const AssetSchema = z.object({
  id: ThemeAssetRefSchema,
  orgId: z.string().min(1),
  kind: z.enum(['logo', 'cover']),
  name: z.string().max(120),
  mime: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  /** Downscaled data URL produced in the browser. */
  dataUrl: z.string().regex(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string().min(1),
});
export type Asset = z.infer<typeof AssetSchema>;

/** Hard limits that keep demo assets from exhausting the ~5 MB localStorage quota. */
export const ASSET_LIMITS = {
  logo: { maxEdge: 320, maxBytes: 80 * 1024 },
  cover: { maxEdge: 1400, maxBytes: 320 * 1024 },
  /** Total per workspace. */
  totalBytes: 1.2 * 1024 * 1024,
  /** Original file size accepted before downscaling. */
  maxUploadBytes: 12 * 1024 * 1024,
} as const;
