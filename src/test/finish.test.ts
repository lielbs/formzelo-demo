import { describe, expect, it } from 'vitest';
import { ThemeExtrasSchema } from '../domain/theme';
import { starterExtras } from '../engine/finish';
import { TEMPLATE_CATEGORIES, TEMPLATE_LIBRARY } from '../engine/library';
import { TEMPLATES } from '../engine/templates';

describe('starter touches for templates', () => {
  it('every business area has a valid strip, badge, three promises and a pattern', () => {
    for (const c of TEMPLATE_CATEGORIES) {
      const x = starterExtras(c.id);
      expect(x, c.id).toBeDefined();
      expect(ThemeExtrasSchema.parse(x)).toEqual(x);
      expect(x!.promises).toHaveLength(3);
      expect(x!.ribbon!.length).toBeLessThanOrEqual(90);
    }
  });
  it('every library template and every built-in starting point except the blank form gets them', () => {
    for (const t of TEMPLATE_LIBRARY) expect(starterExtras(t.category), t.id).toBeDefined();
    for (const key of Object.keys(TEMPLATES)) expect(Boolean(starterExtras(key)), key).toBe(key !== 'generic');
  });
  it('returns a fresh copy each time', () => {
    const a = starterExtras('food')!;
    a.promises![0]!.text = 'changed';
    expect(starterExtras('food')!.promises![0]!.text).not.toBe('changed');
  });
});
