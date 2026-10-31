/**
 * Art-directed presets: the six core personalities below plus the design
 * library (theme/presetLibrary.ts). They differ in composition, hero,
 * typography, component shapes, density and motion — not only in color.
 */
import { THEME_PRESET_IDS, WorkflowThemeSchema, type ThemePresetId, type WorkflowTheme } from '../domain/theme';
import { LIBRARY_PRESETS, type PresetEntry, type PresetMeta, type PresetTheme } from './presetLibrary';

export type { PresetCategory, PresetMeta } from './presetLibrary';
export { PRESET_CATEGORIES } from './presetLibrary';

const base = { themeVersion: 1 as const, optionArt: true, logo: { showName: true }, hero: {} };

const CORE: Record<string, { meta: Omit<PresetMeta, 'experience' | 'category'>; theme: PresetTheme }> = {
  floral_boutique: {
    meta: {
      id: 'floral_boutique',
      name: 'Floral Boutique',
      nameHe: 'בוטיק פרחים',
      description: 'סומק, שנהב ומרווה. טיפוגרפיה עריכתית, צורות אורגניות ותצוגת כרטיס ברכה.',
      bestFor: 'פרחים, מתנות, אירועים קטנים, יופי',
      sample: { eyebrow: 'סטודיו פרחים', title: 'זר שנבחר בשבילך', option: 'זר שופע', cta: 'להמשך' },
    },
    theme: {
      ...base,
      presetId: 'floral_boutique',
      palette: {
        primary: '#A8436A',
        secondary: '#7F9A80',
        accent: '#E8B4A6',
        background: '#FAF5F0',
        surface: '#FFFDFB',
        surfaceAlt: '#F5E8E3',
        text: '#3A2930',
        muted: '#76636A',
      },
      typography: 'editorial',
      hero: { layout: 'split' },
      composition: 'editorial_split',
      decoration: 'organic',
      components: { card: 'soft', input: 'underline', option: 'tile', button: 'pill' },
      radius: 'xl',
      shadow: 'soft',
      density: 'airy',
      progress: 'dots',
      motion: 'subtle',
      mobile: { compactHero: false, stickySummary: true },
    },
  },
  automotive_precision: {
    meta: {
      id: 'automotive_precision',
      name: 'Automotive Precision',
      nameHe: 'דיוק טכני',
      description: 'פחם וגרפיט עם כתום מאופק. היררכיה חדה, כרטיסי אבחון ומצבי אישור/דחייה ברורים.',
      bestFor: 'מוסכים, טכנאים, תיקונים, אישורי עבודה',
      sample: { eyebrow: 'מוסך מורשה', title: 'אישור תיקונים', option: 'רפידות בלם', cta: 'אישור' },
    },
    theme: {
      ...base,
      presetId: 'automotive_precision',
      palette: {
        primary: '#262B32',
        secondary: '#59636E',
        accent: '#E2672A',
        background: '#ECEEF1',
        surface: '#FFFFFF',
        surfaceAlt: '#F4F5F7',
        text: '#14171B',
        muted: '#56606B',
      },
      typography: 'technical',
      hero: { layout: 'banner' },
      composition: 'decision',
      decoration: 'technical',
      components: { card: 'outlined', input: 'outlined', option: 'row', button: 'sharp' },
      radius: 'sm',
      shadow: 'none',
      density: 'compact',
      progress: 'numbered',
      motion: 'subtle',
      mobile: { compactHero: true, stickySummary: true },
    },
  },
  hospitality_premium: {
    meta: {
      id: 'hospitality_premium',
      name: 'Hospitality Premium',
      nameHe: 'אירוח פרימיום',
      description: 'אספרסו, שמנת וטרקוטה. פתיח אווירתי, תפריטים ותוספות כגלריה עשירה והערכת מחיר צמודה.',
      bestFor: 'מסעדות, אירועים, קייטרינג, בתי מלון',
      sample: { eyebrow: 'מטבח עונתי', title: 'ערב פרטי אצלנו', option: 'תפריט שף', cta: 'בקשת הצעה' },
    },
    theme: {
      ...base,
      presetId: 'hospitality_premium',
      palette: {
        primary: '#A9502F',
        secondary: '#3F2A21',
        accent: '#D3A15A',
        background: '#F5EEE4',
        surface: '#FFFBF6',
        surfaceAlt: '#EEE2D2',
        text: '#2A1C15',
        muted: '#6C584A',
      },
      typography: 'warm',
      hero: { layout: 'immersive' },
      composition: 'product_grid',
      decoration: 'atmospheric',
      components: { card: 'elevated', input: 'filled', option: 'tile', button: 'solid' },
      radius: 'lg',
      shadow: 'medium',
      density: 'comfortable',
      progress: 'steps',
      motion: 'subtle',
      mobile: { compactHero: false, stickySummary: true },
    },
  },
  corporate_modern: {
    meta: {
      id: 'corporate_modern',
      name: 'Corporate Modern',
      nameHe: 'משרדי מודרני',
      description: 'לבן, נייבי וצפחה. מקטעים מסודרים, רשימת שלבים ברורה ותחושת אמון לאיסוף מסמכים ואישורים.',
      bestFor: 'משרדים, רואי חשבון, עורכי דין, ביטוח, קליטת לקוחות',
      sample: { eyebrow: 'קליטת לקוח', title: 'המסמכים שנדרשים', option: 'עצמאי/ת', cta: 'המשך' },
    },
    theme: {
      ...base,
      presetId: 'corporate_modern',
      palette: {
        primary: '#1D3A66',
        secondary: '#475569',
        accent: '#2B6CB0',
        background: '#F2F4F7',
        surface: '#FFFFFF',
        surfaceAlt: '#F1F4F8',
        text: '#0F1B2D',
        muted: '#4F5D72',
      },
      typography: 'corporate',
      hero: { layout: 'compact' },
      composition: 'centered',
      decoration: 'structured',
      components: { card: 'outlined', input: 'outlined', option: 'row', button: 'solid' },
      radius: 'md',
      shadow: 'soft',
      density: 'comfortable',
      progress: 'steps',
      motion: 'subtle',
      mobile: { compactHero: true, stickySummary: true },
    },
  },
  creative_studio: {
    meta: {
      id: 'creative_studio',
      name: 'Creative Studio',
      nameHe: 'סטודיו יצירתי',
      description: 'פריסה עריכתית נועזת, טיפוגרפיה גדולה, כרטיסי בחירה בניגודיות גבוהה ותנועה מאופקת.',
      bestFor: 'סטודיו, צילום, עיצוב, סדנאות, אמנים',
      sample: { eyebrow: 'סדנה פתוחה', title: 'בואו ליצור', option: 'קבוצה קטנה', cta: 'קדימה' },
    },
    theme: {
      ...base,
      presetId: 'creative_studio',
      palette: {
        primary: '#4B2FE0',
        secondary: '#111111',
        accent: '#FFD23F',
        background: '#F3EFE6',
        surface: '#FFFFFF',
        surfaceAlt: '#EFE9DC',
        text: '#111111',
        muted: '#4F4B44',
      },
      typography: 'display',
      hero: { layout: 'poster' },
      composition: 'centered',
      decoration: 'expressive',
      components: { card: 'bold', input: 'outlined', option: 'bold', button: 'brutal' },
      radius: 'none',
      shadow: 'hard',
      density: 'comfortable',
      progress: 'numbered',
      motion: 'expressive',
      mobile: { compactHero: false, stickySummary: true },
    },
  },
  modern_minimal: {
    meta: {
      id: 'modern_minimal',
      name: 'Modern Minimal',
      nameHe: 'מינימלי מודרני',
      description: 'ניטרלי ומלוטש. מתאים לכל נושא כשאין זיהוי ברור — שקט, קריא וממוקד.',
      bestFor: 'כל תחום — ברירת המחדל האוניברסלית',
      sample: { eyebrow: 'טופס פנייה', title: 'נשמח לשמוע מכם', option: 'בהקדם', cta: 'המשך' },
    },
    theme: {
      ...base,
      presetId: 'modern_minimal',
      palette: {
        primary: '#1F2933',
        secondary: '#7B8794',
        accent: '#3E6FE0',
        background: '#F6F6F7',
        surface: '#FFFFFF',
        surfaceAlt: '#F1F2F4',
        text: '#111418',
        muted: '#5C6775',
      },
      typography: 'neutral',
      hero: { layout: 'centered' },
      composition: 'centered',
      decoration: 'minimal',
      components: { card: 'flat', input: 'filled', option: 'chip', button: 'pill' },
      radius: 'lg',
      shadow: 'none',
      density: 'comfortable',
      progress: 'bar',
      motion: 'subtle',
      mobile: { compactHero: true, stickySummary: true },
    },
  },
};

/** The six core personalities — the original, most-tested starting points. */
export const CORE_PRESET_IDS = ['floral_boutique', 'automotive_precision', 'hospitality_premium', 'corporate_modern', 'creative_studio', 'modern_minimal'] as const satisfies readonly ThemePresetId[];

const CORE_META: Record<(typeof CORE_PRESET_IDS)[number], Pick<PresetMeta, 'experience' | 'category'>> = {
  floral_boutique: { experience: 'בוטיק', category: 'beauty' },
  automotive_precision: { experience: 'מקצועי', category: 'home' },
  hospitality_premium: { experience: 'פרימיום', category: 'food' },
  corporate_modern: { experience: 'מודרני', category: 'professional' },
  creative_studio: { experience: 'יצירתי', category: 'events' },
  modern_minimal: { experience: 'מינימלי', category: 'universal' },
};

export const PRESETS = Object.fromEntries(
  THEME_PRESET_IDS.map((id): [ThemePresetId, PresetEntry] => {
    const core = CORE[id];
    if (core) return [id, { meta: { ...core.meta, ...CORE_META[id as (typeof CORE_PRESET_IDS)[number]] }, theme: core.theme }];
    const lib = LIBRARY_PRESETS[id];
    if (!lib) throw new Error(`Missing preset definition: ${id}`);
    return [id, lib];
  }),
) as Record<ThemePresetId, PresetEntry>;

export const PRESET_LIST: PresetMeta[] = THEME_PRESET_IDS.map((id) => PRESETS[id].meta);

/** A complete, validated theme for a preset. Uploaded assets can be carried over. */
export function buildTheme(presetId: ThemePresetId, opts: { source?: WorkflowTheme['source']; keep?: Pick<WorkflowTheme, 'hero' | 'logo'> } = {}): WorkflowTheme {
  const preset = structuredClone(PRESETS[presetId].theme);
  const theme: WorkflowTheme = {
    ...preset,
    source: opts.source ?? 'auto',
    hero: { ...preset.hero, eyebrow: opts.keep?.hero.eyebrow, coverAssetId: opts.keep?.hero.coverAssetId },
    logo: { ...preset.logo, ...(opts.keep?.logo ?? {}) },
  };
  return WorkflowThemeSchema.parse(theme);
}

export const DEFAULT_PRESET: ThemePresetId = 'modern_minimal';
