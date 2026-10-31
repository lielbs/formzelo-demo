/**
 * DEMO local generation — deterministic Hebrew keyword matching.
 * This is NOT an AI model. It maps a free-text description to one of the
 * real templates, then applies a few keyword-driven modifiers. The output is
 * an ordinary, editable WorkflowConfig validated against the Zod schema.
 */
import { WorkflowConfigSchema, type WorkflowConfig } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { recommendTheme, type ThemeRecommendation } from '../theme/resolver';
import { newId } from '../lib/id';
import { normalizeHebrew, tokenMatches } from './hebrew';
import { buildGeneric, field, TEMPLATES, type TemplateKey } from './templates';

export { normalizeHebrew };

const KEYWORDS: Record<Exclude<TemplateKey, 'generic'>, string[]> = {
  flower_order: ['פרח', 'זר', 'זרים', 'פלורי', 'משלוח פרחים', 'חנות פרחים', 'ורד', 'סידורי'],
  garage_repairs: ['מוסך', 'רכב', 'בלמים', 'רפידות', 'מכונאי', 'צמיגים', 'טיפול שנתי', 'מגבים', 'פילטר'],
  restaurant_event: ['מסעדה', 'אירוע', 'אורחים', 'תפריט', 'קייטרינג', 'שף', 'ארוחה', 'בר מצווה', 'בת מצווה', 'יום הולדת'],
  document_collection: ['מסמכים', 'מסמך', 'טופס 106', 'רואה חשבון', 'הנהלת חשבונות', 'קליטת לקוח', 'אישורים', 'צילום', 'להעלות', 'העלאת'],
  quote_request: ['הצעת מחיר', 'הצעה', 'שיפוץ', 'התקנה', 'קבלן', 'אינסטלטור', 'חשמלאי', 'הערכת עלות', 'ביקור', 'עבודה'],
};

export interface GenerationResult {
  templateKey: TemplateKey;
  templateLabel: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  /** Human-readable list of what the local engine changed based on the prompt. */
  adjustments: string[];
  config: WorkflowConfig;
  /** Design chosen by the local theme resolver (not AI) — editable before saving. */
  theme: WorkflowTheme;
  themeRecommendation: ThemeRecommendation;
}

export function detectTemplate(prompt: string): { key: TemplateKey; matched: string[]; score: number } {
  const text = normalizeHebrew(prompt);
  const tokens = text.split(' ').filter(Boolean);
  let best: { key: TemplateKey; matched: string[]; score: number } = { key: 'generic', matched: [], score: 0 };
  for (const [key, words] of Object.entries(KEYWORDS) as [Exclude<TemplateKey, 'generic'>, string[]][]) {
    const matched = words.filter((w) => tokenMatches(text, tokens, w));
    // Multi-word phrases are stronger signals than single stems.
    const score = matched.reduce((s, w) => s + (w.includes(' ') ? 2 : 1), 0);
    if (score > best.score) best = { key, matched, score };
  }
  return best;
}

function titleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim();
  const firstSentence = clean.split(/[.!?\n]/)[0] ?? clean;
  return firstSentence.length > 42 ? `${firstSentence.slice(0, 40).trim()}…` : firstSentence || 'טופס חדש';
}

function applyModifiers(config: WorkflowConfig, text: string, adjustments: string[]): WorkflowConfig {
  const next = structuredClone(config);
  const lastStep = next.steps[next.steps.length - 1]!;
  const hasKey = (k: string) => next.steps.some((s) => s.fields.some((f) => f.key === k));

  if (/תמונ|צילומ/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'file'))) {
    lastStep.fields.push(field('photos', 'תמונות', 'file', { helpText: 'בדמו נשמר שם הקובץ בלבד' }));
    adjustments.push('נוסף שדה להעלאת תמונות (נשמר שם הקובץ בלבד)');
  }
  if (/מקדמ/.test(text) && next.pricing.enabled && !next.pricing.depositPercent) {
    next.pricing.depositPercent = 20;
    adjustments.push('נוספה מקדמה מדומה של 20%');
  }
  if (/משלוח/.test(text) && next.pricing.enabled && !next.pricing.fees.some((f) => f.label.includes('משלוח'))) {
    next.pricing.fees.push({ id: newId('fee'), label: 'משלוח', amount: 30 });
    adjustments.push('נוספה עלות משלוח של 30 ₪');
  }
  if (/אימייל|מייל/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'email'))) {
    lastStep.fields.push(field('email', 'אימייל', 'email', { role: 'customer_email' }));
    adjustments.push('נוסף שדה אימייל');
  }
  if (/כתובת/.test(text) && !hasKey('address')) {
    lastStep.fields.push(field('address', 'כתובת', 'text'));
    adjustments.push('נוסף שדה כתובת');
  }
  if (/תאריך|מועד/.test(text) && !next.steps.some((s) => s.fields.some((f) => f.type === 'date'))) {
    lastStep.fields.push(field('requested_date', 'תאריך מבוקש', 'date', { min: 0, role: 'date' }));
    adjustments.push('נוסף שדה תאריך מבוקש');
  }
  return next;
}

export function generateWorkflowFromPrompt(prompt: string, forcedTemplate?: TemplateKey): GenerationResult {
  const text = normalizeHebrew(prompt);
  const detected = detectTemplate(prompt);
  const key = forcedTemplate ?? detected.key;
  const adjustments: string[] = [];

  let config = key === 'generic' ? buildGeneric(titleFromPrompt(prompt)) : TEMPLATES[key].build();
  if (key === 'generic') adjustments.push('לא זוהה תחום מוכר — נוצר טופס בסיסי לעריכה');
  config = applyModifiers(config, text, adjustments);

  const { theme, recommendation } = recommendTheme({ templateKey: key, prompt, title: config.title });
  const confidence = forcedTemplate ? 'high' : detected.score >= 3 ? 'high' : detected.score >= 1 ? 'medium' : 'low';
  return {
    templateKey: key,
    templateLabel: TEMPLATES[key].label,
    confidence,
    matchedKeywords: forcedTemplate ? [] : detected.matched,
    adjustments,
    // Parse guarantees the generator can never emit an invalid workflow.
    config: WorkflowConfigSchema.parse(config),
    theme,
    themeRecommendation: recommendation,
  };
}

export const EXAMPLE_PROMPTS = [
  'אני חנות פרחים ורוצה שלקוחות יזמינו זר עם תקציב, צבעים, ברכה ומשלוח',
  'מוסך שרוצה שהלקוח יאשר או ידחה כל תיקון ברכב ויראה את הסכום',
  'מסעדה שמקבלת בקשות לאירועים פרטיים עם מספר אורחים, תפריט ומקדמה',
  'משרד רואה חשבון שצריך לאסוף מסמכים מלקוחות חדשים',
  'קבלן שיפוצים שרוצה לקבל בקשות להצעת מחיר עם תמונות',
];
