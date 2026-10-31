import { describe, expect, it } from 'vitest';
import { OrgDataSchema, WorkflowConfigSchema } from '../domain/schema';
import { buildSeed } from '../data/seed';
import { evaluateCondition } from '../engine/conditions';
import { detectTemplate, EXAMPLE_PROMPTS, generateWorkflowFromPrompt } from '../engine/generator';
import { computePrice } from '../engine/pricing';
import { TEMPLATES } from '../engine/templates';
import { assertTransition, canTransition, InvalidTransitionError, ownerActions } from '../engine/transitions';
import { validateRun } from '../engine/validation';
import { isoDay } from '../lib/format';

describe('schema validation', () => {
  it('accepts every built-in template', () => {
    for (const t of Object.values(TEMPLATES)) expect(WorkflowConfigSchema.safeParse(t.build()).success).toBe(true);
  });

  it('accepts the seeded demo workspaces', () => {
    for (const org of buildSeed()) expect(OrgDataSchema.safeParse(org).success).toBe(true);
  });

  it('rejects malformed config (bad field key, empty steps, bad color)', () => {
    const cfg = TEMPLATES.generic.build();
    expect(WorkflowConfigSchema.safeParse({ ...cfg, steps: [] }).success).toBe(false);
    expect(WorkflowConfigSchema.safeParse({ ...cfg, branding: { primaryColor: 'red', logoText: 'x' } }).success).toBe(false);
    const badKey = structuredClone(cfg);
    badKey.steps[0]!.fields[0]!.key = 'Bad Key';
    expect(WorkflowConfigSchema.safeParse(badKey).success).toBe(false);
  });

  it('rejects unknown condition operators (no arbitrary logic)', () => {
    const cfg = structuredClone(TEMPLATES.generic.build()) as unknown as {
      steps: { fields: { condition?: unknown }[] }[];
    };
    cfg.steps[0]!.fields[0]!.condition = { fieldKey: 'x', operator: 'eval', value: 'alert(1)' };
    expect(WorkflowConfigSchema.safeParse(cfg).success).toBe(false);
  });
});

describe('pricing', () => {
  it('flower: budget + gift wrap + delivery', () => {
    const cfg = TEMPLATES.flower_order.build();
    expect(computePrice(cfg, { budget: '250', gift_wrap: true }).total).toBe(300);
    expect(computePrice(cfg, { budget: '500', gift_wrap: false }).total).toBe(530);
  });

  it('garage: only approved repairs count', () => {
    const cfg = TEMPLATES.garage_repairs.build();
    const r = computePrice(cfg, { brake_pads: 'approved', cabin_filter: 'declined', wipers: 'approved' });
    expect(r.total).toBe(790);
    expect(r.lines.map((l) => l.amount)).toEqual([650, 140]);
    expect(computePrice(cfg, { brake_pads: 'declined', cabin_filter: 'declined', wipers: 'declined' }).total).toBe(0);
  });

  it('restaurant: per-guest menu and wine, flat extras, 20% deposit', () => {
    const cfg = TEMPLATES.restaurant_event.build();
    const r = computePrice(cfg, { guests: 20, menu: 'chef', wine: true, extras: ['cake'] });
    expect(r.total).toBe(20 * 240 + 20 * 65 + 450);
    expect(r.deposit).toBe(r.total * 0.2);
  });

  it('hidden fields never contribute to the total', () => {
    const cfg = TEMPLATES.generic.build();
    cfg.pricing.enabled = true;
    cfg.steps[0]!.fields.push(
      { id: 'a', key: 'rush', label: 'דחוף', type: 'checkbox', required: false, price: 100 },
      { id: 'b', key: 'rush_fee', label: 'תוספת', type: 'checkbox', required: false, price: 50, condition: { fieldKey: 'rush', operator: 'isTrue' } },
    );
    expect(computePrice(cfg, { rush: true, rush_fee: true }).total).toBe(150);
    expect(computePrice(cfg, { rush: false, rush_fee: true }).total).toBe(0);
  });
});

describe('conditions and validation', () => {
  it('evaluates declarative operators', () => {
    expect(evaluateCondition({ fieldKey: 'a', operator: 'equals', value: 'x' }, { a: 'x' })).toBe(true);
    expect(evaluateCondition({ fieldKey: 'a', operator: 'includes', value: 'x' }, { a: ['y', 'x'] })).toBe(true);
    expect(evaluateCondition({ fieldKey: 'n', operator: 'gt', value: 5 }, { n: 6 })).toBe(true);
    expect(evaluateCondition({ fieldKey: 'a', operator: 'isEmpty' }, {})).toBe(true);
  });

  it('requires company only for business events', () => {
    const cfg = TEMPLATES.restaurant_event.build();
    const base = {
      event_date: isoDay(10),
      guests: 20,
      event_type: 'family',
      slot: 'dinner',
      menu: 'classic',
      contact_name: 'דנה',
      contact_phone: '050-555-0101',
      contact_email: 'd@example.com',
    };
    expect(validateRun(cfg, base)).toEqual({});
    expect(validateRun(cfg, { ...base, event_type: 'business' })).toHaveProperty('company');
  });

  it('enforces guest bounds, phone and date window', () => {
    const cfg = TEMPLATES.restaurant_event.build();
    const errs = validateRun(cfg, { event_date: isoDay(1), guests: 5, contact_phone: '123', contact_email: 'nope' });
    expect(Object.keys(errs)).toEqual(expect.arrayContaining(['event_date', 'guests', 'contact_phone', 'contact_email', 'menu']));
  });

  it('garage decisions are each required', () => {
    const cfg = TEMPLATES.garage_repairs.build();
    expect(validateRun(cfg, { brake_pads: 'approved' })).toMatchObject({ cabin_filter: expect.any(String), wipers: expect.any(String) });
  });
});

describe('run transitions', () => {
  it('allows the main happy path', () => {
    expect(canTransition('submitted', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'approved')).toBe(true);
    expect(canTransition('approved', 'completed')).toBe(true);
    expect(canTransition('changes_requested', 'submitted')).toBe(true);
  });

  it('rejects invalid jumps', () => {
    expect(() => assertTransition('completed', 'submitted')).toThrow(InvalidTransitionError);
    expect(canTransition('awaiting_customer', 'approved')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
  });

  it('never offers the owner a customer-only transition', () => {
    expect(ownerActions('changes_requested').map((a) => a.to)).not.toContain('submitted');
    expect(ownerActions('awaiting_customer').map((a) => a.to)).toEqual(['cancelled']);
  });
});

describe('local prompt generator', () => {
  it('maps example prompts to the expected templates', () => {
    expect(EXAMPLE_PROMPTS.map((p) => detectTemplate(p).key)).toEqual([
      'flower_order',
      'garage_repairs',
      'restaurant_event',
      'document_collection',
      'quote_request',
    ]);
  });

  it('does not match short stems inside unrelated words', () => {
    expect(detectTemplate('צריך עזרה עם טופס').key).toBe('generic');
  });

  it('falls back to an editable generic form and applies modifiers', () => {
    const r = generateWorkflowFromPrompt('סטודיו ליוגה, רוצה טופס הרשמה עם תאריך ואימייל');
    expect(r.templateKey).toBe('generic');
    const keys = r.config.steps.flatMap((s) => s.fields.map((f) => f.key));
    expect(keys).toEqual(expect.arrayContaining(['requested_date', 'email']));
  });
});
