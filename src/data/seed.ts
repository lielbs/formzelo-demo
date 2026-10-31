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
import { buildSubmission, referencePrefix, statusNotification, submitNotifications } from '../engine/runs';
import { TEMPLATES, type TemplateKey } from '../engine/templates';
import { STATUS_LABELS } from '../engine/transitions';
import { toRunAnswers } from '../engine/validation';
import { isoDay } from '../lib/format';
import { recommendTheme } from '../theme/resolver';
import { newId } from '../lib/id';

export const DEMO_ORG_IDS = { bloom: 'org_bloom', autocare: 'org_autocare', urban: 'org_urban' } as const;
export const DEMO_SLUGS = { flowers: 'bloom-flowers', garage: 'autocare-repairs', events: 'urban-table-events' } as const;
/** Stable open case so the landing page can link straight to a live garage approval. */
export const DEMO_GARAGE_CASE_ID = 'run_demo_garage_case';

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
  };
}

function addWorkflow(
  ctx: Ctx,
  opts: { slug: string; templateKey: TemplateKey; status: Workflow['status']; config?: WorkflowConfig; daysAgo: number },
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
    design: recommendTheme({ templateKey: opts.templateKey, title: config.title, description: config.description, industry: ctx.data.organization.industry }).theme,
    hasUnpublishedChanges: false,
    isDemo: true,
    createdAt: at,
    updatedAt: at,
  };
  ctx.data.workflows.push(workflow);
  ctx.data.usage.push({ id: newId('use'), orgId: workflow.orgId, type: 'workflow_created', workflowId: workflow.id, createdAt: at, updatedAt: at });
  if (opts.status === 'draft') return { workflow };
  const version: WorkflowVersion = {
    id: newId('ver'),
    orgId: workflow.orgId,
    workflowId: workflow.id,
    version: 1,
    config: structuredClone(config),
    design: structuredClone(workflow.design),
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
  opts: { values: Values; caseValues?: Values; status: RunStatus; hoursAgo: number; note?: string; depositPaid?: boolean; id?: string },
): WorkflowRun {
  const version = wf.version!;
  const config = version.config;
  const created = ctx.now - opts.hoursAgo * 3_600_000;
  const iso = (offsetH: number) => new Date(created + offsetH * 3_600_000).toISOString();
  const caseAnswers = opts.caseValues ? toRunAnswers(config.caseFields, opts.caseValues) : [];
  const isCaseOpen = opts.status === 'awaiting_customer';
  const sub = buildSubmission(config, isCaseOpen ? {} : opts.values, caseAnswers);
  const seq = ctx.data.runs.length + 1001;
  const run: WorkflowRun = {
    id: opts.id ?? newId('run'),
    orgId: ctx.data.organization.id,
    workflowId: wf.workflow.id,
    versionId: version.id,
    versionNumber: version.version,
    reference: `${referencePrefix(ctx.data.organization)}-${seq}`,
    status: 'submitted',
    answers: isCaseOpen ? [] : sub.answers,
    caseAnswers,
    priceLines: isCaseOpen ? [] : sub.priceLines,
    total: isCaseOpen ? 0 : sub.total,
    payment: { status: 'none', amount: sub.deposit },
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
    if (to === 'approved' && config.pricing.depositPercent > 0) run.payment = { status: 'deposit_requested', amount: sub.deposit };
    event(ctx, run, at, { type: 'status_changed', actor: 'owner', from, to, message: `הסטטוס שונה ל"${STATUS_LABELS[to]}"` });
    const n = statusNotification(ctx.data.organization, run, to, undefined, at);
    if (n) ctx.data.notifications.push(n);
    from = to;
    run.updatedAt = at;
    h += 2 + ctx.rand() * 10;
  }
  run.status = opts.status;
  if (opts.depositPaid) {
    run.payment = { status: 'deposit_paid_simulated', amount: sub.deposit };
    event(ctx, run, run.updatedAt, { type: 'payment_simulated', actor: 'owner', message: 'מקדמה סומנה כשולמה (סימולציה — לא בוצע תשלום)' });
  }
  if (opts.note) event(ctx, run, run.updatedAt, { type: 'note_added', actor: 'owner', message: opts.note, internal: true });
  return run;
}

function seedBloom(now: number): OrgData {
  const ctx: Ctx = { data: emptyData(org(DEMO_ORG_IDS.bloom, 'bloom-studio', 'Bloom Studio', 'חנות פרחים', 'זרים בעבודת יד, משלוחים בעיר', '#B84C6E', 'hello@bloom.example.com', now)), now, rand: rng(11) };
  const flowers = addWorkflow(ctx, { slug: DEMO_SLUGS.flowers, templateKey: 'flower_order', status: 'published', daysAgo: 30 });
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
      values: {
        budget: budgets[Math.floor(r() * budgets.length)],
        palette: palettes[i % palettes.length],
        occasion: occasions[i % occasions.length],
        greeting: i % 3 === 0 ? 'מזל טוב! אוהבים אותך' : 'חושבים עליך ❤',
        sender: NAMES[i % NAMES.length],
        sender_phone: phone(i),
        gift_wrap: r() > 0.5,
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
  const repairs = addWorkflow(ctx, { slug: DEMO_SLUGS.garage, templateKey: 'garage_repairs', status: 'published', daysAgo: 28 });
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
  const events = addWorkflow(ctx, { slug: DEMO_SLUGS.events, templateKey: 'restaurant_event', status: 'published', daysAgo: 26 });
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

export function buildSeed(now = Date.now()): OrgData[] {
  return [seedBloom(now), seedAutoCare(now), seedUrban(now)];
}
