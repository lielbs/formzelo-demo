import { describe, expect, it } from 'vitest';
import { WorkflowConfigSchema } from '../domain/schema';
import { analyzePrompt } from '../engine/compose';
import { visibleSteps } from '../engine/conditions';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { computePrice } from '../engine/pricing';

const CONTEST = 'תיצור לי תהליך הרשמה לתחרות עם שלושה מסלולים, הגבלת משתתפים, אישור הורה לקטינים ותשלום אופציונלי.';

describe('compositional generator', () => {
  it('reads purpose, audience, choices, capacity, consent and payment from the prompt', () => {
    const intent = analyzePrompt(CONTEST);
    expect(intent.purpose).toBe('registration');
    expect(intent.subject).toBe('תחרות');
    expect(intent.choices).toEqual([{ noun: 'מסלול', count: 3 }]);
    expect(intent.capacity).toBe(true);
    expect(intent.parentalConsent).toBe(true);
    expect(intent.audience.minors).toBe(true);
    expect(intent.payment).toBe('optional');
    // "אישור הורה" is customer consent, not a business approval.
    expect(intent.approval).toBe(false);
  });

  it('composes the contest registration from blocks instead of a template', () => {
    const r = generateWorkflowFromPrompt(CONTEST);
    expect(r.composed).toBe(true);
    expect(WorkflowConfigSchema.safeParse(r.config).success).toBe(true);
    const track = r.config.steps.flatMap((s) => s.fields).find((f) => f.key === 'track')!;
    expect(track.options).toHaveLength(3);
    expect(track.options!.every((o) => o.capacity === 30 && o.price! > 0)).toBe(true);
    expect(r.config.completion).toMatchObject({ mode: 'calculated', allowPayLater: true });
    expect(r.config.pricing.enabled).toBe(true);
    expect(r.reviewNotes.join(' ')).toMatch(/בדפדפן זה בלבד/);
    expect(r.config.draftNotes?.length).toBeGreaterThan(0);
    expect(r.themeRecommendation.presetId).toBe('creative_studio');
  });

  it('shows the parent step only for minors', () => {
    const { config } = generateWorkflowFromPrompt(CONTEST);
    const titles = (age: number) => visibleSteps(config, { age }).map((s) => s.title);
    expect(titles(12)).toContain('אישור הורה');
    expect(titles(25)).not.toContain('אישור הורה');
  });

  it('prices by selected track', () => {
    const { config } = generateWorkflowFromPrompt(CONTEST);
    const track = config.steps[0]!.fields.find((f) => f.key === 'track')!;
    expect(computePrice(config, { track: track.options![1]!.value }).total).toBe(track.options![1]!.price);
  });

  it('respects explicit numbers, approval and no-payment wording', () => {
    const r = generateWorkflowFromPrompt('הרשמה לסדנת קרמיקה עם 2 מועדים, עד 12 משתתפים, באישור ידני, ללא תשלום');
    const f = r.config.steps[0]!.fields.find((x) => x.key === 'track')!;
    expect(f.label).toBe('בחירת מועד');
    expect(f.options!.map((o) => o.capacity)).toEqual([12, 12]);
    expect(r.config.completion?.mode).toBe('request');
    expect(r.intent.approval).toBe(true);
    expect(r.config.confirmation?.title).toMatch(/ממתינה לאישור/);
  });

  it('flags requirements the demo cannot implement instead of faking them', () => {
    const r = generateWorkflowFromPrompt('מוסך שרוצה שהלקוח יאשר תיקונים, יחתום חתימה דיגיטלית ויקבל SMS וחשבונית');
    expect(r.composed).toBe(false);
    expect(r.templateKey).toBe('garage_repairs');
    const notes = r.reviewNotes.join(' | ');
    expect(notes).toMatch(/חתימה דיגיטלית/);
    expect(notes).toMatch(/SMS/);
    expect(notes).toMatch(/חשבונית/);
  });

  it('keeps domain prompts on their templates', () => {
    expect(generateWorkflowFromPrompt('אני חנות פרחים ורוצה שלקוחות יזמינו זר').templateKey).toBe('flower_order');
    expect(generateWorkflowFromPrompt('מסעדה שמקבלת בקשות לאירועים פרטיים עם מקדמה').composed).toBe(false);
  });

  it('composes a feedback survey without payment', () => {
    const r = generateWorkflowFromPrompt('סקר שביעות רצון ללקוחות אחרי טיפול, עם דירוג והערות');
    expect(r.composed).toBe(true);
    expect(r.config.completion?.mode).toBe('request');
    expect(r.config.steps[0]!.fields[0]!.key).toBe('rating');
  });
});
