import { describe, expect, it } from 'vitest';
import premium from '../theme/premium.css?raw';
import { buildTheme } from '../theme/presets';
import { themeTokens } from '../theme/tokens';

const guard = '@media (prefers-reduced-motion: no-preference) {';

describe('premium motion layer', () => {
  it('runs every animation only when the visitor has not asked for reduced motion', () => {
    const at = premium.indexOf(guard);
    expect(at).toBeGreaterThan(0);
    const before = premium.slice(0, at);
    // Outside the guard only durations (calm designs) and the print reset may mention animation.
    for (const line of before.split('\n').filter((l) => /^\s*animation(-name)?\s*:/.test(l))) expect(line).toMatch(/animation:\s*none/);
    const guarded = premium.slice(at);
    expect(guarded).toMatch(/fz-m-wave/);
    // Each motion rule also honours the theme's own "no motion" setting.
    for (const line of guarded.split('\n').filter((l) => l.includes('.fz-hero-art .fz-m-'))) expect(line).toContain(":not([data-motion='none'])");
  });

  it('animates artwork only inside a real hero, never in gallery thumbnails', () => {
    for (const sel of premium.match(/[^{}\n]*\.fz-m-[a-z-]+[^{]*\{/g) ?? []) expect(sel).toContain('.fz-hero-art');
  });

  it('uses only transform and opacity in keyframes (no layout-changing motion)', () => {
    const frames = premium.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? [];
    expect(frames.length).toBeGreaterThan(15);
    for (const f of frames) {
      const props = [...f.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]);
      for (const p of props) expect(['transform', 'opacity', 'stroke-dashoffset'], f.split('{')[0]).toContain(p);
    }
  });

  it('gives floating cards a true black shadow on dark designs', () => {
    const dark = themeTokens(buildTheme('luxury_noir')).style as Record<string, string>;
    const light = themeTokens(buildTheme('spa_serenity')).style as Record<string, string>;
    expect(dark['--fz-float-shadow']).toContain('#000000');
    expect(light['--fz-float-shadow']).not.toContain('#000000');
  });
});
