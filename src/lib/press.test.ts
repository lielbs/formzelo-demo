import { describe, expect, it } from 'vitest';
import { PRESSABLE, pressScale } from './press';

describe('tap feedback', () => {
  it('sinks small controls more than wide ones and cards least', () => {
    expect(pressScale(44, 44)).toBe(0.88);
    expect(pressScale(120, 44)).toBe(0.94);
    expect(pressScale(340, 52)).toBe(0.97);
    expect(pressScale(360, 200)).toBe(0.985);
    expect(pressScale(44, 44)).toBeLessThan(pressScale(120, 44));
  });

  it('covers buttons, links and ARIA controls but never disabled buttons', () => {
    expect(PRESSABLE).toContain('button:not([disabled])');
    expect(PRESSABLE).toContain('a[href]');
    expect(PRESSABLE).toContain('[role="radio"]');
    expect(PRESSABLE).not.toMatch(/(^|,)button(,|$)/);
  });
});
