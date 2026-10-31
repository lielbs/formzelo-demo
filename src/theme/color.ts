/** Small WCAG color helpers so owner-picked colors stay readable. */

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '000000';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear mix: weight 0 = a, 1 = b. */
export function mix(a: string, b: string, weight: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i]! - v) * weight) as RGB);
}

/** White or near-black, whichever reads better on the background. */
export function readableOn(bg: string, dark = '#111418', light = '#FFFFFF'): string {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

/** Darken (or lighten on dark surfaces) `fg` until it reaches `target` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, target = 4.5): string {
  if (contrastRatio(fg, bg) >= target) return fg.toUpperCase();
  const towards = luminance(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let w = 0.08; w <= 1; w += 0.08) {
    const c = mix(fg, towards, w);
    if (contrastRatio(c, bg) >= target) return c;
  }
  return towards;
}
