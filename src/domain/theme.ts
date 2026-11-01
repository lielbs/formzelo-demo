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
  // Design library (additive — every stored design keeps its id).
  'spa_serenity',
  'beauty_glam',
  'bakery_sweet',
  'cafe_bistro',
  'celebration_party',
  'wedding_elegance',
  'legal_trust',
  'finance_clarity',
  'tech_startup',
  'medical_care',
  'fitness_energy',
  'kids_play',
  'academy_learn',
  'home_services',
  'eco_nature',
  'luxury_noir',
  'nightlife_neon',
  'travel_coastal',
  'pets_friendly',
  'community_warm',
] as const;
export const ILLUSTRATION_SPOTS = ['hero', 'options', 'blocks'] as const;

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

export const TYPOGRAPHY_PRESETS = ['editorial', 'technical', 'warm', 'corporate', 'display', 'neutral', 'classic', 'friendly', 'handwritten', 'impact', 'clean'] as const;
export const HERO_LAYOUTS = ['split', 'banner', 'immersive', 'compact', 'poster', 'centered', 'none'] as const;
export const COMPOSITIONS = ['centered', 'editorial_split', 'product_grid', 'decision', 'booking', 'document'] as const;
export const DECORATIONS = ['organic', 'technical', 'atmospheric', 'structured', 'expressive', 'minimal', 'geometric', 'waves', 'arches', 'celebration', 'botanical', 'constellation', 'none'] as const;
export const CARD_VARIANTS = ['soft', 'outlined', 'elevated', 'bold', 'flat'] as const;
export const INPUT_VARIANTS = ['outlined', 'filled', 'underline'] as const;
export const OPTION_VARIANTS = ['tile', 'row', 'chip', 'bold'] as const;
export const BUTTON_VARIANTS = ['pill', 'solid', 'sharp', 'brutal'] as const;
export const RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export const SHADOWS = ['none', 'soft', 'medium', 'hard'] as const;
export const DENSITIES = ['compact', 'comfortable', 'airy'] as const;
export const PROGRESS_STYLES = ['bar', 'steps', 'dots', 'numbered'] as const;
export const MOTION_LEVELS = ['none', 'subtle', 'expressive'] as const;
/**
 * How the customer moves through the form — the page architecture, not just its colours.
 * card: the whole step in one floating card · focus: one question at a time, large type ·
 * editorial: an open magazine page with chapter numbers and rules · console: a side rail of steps
 * with a working grid of fields · playful: outlined cards, hard shadows and stickers.
 */
export const FLOWS = ['card', 'focus', 'editorial', 'console', 'playful'] as const;
/** Background textures drawn from the palette (no images, no user input inside the SVG). */
export const PATTERNS = ['none', 'dots', 'grid', 'waves', 'confetti', 'stripes', 'diamonds'] as const;
/** Same set as the highlight icons in schema.ts (kept here to avoid a circular import). */
export const PROMISE_ICONS = ['sparkles', 'truck', 'leaf', 'shield', 'clock', 'heart', 'star', 'check', 'wrench', 'chef', 'calendar', 'phone'] as const;

export const ThemeAssetRefSchema = z.string().regex(/^ast_[a-z0-9]+$/);

/** Owner text. Not trimmed or required here (the studio stores it as typed); empty renders nothing. */
const line = (max: number) => z.string().max(max);

/**
 * The business's own touches on top of a design: an announcement strip, a sticker on the
 * opening, a note from the owner, short promises, a background texture and a personal sign-off
 * on the confirmation. All plain text (rendered as text nodes), all optional.
 */
export const ThemeExtrasSchema = z.object({
  ribbon: line(90).optional(),
  badge: line(24).optional(),
  welcome: z
    .object({
      name: line(40),
      role: z.string().max(50).optional(),
      message: line(240),
      photoAssetId: ThemeAssetRefSchema.optional(),
    })
    .optional(),
  promises: z.array(z.object({ icon: z.enum(PROMISE_ICONS), text: line(40) })).max(4).optional(),
  pattern: z.enum(PATTERNS).optional(),
  signoff: z.object({ message: line(200), name: line(50) }).optional(),
});
export type ThemeExtras = z.infer<typeof ThemeExtrasSchema>;

// ---------- the business's own images ----------

/**
 * How the business's photo (hero.coverAssetId) sits in the design.
 * backdrop: behind the opening, under a scrim · panel: half of the opening · frame: a shaped
 * picture on the opening · band: a wide strip under the title · page: soft ambience behind the page.
 */
export const COVER_STYLES = ['backdrop', 'panel', 'frame', 'band', 'page'] as const;
export const FRAME_SHAPES = ['rounded', 'arch', 'circle', 'organic'] as const;
/** Colour treatment so any photo belongs to the palette. Product photos (options) stay natural. */
export const PHOTO_TONES = ['natural', 'brand', 'mono', 'warm', 'soft'] as const;
export const GALLERY_STYLES = ['strip', 'mosaic', 'polaroid', 'stack'] as const;
export const GALLERY_PLACEMENTS = ['hero', 'intro', 'completion'] as const;
export const LOGO_STYLES = ['plain', 'badge', 'seal', 'wordmark'] as const;

export const MediaSettingsSchema = z.object({
  coverStyle: z.enum(COVER_STYLES).optional(),
  frame: z.enum(FRAME_SHAPES).optional(),
  tone: z.enum(PHOTO_TONES).optional(),
  /** The business's photos: its place, dishes, haircuts, work. Local workspace assets only. */
  gallery: z.array(ThemeAssetRefSchema).max(6).optional(),
  galleryTitle: z.string().max(40).optional(),
  galleryStyle: z.enum(GALLERY_STYLES).optional(),
  galleryPlacement: z.enum(GALLERY_PLACEMENTS).optional(),
  logoStyle: z.enum(LOGO_STYLES).optional(),
});
export type MediaSettings = z.infer<typeof MediaSettingsSchema>;

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
  /**
   * Illustrated style: drawn artwork in the opening and on options. Absent = off — the default is
   * the typographic standard (type, colour and the business's own photos, no clip-art).
   */
  illustrations: z.boolean().optional(),
  /** Where the illustrated style draws (absent = everywhere): the opening, option cards, image blocks. */
  illustrationSpots: z.array(z.enum(ILLUSTRATION_SPOTS)).max(3).optional(),
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
  /** Fill experience. Absent on older versions = 'card' (unchanged look). */
  flow: z.enum(FLOWS).optional(),
  /** The business's own touches (announcement, sticker, owner note, promises, texture, sign-off). */
  extras: ThemeExtrasSchema.optional(),
  /** How the business's photos and logo sit in the design. Absent = photo behind the opening, plain logo. */
  media: MediaSettingsSchema.optional(),
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
  mime: z.enum(['image/webp', 'image/jpeg', 'image/png', 'image/svg+xml']),
  /**
   * Downscaled data URL produced in the browser, or — for the demo businesses' showcase library
   * (data/showcase.ts, never stored) — a site-relative path under showcase/.
   */
  dataUrl: z.union([z.string().regex(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/), z.string().regex(/^showcase\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|svg)$/)]),
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
