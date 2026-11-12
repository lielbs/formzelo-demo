import { describe, expect, it } from 'vitest';
import { framedByOtherOrigin, isFrameProtectedPath, routePath } from './frameGuard';

describe('frame guard', () => {
  it('protects staff and account screens, keeps customer pages embeddable', () => {
    for (const p of ['/app', '/app/', '/app/tables/x/live', '/operator', '/invite', '/reset', '/track', '/t/r', '/t/w']) {
      expect(isFrameProtectedPath(p), p).toBe(true);
    }
    for (const p of ['/', '/f/bloom', '/t/bistro', '/t/bistro/menu', '/t/bistro/waitlist', '/t-preview', '/privacy', '/application', '/t/rooftop']) {
      expect(isFrameProtectedPath(p), p).toBe(false);
    }
  });

  it('strips the deploy base before matching', () => {
    expect(routePath('/live/app/tables', '/live')).toBe('/app/tables');
    expect(routePath('/live', '/live')).toBe('/');
    expect(routePath('/app', '')).toBe('/app');
  });

  it('detects a frame on another origin, allows top level and same-origin frames', () => {
    const loc = { origin: 'https://formangle.test' };
    const self = { location: loc };
    expect(framedByOtherOrigin({ self, top: self, location: loc })).toBe(false);
    const sameTop = { location: { origin: 'https://formangle.test' } };
    expect(framedByOtherOrigin({ self, top: sameTop, location: loc })).toBe(false);
    const foreignTop = { get location(): { origin: string } { throw new DOMException('blocked', 'SecurityError'); } };
    expect(framedByOtherOrigin({ self, top: foreignTop, location: loc })).toBe(true);
  });
});
