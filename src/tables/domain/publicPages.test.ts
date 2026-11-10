import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../theme/color';
import { normalizeDraft, newDraft } from './draft';
import {
  answersPayload, defaultPublicPages, inheritBrand, missingAnswers, normalizePublicPages, PAGE_PRESETS, pageTheme, presetTheme, PRESETS,
  publicPagesProblems, referencedAssets, resolveLook, visibleQuestions, type PublicPagesConfig,
} from './publicPages';

const q = (over: Record<string, unknown> = {}) => ({ key: 'q_abcdef12', kind: 'text', label: 'אלרגיות?', group: 'extra', required: false, ...over });

describe('public pages: defaults and presets', () => {
  it('default config is valid and complete', () => {
    const d = defaultPublicPages();
    expect(publicPagesProblems(d)).toEqual([]);
    expect(d.booking.fields.map((f) => f.key)).toEqual(['name', 'phone', 'email', 'requests']);
    expect(d.waitlist.fields.map((f) => f.key)).toEqual(['name', 'phone', 'notes']);
    expect(d.waitlist.fields.find((f) => f.key === 'notes')?.hidden).toBe(true);
  });

  it('has exactly the five requested presets, each valid and readable', () => {
    expect([...PAGE_PRESETS]).toEqual(['fine_dining', 'cafe', 'casual', 'cocktail_bar', 'minimal']);
    for (const id of PAGE_PRESETS) {
      const pages = { ...defaultPublicPages(), theme: presetTheme(id) };
      expect(publicPagesProblems(pages)).toEqual([]);
      const p = PRESETS[id].theme.palette;
      expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('applying a preset keeps the owner images and brand choice', () => {
    const t = presetTheme('cafe', { inheritBrand: true, logoAssetId: 'ast_logo1234', heroAssetId: 'ast_hero1234', showLogo: false, heroStyle: 'inline' });
    expect(t).toMatchObject({ preset: 'cafe', inheritBrand: true, logoAssetId: 'ast_logo1234', heroAssetId: 'ast_hero1234', showLogo: false, heroStyle: 'inline', typography: 'friendly' });
  });
});

describe('public pages: normalization', () => {
  it('repairs hostile or partial input into a valid config', () => {
    const n = normalizePublicPages({
      version: 9, theme: { preset: 'nope', palette: { accent: 'red', text: '#000000' }, typography: 'comic', button: 'brutal', logoAssetId: 'javascript:x' },
      booking: {
        copy: { title: 'x'.repeat(500), extra: 1 },
        fields: [{ key: 'phone', kind: 'builtin', hidden: true, group: 'contact' }, { key: 'evil', kind: 'builtin' }, q({ kind: 'select', options: ['a', 'a', '', 'b'] }), q()],
      },
    });
    expect(publicPagesProblems(n)).toEqual([]);
    expect(n.version).toBe(1);
    expect(n.theme.palette.text).toBe('#000000');
    expect(n.theme.button).toBe('solid');
    expect(n.theme.logoAssetId).toBeUndefined();
    expect(n.booking.copy.title).toHaveLength(80);
    const keys = n.booking.fields.map((f) => f.key);
    expect(keys).toEqual(['phone', 'q_abcdef12', 'name', 'email', 'requests']);
    expect(n.booking.fields[0]!.hidden).toBeUndefined(); // mandatory fields cannot be hidden
    expect(n.booking.fields[1]!.options).toEqual(['a', 'b']);
  });

  it('caps additional questions at six', () => {
    const fields = Array.from({ length: 9 }, (_, i) => q({ key: `q_question${i}` }));
    const n = normalizePublicPages({ booking: { fields } });
    expect(visibleQuestions(n.booking)).toHaveLength(6);
  });

  it('keeps a page theme only while the page uses its own theme', () => {
    const n = normalizePublicPages({ waitlist: { ownTheme: false, theme: presetTheme('minimal') }, booking: { ownTheme: true, theme: presetTheme('cafe') } });
    expect(n.waitlist.theme).toBeUndefined();
    expect(pageTheme(n, 'booking').preset).toBe('cafe');
    expect(pageTheme(n, 'waitlist').preset).toBe(n.theme.preset);
  });

  it('normalizeDraft keeps publicPages (so other editors never drop it) and leaves old drafts alone', () => {
    const draft = { ...newDraft('ביסטרו'), publicPages: defaultPublicPages() };
    expect(normalizeDraft(draft, 'x').publicPages).toEqual(defaultPublicPages());
    expect('publicPages' in normalizeDraft(newDraft('ביסטרו'), 'x')).toBe(false);
  });
});

describe('public pages: validation mirrors the server', () => {
  const base = (): PublicPagesConfig => defaultPublicPages();
  it('rejects hiding or removing mandatory fields', () => {
    const a = base();
    a.booking.fields[0]!.hidden = true;
    expect(publicPagesProblems(a).map((p) => p.code)).toContain('pages_mandatory_field');
    const b = base();
    b.waitlist.fields = b.waitlist.fields.filter((f) => f.key !== 'phone');
    expect(publicPagesProblems(b).map((p) => p.code)).toContain('pages_mandatory_field');
  });

  it('rejects bad questions, colours, duplicates and foreign images', () => {
    const c = base();
    c.booking.fields.push(q({ label: ' ' }) as never, q({ key: 'q_select01', kind: 'select', options: [] }) as never, q({ key: 'name' }) as never);
    c.theme.palette.accent = 'blue';
    c.theme.heroAssetId = 'ast_notmine01';
    const codes = publicPagesProblems(c, new Set(['ast_mine00001'])).map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['pages_question_label', 'pages_question_options', 'pages_field_duplicate', 'pages_color_invalid', 'pages_image_missing']));
  });

  it('lists every referenced image', () => {
    const c = base();
    c.theme.logoAssetId = 'ast_logo00001';
    c.booking.ownTheme = true;
    c.booking.theme = { ...presetTheme('cafe'), heroAssetId: 'ast_hero00001' };
    expect(referencedAssets(c).sort()).toEqual(['ast_hero00001', 'ast_logo00001']);
  });
});

describe('public pages: answers', () => {
  const page = normalizePublicPages({
    booking: { fields: [q({ key: 'q_text00001', required: true }), q({ key: 'q_check0001', kind: 'checkbox', required: true }), q({ key: 'q_sel000001', kind: 'select', options: ['כן', 'לא'] }), q({ key: 'q_hidden001', hidden: true })] },
  }).booking;

  it('reports missing required answers', () => {
    expect(missingAnswers(page, {})).toEqual(['q_text00001', 'q_check0001']);
    expect(missingAnswers(page, { q_text00001: ' ok ', q_check0001: true })).toEqual([]);
  });

  it('sends only visible, non-empty answers, trimmed', () => {
    expect(answersPayload(page, { q_text00001: '  שומשום ', q_check0001: false, q_sel000001: '', q_hidden001: 'x', name: 'n' }))
      .toEqual({ q_text00001: 'שומשום' });
  });
});

describe('public pages: look', () => {
  it('repairs contrast and provides light and dark sets', () => {
    const t = { ...presetTheme('minimal'), palette: { accent: '#FFEE00', background: '#FFFFFF', surface: '#FFFFFF', text: '#EEEEEE' } };
    const look = resolveLook(t);
    expect(contrastRatio(look.vars['--pp-l-text']!, look.vars['--pp-l-surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(look.vars['--pp-l-accent']!, look.vars['--pp-l-surface']!)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(look.vars['--pp-d-text']!, look.vars['--pp-d-surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(look.darkNative).toBe(false);
    expect(resolveLook(presetTheme('fine_dining')).darkNative).toBe(true);
  });

  it('inherits accent, typography, button, logo and cover from the Brand Kit only when asked', () => {
    const kit = { palette: { primary: '#123456', background: '#FAFAFA' }, typography: 'editorial', button: 'pill', logoAssetId: 'ast_brandlogo', coverAssetId: 'ast_brandcover' };
    const off = presetTheme('casual');
    expect(inheritBrand(off, kit)).toBe(off);
    const on = inheritBrand({ ...off, inheritBrand: true }, kit);
    expect(on).toMatchObject({ typography: 'editorial', button: 'pill', logoAssetId: 'ast_brandlogo', heroAssetId: 'ast_brandcover' });
    expect(on.palette.accent).toBe('#123456');
    // The page's own image wins over the kit.
    expect(inheritBrand({ ...off, inheritBrand: true, heroAssetId: 'ast_ownhero01' }, kit).heroAssetId).toBe('ast_ownhero01');
    // Unsupported kit values (e.g. the brutal button) are ignored.
    expect(inheritBrand({ ...off, inheritBrand: true }, { button: 'brutal' }).button).toBe(off.button);
  });

  it('hides the logo when the owner turns it off', () => {
    expect(resolveLook({ ...presetTheme('cafe'), logoAssetId: 'ast_logo00001', showLogo: false }).logoAssetId).toBeUndefined();
  });
});
