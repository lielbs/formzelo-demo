/**
 * Turns a WorkflowTheme into CSS custom properties + data attributes.
 * All visual variation in the renderer flows through these tokens
 * (see src/theme/theme.css), so the renderer itself stays generic.
 */
import type { CSSProperties } from 'react';
import type { WorkflowTheme } from '../domain/theme';
import { contrastRatio, ensureContrast, mix, readableOn } from './color';

export const TYPOGRAPHY: Record<WorkflowTheme['typography'], { label: string; display: string; body: string; weight: number; tracking: string; scale: number }> = {
  editorial: { label: 'עריכתי — סריף אלגנטי', display: '"Frank Ruhl Libre", Georgia, serif', body: 'Heebo, Rubik, system-ui, sans-serif', weight: 500, tracking: '-0.01em', scale: 1.14 },
  technical: { label: 'טכני — IBM Plex', display: '"IBM Plex Sans Hebrew", Rubik, system-ui, sans-serif', body: '"IBM Plex Sans Hebrew", Rubik, system-ui, sans-serif', weight: 600, tracking: '0', scale: 0.96 },
  warm: { label: 'חמים — Bellefair', display: 'Bellefair, "Frank Ruhl Libre", Georgia, serif', body: 'Heebo, Rubik, system-ui, sans-serif', weight: 400, tracking: '0', scale: 1.22 },
  corporate: { label: 'משרדי — Heebo', display: 'Heebo, Rubik, system-ui, sans-serif', body: 'Heebo, Rubik, system-ui, sans-serif', weight: 700, tracking: '-0.01em', scale: 1 },
  display: { label: 'נועז — Secular One', display: '"Secular One", Rubik, system-ui, sans-serif', body: 'Rubik, system-ui, sans-serif', weight: 400, tracking: '-0.015em', scale: 1.32 },
  neutral: { label: 'ניטרלי — Rubik', display: 'Rubik, system-ui, sans-serif', body: 'Rubik, system-ui, sans-serif', weight: 600, tracking: '-0.01em', scale: 1 },
};

const RADIUS: Record<WorkflowTheme['radius'], [number, number]> = {
  none: [0, 0],
  sm: [6, 4],
  md: [12, 8],
  lg: [20, 12],
  xl: [28, 16],
};

const DENSITY: Record<WorkflowTheme['density'], { pad: number; gap: number; field: number; control: number }> = {
  compact: { pad: 18, gap: 12, field: 18, control: 44 },
  comfortable: { pad: 26, gap: 16, field: 22, control: 48 },
  airy: { pad: 34, gap: 20, field: 28, control: 52 },
};

const MOTION: Record<WorkflowTheme['motion'], { dur: number; shift: number }> = {
  none: { dur: 0, shift: 0 },
  subtle: { dur: 260, shift: 10 },
  expressive: { dur: 440, shift: 28 },
};

export interface ThemeTokens {
  style: CSSProperties;
  attrs: Record<string, string>;
  /** Contrast warnings for the editor (Hebrew). */
  warnings: string[];
}

export function heroBackground(theme: WorkflowTheme): string {
  const p = theme.palette;
  switch (theme.hero.layout) {
    case 'banner':
      return mix(p.primary, '#000000', 0.25);
    case 'immersive':
      return p.secondary;
    case 'poster':
      return p.accent;
    case 'split':
      return p.surfaceAlt;
    default:
      return p.background;
  }
}

export function themeTokens(theme: WorkflowTheme): ThemeTokens {
  const p = theme.palette;
  const t = TYPOGRAPHY[theme.typography];
  const [r, rs] = RADIUS[theme.radius];
  const d = DENSITY[theme.density];
  const m = MOTION[theme.motion];
  const heroBg = heroBackground(theme);
  const heroText = contrastRatio(heroBg, p.text) >= 4.5 ? p.text : readableOn(heroBg);
  const shadowTint = mix(p.text, p.background, 0.1);
  const shadow = {
    none: 'none',
    soft: `0 1px 2px ${shadowTint}0D, 0 10px 30px ${shadowTint}12`,
    medium: `0 2px 6px ${shadowTint}14, 0 22px 50px ${shadowTint}22`,
    hard: `5px 5px 0 ${p.text}`,
  }[theme.shadow];
  const buttonRadius = { pill: '999px', solid: `${Math.max(rs, 6)}px`, sharp: '3px', brutal: `${rs}px` }[theme.components.button];

  const warnings: string[] = [];
  if (contrastRatio(p.text, p.surface) < 4.5) warnings.push('צבע הטקסט אינו קריא מספיק על רקע הכרטיסים');
  if (contrastRatio(p.primary, readableOn(p.primary)) < 4.5) warnings.push('הכפתור הראשי עלול להיות לא קריא — בחרו גוון כהה או בהיר יותר');
  if (contrastRatio(p.primary, p.surface) < 3) warnings.push('הצבע הראשי חלש על רקע לבן; בקישורים ובאייקונים נשתמש בגוון כהה יותר שלו');

  const style: Record<string, string> = {
    '--fz-primary': p.primary,
    '--fz-on-primary': readableOn(p.primary),
    '--fz-primary-ink': ensureContrast(p.primary, p.surface),
    '--fz-primary-soft': mix(p.surface, p.primary, 0.08),
    '--fz-primary-tint': mix(p.surface, p.primary, 0.18),
    '--fz-secondary': p.secondary,
    '--fz-on-secondary': readableOn(p.secondary),
    '--fz-accent': p.accent,
    '--fz-on-accent': readableOn(p.accent),
    '--fz-accent-ink': ensureContrast(p.accent, p.surface),
    '--fz-bg': p.background,
    '--fz-surface': p.surface,
    '--fz-surface-alt': p.surfaceAlt,
    '--fz-text': p.text,
    '--fz-muted': ensureContrast(p.muted, p.surface),
    '--fz-line': mix(p.surface, p.text, 0.13),
    '--fz-line-strong': mix(p.surface, p.text, 0.32),
    '--fz-hero-bg': heroBg,
    '--fz-hero-text': heroText,
    '--fz-hero-muted': mix(heroText, heroBg, 0.28),
    '--fz-success': ensureContrast('#1E8A5A', p.surface),
    '--fz-success-soft': mix(p.surface, '#1E8A5A', 0.1),
    '--fz-danger': ensureContrast('#C2392A', p.surface),
    '--fz-danger-soft': mix(p.surface, '#C2392A', 0.08),
    '--fz-font-display': t.display,
    '--fz-font-body': t.body,
    '--fz-display-weight': String(t.weight),
    '--fz-display-tracking': t.tracking,
    '--fz-display-scale': String(t.scale),
    '--fz-r': `${r}px`,
    '--fz-r-sm': `${rs}px`,
    '--fz-r-btn': buttonRadius,
    '--fz-shadow': shadow,
    '--fz-pad': `${d.pad}px`,
    '--fz-gap': `${d.gap}px`,
    '--fz-field-gap': `${d.field}px`,
    '--fz-control-h': `${d.control}px`,
    '--fz-dur': `${m.dur}ms`,
    '--fz-shift': `${m.shift}px`,
    // Backwards compatibility with the shared brand-* utility classes.
    '--brand': p.primary,
  };

  const attrs = {
    'data-preset': theme.presetId,
    'data-card': theme.components.card,
    'data-input': theme.components.input,
    'data-option': theme.components.option,
    'data-button': theme.components.button,
    'data-hero': theme.hero.layout,
    'data-composition': theme.composition,
    'data-decor': theme.decoration,
    'data-motion': theme.motion,
    'data-progress': theme.progress,
    'data-type': theme.typography,
    'data-shadow': theme.shadow,
    'data-radius': theme.radius,
  };
  return { style: style as CSSProperties, attrs, warnings };
}
