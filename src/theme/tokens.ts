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
  classic: { label: 'קלאסי — David Libre', display: '"David Libre", "Frank Ruhl Libre", Georgia, serif', body: 'Assistant, Heebo, system-ui, sans-serif', weight: 500, tracking: '0', scale: 1.16 },
  friendly: { label: 'ידידותי — Varela Round', display: '"Varela Round", Assistant, system-ui, sans-serif', body: 'Assistant, Heebo, system-ui, sans-serif', weight: 400, tracking: '-0.005em', scale: 1.06 },
  handwritten: { label: 'כתב יד — Amatic SC', display: '"Amatic SC", "Varela Round", system-ui, sans-serif', body: 'Assistant, Heebo, system-ui, sans-serif', weight: 700, tracking: '0.01em', scale: 1.55 },
  impact: { label: 'עוצמתי — Suez One', display: '"Suez One", "Secular One", Georgia, serif', body: 'Assistant, Heebo, system-ui, sans-serif', weight: 400, tracking: '-0.01em', scale: 1.18 },
  clean: { label: 'נקי — Assistant', display: 'Assistant, Heebo, system-ui, sans-serif', body: 'Assistant, Heebo, system-ui, sans-serif', weight: 700, tracking: '-0.015em', scale: 1.04 },
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

/**
 * Background textures. Built only from palette colours, which the schema guarantees are #RRGGBB,
 * so no owner-written text ever reaches the SVG. Kept faint: a texture, never a picture.
 */
export function patternImage(theme: WorkflowTheme): string | undefined {
  const kind = theme.extras?.pattern;
  if (!kind || kind === 'none') return undefined;
  const p = theme.palette;
  const ink = mix(p.background, p.text, 0.1);
  const soft = mix(p.background, p.primary, 0.16);
  const warm = mix(p.background, p.accent, 0.4);
  const svg: Record<Exclude<typeof kind, 'none'>, string> = {
    dots: `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='3' cy='3' r='1.6' fill='${ink}'/></svg>`,
    grid: `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><path d='M32 0H0V32' fill='none' stroke='${ink}' stroke-width='1'/></svg>`,
    waves: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='24'><path d='M0 12c10-8 30-8 40 0s30 8 40 0' fill='none' stroke='${soft}' stroke-width='1.6'/></svg>`,
    stripes: `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><path d='M-4 4l8-8M0 16L16 0M12 20l8-8' stroke='${ink}' stroke-width='1.4'/></svg>`,
    diamonds: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><path d='M14 9l5 5-5 5-5-5z' fill='${soft}'/></svg>`,
    confetti: `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect x='14' y='18' width='10' height='4' rx='2' transform='rotate(28 19 20)' fill='${warm}'/><circle cx='78' cy='26' r='3' fill='${soft}'/><rect x='92' y='76' width='9' height='4' rx='2' transform='rotate(-34 96 78)' fill='${soft}'/><circle cx='30' cy='88' r='2.5' fill='${warm}'/><path d='M58 58l4 7-8 0z' fill='${ink}'/></svg>`,
  };
  return `url("data:image/svg+xml,${encodeURIComponent(svg[kind])}")`;
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
    // A soft tint of the brand, so light heroes still read as a stage rather than empty page.
    case 'centered':
      return mix(p.background, p.primary, 0.13);
    case 'compact':
      return mix(p.background, p.secondary, 0.2);
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
    '--fz-glow': mix(heroBg, p.accent, 0.55),
    // Floating card on the hero stage; on dark designs the shadow is true black, never a light haze.
    '--fz-float-shadow': (() => {
      const t = readableOn(p.background) === '#FFFFFF' ? '#000000' : shadowTint;
      return `0 1px 2px ${t}10, 0 24px 60px -18px ${t}${t === '#000000' ? '99' : '40'}, 0 8px 22px -12px ${t}24`;
    })(),
    '--fz-shift': `${m.shift}px`,
    '--fz-pattern': patternImage(theme) ?? 'none',
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
    'data-illustrated': theme.illustrations ? 'true' : 'false',
    'data-art-blocks': theme.illustrations && (theme.illustrationSpots ?? ['blocks']).includes('blocks') ? 'true' : 'false',
    'data-motion': theme.motion,
    'data-progress': theme.progress,
    'data-type': theme.typography,
    'data-shadow': theme.shadow,
    'data-radius': theme.radius,
    'data-flow': theme.flow ?? 'card',
    'data-pattern': theme.extras?.pattern ?? 'none',
  };
  return { style: style as CSSProperties, attrs, warnings };
}
