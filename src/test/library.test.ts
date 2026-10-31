import { describe, expect, it } from 'vitest';
import fieldInputSource from '../renderer/FieldInput.tsx?raw';
import { WorkflowConfigSchema, isDisplayField } from '../domain/schema';
import { THEME_PRESET_IDS } from '../domain/theme';
import { searchTemplates, TEMPLATE_CATEGORIES, TEMPLATE_LIBRARY, templateById } from '../engine/library';
import { canPublish, logicIssues, publishReadiness } from '../engine/logic';
import { computePrice } from '../engine/pricing';
import { buildTheme, PRESETS } from '../theme/presets';

describe('template library', () => {
  it('is large and covers every topic with real choice', () => {
    expect(TEMPLATE_LIBRARY.length).toBeGreaterThanOrEqual(45);
    expect(new Set(TEMPLATE_LIBRARY.map((t) => t.id)).size).toBe(TEMPLATE_LIBRARY.length);
    expect(new Set(TEMPLATE_LIBRARY.map((t) => t.title)).size).toBe(TEMPLATE_LIBRARY.length);
    for (const c of TEMPLATE_CATEGORIES) expect(TEMPLATE_LIBRARY.filter((t) => t.category === c.id).length, c.id).toBeGreaterThanOrEqual(2);
  });

  it('every template is schema-valid, logic-clean and publishable', () => {
    for (const t of TEMPLATE_LIBRARY) {
      const c = t.build();
      const parsed = WorkflowConfigSchema.safeParse(c);
      expect(parsed.success, `${t.id}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      expect(logicIssues(c).filter((i) => i.level === 'error'), t.id).toEqual([]);
      expect(canPublish(publishReadiness(c)), t.id).toBe(true);
      const keys = c.steps.flatMap((s) => s.fields).map((f) => f.key);
      expect(new Set(keys).size, t.id).toBe(keys.length);
      expect(c.steps.flatMap((s) => s.fields).filter((f) => !isDisplayField(f)).length, t.id).toBeGreaterThanOrEqual(3);
      expect(t.description.length, t.id).toBeGreaterThan(15);
    }
  });

  it('pairs every template with a design from the library and uses the library widely', () => {
    for (const t of TEMPLATE_LIBRARY) {
      expect(THEME_PRESET_IDS, t.id).toContain(t.preset);
      expect(buildTheme(t.preset).presetId).toBe(t.preset);
    }
    expect(new Set(TEMPLATE_LIBRARY.map((t) => t.preset)).size).toBeGreaterThanOrEqual(20);
    expect(Object.keys(PRESETS).length).toBe(THEME_PRESET_IDS.length);
  });

  it('builds fresh ids every time so two workflows from one template never share ids', () => {
    const a = templateById('custom_cake')!.build();
    const b = templateById('custom_cake')!.build();
    expect(a.steps[0]!.id).not.toBe(b.steps[0]!.id);
    expect(a.steps[0]!.fields[0]!.id).not.toBe(b.steps[0]!.fields[0]!.id);
  });

  it('prices, conditions and per-unit multipliers work in library templates', () => {
    const cake = templateById('custom_cake')!.build();
    expect(computePrice(cake, { size: 'm', delivery: 'delivery' }).total).toBe(420 + 45);
    expect(computePrice(cake, { size: 'm', delivery: 'pickup' }).total).toBe(420);
    const cabin = templateById('cabin_booking')!.build();
    expect(computePrice(cabin, { nights: 3, unit: 'couple', breakfast: true }).total).toBe(3 * 950 + 3 * 180);
    const catering = templateById('catering_order')!.build();
    expect(computePrice(catering, { guests: 40, menu: 'classic' }).total).toBe(40 * 120 + 350);
  });

  it('searches by title, description and tags, within a category', () => {
    expect(searchTemplates('עוגה').map((t) => t.id)).toContain('custom_cake');
    expect(searchTemplates('מזגן').map((t) => t.id)).toContain('technician_visit');
    expect(searchTemplates('', 'pets').every((t) => t.category === 'pets')).toBe(true);
    expect(searchTemplates('לא-קיים-בשום-מקום')).toEqual([]);
  });

  it('is honest about demo-only capabilities', () => {
    // File fields exist in some templates; the customer component always states that only the name is kept.
    expect(TEMPLATE_LIBRARY.some((t) => t.build().steps.some((st) => st.fields.some((f) => f.type === 'file')))).toBe(true);
    expect(fieldInputSource).toContain('בדמו נשמרים שם הקובץ וגודלו בלבד');
    expect(templateById('donation_pledge')!.build().disclaimer).toMatch(/לא מתבצע תשלום/);
  });
});
