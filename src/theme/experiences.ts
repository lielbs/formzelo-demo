import type { ThemePresetId } from '../domain/theme';
import { PRESET_LIST } from './presets';

/** Every design personality, named by the experience it creates for the customer. */
export const EXPERIENCES = Object.fromEntries(PRESET_LIST.map((p) => [p.id, p.experience])) as Record<ThemePresetId, string>;
