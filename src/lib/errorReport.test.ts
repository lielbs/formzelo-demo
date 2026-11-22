import { describe, expect, it } from 'vitest';
import { browserOf, buildOf, routeOf, scrub, toReport } from './errorReport';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('error reports carry nothing personal', () => {
  it('drops the query and the fragment (manage links keep their token there)', () => {
    expect(routeOf('https://formangle.rockstackds.com/live/t/r#t=AbCdEfGhIjKlMnOpQrStUvWxYz0123')).toBe('/live/t/r');
    expect(routeOf('https://formangle.rockstackds.com/live/track?token=abc&x=1')).toBe('/live/track');
  });

  it('masks emails, phone numbers and long tokens', () => {
    const s = scrub('failed for dana@example.com at 050-555-1234 or +972 50 555 1234 with AbCdEfGhIjKlMnOpQrStUvWxYz012345', 300);
    expect(s).not.toMatch(/dana|555|AbCdEfGh/);
    expect(s).toContain('<email>');
    expect(s).toContain('<number>');
    expect(s).toContain('<token>');
  });

  it('keeps ordinary error text and short ids readable', () => {
    expect(scrub('TypeError: cannot read properties of undefined (reading "tables") at 20:15', 300)).toBe('TypeError: cannot read properties of undefined (reading "tables") at 20:15');
  });

  it('shortens long messages and stacks', () => {
    expect(scrub('x '.repeat(400), 300)).toHaveLength(300);
    const r = toReport('error', Object.assign(new Error('boom'), { stack: 'Error: boom\n' + '    at fn (app.js:1:1)\n'.repeat(300) }), 'https://x.test/a', IPHONE)!;
    expect(r.stack!.length).toBeLessThanOrEqual(2000);
  });
});

describe('toReport', () => {
  it('builds a report from an Error', () => {
    const r = toReport('rejection', new TypeError('x is undefined'), 'https://formangle.rockstackds.com/live/t/indigo-8?ref=wa', IPHONE, 'index-ABC');
    expect(r).toMatchObject({ kind: 'rejection', route: '/live/t/indigo-8', message: 'TypeError: x is undefined', build: 'index-ABC', browser: 'safari mobile' });
  });

  it('accepts a thrown string', () => {
    expect(toReport('error', 'plain failure', 'https://x.test/', DESKTOP_CHROME)?.message).toBe('plain failure');
  });

  it('ignores empty errors, opaque cross-origin errors and extensions', () => {
    expect(toReport('error', null, 'https://x.test/', IPHONE)).toBeNull();
    expect(toReport('error', { message: '   ' }, 'https://x.test/', IPHONE)).toBeNull();
    expect(toReport('error', 'Script error.', 'https://x.test/', IPHONE)).toBeNull();
    expect(toReport('error', { message: 'x', stack: 'at chrome-extension://abc/content.js:1:1' }, 'https://x.test/', IPHONE)).toBeNull();
  });
});

describe('build and browser', () => {
  it('reads the build from the hashed entry script', () => {
    const doc = { querySelector: () => ({ src: 'https://formangle.rockstackds.com/live/assets/index-DGhDXxpu.js' }) } as unknown as Document;
    expect(buildOf(doc)).toBe('index-DGhDXxpu');
    expect(buildOf({ querySelector: () => null } as unknown as Document)).toBeUndefined();
  });

  it('keeps only a coarse browser class', () => {
    expect(browserOf(IPHONE)).toBe('safari mobile');
    expect(browserOf(DESKTOP_CHROME)).toBe('chrome desktop');
    expect(browserOf('Mozilla/5.0 (Windows NT 10.0) Edg/131.0')).toBe('edge desktop');
  });
});
