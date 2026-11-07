import { describe, expect, it } from 'vitest';
import { WorkflowConfigSchema } from '../domain/schema';
import { advise } from '../engine/advisor';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { field, TEMPLATES } from '../engine/templates';

const base = { hasLogo: true, presenceLinks: 3 };
const ids = (c: Parameters<typeof advise>[0]) => advise(c).map((a) => a.id);

describe('built-in studio advice', () => {
  it('asks for a way back to the customer and adds it in one tap', () => {
    const config = structuredClone(TEMPLATES.table_booking.build());
    config.steps.forEach((s) => (s.fields = s.fields.filter((f) => f.type !== 'phone' && f.type !== 'email' && !f.role?.startsWith('customer_p'))));
    const tip = advise({ config, ...base }).find((a) => a.id === 'contact')!;
    expect(tip.fix.kind).toBe('apply');
    if (tip.fix.kind === 'apply') tip.fix.apply(config);
    expect(config.steps[config.steps.length - 1]!.fields.some((f) => f.type === 'phone' && f.required)).toBe(true);
    expect(ids({ config, ...base })).not.toContain('contact');
  });

  it('splits a long step into two valid steps without losing a field', () => {
    const config = structuredClone(TEMPLATES.table_booking.build());
    const step = config.steps[0]!;
    for (let i = 0; i < 8; i++) step.fields.push(field(`extra_${i}`, `שאלה ${i}`, 'text'));
    const before = config.steps.flatMap((s) => s.fields).length;
    const tip = advise({ config, ...base }).find((a) => a.id.startsWith('split-'))!;
    if (tip.fix.kind === 'apply') tip.fix.apply(config);
    expect(config.steps.flatMap((s) => s.fields).length).toBe(before);
    expect(config.steps[1]!.title).toMatch(/המשך/);
    expect(WorkflowConfigSchema.safeParse(config).success).toBe(true);
  });

  it('guides bookings: turn on rules, then notice and how far ahead', () => {
    const config = structuredClone(TEMPLATES.table_booking.build());
    expect(ids({ config, ...base })).toEqual(expect.arrayContaining(['notice', 'ahead']));
    for (const a of advise({ config, ...base })) if (a.fix.kind === 'apply' && (a.id === 'notice' || a.id === 'ahead')) a.fix.apply(config);
    expect(config.booking).toMatchObject({ minNoticeHours: 2, maxDaysAhead: 60 });
    config.booking!.enabled = false;
    expect(ids({ config, ...base })).toContain('booking');
  });

  it('suggests places for a registration and stays quiet once limits are set', () => {
    const { config } = generateWorkflowFromPrompt('הרשמה לסדנת קרמיקה, ללא תשלום');
    config.steps.forEach((s) => s.fields.forEach((f) => f.options?.forEach((o) => delete o.capacity)));
    expect(ids({ config, ...base })).toContain('places');
    expect(ids({ config, ...base, intake: { paused: false, onePerContact: false, maxTotal: 12 } })).not.toContain('places');
    expect(ids({ config, hasLogo: false, presenceLinks: 0 })).toEqual(expect.arrayContaining(['logo', 'presence']));
    // A flower order that mentions an occasion is not a registration.
    expect(ids({ config: TEMPLATES.flower_order.build(), ...base })).not.toContain('places');
  });
});
