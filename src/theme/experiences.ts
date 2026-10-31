import type { ThemePresetId } from '../domain/theme';

/** The six design personalities, named by the experience they create for the customer. */
export const EXPERIENCES: Record<ThemePresetId, string> = {
  floral_boutique: 'בוטיק',
  automotive_precision: 'מקצועי',
  corporate_modern: 'מודרני',
  hospitality_premium: 'פרימיום',
  modern_minimal: 'מינימלי',
  creative_studio: 'יצירתי',
};
