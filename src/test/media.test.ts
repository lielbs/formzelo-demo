import { describe, expect, it } from 'vitest';
import mediaCss from '../theme/media.css?raw';
import { MediaSettingsSchema, WorkflowThemeSchema } from '../domain/theme';
import { resolveMedia } from '../renderer/media';
import { buildTheme } from '../theme/presets';

describe('business images in a design', () => {
  it('a design without media settings keeps the photo behind the opening and a plain logo', () => {
    const m = resolveMedia(buildTheme('modern_minimal'));
    expect(m.coverStyle).toBe('backdrop');
    expect(m.logoStyle).toBe('plain');
    expect(m.tone).toBe('natural');
  });

  it('defaults follow the design: arches frame in an arch, magazines lay photos out as a mosaic', () => {
    expect(resolveMedia(buildTheme('wedding_elegance')).galleryStyle).toBe('mosaic');
    expect(resolveMedia(buildTheme('kids_play')).galleryStyle).toBe('polaroid');
    const arches = buildTheme('modern_minimal');
    expect(resolveMedia({ ...arches, decoration: 'arches' }).frame).toBe('arch');
    expect(resolveMedia({ ...arches, decoration: 'organic' }).frame).toBe('organic');
  });

  it('accepts only workspace images, at most six', () => {
    expect(MediaSettingsSchema.safeParse({ gallery: ['ast_a1', 'ast_b2'] }).success).toBe(true);
    expect(MediaSettingsSchema.safeParse({ gallery: ['https://example.com/x.jpg'] }).success).toBe(false);
    expect(MediaSettingsSchema.safeParse({ gallery: ['data:image/png;base64,AAAA'] }).success).toBe(false);
    expect(MediaSettingsSchema.safeParse({ gallery: Array.from({ length: 7 }, (_, i) => `ast_${i}`) }).success).toBe(false);
    expect(WorkflowThemeSchema.safeParse({ ...buildTheme('modern_minimal'), media: { coverStyle: 'video' } }).success).toBe(false);
  });

  it('switching style keeps where the business put its photos and logo', () => {
    const before = { ...buildTheme('floral_boutique'), media: { coverStyle: 'frame' as const, tone: 'brand' as const, gallery: ['ast_x1'], logoStyle: 'seal' as const } };
    const after = buildTheme('luxury_noir', { keep: { hero: before.hero, logo: before.logo, media: before.media } });
    expect(after.media).toEqual(before.media);
  });

  it('animates only inside the reduced-motion guard, with transform and opacity only', () => {
    const guard = '@media (prefers-reduced-motion: no-preference) {';
    const at = mediaCss.indexOf(guard);
    expect(at).toBeGreaterThan(0);
    for (const line of mediaCss.slice(0, at).split('\n').filter((l) => /^\s*animation(-name)?\s*:/.test(l))) expect(line).toMatch(/animation:\s*none/);
    for (const rule of mediaCss.slice(at).match(/\.fz[^{]*\{[^}]*(animation|transform)/g) ?? []) expect(rule).toContain(":not([data-motion='none'])");
    for (const fr of mediaCss.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? []) for (const [, p] of fr.matchAll(/^\s+([a-z-]+):/gm)) expect(['transform', 'opacity']).toContain(p);
  });
});
