import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byMode } from './modeCopy';

describe('byMode', () => {
  it('picks the demo text only in demo mode', () => {
    expect(byMode('a', 'b', 'demo')).toBe('a');
    expect(byMode('a', 'b', 'production')).toBe('b');
  });
});

/**
 * Sentences that are only true in the demo ("saved in this browser", "simulated messages") must
 * never reach a paying customer (UX audit 2026-11, D7). Every file below was checked: the wording
 * is demo-only (behind byMode / IS_DEMO / a demo-mode condition, or in a demo-only screen), or
 * true in production too (e.g. colour extraction does run in the browser). A new file that
 * mentions the browser this way fails here until someone checks it and adds it.
 */
const REVIEWED = new Set([
  'components/Activity.tsx', 'components/AppLayout.tsx', 'components/ErrorBoundary.tsx', 'components/ImagePicker.tsx', 'components/SiteChrome.tsx',
  'data/localRepository.ts', 'data/repository.ts', 'engine/compose.ts', 'lib/share.ts',
  'pages/Demo.tsx', 'pages/Landing.tsx', 'pages/Privacy.tsx', 'pages/PublicFlow.tsx', 'pages/Tour.tsx',
  'pages/app/ActionComposer.tsx', 'pages/app/Analytics.tsx', 'pages/app/BrandKit.tsx', 'pages/app/Dashboard.tsx', 'pages/app/QuotePanel.tsx',
  'pages/app/RequestDetail.tsx', 'pages/app/Settings.tsx', 'pages/app/editor/DesignPanel.tsx', 'pages/app/editor/Inspector.tsx',
  'pages/app/editor/IntakePanel.tsx', 'pages/app/editor/MediaPanel.tsx', 'renderer/Confirmation.tsx', 'renderer/FieldInput.tsx', 'renderer/blocks.tsx',
  'tables/public/i18n.ts',
]);

describe('demo-only wording stays out of production screens', () => {
  it('only reviewed files mention browser-only storage or simulated messages', () => {
    const root = join(process.cwd(), 'src');
    const files: string[] = [];
    const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) files.push(p); } };
    walk(root);
    const unreviewed = files
      .filter((f) => /בדפדפן|הודעות מדומות/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f).replace(/\\/g, '/'))
      .filter((f) => !REVIEWED.has(f) && !f.startsWith('test/'));
    expect(unreviewed).toEqual([]);
  });
});
