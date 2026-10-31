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
export const COMPOSITIONS = ['centered', 'editorial_split', 'product_grid', 'decision', 'booking', 'document'] as const;
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

// ---------- Business Engagement Kit (digital presence links) ----------

export const PRESENCE_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'waze', 'google_maps', 'google_review', 'website', 'youtube', 'linkedin', 'phone', 'email', 'custom'] as const;
export const PRESENCE_ICONS = ['link', 'globe', 'calendar', 'bag', 'star', 'phone', 'mail', 'pin', 'chat', 'music'] as const;

/** One business link, configured once in the workspace Brand Kit. Values are re-validated whenever rendered. */
export const PresenceLinkSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(PRESENCE_PLATFORMS),
  value: z.string().max(500),
  /** Custom label (custom links; optional override otherwise). Plain text only. */
  label: z.string().max(40).optional(),
  description: z.string().max(80).optional(),
  /** Icon for custom links. */
  icon: z.enum(PRESENCE_ICONS).optional(),
  enabled: z.boolean(),
  /** Demo placeholder for a fictional business: rendered as a labelled, non-clickable preview. */
  sample: z.boolean().optional(),
});
export type PresenceLink = z.infer<typeof PresenceLinkSchema>;

/** Per-workflow presentation of the links (draft design → frozen at publish). */
export const PresenceSettingsSchema = z.object({
  visibility: z.enum(['all', 'selected', 'hidden']),
  /** Link ids shown when visibility = selected. */
  selected: z.array(z.string()).max(20),
  placement: z.enum(['header', 'footer', 'completion', 'header_completion', 'footer_completion', 'all']),
  style: z.enum(['icons', 'icon_label', 'cards', 'compact']),
  /** Neutral "share your experience on Google" request — only after a completed service. */
  reviewCta: z.boolean(),
  /**
   * Links resolved from the Brand Kit. Drafts get them live (effectiveTheme); a
   * published version keeps the snapshot taken at publish time.
   */
  links: z.array(PresenceLinkSchema).max(20).optional(),
});
export type PresenceSettings = z.infer<typeof PresenceSettingsSchema>;

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
    /** Where the identity row sits in the hero. */
    placement: z.enum(['start', 'center', 'hidden']).optional(),
  }),
  /**
   * Draft only: take colors, type, button shape, density, logo and cover from the
   * workspace brand kit. Published versions store the resolved theme with this off.
   */
  inheritBrand: z.boolean().optional(),
  /** Business links: where / how they appear. Absent on older versions = no links (unchanged look). */
  presence: PresenceSettingsSchema.optional(),
});
export type WorkflowTheme = z.infer<typeof WorkflowThemeSchema>;

/** Workspace-level visual identity; workflows inherit it unless they override. */
export const BrandKitSchema = z.object({
  displayName: z.string().min(1).max(60),
  description: z.string().max(240).default(''),
  logoAssetId: ThemeAssetRefSchema.optional(),
  secondaryLogoAssetId: ThemeAssetRefSchema.optional(),
  coverAssetId: ThemeAssetRefSchema.optional(),
  palette: z.object({ primary: hex, secondary: hex, accent: hex, background: hex }),
  typography: z.enum(TYPOGRAPHY_PRESETS),
  button: z.enum(BUTTON_VARIANTS),
  density: z.enum(DENSITIES),
  logoPlacement: z.enum(['start', 'center', 'hidden']),
  /** Decorative artwork in heroes (off = clean, image-free look). */
  decorations: z.boolean(),
  /** Default design personality for new workflows. */
  personality: ThemePresetIdSchema,
  /** Digital presence: social, navigation, contact, reviews and custom links (ordered). */
  links: z.array(PresenceLinkSchema).max(20).default([]),
  updatedAt: z.string().min(1),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;

/** Uploaded local image. Stored in its own localStorage key per workspace, never inside versions. */
export const AssetSchema = z.object({
  id: ThemeAssetRefSchema,
  orgId: z.string().min(1),
  kind: z.enum(['logo', 'cover', 'image']),
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
  /** Content images (image / gallery blocks, image option cards). */
  image: { maxEdge: 900, maxBytes: 160 * 1024 },
  /** Total per workspace. */
  totalBytes: 1.2 * 1024 * 1024,
  /** Original file size accepted before downscaling. */
  maxUploadBytes: 12 * 1024 * 1024,
} as const;
