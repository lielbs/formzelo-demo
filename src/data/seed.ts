/**
 * FICTIONAL demo data. All names, phones (050-555-xxxx) and emails
 * (@example.com) are invented. Every seeded record carries isDemo: true.
 */
import {
  SCHEMA_VERSION,
  type OrgData,
  type Organization,
  type RunEvent,
  type RunStatus,
  type Workflow,
  type WorkflowConfig,
  type WorkflowRun,
  type WorkflowVersion,
} from '../domain/schema';
import type { Values } from '../engine/conditions';
import { initialPayment, paymentOnApproval, simulatePaid } from '../engine/completion';
import { computePrice } from '../engine/pricing';
import { buildSubmission, nextReference, statusNotification, submitNotifications } from '../engine/runs';
import { TEMPLATES, type TemplateKey } from '../engine/templates';
import { STATUS_LABELS } from '../engine/transitions';
import { DEMO_EXTRAS } from './demoExtras';
import { toRunAnswers } from '../engine/validation';
import type { PresenceLink, PresenceSettings, WorkflowTheme } from '../domain/theme';
import { isoDay } from '../lib/format';
import { brandKitFromTheme, defaultBrandKit, freezeTheme } from '../theme/brand';
import { recommendTheme } from '../theme/resolver';
import { newId } from '../lib/id';
import { actionSummary, buildAction, respond, type ActionInput } from '../engine/actions';
import { applyShowcase } from './showcase';

export const DEMO_ORG_IDS = { bloom: 'org_bloom', autocare: 'org_autocare', urban: 'org_urban', valley: 'org_valley' } as const;
export const DEMO_SLUGS = { flowers: 'bloom-flowers', garage: 'autocare-repairs', events: 'urban-table-events', booking: 'urban-table-booking', contest: 'valley-run' } as const;
/** Stable open case so the landing page can link straight to a live garage approval. */
export const DEMO_GARAGE_CASE_ID = 'run_demo_garage_case';


/**
 * Sample business links for the fictional demo workspaces. Every one is flagged
 * `sample`, so customers see a labelled, NON-clickable preview — demo visitors are
 * never sent to real, unrelated accounts. Domains use reserved names (.example,
 * example.com) and fictional 555 numbers wherever the platform allows it.
 */
const L = (id: string, platform: PresenceLink['platform'], value: string, extra: Partial<PresenceLink> = {}): PresenceLink => ({ id, platform, value, enabled: true, sample: true, ...extra });

export const DEMO_LINKS: Record<string, PresenceLink[]> = {
  [DEMO_ORG_IDS.bloom]: [
    L('lnk_bloom_ig', 'instagram', '@bloom.studio.demo'),
    L('lnk_bloom_web', 'website', 'https://bloom-studio.example'),
    L('lnk_bloom_wa', 'whatsapp', '050-555-0100'),
    L('lnk_bloom_tel', 'phone', '03-555-0100'),
    L('lnk_bloom_review', 'google_review', 'https://g.page/r/DEMO-BLOOM/review'),
  ],
  [DEMO_ORG_IDS.autocare]: [
    L('lnk_auto_waze', 'waze', 'https://waze.com/ul/autocare-demo'),
    L('lnk_auto_wa', 'whatsapp', '050-555-0177'),
    L('lnk_auto_tel', 'phone', '03-555-0177'),
    L('lnk_auto_maps', 'google_maps', 'https://maps.app.goo.gl/autocare-demo'),
    L('lnk_auto_review', 'google_review', 'https://g.page/r/DEMO-AUTOCARE/review'),
  ],
  [DEMO_ORG_IDS.urban]: [
    L('lnk_urban_ig', 'instagram', '@urban.table.demo'),
    L('lnk_urban_maps', 'google_maps', 'https://maps.app.goo.gl/urban-table-demo'),
    L('lnk_urban_web', 'website', 'https://urban-table.example'),
    L('lnk_urban_tel', 'phone', '03-555-0133'),
    L('lnk_urban_tt', 'tiktok', '@urban.table.demo'),
  ],
  [DEMO_ORG_IDS.valley]: [
    L('lnk_valley_web', 'website', 'https://valley-run.example'),
    L('lnk_valley_ig', 'instagram', '@valley.run.demo'),
    L('lnk_valley_fb', 'facebook', 'https://facebook.com/valley.run.demo'),
    L('lnk_valley_rules', 'custom', 'https://valley-run.example/rules', { label: 'תקנון המרוץ', description: 'כללים, ציוד ומסלולים', icon: 'link' }),
  ],
};

const DAY = 86_400_000;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['מאיה ברק', 'יונתן שגיא', 'רוני אלון', 'תמר גל', 'עידו נחום', 'שירה פז', 'אורי דגן', 'נעמה רז', 'אלון שחר', 'ליה כרמי', 'גיל עופר', 'הדס מור'];
const phone = (i: number) => `050-555-${String(100 + i).padStart(4, '0')}`;

/** Owner-side path from submission to the target status, for a believable timeline. */
const PATHS: Partial<Record<RunStatus, RunStatus[]>> = {
  submitted: [],
  in_review: ['in_review'],
  approved: ['in_review', 'approved'],
  completed: ['in_review', 'approved', 'completed'],
  rejected: ['rejected'],
  changes_requested: ['changes_requested'],
  cancelled: ['cancelled'],
};

interface Ctx {
  data: OrgData;
  now: number;
  rand: () => number;
  /** The first workflow added defines the workspace brand kit. */
  kitFromWorkflow?: boolean;
  /** Brand Kit links for the workspace (set before the first workflow is frozen). */
  links?: PresenceLink[];
}

function org(id: string, slug: string, name: string, industry: string, tagline: string, color: string, email: string, now: number): Organization {
  const at = new Date(now - 40 * DAY).toISOString();
  return { id, slug, name, industry, tagline, brand: { primaryColor: color, logoText: name }, contactEmail: email, isDemo: true, createdAt: at, updatedAt: at };
}

function emptyData(organization: Organization): OrgData {
  const at = organization.createdAt;
  return {
    schemaVersion: SCHEMA_VERSION,
    organization,
    memberships: [
      { id: newId('mem'), orgId: organization.id, userName: 'בעלי העסק (דמו)', role: 'owner', simulated: true, createdAt: at, updatedAt: at },
      { id: newId('mem'), orgId: organization.id, userName: 'צוות (דמו)', role: 'staff', simulated: true, createdAt: at, updatedAt: at },
    ],
    workflows: [],
    versions: [],
    runs: [],
    events: [],
    notifications: [],
    usage: [],
    brandKit: defaultBrandKit(organization.name, at),
    actions: [],
  };
}

/** The demo business's own add-ons on top of the design's texture. */
export function withDemoExtras<T extends { extras?: WorkflowTheme['extras'] }>(slug: string, design: T): T {
  const own = DEMO_EXTRAS[slug];
  return own ? { ...design, extras: { ...design.extras, ...structuredClone(own) } } : design;
}

function addWorkflow(
  ctx: Ctx,
  opts: { slug: string; templateKey: TemplateKey; status: Workflow['status']; config?: WorkflowConfig; daysAgo: number; presence?: Omit<PresenceSettings, 'links'> },
): { workflow: Workflow; version?: WorkflowVersion } {
  const config = opts.config ?? TEMPLATES[opts.templateKey].build();
  const at = new Date(ctx.now - opts.daysAgo * DAY).toISOString();
  const workflow: Workflow = {
    id: newId('wf'),
    orgId: ctx.data.organization.id,
    slug: opts.slug,
    status: opts.status,
    templateKey: opts.templateKey,
    draft: config,
    design: withDemoExtras(opts.slug, { ...recommendTheme({ templateKey: opts.templateKey, title: config.title, description: config.description, industry: ctx.data.organization.industry }).theme, inheritBrand: true, ...(opts.presence ? { presence: opts.presence } : {}) }),
    hasUnpublishedChanges: false,
    isDemo: true,
    createdAt: at,
    updatedAt: at,
  };
  if (!ctx.kitFromWorkflow) {
    const o = ctx.data.organization;
    ctx.data.brandKit = { ...brandKitFromTheme(o.name, o.tagline, workflow.design, at), links: structuredClone(ctx.links ?? DEMO_LINKS[o.id] ?? []) };
    ctx.kitFromWorkflow = true;
  }
  ctx.data.workflows.push(workflow);
  ctx.data.usage.push({ id: newId('use'), orgId: workflow.orgId, type: 'workflow_created', workflowId: workflow.id, createdAt: at, updatedAt: at });
  if (opts.status === 'draft') return { workflow };
  const version: WorkflowVersion = {
    id: newId('ver'),
    orgId: workflow.orgId,
    workflowId: workflow.id,
    version: 1,
    config: structuredClone(config),
    design: freezeTheme(workflow.design, ctx.data.brandKit),
    publishedAt: at,
    createdAt: at,
    updatedAt: at,
  };
  workflow.publishedVersionId = version.id;
  ctx.data.versions.push(version);
  ctx.data.usage.push({ id: newId('use'), orgId: workflow.orgId, type: 'workflow_published', workflowId: workflow.id, createdAt: at, updatedAt: at });
  return { workflow, version };
}

function event(ctx: Ctx, run: WorkflowRun, at: string, e: Pick<RunEvent, 'type' | 'actor' | 'message'> & Partial<RunEvent>) {
  ctx.data.events.push({ id: newId('evt'), orgId: run.orgId, runId: run.id, internal: false, createdAt: at, updatedAt: at, ...e });
}

function addRun(
  ctx: Ctx,
  wf: { workflow: Workflow; version?: WorkflowVersion },
  opts: { values: Values; caseValues?: Values; status: RunStatus; hoursAgo: number; note?: string; depositPaid?: boolean; payNow?: boolean; id?: string },
): WorkflowRun {
  const version = wf.version!;
  const config = version.config;
  const created = ctx.now - opts.hoursAgo * 3_600_000;
  const iso = (offsetH: number) => new Date(created + offsetH * 3_600_000).toISOString();
  const caseAnswers = opts.caseValues ? toRunAnswers(config.caseFields, opts.caseValues) : [];
  const isCaseOpen = opts.status === 'awaiting_customer';
  const sub = buildSubmission(config, isCaseOpen ? {} : opts.values, caseAnswers);
  const run: WorkflowRun = {
    id: opts.id ?? newId('run'),
    orgId: ctx.data.organization.id,
    workflowId: wf.workflow.id,
    versionId: version.id,
    versionNumber: version.version,
    reference: nextReference(ctx.data.organization, ctx.data.runs),
    status: 'submitted',
    answers: isCaseOpen ? [] : sub.answers,
    caseAnswers,
    priceLines: isCaseOpen ? [] : sub.priceLines,
    total: isCaseOpen ? 0 : sub.total,
    payment: isCaseOpen ? { status: 'none', amount: 0 } : initialPayment(config, computePrice(config, opts.values), Boolean(opts.payNow), iso(0)),
    completionMode: config.completion?.mode,
    customerName: sub.customerName,
    customerContact: sub.customerContact,
    consentAt: isCaseOpen ? undefined : iso(0),
    submittedAt: isCaseOpen ? undefined : iso(0),
    isDemo: true,
    createdAt: iso(0),
    updatedAt: iso(0),
  };
  ctx.data.runs.push(run);

  if (config.mode === 'case') {
    event(ctx, run, iso(-2), { type: 'case_created', actor: 'owner', message: 'נפתח תיק ונשלח קישור אישי ללקוח' });
  }
  if (isCaseOpen) {
    run.status = 'awaiting_customer';
    run.createdAt = iso(-2);
    return run;
  }

  event(ctx, run, iso(0), { type: 'submitted', actor: 'customer', message: 'הלקוח/ה שלח/ה את הבקשה', to: 'submitted' });
  ctx.data.usage.push({ id: newId('use'), orgId: run.orgId, type: 'run_submitted', workflowId: run.workflowId, createdAt: iso(0), updatedAt: iso(0) });
  ctx.data.notifications.push(...submitNotifications(ctx.data.organization, run, config.title, iso(0)));

  let from: RunStatus = 'submitted';
  let h = 1 + ctx.rand() * 3;
  for (const to of PATHS[opts.status] ?? []) {
    const at = iso(Math.min(h, opts.hoursAgo - 0.1));
    if (to === 'approved') run.payment = paymentOnApproval(config, run.payment, at);
    if (to === 'approved' && config.booking?.enabled) event(ctx, run, at, { type: 'booking_confirmed', actor: 'owner', message: 'ההזמנה אושרה — השולחן שמור (דמו מקומי)' });
    event(ctx, run, at, { type: 'status_changed', actor: 'owner', from, to, message: `הסטטוס שונה ל"${STATUS_LABELS[to]}"` });
    const n = statusNotification(ctx.data.organization, run, to, undefined, at);
    if (n) ctx.data.notifications.push(n);
    from = to;
    run.updatedAt = at;
    h += 2 + ctx.rand() * 10;
  }
  run.status = opts.status;
  if (opts.depositPaid) {
    const paid = simulatePaid(run.payment, run.updatedAt);
    if (paid) {
      run.payment = paid;
      event(ctx, run, run.updatedAt, { type: 'payment_simulated', actor: 'owner', message: 'תשלום סומן כשולם (סימולציה — לא בוצע חיוב)' });
    }
  }
  if (opts.note) event(ctx, run, run.updatedAt, { type: 'note_added', actor: 'owner', message: opts.note, internal: true });
  return run;
}

function seedBloom(now: number): OrgData {
  const ctx: Ctx = { data: emptyData(org(DEMO_ORG_IDS.bloom, 'bloom-studio', 'Bloom Studio', 'חנות פרחים', 'זרים בעבודת יד, משלוחים בעיר', '#B84C6E', 'hello@bloom.example.com', now)), now, rand: rng(11) };
  const flowers = addWorkflow(ctx, {
    slug: DEMO_SLUGS.flowers,
    templateKey: 'flower_order',
    status: 'published',
    daysAgo: 30,
    presence: { visibility: 'selected', selected: ['lnk_bloom_ig', 'lnk_bloom_web', 'lnk_bloom_wa'], placement: 'footer_completion', style: 'icon_label', reviewCta: true },
  });
  const workshopConfig = TEMPLATES.generic.build();
  workshopConfig.title = 'הרשמה לסדנת זרים';
  workshopConfig.description = 'טיוטה: סדנת קיץ לקבוצות קטנות.';
  workshopConfig.branding = { primaryColor: '#B84C6E', logoText: 'Bloom Studio' };
  addWorkflow(ctx, { slug: 'bloom-workshop', templateKey: 'generic', status: 'draft', config: workshopConfig, daysAgo: 3 });

  const budgets = ['150', '250', '350', '500'];
  const palettes = ['pastel', 'vivid', 'white_green', 'seasonal'];
  const occasions = ['birthday', 'anniversary', 'thanks', 'get_well', 'new_baby', 'just_because'];
  const plan: [RunStatus, number, string?][] = [
    ['submitted', 2],
    ['submitted', 7],
    ['in_review', 20],
    ['approved', 44, 'ביקשה ורדים לבנים בלבד'],
    ['completed', 80],
    ['completed', 130],
    ['completed', 190],
    ['rejected', 230, 'אזור משלוח מחוץ לטווח'],
    ['changes_requested', 260],
    ['completed', 330],
    ['completed', 410],
  ];
  plan.forEach(([status, hoursAgo, note], i) => {
    const r = ctx.rand;
    addRun(ctx, flowers, {
      status,
      hoursAgo,
      note,
      payNow: status === 'completed' || i % 3 === 0,
      values: {
        budget: budgets[Math.floor(r() * budgets.length)],
        palette: palettes[i % palettes.length],
        occasion: occasions[i % occasions.length],
        greeting: i % 3 === 0 ? 'מזל טוב! אוהבים אותך' : 'חושבים עליך ❤',
        sender: NAMES[i % NAMES.length],
        sender_phone: phone(i),
        gift_wrap: r() > 0.5,
        bouquet_style: ['round', 'garden', 'tall'][i % 3],
        recipient: NAMES[(i + 5) % NAMES.length],
        recipient_phone: phone(i + 40),
        address: ['הרצל 12, תל אביב', 'העצמאות 4, חיפה', 'ביאליק 30, רמת גן', 'הנביאים 8, ירושלים'][i % 4],
        delivery_date: isoDay(Math.round(2 - hoursAgo / 24), new Date(now)),
      },
    });
  });
  return ctx.data;
}

function seedAutoCare(now: number): OrgData {
  const ctx: Ctx = { data: emptyData(org(DEMO_ORG_IDS.autocare, 'autocare', 'AutoCare Garage', 'מוסך', 'שירות ותיקונים לכל סוגי הרכב', '#2F5D8A', 'service@autocare.example.com', now)), now, rand: rng(22) };
  const repairs = addWorkflow(ctx, {
    slug: DEMO_SLUGS.garage,
    templateKey: 'garage_repairs',
    status: 'published',
    daysAgo: 28,
    presence: { visibility: 'selected', selected: ['lnk_auto_waze', 'lnk_auto_wa', 'lnk_auto_tel', 'lnk_auto_maps'], placement: 'completion', style: 'cards', reviewCta: true },
  });
  const cars = ['טויוטה קורולה 2019', 'יונדאי i30 2021', 'מאזדה 3 2018', 'קיה פיקנטו 2020', 'סקודה אוקטביה 2017', 'שברולט ספארק 2016'];
  const decide = (a: boolean) => (a ? 'approved' : 'declined');
  const plan: [RunStatus, number, [boolean, boolean, boolean]][] = [
    ['submitted', 3, [true, true, false]],
    ['in_review', 26, [true, false, false]],
    ['completed', 70, [true, true, true]],
    ['completed', 150, [false, true, true]],
    ['approved', 200, [true, false, true]],
    ['completed', 300, [true, true, false]],
  ];
  plan.forEach(([status, hoursAgo, d], i) => {
    addRun(ctx, repairs, {
      status,
      hoursAgo,
      caseValues: {
        customer_name: NAMES[(i + 2) % NAMES.length],
        customer_phone: phone(i + 10),
        car_plate: `${10 + i * 7}-${300 + i * 41}-${50 + i}`,
        car_model: cars[i % cars.length],
        advisor: 'אבי (דמו)',
      },
      values: { brake_pads: decide(d[0]), cabin_filter: decide(d[1]), wipers: decide(d[2]), pickup_time: 'tomorrow', notes: i === 0 ? 'אפשר לבדוק גם את המזגן?' : '' },
    });
  });
  addRun(ctx, repairs, {
    id: DEMO_GARAGE_CASE_ID,
    status: 'awaiting_customer',
    hoursAgo: 1,
    values: {},
    caseValues: { customer_name: 'דנה שמיר', customer_phone: phone(77), car_plate: '84-219-63', car_model: 'טויוטה יאריס 2020', advisor: 'אבי (דמו)' },
  });
  return ctx.data;
}

function seedUrban(now: number): OrgData {
  const ctx: Ctx = { data: emptyData(org(DEMO_ORG_IDS.urban, 'urban-table', 'Urban Table', 'מסעדה', 'מטבח עונתי ואירועים פרטיים', '#3A8A78', 'events@urbantable.example.com', now)), now, rand: rng(33) };
  const events = addWorkflow(ctx, {
    slug: DEMO_SLUGS.events,
    templateKey: 'restaurant_event',
    status: 'published',
    daysAgo: 26,
    presence: { visibility: 'selected', selected: ['lnk_urban_ig', 'lnk_urban_maps', 'lnk_urban_web'], placement: 'completion', style: 'cards', reviewCta: false },
  });
  const holiday = TEMPLATES.restaurant_event.build();
  holiday.title = 'תפריט חג — 2025';
  addWorkflow(ctx, { slug: 'urban-holiday-2025', templateKey: 'restaurant_event', status: 'archived', config: holiday, daysAgo: 35 });

  const menus = ['classic', 'chef', 'vegan'];
  const types = ['birthday', 'business', 'family', 'other'];
  const plan: [RunStatus, number, number, boolean?][] = [
    ['submitted', 5, 24],
    ['in_review', 30, 40],
    ['approved', 60, 18],
    ['approved', 120, 32, true],
    ['completed', 260, 60, true],
    ['rejected', 340, 75],
  ];
  addBookingDemo(ctx);
  plan.forEach(([status, hoursAgo, guests, depositPaid], i) => {
    const type = types[i % types.length]!;
    addRun(ctx, events, {
      status,
      hoursAgo,
      depositPaid,
      values: {
        event_date: isoDay(14 + i * 9, new Date(now)),
        guests,
        event_type: type,
        slot: i % 2 ? 'lunch' : 'dinner',
        menu: menus[i % menus.length],
        wine: i % 2 === 0,
        extras: i % 3 === 0 ? ['cake', 'decor'] : ['private_room'],
        dietary: i === 1 ? 'שני סועדים ללא גלוטן' : '',
        contact_name: NAMES[(i + 7) % NAMES.length],
        contact_phone: phone(i + 20),
        contact_email: `guest${i + 1}@example.com`,
        company: type === 'business' ? 'סטארט-אפ דמו בע״מ' : undefined,
      },
    });
  });
  return ctx.data;
}

const BOOKING_PLAN: [RunStatus, number, number, string, number][] = [
  // status, hours ago, days ahead, time, guests
  ['submitted', 1, 2, '20:00', 4],
  ['approved', 9, 2, '20:00', 6],
  ['approved', 20, 2, '20:00', 5],
  ['in_review', 4, 3, '19:30', 2],
  ['approved', 30, 5, '21:00', 8],
  ['rejected', 50, 1, '18:00', 10],
  ['completed', 120, -3, '19:00', 3],
];

/** Urban Table booking requests demo. Also used by the v2 → v3 migration for existing browsers. */
function addBookingDemo(ctx: Ctx) {
  const booking = addWorkflow(ctx, {
    slug: DEMO_SLUGS.booking,
    templateKey: 'table_booking',
    status: 'published',
    daysAgo: 12,
    // A booking request is not a delivered service: no review request here.
    presence: { visibility: 'selected', selected: ['lnk_urban_maps', 'lnk_urban_tel', 'lnk_urban_ig'], placement: 'footer_completion', style: 'icon_label', reviewCta: false },
  });
  const openDay = (offset: number) => {
    // Shift forward to the next open day so seeded requests are valid.
    let d = offset;
    while (new Date(ctx.now + d * 86_400_000).getDay() === 0) d++;
    return isoDay(d, new Date(ctx.now));
  };
  BOOKING_PLAN.forEach(([status, hoursAgo, days, time, guests], i) => {
    addRun(ctx, booking, {
      status,
      hoursAgo,
      values: {
        booking_date: openDay(days),
        booking_time: time,
        party_size: guests,
        seating: ['inside', 'bar', 'terrace', 'any'][i % 4],
        guest_name: NAMES[(i + 3) % NAMES.length],
        guest_phone: phone(i + 60),
        occasion: ['none', 'birthday', 'date', 'business'][i % 4],
        requests: i === 1 ? 'כיסא תינוק' : '',
      },
    });
  });
}

/** Adds the booking demo to an existing (migrated) Urban Table workspace, without touching other data. */
export function appendBookingDemo(data: OrgData, now = Date.now()): OrgData {
  const ctx: Ctx = { data, now, rand: rng(44), kitFromWorkflow: true };
  addBookingDemo(ctx);
  return ctx.data;
}

// status, hours ago, track, age (under 18 adds parental consent), pay now
const CONTEST_PLAN: [RunStatus, number, string, number, boolean][] = [
  ['submitted', 2, 'half_21k', 34, true],
  ['approved', 7, 'half_21k', 41, true],
  ['approved', 16, 'half_21k', 29, false],
  ['approved', 30, 'half_21k', 52, true],
  ['in_review', 40, 'half_21k', 17, false],
  ['approved', 55, 'half_21k', 38, true],
  ['approved', 70, 'half_21k', 45, true],
  ['submitted', 5, 'classic_10k', 27, false],
  ['approved', 26, 'classic_10k', 33, true],
  ['submitted', 9, 'family_3k', 11, false],
  ['approved', 48, 'family_3k', 39, true],
  ['approved', 90, 'half_21k', 36, true],
  ['rejected', 80, 'half_21k', 15, false],
];

/** Valley Run — community race registration (contest showcase). */
function seedValley(now: number): OrgData {
  const ctx: Ctx = { data: emptyData(org(DEMO_ORG_IDS.valley, 'valley-run', 'Valley Run', 'אירועי ספורט', 'מרוץ קהילתי לכל הגילים', '#3D3BF3', 'hello@valleyrun.example.com', now)), now, rand: rng(55) };
  const contest = addWorkflow(ctx, { slug: DEMO_SLUGS.contest, templateKey: 'contest_registration', status: 'published', daysAgo: 18, presence: { visibility: 'all', selected: [], placement: 'footer_completion', style: 'icon_label', reviewCta: false } });
  CONTEST_PLAN.forEach(([status, hoursAgo, track, age, payNow], i) => {
    const minor = age < 18;
    addRun(ctx, contest, {
      status,
      hoursAgo,
      payNow,
      values: {
        track,
        shirt: ['s', 'm', 'l', 'm', 'xl'][i % 5],
        name: NAMES[(i + 5) % NAMES.length],
        age,
        phone: phone(i + 80),
        email: `runner${i + 1}@example.com`,
        health: true,
        ...(minor ? { parent_name: 'הורה (דמו)', parent_phone: phone(i + 90), parent_consent: true } : {}),
      },
      note: status === 'rejected' ? 'גיל מתחת למינימום לחצי מרתון — הוצע מסלול 10 ק״מ' : undefined,
    });
  });
  return ctx.data;
}

/** Demo workspaces added after launch; existing browsers receive them through the v3 → v4 migration. */
export const LATER_DEMO_ORGS: Record<string, (now: number) => OrgData> = { [DEMO_ORG_IDS.valley]: seedValley };

type DemoAction = { slug: string; status: RunStatus; input: ActionInput; hoursAgo: number; answer?: 'a' | 'b'; answeredHoursAgo?: number };

/** Formangle Actions on the demo requests, so the inbox shows open and answered decisions. */
const DEMO_ACTIONS: Record<string, DemoAction[]> = {
  [DEMO_ORG_IDS.autocare]: [
    { slug: DEMO_SLUGS.garage, status: 'submitted', hoursAgo: 1, input: { kind: 'approval', title: 'בדיקת מערכת המיזוג', description: 'ביקשתם שנבדוק גם את המזגן. הבדיקה כוללת לחץ גז ואיתור נזילות. האם לאשר?', amount: 180, note: 'המחיר כולל מע״מ. אם יידרש תיקון, נשלח בקשת אישור נפרדת.' } },
    { slug: DEMO_SLUGS.garage, status: 'in_review', hoursAgo: 20, answer: 'a', answeredHoursAgo: 19, input: { kind: 'approval', title: 'החלפת רפידות בלם', description: 'בבדיקה נמצא שרפידות הבלם הקדמיות שחוקות. האם לאשר את העבודה?', amount: 480 } },
    { slug: DEMO_SLUGS.garage, status: 'in_review', hoursAgo: 18, answer: 'b', answeredHoursAgo: 17, input: { kind: 'choice', title: 'איך תרצו לקבל את הרכב?', description: 'הרכב יהיה מוכן מחר אחרי 14:00.', options: ['איסוף מהמוסך', 'החזרה עד הבית (₪60)'] } },
  ],
  [DEMO_ORG_IDS.bloom]: [
    { slug: DEMO_SLUGS.flowers, status: 'submitted', hoursAgo: 2, input: { kind: 'choice', title: 'איך תרצו לקבל את הזר?', description: 'הזר יהיה מוכן מחר מ-10:00.', options: ['משלוח', 'איסוף עצמי'] } },
    { slug: DEMO_SLUGS.flowers, status: 'approved', hoursAgo: 5, input: { kind: 'update', title: 'הזר מוכן לאיסוף', description: 'אפשר לאסוף היום עד 19:00 מהסטודיו.' } },
  ],
  [DEMO_ORG_IDS.urban]: [
    { slug: DEMO_SLUGS.booking, status: 'approved', hoursAgo: 3, input: { kind: 'update', title: 'השולחן שמור', description: 'נשמח לראותכם. אם מתעכבים, נשמור את השולחן 15 דקות.' } },
  ],
};

/**
 * Adds the demo actions to a demo workspace that has none (fresh seed, or the v6 -> v7 migration).
 * Each goes on the most recent request of its workflow in the given status.
 */
export function appendDemoActions(data: OrgData, now = Date.now()): OrgData {
  const plan = DEMO_ACTIONS[data.organization.id];
  if (!plan || data.actions.length) return data;
  plan.forEach((p, i) => {
    const wf = data.workflows.find((w) => w.slug === p.slug);
    const run = data.runs
      .filter((r) => r.workflowId === wf?.id && r.status === p.status && r.id !== DEMO_GARAGE_CASE_ID)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!run) return;
    const at = new Date(now - p.hoursAgo * 3_600_000).toISOString();
    let action = buildAction(p.input, run, { id: `act_demo_${data.organization.id.slice(4)}_${i + 1}` }, at);
    data.events.push({ id: newId('evt'), orgId: run.orgId, runId: run.id, actionId: action.id, type: 'action_created', actor: 'owner', message: `${action.kind === 'update' ? 'עדכון ללקוח' : 'נפתחה בקשה ללקוח'}: ${actionSummary(action)}`, internal: false, createdAt: at, updatedAt: at });
    if (p.answer) {
      const answeredAt = new Date(now - (p.answeredHoursAgo ?? p.hoursAgo) * 3_600_000).toISOString();
      action = respond(action, p.answer, answeredAt);
      data.events.push({ id: newId('evt'), orgId: run.orgId, runId: run.id, actionId: action.id, type: 'action_responded', actor: 'customer', message: `הלקוח/ה בחר/ה "${action.response!.label}" — ${actionSummary(action)}`, internal: false, createdAt: answeredAt, updatedAt: answeredAt });
    }
    data.actions.push(action);
  });
  return data;
}

export function buildSeed(now = Date.now()): OrgData[] {
  return [seedBloom(now), seedAutoCare(now), seedUrban(now), seedValley(now)].map((d) => applyShowcase(appendDemoActions(d, now)));
}
