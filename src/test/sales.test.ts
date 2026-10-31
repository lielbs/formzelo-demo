import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import readme from '../../README.md?raw';
import type { WorkflowField } from '../domain/schema';
import { DEFAULT_CONTACT_EMAIL } from '../lib/links';
import { DEMO_REQUEST_SUBJECT, demoRequestMailto, packageMailto, PACKAGES, PRICING_TERMS } from '../lib/plans';
import { BRAND_TABS } from '../pages/app/brandTabs';
import { EXPERIENCES } from '../theme/experiences';
import { Pricing } from '../pages/Pricing';
import { FieldInput } from '../renderer/FieldInput';
import { PRESET_LIST } from '../theme/presets';

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const decode = (href: string) => {
  const u = new URL(href);
  return { to: u.pathname, subject: u.searchParams.get('subject') ?? '', body: u.searchParams.get('body') ?? '' };
};

describe('RockStack-managed packages', () => {
  it('has exactly Business, Business Plus and Enterprise with the agreed prices', () => {
    expect(PACKAGES.map((p) => [p.key, p.name, p.monthly, p.setup])).toEqual([
      ['business', 'Business', 399, 990],
      ['business_plus', 'Business Plus', 499, 1490],
      ['enterprise', 'Enterprise', null, null],
    ]);
    expect(PACKAGES.filter((p) => p.recommended).map((p) => p.key)).toEqual(['business_plus']);
    expect(PACKAGES[0]!.workflows).toContain('3');
    expect(PACKAGES[1]!.workflows).toContain('8');
    expect(PACKAGES[1]!.features).toContain('כל מה שב-Business');
  });

  it('states VAT, indicative status, managed setup and separately priced integrations', () => {
    expect(PRICING_TERMS.vat).toMatch(/מע״מ/);
    expect(PRICING_TERMS.indicative).toBe('מחירי חבילות מוצעים, בכפוף לאפיון ולהצעת מחיר.');
    expect(PRICING_TERMS.managed).toBe('RockStack מאפיינת, מקימה ומתאימה את Formangle לצרכים של העסק שלכם.');
    expect(PRICING_TERMS.separate).toMatch(/אינטגרציות ופיתוח מותאם/);
    expect(PRICING_TERMS.noSelfService).toMatch(/RockStack/);
  });

  it('every package CTA opens a prepared email to RockStack sales with its own subject', () => {
    const subjects = new Set<string>();
    for (const p of PACKAGES) {
      const m = decode(packageMailto(p));
      expect(m.to).toBe(DEFAULT_CONTACT_EMAIL);
      expect(m.subject).toContain(p.name);
      expect(m.body).toContain(p.name);
      subjects.add(m.subject);
    }
    expect(subjects.size).toBe(3);
    expect(decode(packageMailto(PACKAGES[0]!)).body).toContain('399 ₪ לחודש + 990 ₪ הקמה');
    const demo = decode(demoRequestMailto());
    expect(demo.to).toBe('contact@rockstackds.com');
    expect(demo.subject).toBe(DEMO_REQUEST_SUBJECT);
  });

  it('the pricing page renders both fees, VAT, and no checkout or signup', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Pricing)));
    const text = html.replace(/[‎‏]/g, '').replace(/ /g, ' ');
    for (const t of ['Business', 'Business Plus', 'Enterprise', '399 ₪', '990 ₪', '499 ₪', '1,490 ₪', 'הקמה חד-פעמית', 'הצעת מחיר מותאמת', 'מע״מ', 'אינטגרציות ופיתוח מותאם']) {
      expect(text).toContain(t);
    }
    expect(html).toContain('mailto:contact@rockstackds.com');
    expect(html).not.toMatch(/checkout|לרכישה|הרשמה עצמית למנוי|כרטיס אשראי/i);
  });

  it('old public packages are gone from the product and the docs', () => {
    const all = Object.entries(sources);
    for (const [file, text] of all) {
      expect(text, file).not.toMatch(/\b(Start|Grow|Scale)\b['"]?\s*[,—-]\s*\d{2,3}/);
      expect(text, file).not.toMatch(/99, 199 ו-399|name: 'Start'|name: 'Scale'/);
    }
    expect(readme).not.toMatch(/99 \/ 199 \/ 399/);
    expect(readme).toContain('Business Plus');
  });
});

describe('sales and generator copy honesty', () => {
  it('landing sells outcomes with the demo CTA and the demo-request email', () => {
    const landing = sources['../pages/Landing.tsx']!;
    expect(landing).toContain('כל הפניות והתהליכים של העסק.');
    expect(landing).toContain('בחוויה אחת שמרגישה כמו המותג שלכם.');
    expect(landing).toContain('צפו בהדגמה');
    expect(landing).toContain('תיאום הדגמה לעסק');
    expect(landing).toContain('demoRequestMailto()');
  });

  it('generator copy never claims a connected AI service', () => {
    const files = ['../pages/Landing.tsx', '../pages/app/WorkflowNew.tsx', '../components/Brand.tsx'].map((f) => sources[f]!).join('\n');
    expect(files).toContain('מתארים את הצורך — ומקבלים תהליך מוכן לעריכה.');
    expect(files).toContain('יצירה מקומית מתבניות');
    // Product copy does not use the term "AI" at all — the generator is described as a local, template-based engine.
    for (const [file, text] of Object.entries(sources)) {
      const visible = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(visible, file).not.toMatch(/AI|בינה מלאכותית/);
    }
    for (const text of Object.values(sources)) expect(text).not.toMatch(/generativelanguage\.googleapis|api\.openai\.com|api\.anthropic\.com/);
  });

  it('names one experience for every design personality', () => {
    expect(Object.keys(EXPERIENCES).sort()).toEqual(PRESET_LIST.map((p) => p.id).sort());
    expect(Object.values(EXPERIENCES)).toEqual(expect.arrayContaining(['בוטיק', 'מקצועי', 'מודרני', 'פרימיום', 'מינימלי', 'יצירתי']));
  });

  it('Brand Kit is organized into the four areas', () => {
    expect(BRAND_TABS.map((t) => t.label)).toEqual(['פרטי העסק', 'עיצוב ומיתוג', 'קישורים עסקיים', 'תצוגה מקדימה']);
  });
});

describe('accessible choice cards', () => {
  it('names each option by its title and describes it with description, price and places', () => {
    const field: WorkflowField = {
      id: 'f1',
      key: 'route',
      label: 'מסלול',
      type: 'radio',
      required: true,
      appearance: 'tiles',
      options: [
        { id: 'o1', label: 'קלאסי', value: 'classic', price: 90, description: 'מסלול נוף', capacity: 40 },
        { id: 'o2', label: 'קצר', value: 'short' },
      ],
    };
    const html = renderToStaticMarkup(createElement(FieldInput, { field, value: undefined, onChange: () => {}, optionArt: false }));
    expect(html).toMatch(/aria-label="קלאסי"/);
    const described = html.match(/aria-label="קלאסי" aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? [];
    expect(described).toHaveLength(3);
    for (const id of described) expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/aria-label="קצר"(?! aria-describedby)/);
    expect(html).toContain('<legend');
  });
});
