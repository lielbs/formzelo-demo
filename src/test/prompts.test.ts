import { describe, expect, it } from 'vitest';
import { WorkflowConfigSchema } from '../domain/schema';
import { generateWorkflowFromPrompt } from '../engine/generator';

const fieldKeys = (r: ReturnType<typeof generateWorkflowFromPrompt>) => r.config.steps.flatMap((s) => s.fields.map((f) => f.key));

describe('reference business prompts', () => {
  it('1. restaurant table reservation without payment', () => {
    const r = generateWorkflowFromPrompt('מסעדה שרוצה לקבל הזמנות שולחן בלי תשלום');
    expect(r.templateKey).toBe('table_booking');
    expect(r.config.completion?.mode).toBe('request');
    expect(r.config.booking?.enabled).toBe(true);
    expect(r.theme.presetId).toBe('hospitality_premium');
  });

  it('2. flower customization with delivery pricing', () => {
    const r = generateWorkflowFromPrompt('חנות פרחים שהלקוח מעצב זר, בוחר צבעים וכרטיס ברכה, עם מחיר משלוח');
    expect(r.templateKey).toBe('flower_order');
    expect(r.config.pricing.fees.some((f) => f.label.includes('משלוח'))).toBe(true);
    expect(r.detected).toEqual(expect.arrayContaining(['בחירת צבעים', 'כרטיס ברכה', 'מחיר משלוח']));
  });

  it('3. garage approval without payment — the customer approves, not the business', () => {
    const r = generateWorkflowFromPrompt('מוסך שהלקוח יאשר או ידחה כל תיקון, בלי תשלום באתר');
    expect(r.templateKey).toBe('garage_repairs');
    expect(r.config.completion?.mode).toBe('request');
    expect(r.intent.approval).toBe(false);
  });

  it('5. salon appointments get services, day slots and a beauty look', () => {
    const r = generateWorkflowFromPrompt('מספרה שרוצה שלקוחות יקבעו תור לתספורת או צבע');
    expect(r.templateKey).toBe('table_booking');
    const service = r.config.steps[0]!.fields.find((f) => f.key === 'service')!;
    // Exactly the services the owner named — no invented extras.
    expect(service.options!.map((o) => o.label)).toEqual(['תספורת', 'צבע']);
    expect(r.theme.presetId).toBe('floral_boutique');
    expect(r.detected).not.toContain('בחירת צבעים');
    expect(r.adjustments.join(' ')).toMatch(/השירותים שכתבתם/);
    // With one named service the rest are samples, and the owner is told so.
    expect(generateWorkflowFromPrompt('מספרה שרוצה שלקוחות יקבעו תור לתספורת').reviewNotes.join(' ')).toMatch(/השירותים היא לדוגמה/);
  });

  it('6. corporate onboarding collects documents and flags the signature', () => {
    const r = generateWorkflowFromPrompt('חברה שרוצה לקלוט לקוח עסקי חדש ולאסוף מסמכים וחתימה על הסכם');
    expect(r.templateKey).toBe('document_collection');
    expect(r.theme.presetId).toBe('corporate_modern');
    expect(r.reviewNotes.join(' ')).toMatch(/חתימה/);
  });

  it('7. private event quotation with an optional deposit', () => {
    const r = generateWorkflowFromPrompt('הצעת מחיר לאירוע פרטי עם מקדמה אופציונלית');
    expect(r.templateKey).toBe('restaurant_event');
    expect(r.config.completion).toMatchObject({ mode: 'deposit', depositTiming: 'after_approval' });
    expect(r.reviewNotes.join(' ')).toMatch(/מקדמה אופציונלית/);
  });

  it('a quotation without a deposit stays a quote (no payment)', () => {
    const r = generateWorkflowFromPrompt('בקשת הצעת מחיר לאירוע פרטי');
    expect(r.templateKey).toBe('restaurant_event');
    expect(r.config.completion?.mode).toBe('quote');
  });

  it('every reference prompt yields a valid, schema-checked workflow', () => {
    for (const p of [
      'מסעדה שרוצה לקבל הזמנות שולחן בלי תשלום',
      'מספרה שרוצה שלקוחות יקבעו תור לתספורת או צבע',
      'חברה שרוצה לקלוט לקוח עסקי חדש ולאסוף מסמכים וחתימה על הסכם',
      'הצעת מחיר לאירוע פרטי עם מקדמה אופציונלית',
    ]) {
      const r = generateWorkflowFromPrompt(p);
      expect(WorkflowConfigSchema.safeParse(r.config).success).toBe(true);
      expect(new Set(fieldKeys(r)).size).toBe(fieldKeys(r).length);
    }
  });
});

describe('labelled examples on the creation screen', () => {
  it('each example generates a valid workflow with a recommended style', async () => {
    const { PROMPT_EXAMPLES } = await import('../engine/generator');
    for (const ex of PROMPT_EXAMPLES) {
      const r = generateWorkflowFromPrompt(ex.prompt);
      expect(WorkflowConfigSchema.safeParse(r.config).success).toBe(true);
      expect(r.confidence).not.toBe('low');
    }
  });
});
