import { beforeEach, describe, expect, it } from 'vitest';
import { migrateOrgData } from '../data/migrations';
import { LocalStorageRepository, type KeyValueStore } from '../data/localRepository';
import { DomainRuleError, ValidationFailedError } from '../data/repository';
import { buildSeed, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { OrgDataSchema, WorkflowConfigSchema, type WorkflowConfig } from '../domain/schema';
import { slotAvailability, validateBooking, weekdayOf } from '../engine/booking';
import { completionOf, initialPayment, isPaymentOutstanding, paymentOnApproval, paymentPlan, safeExternalUrl, simulatePaid } from '../engine/completion';
import { computePrice } from '../engine/pricing';
import { field, TEMPLATES } from '../engine/templates';
import { toRunAnswers, validateRun } from '../engine/validation';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { isoDay } from '../lib/format';
import { effectiveTheme, freezeTheme } from '../theme/brand';
import { buildTheme } from '../theme/presets';

class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  key = (i: number) => [...this.m.keys()][i] ?? null;
  get length() {
    return this.m.size;
  }
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const AT = '2026-01-01T00:00:00.000Z';

/** Next date (from tomorrow) whose weekday is in `days`. */
function nextDay(days: number[], from = 1): string {
  for (let i = from; i < from + 14; i++) {
    const iso = isoDay(i);
    if (days.includes(weekdayOf(iso)!)) return iso;
  }
  throw new Error('no day');
}

const flowerValues = {
  budget: '350',
  palette: 'pastel',
  occasion: 'birthday',
  sender: 'בודק',
  sender_phone: '050-555-0199',
  gift_wrap: true,
  recipient: 'מקבל',
  recipient_phone: '050-555-0198',
  address: 'הרצל 1, תל אביב',
  delivery_date: isoDay(3),
};

const withCompletion = (c: WorkflowConfig['completion'], pricing = true): WorkflowConfig => {
  const cfg = TEMPLATES.restaurant_event.build();
  cfg.pricing.enabled = pricing;
  cfg.completion = c;
  return cfg;
};
const restaurantValues = { guests: 10, menu: 'classic' }; // 1,800

describe('completion modes (payment independent from pricing)', () => {
  it('derives legacy behaviour for versions without a completion block', () => {
    const legacy = TEMPLATES.restaurant_event.build();
    delete legacy.completion;
    expect(completionOf(legacy)).toEqual({ mode: 'deposit', depositPercent: 20, depositTiming: 'after_approval' });
    const quote = TEMPLATES.flower_order.build();
    delete quote.completion;
    expect(completionOf(quote).mode).toBe('quote');
    const plain = TEMPLATES.generic.build();
    delete plain.completion;
    expect(completionOf(plain).mode).toBe('request');
  });

  it('request-only and quote-only never create an outstanding payment', () => {
    const req = withCompletion({ mode: 'request' });
    const p1 = initialPayment(req, computePrice(req, restaurantValues), true, AT);
    expect(p1.status).toBe('none');
    expect(p1.amount).toBe(0);
    expect(isPaymentOutstanding(p1)).toBe(false);
    const q = withCompletion({ mode: 'quote' });
    const p2 = initialPayment(q, computePrice(q, restaurantValues), true, AT);
    expect(p2).toMatchObject({ status: 'quote', amount: 1800, kind: 'estimate' });
    expect(isPaymentOutstanding(p2)).toBe(false);
    // Approval of a request never invents a payment.
    expect(paymentOnApproval(req, p1, AT).status).toBe('none');
  });

  it('simulates a deposit on submit, and deposit / full payment after approval', () => {
    const onSubmit = withCompletion({ mode: 'deposit', depositPercent: 25, depositTiming: 'on_submit' });
    const price = computePrice(onSubmit, restaurantValues);
    expect(initialPayment(onSubmit, price, true, AT)).toMatchObject({ status: 'deposit_paid_simulated', amount: 450 });
    expect(initialPayment(onSubmit, price, false, AT)).toMatchObject({ status: 'deposit_requested', amount: 450 });

    const after = withCompletion({ mode: 'deposit', depositPercent: 20, depositTiming: 'after_approval' });
    const p = initialPayment(after, price, true, AT);
    expect(p).toMatchObject({ status: 'none', amount: 360 });
    const approved = paymentOnApproval(after, p, AT);
    expect(approved.status).toBe('deposit_requested');
    expect(simulatePaid(approved, AT)?.status).toBe('deposit_paid_simulated');

    const full = withCompletion({ mode: 'pay_after_approval' });
    expect(paymentOnApproval(full, initialPayment(full, price, true, AT), AT)).toMatchObject({ status: 'payment_requested', amount: 1800 });
  });

  it('fixed and calculated amounts, with an optional pay-later choice', () => {
    const fixed = withCompletion({ mode: 'fixed', fixedAmount: 250 });
    expect(paymentPlan(fixed, { total: 999 }).dueNow).toBe(250);
    const calc = withCompletion({ mode: 'calculated', allowPayLater: true });
    const price = computePrice(calc, restaurantValues);
    expect(initialPayment(calc, price, true, AT).status).toBe('paid_simulated');
    expect(initialPayment(calc, price, false, AT).status).toBe('payment_requested');
  });

  it('accepts only safe https external payment links', () => {
    expect(safeExternalUrl('https://pay.example.com/x?y=1')).toBe('https://pay.example.com/x?y=1');
    expect(safeExternalUrl('http://pay.example.com')).toBeNull();
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('https://user:pw@pay.example.com')).toBeNull();
    expect(WorkflowConfigSchema.safeParse({ ...withCompletion({ mode: 'external_link', externalUrl: 'javascript:alert(1)' }) }).success).toBe(false);
  });

  it('external links: shown on submit by default, or only after approval — never marked paid', () => {
    const now = withCompletion({ mode: 'external_link', externalUrl: 'https://pay.example.com/p' });
    const later = withCompletion({ mode: 'external_link', externalUrl: 'https://pay.example.com/p', externalTiming: 'after_approval' });
    const price = { total: 0, lines: [] } as unknown as Parameters<typeof initialPayment>[1];
    expect(initialPayment(now, price, true, AT)).toMatchObject({ status: 'external_link', kind: 'external' });
    const pending = initialPayment(later, price, true, AT);
    expect(pending).toMatchObject({ status: 'none', kind: 'external' });
    // Approval reveals the link even though Formangle calculated no amount; nothing becomes "paid".
    const approved = paymentOnApproval(later, pending, AT);
    expect(approved.status).toBe('external_link');
    expect(simulatePaid(approved, AT)).toBeNull();
    expect(paymentPlan(later, { total: 0 }).headline).toMatch(/אחרי אישור/);
  });
});

describe('booking requests', () => {
  const cfg = TEMPLATES.table_booking.build();
  const b = cfg.booking!;
  const run = (date: string, time: string, guests: number, status: 'submitted' | 'approved' | 'rejected' = 'approved') => ({
    id: `r_${date}_${time}_${guests}_${status}`,
    status,
    answers: toRunAnswers(cfg.steps.flatMap((s) => s.fields), { booking_date: date, booking_time: time, party_size: guests }),
  });

  it('rejects closed days and slots that are not offered', () => {
    const sunday = nextDay([0]);
    expect(validateBooking(cfg, { booking_date: sunday, booking_time: '19:00', party_size: 2 }, [])).toHaveProperty('booking_date');
    const open = nextDay([2]);
    const bad = { booking_date: open, booking_time: '17:15', party_size: 2 };
    expect(validateRun(cfg, { ...bad, guest_name: 'א', guest_phone: '050-555-0100' })).toHaveProperty('booking_time');
  });

  it('counts local capacity per slot; rejected requests free the slot', () => {
    const day = nextDay([3]);
    const runs = [run(day, '20:00', 8), run(day, '20:00', 6), run(day, '20:00', 4, 'rejected')] as never[];
    const slot = slotAvailability(b, day, runs).find((s) => s.time === '20:00')!;
    expect(slot.used).toBe(14);
    expect(slot.state).toBe('limited');
    expect(validateBooking(cfg, { booking_date: day, booking_time: '20:00', party_size: 3 }, runs)).toHaveProperty('booking_time');
    expect(validateBooking(cfg, { booking_date: day, booking_time: '20:00', party_size: 2 }, runs)).toEqual({});
  });
});

describe('content blocks are presentation only', () => {
  it('never become answers, validation errors or price lines', () => {
    const cfg = TEMPLATES.generic.build();
    cfg.steps[0]!.fields.unshift(
      field('intro', 'ברוכים הבאים', 'heading', { content: 'טקסט' }),
      field('terms_1', 'תנאים', 'terms', { content: 'א', required: true }),
      field('why', 'למה', 'highlights', { items: [{ id: 'hl_1', title: 'מהיר' }] }),
    );
    const values = { name: 'דנה', phone: '050-555-0101', request: 'שלום' };
    expect(validateRun(cfg, values)).toEqual({});
    expect(toRunAnswers(cfg.steps[0]!.fields, values).map((a) => a.fieldKey)).toEqual(['name', 'phone', 'email', 'request']);
    expect(WorkflowConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('rejects remote URLs as media', () => {
    const cfg = TEMPLATES.generic.build();
    cfg.steps[0]!.fields.push(field('img', 'תמונה', 'image', { media: ['https://evil.example.com/x.png'] }));
    expect(WorkflowConfigSchema.safeParse(cfg).success).toBe(false);
  });
});

describe('brand kit', () => {
  it('applies only to inheriting drafts and is frozen at publish', () => {
    const kit = buildSeed()[0]!.brandKit;
    const custom = { ...kit, palette: { ...kit.palette, primary: '#123456' } };
    const design = { ...buildTheme('creative_studio'), inheritBrand: true };
    expect(effectiveTheme(design, custom).palette.primary).toBe('#123456');
    expect(effectiveTheme({ ...design, inheritBrand: false }, custom).palette.primary).toBe(design.palette.primary);
    const frozen = freezeTheme(design, custom);
    expect(frozen.inheritBrand).toBe(false);
    expect(effectiveTheme(frozen, { ...custom, palette: { ...custom.palette, primary: '#654321' } }).palette.primary).toBe('#123456');
  });
});

describe('repository v3', () => {
  let store: MemoryStore;
  let repo: LocalStorageRepository;
  beforeEach(async () => {
    store = new MemoryStore();
    repo = new LocalStorageRepository(store);
    await repo.init();
  });

  it('persists the brand kit; published versions keep the old look until republished', async () => {
    const pub = (await repo.resolvePublic(DEMO_SLUGS.flowers))!;
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.bloom);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, palette: { ...kit.palette, primary: '#0F5E7A' } });
    const reopened = new LocalStorageRepository(store);
    expect((await reopened.getBrandKit(DEMO_ORG_IDS.bloom)).palette.primary).toBe('#0F5E7A');
    expect((await reopened.resolvePublic(DEMO_SLUGS.flowers))!.version.design.palette.primary).toBe(pub.version.design.palette.primary);
    const v2 = await reopened.publishWorkflow(DEMO_ORG_IDS.bloom, pub.workflow.id);
    expect(v2.design.palette.primary).toBe('#0F5E7A');
    expect(v2.design.inheritBrand).toBe(false);
    // Brand kits are per workspace.
    expect((await reopened.getBrandKit(DEMO_ORG_IDS.autocare)).palette.primary).not.toBe('#0F5E7A');
  });

  it('a workflow can override the brand kit', async () => {
    const wf = (await repo.listWorkflows(DEMO_ORG_IDS.bloom)).find((w) => w.slug === DEMO_SLUGS.flowers)!;
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.bloom);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, palette: { ...kit.palette, primary: '#111111' } });
    await repo.saveDraft(DEMO_ORG_IDS.bloom, wf.id, wf.draft, { ...wf.design, inheritBrand: false, palette: { ...wf.design.palette, primary: '#AA2244' } });
    const v = await repo.publishWorkflow(DEMO_ORG_IDS.bloom, wf.id);
    expect(v.design.palette.primary).toBe('#AA2244');
  });

  it('upload removal is blocked while the brand kit uses the image, allowed after', async () => {
    const logo = await repo.saveAsset(DEMO_ORG_IDS.bloom, { kind: 'logo', name: 'l.png', mime: 'image/png', dataUrl: TINY_PNG, width: 1, height: 1 });
    const kit = await repo.getBrandKit(DEMO_ORG_IDS.bloom);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, logoAssetId: logo.id });
    await expect(repo.deleteAsset(DEMO_ORG_IDS.bloom, logo.id)).rejects.toBeInstanceOf(DomainRuleError);
    await repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, logoAssetId: undefined });
    await repo.deleteAsset(DEMO_ORG_IDS.bloom, logo.id);
    expect(await repo.listAssets(DEMO_ORG_IDS.bloom)).toEqual([]);
    await expect(repo.updateBrandKit(DEMO_ORG_IDS.bloom, { ...kit, logoAssetId: 'ast_missing' })).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('flower order: calculated total with simulated pay-now or pay-later', async () => {
    const paid = await repo.submitRun(DEMO_SLUGS.flowers, { values: flowerValues, consent: true, payNow: true });
    expect(paid).toMatchObject({ total: 400, completionMode: 'calculated', payment: { status: 'paid_simulated', amount: 400 } });
    const later = await repo.submitRun(DEMO_SLUGS.flowers, { values: flowerValues, consent: true, payNow: false });
    expect(later.payment.status).toBe('payment_requested');
    const marked = await repo.markPaymentPaid(DEMO_ORG_IDS.bloom, later.id);
    expect(marked.payment.status).toBe('paid_simulated');
    await expect(repo.markPaymentPaid(DEMO_ORG_IDS.bloom, later.id)).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('garage case is a no-payment submission with exact approved total', async () => {
    const pub = (await repo.resolvePublic(DEMO_SLUGS.garage))!;
    const caseRun = (await repo.listRuns(DEMO_ORG_IDS.autocare)).find((r) => r.status === 'awaiting_customer')!;
    const run = await repo.submitRun(DEMO_SLUGS.garage, { runId: caseRun.id, consent: true, payNow: true, values: { brake_pads: 'approved', cabin_filter: 'declined', wipers: 'approved' } });
    expect(run.total).toBe(790);
    expect(run.payment).toMatchObject({ status: 'none', amount: 0 });
    expect(pub.version.config.completion?.mode).toBe('request');
  });

  it('booking request: validated, request until approved, then confirmed', async () => {
    const day = nextDay([1, 2, 3, 4, 5, 6], 6);
    const values = { booking_date: day, booking_time: '18:30', party_size: 4, guest_name: 'רון', guest_phone: '050-555-0123' };
    const sunday = nextDay([0]);
    await expect(repo.submitRun(DEMO_SLUGS.booking, { values: { ...values, booking_date: sunday }, consent: true })).rejects.toBeInstanceOf(ValidationFailedError);
    const run = await repo.submitRun(DEMO_SLUGS.booking, { values, consent: true });
    expect(run.payment.status).toBe('none');
    const slots = await repo.getBookingAvailability(DEMO_SLUGS.booking, day);
    expect(slots.find((s) => s.time === '18:30')?.used).toBe(4);
    const approved = await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'approved');
    expect(approved.status).toBe('approved');
    const events = await repo.listEvents(DEMO_ORG_IDS.urban, run.id);
    expect(events.some((e) => e.type === 'booking_confirmed')).toBe(true);
  });

  it('restaurant event keeps the original price and deposit-after-approval behaviour', async () => {
    const run = await repo.submitRun(DEMO_SLUGS.events, {
      consent: true,
      values: { event_date: isoDay(20), guests: 30, event_type: 'business', slot: 'dinner', menu: 'chef', wine: true, extras: ['cake'], contact_name: 'רון', contact_phone: '050-555-0166', contact_email: 'r@example.com', company: 'בדיקות' },
    });
    expect(run.total).toBe(9600);
    expect(run.payment).toMatchObject({ status: 'none', amount: 1920 });
    const approved = await repo.transitionRun(DEMO_ORG_IDS.urban, run.id, 'approved');
    expect(approved.payment.status).toBe('deposit_requested');
  });

  it('conditional required field (company only for business events)', async () => {
    const base = { event_date: isoDay(20), guests: 12, slot: 'lunch', menu: 'vegan', contact_name: 'א', contact_phone: '050-555-0100', contact_email: 'a@example.com' };
    await expect(repo.submitRun(DEMO_SLUGS.events, { consent: true, values: { ...base, event_type: 'business' } })).rejects.toBeInstanceOf(ValidationFailedError);
    const ok = await repo.submitRun(DEMO_SLUGS.events, { consent: true, values: { ...base, event_type: 'family' } });
    expect(ok.answers.some((a) => a.fieldKey === 'company')).toBe(false);
  });

  it('custom prompt -> create -> publish -> submit reaches the right inbox only', async () => {
    const gen = generateWorkflowFromPrompt('מספרה שרוצה לקבל בקשות לקביעת תור עם תאריך ושעה, ללא תשלום');
    expect(gen.templateKey).toBe('table_booking');
    expect(gen.completionMode).toBe('request');
    // A salon is not a restaurant: no table wording, no seating preference.
    expect(gen.config.title).not.toContain('שולחן');
    expect(gen.config.steps.flatMap((s) => s.fields).some((f) => f.key === 'seating')).toBe(false);
    const wf = await repo.createWorkflow(DEMO_ORG_IDS.autocare, { config: gen.config, templateKey: gen.templateKey, sourcePrompt: 'x', design: gen.theme });
    expect(wf.design.inheritBrand).toBe(true);
    await repo.publishWorkflow(DEMO_ORG_IDS.autocare, wf.id);
    const day = nextDay(gen.config.booking!.openWeekdays, 3);
    const run = await repo.submitRun(wf.slug, { consent: true, values: { booking_date: day, booking_time: gen.config.booking!.slots[0]!, service: gen.config.steps[0]!.fields.find((f) => f.key === 'service')!.options![0]!.value, party_size: 2, guest_name: 'לקוחה', guest_phone: '050-555-0177' } });
    expect((await repo.listRuns(DEMO_ORG_IDS.autocare)).some((r) => r.id === run.id)).toBe(true);
    expect((await repo.listRuns(DEMO_ORG_IDS.bloom)).some((r) => r.id === run.id)).toBe(false);
  });
});

describe('migration v2 -> v3', () => {
  const asV2 = (i: number) => {
    const d = structuredClone(buildSeed()[i]!) as unknown as Record<string, unknown> & { workflows: Record<string, unknown>[]; versions: { config: Record<string, unknown> }[] };
    d.schemaVersion = 2;
    delete d.brandKit;
    if (i === 2) {
      // A v2 Urban Table workspace never had the booking demo.
      const bookingWf = d.workflows.find((w) => w.slug === DEMO_SLUGS.booking)!;
      d.workflows = d.workflows.filter((w) => w !== bookingWf);
      d.versions = d.versions.filter((v) => (v as unknown as { workflowId: string }).workflowId !== bookingWf.id);
      d.runs = (d.runs as { workflowId: string }[]).filter((r) => r.workflowId !== bookingWf.id);
    }
    d.workflows.forEach((w) => delete (w.design as Record<string, unknown>).inheritBrand);
    return d;
  };

  it('creates a brand kit from the main workflow and keeps versions untouched', () => {
    const v2 = asV2(0);
    const before = JSON.stringify(v2.versions);
    const { value, migrated } = migrateOrgData(v2);
    expect(migrated).toBe(true);
    const parsed = OrgDataSchema.parse(value);
    expect(parsed.brandKit.personality).toBe('floral_boutique');
    expect(parsed.workflows.find((w) => w.slug === DEMO_SLUGS.flowers)!.design.inheritBrand).toBe(true);
    expect(JSON.stringify((value as { versions: unknown[] }).versions)).toBe(before);
  });

  it('adds the booking demo to an existing Urban Table workspace without touching its runs', () => {
    const v2 = asV2(2);
    const runIds = (v2.runs as { id: string }[]).map((r) => r.id);
    const parsed = OrgDataSchema.parse(migrateOrgData(v2).value);
    expect(parsed.workflows.some((w) => w.slug === DEMO_SLUGS.booking && w.status === 'published')).toBe(true);
    expect(runIds.every((id) => parsed.runs.some((r) => r.id === id))).toBe(true);
    expect(new Set(parsed.runs.map((r) => r.reference)).size).toBe(parsed.runs.length);
  });

  it('migrates stored v2 data in place on first read', async () => {
    const store = new MemoryStore();
    const seeded = new LocalStorageRepository(store);
    await seeded.init();
    store.setItem(`formzelo:v1:org:${DEMO_ORG_IDS.urban}`, JSON.stringify(asV2(2)));
    const meta = JSON.parse(store.getItem('formzelo:v1:meta')!);
    delete meta.slugIndex[DEMO_SLUGS.booking];
    store.setItem('formzelo:v1:meta', JSON.stringify({ ...meta, schemaVersion: 2 }));
    const repo = new LocalStorageRepository(store);
    await repo.init();
    expect((await repo.getBrandKit(DEMO_ORG_IDS.urban)).personality).toBe('hospitality_premium');
    expect(await repo.resolvePublic(DEMO_SLUGS.booking)).not.toBeNull();
  });
});
