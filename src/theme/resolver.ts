/**
 * Theme selection — transparent, deterministic, local.
 *
 * ThemeResolver is the seam for a future model-backed resolver. The only
 * implementation today is KeywordThemeResolver: Hebrew keyword stems plus the
 * template the workflow was built from. No network, no AI.
 */
import type { ThemePresetId } from '../domain/theme';
import { normalizeHebrew, tokenMatches } from '../engine/hebrew';
import { buildTheme, DEFAULT_PRESET, PRESETS } from './presets';

export interface ThemeContext {
  templateKey?: string;
  title?: string;
  description?: string;
  prompt?: string;
  industry?: string;
}

export interface ThemeRecommendation {
  presetId: ThemePresetId;
  confidence: 'high' | 'medium' | 'low';
  matched: string[];
  /** Hebrew, human-readable explanation shown in the editor. */
  reason: string;
}

export interface ThemeResolver {
  resolve(ctx: ThemeContext): ThemeRecommendation;
}

const TEMPLATE_PRESET: Record<string, ThemePresetId> = {
  flower_order: 'floral_boutique',
  garage_repairs: 'automotive_precision',
  restaurant_event: 'hospitality_premium',
  table_booking: 'hospitality_premium',
  document_collection: 'corporate_modern',
  quote_request: 'corporate_modern',
};

const KEYWORDS: Record<Exclude<ThemePresetId, 'modern_minimal'>, string[]> = {
  floral_boutique: ['פרח', 'זר', 'פלורי', 'ורד', 'כלה', 'מתנה', 'מתנות', 'קוסמטיק', 'ספא', 'איפור'],
  automotive_precision: ['מוסך', 'רכב', 'בלמ', 'רפיד', 'מכונאי', 'צמיג', 'מגב', 'פילטר', 'טכנאי', 'תיקון', 'תיקונים', 'אופנוע', 'מזגן'],
  hospitality_premium: ['מסעד', 'אירוע', 'אורחים', 'תפריט', 'קייטרינג', 'שף', 'ארוח', 'בר מצווה', 'בת מצווה', 'יין', 'מלון', 'צימר', 'בית קפה'],
  corporate_modern: ['משרד', 'מסמכ', 'רואה חשבון', 'עורך דין', 'עורכת דין', 'ביטוח', 'הנהלת חשבונות', 'חברה', 'קליטת', 'גיוס', 'טופס 106', 'משכנתא', 'יועץ', 'הצעת מחיר', 'קבלן'],
  creative_studio: ['סטודיו', 'עיצוב', 'צילום', 'צלם', 'אמנ', 'סדנ', 'קעקוע', 'מוזיק', 'ריקוד', 'תיאטרון', 'יוגה', 'פודקאסט', 'גרפי', 'תחרו', 'טורניר', 'מרתון', 'קייטנ', 'חוג'],
};

const TEMPLATE_WEIGHT = 3;

export class KeywordThemeResolver implements ThemeResolver {
  resolve(ctx: ThemeContext): ThemeRecommendation {
    const text = normalizeHebrew([ctx.prompt, ctx.title, ctx.description, ctx.industry].filter(Boolean).join(' '));
    const tokens = text.split(' ').filter(Boolean);
    const fromTemplate = ctx.templateKey ? TEMPLATE_PRESET[ctx.templateKey] : undefined;

    let best: { id: ThemePresetId; score: number; matched: string[] } = { id: DEFAULT_PRESET, score: 0, matched: [] };
    for (const [id, words] of Object.entries(KEYWORDS) as [ThemePresetId, string[]][]) {
      const matched = words.filter((w) => tokenMatches(text, tokens, w));
      const score = matched.length + (fromTemplate === id ? TEMPLATE_WEIGHT : 0);
      // Ties keep the earlier (template-backed or more specific) candidate.
      if (score > best.score) best = { id, score, matched };
    }

    const name = PRESETS[best.id].meta.nameHe;
    if (best.score === 0) {
      return { presetId: DEFAULT_PRESET, confidence: 'low', matched: [], reason: `לא זוהה תחום מובהק — נבחר העיצוב האוניברסלי "${name}".` };
    }
    const parts: string[] = [];
    if (fromTemplate === best.id) parts.push('סוג התהליך');
    if (best.matched.length) parts.push(`מילים שזוהו: ${best.matched.slice(0, 4).join(', ')}`);
    return {
      presetId: best.id,
      confidence: best.score >= 3 ? 'high' : 'medium',
      matched: best.matched,
      reason: `נבחר "${name}" לפי ${parts.join(' · ')}.`,
    };
  }
}

export const themeResolver: ThemeResolver = new KeywordThemeResolver();

/** Recommended preset turned into a complete theme (used by generator, seed and migration). */
export function recommendTheme(ctx: ThemeContext, resolver: ThemeResolver = themeResolver) {
  const recommendation = resolver.resolve(ctx);
  return { recommendation, theme: buildTheme(recommendation.presetId, { source: 'auto' }) };
}
