import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATIC_ROUTES } from '../../vite.config';

/** Every .tsx under src/. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

describe('deploy base path', () => {
  // The production app is served from /live/: a root-relative src/href in markup would load the
  // demo site instead (this broke the booking page design preview).
  it('has no hard-coded root-relative src or href in components', () => {
    const offenders = sources('src').filter((file) => /\b(src|href)="\/(?!\/)/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('serves the page design preview as a static entry', () => {
    expect(STATIC_ROUTES).toContain('t-preview');
  });
});
