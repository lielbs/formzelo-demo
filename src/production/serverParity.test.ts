/**
 * Browser ⇄ server rule parity. Every library and starter template is published into a
 * disposable local database and hundreds of generated answer sets are submitted through the
 * real `submit_public_workflow` RPC as the anonymous role. The server must accept exactly what
 * the browser engine accepts, name the same field when it rejects, and store the same price.
 *
 * Runs only against a local synthetic database:
 *   FORMANGLE_PARITY_DB=postgres://postgres:postgres@127.0.0.1:54322/postgres npx vitest run src/production/serverParity.test.ts
 * Everything happens inside one transaction that is rolled back.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDisplayField, type AnswerValue, type WorkflowConfig, type WorkflowField } from '../domain/schema';
import { validateBooking } from '../engine/booking';
import { validateOptionCapacity } from '../engine/capacity';
import { allVisibleFields, type Values } from '../engine/conditions';
import { TEMPLATE_LIBRARY } from '../engine/library';
import { computePrice } from '../engine/pricing';
import { TEMPLATES } from '../engine/templates';
import { validateRun } from '../engine/validation';
import { isoDay } from '../lib/format';

const url = process.env.FORMANGLE_PARITY_DB;
const LOCAL = /^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):54322\//;
process.env.TZ = 'Asia/Jerusalem';

// Deterministic generator so a failure can be replayed.
let seed = Number(process.env.FORMANGLE_PARITY_SEED ?? 20261107);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;

function valueFor(f: WorkflowField, config: WorkflowConfig): AnswerValue | undefined {
  const opts = f.options ?? [];
  const bad = chance(0.06);
  switch (f.type) {
    case 'text':
    case 'textarea':
    case 'file':
      if (bad) return f.max ? 'א'.repeat(f.max + 1) : '   ';
      return pick(['שלום', 'בקשה קצרה', 'Dana Levi', 'פרטים נוספים לבקשה']);
    case 'email':
      return bad ? 'not-an-email' : pick(['dana@example.com', ' noa@example.co.il ']);
    case 'phone':
      return bad ? pick(['12345', '+972501234567']) : pick(['050-1234567', '0521234567', '03 123 4567']);
    case 'number': {
      const min = f.min ?? 0;
      const max = f.max ?? min + 20;
      if (bad) return pick([max + 1, min - 1, 'abc']);
      const n = min + Math.floor(rand() * (max - min + 1));
      return chance(0.15) ? String(n) : n;
    }
    case 'date': {
      const b = config.booking?.enabled && config.booking.dateKey === f.key ? config.booking : undefined;
      const span = b?.maxDaysAhead ? b.maxDaysAhead + 3 : 40;
      return isoDay(Math.floor(rand() * (span + 3)) - 2);
    }
    case 'time':
    case 'select':
    case 'radio':
      if (bad || !opts.length) return 'forged-value';
      return pick(opts).value;
    case 'multiselect': {
      if (bad) return ['forged-value'];
      return opts.filter(() => chance(0.4)).map((o) => o.value);
    }
    case 'checkbox':
      return chance(0.7);
    case 'decision':
      return bad ? 'maybe' : pick(['approved', 'declined']);
    default:
      return undefined;
  }
}

function answersFor(config: WorkflowConfig): Values {
  const values: Values = {};
  for (const f of config.steps.flatMap((s) => s.fields)) {
    if (isDisplayField(f) || f.type === 'info') continue;
    if (chance(f.required ? 0.04 : 0.25)) continue;
    const v = valueFor(f, config);
    if (v !== undefined) values[f.key] = v;
  }
  return values;
}

function clientVerdict(config: WorkflowConfig, values: Values, consent: boolean) {
  const errors = {
    ...validateRun(config, values),
    ...validateBooking(config, values, []),
    ...validateOptionCapacity(config, values, {}),
  };
  if (config.consent.required && !consent) errors.__consent = 'consent';
  return errors;
}

const configs: { key: string; config: WorkflowConfig }[] = [
  ...Object.entries(TEMPLATES).map(([key, t]) => ({ key: `starter-${key}`, config: t.build() })),
  ...TEMPLATE_LIBRARY.map((t) => ({ key: `lib-${t.id}`, config: t.build() })),
].filter(({ config }) => config.mode !== 'case');

describe.skipIf(!url)('server enforces exactly the browser rules', () => {
  const client = new pg.Client({ connectionString: url });
  const slugs = new Map<string, string>();

  beforeAll(async () => {
    if (!url || !LOCAL.test(url)) throw new Error('Parity runs only against the local synthetic database on port 54322.');
    await client.connect();
    await client.query('begin');
    await client.query(`insert into auth.users(id,email,email_confirmed_at) values ('9a000000-0000-4000-8000-000000000001','parity@example.invalid',now())`);
    await client.query(`insert into public.organizations(id,slug,name,status) values ('9b000000-0000-4000-8000-000000000001','parity-tenant','Parity','active')`);
    for (const [i, { key, config }] of configs.entries()) {
      const slug = `parity-${i}-${key.replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');
      const { rows } = await client.query(
        `insert into public.workflows(organization_id,public_slug,status,draft_config,draft_design,schema_version,created_by,template_key)
         values ('9b000000-0000-4000-8000-000000000001',$1,'draft',$2,'{}',8,'9a000000-0000-4000-8000-000000000001','parity') returning id`,
        [slug, JSON.stringify(config)],
      );
      const wf = rows[0].id as string;
      const v = await client.query(
        `insert into public.workflow_versions(organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by)
         values ('9b000000-0000-4000-8000-000000000001',$1,1,8,'parity',$2,'{}','9a000000-0000-4000-8000-000000000001') returning id`,
        [wf, JSON.stringify(config)],
      );
      await client.query(`update public.workflows set status='published',published_version_id=$2 where id=$1`, [wf, v.rows[0].id]);
      slugs.set(key, slug);
    }
  });

  afterAll(async () => {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  });

  it.each(configs.map((c) => [c.key, c] as const))('%s', async (_key, { key, config }) => {
    const slug = slugs.get(key)!;
    const mismatches: string[] = [];
    for (let i = 0; i < 60; i++) {
      const values = answersFor(config);
      const consent = !config.consent.required || chance(0.9);
      const errors = clientVerdict(config, values, consent);
      await client.query('savepoint s');
      await client.query('set local role anon');
      let server: { ok: true; row: Record<string, unknown> } | { ok: false; code: string; message: string; hint: string };
      try {
        const { rows } = await client.query('select public.submit_public_workflow($1,$2,$3,gen_random_uuid(),gen_random_uuid()) as r', [slug, JSON.stringify(values), consent]);
        server = { ok: true, row: rows[0].r };
      } catch (e) {
        const err = e as { code: string; message: string; hint?: string };
        server = { ok: false, code: err.code, message: err.message, hint: err.hint ?? '' };
      }
      await client.query('rollback to savepoint s');
      await client.query('reset role');

      const clientOk = Object.keys(errors).length === 0;
      const replay = JSON.stringify(values);
      if (clientOk !== server.ok) {
        mismatches.push(`${clientOk ? 'client accepts, server rejects' : 'client rejects, server accepts'}: ${server.ok ? '' : `${server.code} ${server.message} [${server.hint}]`} client=${JSON.stringify(errors)} values=${replay}`);
        continue;
      }
      if (!server.ok) {
        if (server.code === 'P0001' && server.hint && !(server.hint in errors)) mismatches.push(`server blames ${server.hint}, client blames ${Object.keys(errors).join(',')} values=${replay}`);
        continue;
      }
      const price = computePrice(config, values);
      const stored = server.row.answers as { priceLines: { label: string; amount: number }[]; answers: { fieldKey: string }[] };
      if (Number(server.row.totalMinor) !== Math.round(price.total * 100)) mismatches.push(`total ${server.row.totalMinor} vs ${price.total} values=${replay}`);
      const lines = (l: { label: string; amount: number }[]) => JSON.stringify(l.map((x) => [x.label, Number(x.amount)]));
      if (lines(stored.priceLines) !== lines(price.lines)) mismatches.push(`lines ${lines(stored.priceLines)} vs ${lines(price.lines)}`);
      const keys = allVisibleFields(config, values).filter((f) => !isDisplayField(f) && values[f.key] !== undefined && values[f.key] !== '').map((f) => f.key);
      const storedKeys = stored.answers.map((a) => a.fieldKey);
      if (JSON.stringify(storedKeys) !== JSON.stringify(keys)) mismatches.push(`answers ${storedKeys} vs ${keys}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

describe.skipIf(!url)('the last place is sold once under concurrency', () => {
  it('eight customers racing for one slot produce exactly one booking', async () => {
    if (!url || !LOCAL.test(url)) throw new Error('local database only');
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    const tag = Math.random().toString(36).slice(2, 8);
    const org = crypto.randomUUID();
    const user = crypto.randomUUID();
    const wf = crypto.randomUUID();
    const config = {
      ...TEMPLATES.table_booking.build(),
      booking: { enabled: true, dateKey: 'date', timeKey: 'time', openWeekdays: [0, 1, 2, 3, 4, 5, 6], slots: ['19:00'], capacityPerSlot: 1, capacityUnit: 'bookings' as const },
      steps: [{ id: 's1', title: 'מועד', fields: [
        { id: 'f1', key: 'date', label: 'תאריך', type: 'date' as const, required: true },
        { id: 'f2', key: 'time', label: 'שעה', type: 'time' as const, required: true, options: [{ id: 'o1', label: '19:00', value: '19:00' }] },
      ] }],
    };
    await admin.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())`, [user, `race-${tag}@example.invalid`]);
    await admin.query(`insert into public.organizations(id,slug,name,status) values ($1,$2,'Race','active')`, [org, `race-${tag}`]);
    await admin.query(`insert into public.workflows(id,organization_id,public_slug,status,draft_config,draft_design,schema_version,created_by,template_key) values ($1,$2,$3,'draft',$4,'{}',8,$5,'race')`, [wf, org, `race-${tag}`, JSON.stringify(config), user]);
    await admin.query(`insert into public.workflow_versions(id,organization_id,workflow_id,version_number,schema_version,engine_version,config,design,published_by) values ($1,$2,$1,1,8,'race',$3,'{}',$4)`, [wf, org, JSON.stringify(config), user]);
    await admin.query(`update public.workflows set status='published',published_version_id=$1 where id=$1`, [wf]);
    const date = isoDay(3);
    const racers = await Promise.all(Array.from({ length: 8 }, async () => { const c = new pg.Client({ connectionString: url }); await c.connect(); return c; }));
    const results = await Promise.allSettled(racers.map(async (c) => {
      await c.query('begin');
      await c.query('set local role anon');
      await c.query('select public.submit_public_workflow($1,$2,true,gen_random_uuid(),gen_random_uuid())', [`race-${tag}`, JSON.stringify({ date, time: '19:00' })]);
      await c.query('commit');
    }));
    await Promise.all(racers.map((c) => c.end()));
    const { rows } = await admin.query(`select count(*)::int n from public.submissions where workflow_id=$1`, [wf]);
    await admin.end();
    expect(results.map((r) => (r.status === "rejected" ? String((r as PromiseRejectedResult).reason.message) : "ok"))).toContain("ok");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason.message)).toEqual(Array(7).fill('booking_slot_full'));
    expect(rows[0].n).toBe(1);
  });
});
