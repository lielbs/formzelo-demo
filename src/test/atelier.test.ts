import { describe, expect, it } from 'vitest';
import atelier from '../theme/atelier.css?raw';
import { PRESET_LIST, buildTheme } from '../theme/presets';
import { themeTokens } from '../theme/tokens';
import { WorkflowThemeSchema } from '../domain/theme';
import { artIn } from '../renderer/parts';

const guard = '@media (prefers-reduced-motion: no-preference) {';

describe('atelier standard', () => {
  it('draws no illustrations unless the owner turns them on', () => {
    for (const p of PRESET_LIST) {
      const t = buildTheme(p.id);
      expect(t.illustrations).toBeUndefined();
      expect(themeTokens(t).attrs['data-illustrated']).toBe('false');
      expect(artIn(t, 'hero') || artIn(t, 'options') || artIn(t, 'blocks')).toBe(false);
    }
  });

  it("keeps the owner's illustration choice and spots across a change of design", () => {
    const mine = { ...buildTheme('floral_boutique'), illustrations: true, illustrationSpots: ['options' as const] };
    expect(WorkflowThemeSchema.safeParse(mine).success).toBe(true);
    const next = buildTheme('automotive_precision', { keep: { hero: mine.hero, logo: mine.logo, illustrations: mine.illustrations, illustrationSpots: mine.illustrationSpots } });
    expect(next.illustrations).toBe(true);
    expect(artIn(next, 'options')).toBe(true);
    expect(artIn(next, 'hero')).toBe(false);
    expect(themeTokens(next).attrs['data-art-blocks']).toBe('false');
  });

  it('animates only inside the reduced-motion guard, with transform and opacity', () => {
    const at = atelier.indexOf(guard);
    expect(at).toBeGreaterThan(0);
    for (const line of atelier.slice(0, at).split('\n')) expect(line).not.toMatch(/^\s*animation\s*:/);
    for (const rule of atelier.slice(at).match(/[^{}]*\{[^}]*animation:/g) ?? []) expect(rule).toContain(":not([data-motion='none'])");
    const frames = atelier.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? [];
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const f of frames) for (const [, prop] of f.matchAll(/^\s+([a-z-]+):/gm)) expect(['transform', 'opacity']).toContain(prop);
  });

  it('keeps decorative marks out of the way of text and cards', () => {
    // Marks never render beside a summary card, on centered or condensed openings, or behind a photo.
    expect(atelier).toMatch(/:has\(\.fz-hero-summary\)::after/);
    expect(atelier).toMatch(/\[data-condensed='true'\]::after/);
    expect(atelier).toMatch(/\[data-cover\]::after/);
    // Drawings in the illustrated style live in their own frame.
    expect(atelier).toContain(".fz-hero[data-art='panel'] .fz-hero-artpanel");
  });
});
