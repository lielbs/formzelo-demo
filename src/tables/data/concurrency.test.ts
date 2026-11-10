/**
 * Formangle Tables inventory under real concurrency: separate PostgreSQL connections race through
 * the same SQL commands the app uses. Synthetic data on the disposable local stack only.
 * Run (local stack up):
 *   FORMANGLE_PARITY_DB=postgres://postgres:postgres@127.0.0.1:54322/postgres npx vitest run src/tables/data/concurrency.test.ts
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.FORMANGLE_PARITY_DB;
if (url && !/@127\.0\.0\.1:54322\//.test(url)) throw new Error('Concurrency tests run only against the local stack');

type Ctx = { org: string; owner: string; host1: string; host2: string; venue: string; slug: string; day: string; day2: string; t: string[] };

function draft(T: string[], policy: Record<string, unknown> = {}) {
  const ZONE = T[6]!;
  const COMBO = T[7]!;
  const tables = [
    { label: 'A1', min: 1, max: 2 }, { label: 'A2', min: 1, max: 2 }, { label: 'B1', min: 2, max: 4 },
    { label: 'B2', min: 2, max: 4 }, { label: 'C1', min: 4, max: 6 }, { label: 'C2', min: 4, max: 6 },
  ].map((t, i) => ({ id: T[i], label: t.label, zoneId: ZONE, minCovers: t.min, maxCovers: t.max, shape: 'square', x: i * 80, y: 0, w: 60, h: 60 }));
  return {
    schema: 1,
    basics: { name: 'Race Bistro', timezone: 'Asia/Jerusalem' },
    services: [{ key: 'dinner', name: 'Dinner', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', lastSeating: '22:00', durationMinutes: 90 }],
    zones: [{ id: ZONE, name: 'Hall' }],
    tables,
    combinations: [{ id: COMBO, label: 'C1+C2', tableIds: [T[4], T[5]], minCovers: 7, maxCovers: 12, priority: 0 }],
    policy: {
      slotMinutes: 30, leadMinutes: 0, horizonDays: 60, minParty: 1, maxParty: 12, bufferMinutes: 0, approvalMode: 'auto',
      pendingMode: 'unallocated', pendingHoldMinutes: 15, cancelCutoffMinutes: 0, modifyCutoffMinutes: 0, allowGuestModify: true, rules: [],
      ...policy,
    },
    guest: { terms: 'Terms' },
  };
}

async function connect() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Runs one statement as an authenticated user in its own transaction. */
async function asUser<T = unknown>(c: pg.Client, user: string, sql: string, params: unknown[]): Promise<T> {
  await c.query('begin');
  try {
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows[0] ? (Object.values(r.rows[0])[0] as T) : (undefined as T);
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

async function asAnon<T = unknown>(c: pg.Client, sql: string, params: unknown[]): Promise<T> {
  await c.query('begin');
  try {
    await c.query('set local role anon');
    const r = await c.query(sql, params);
    await c.query('commit');
    return Object.values(r.rows[0])[0] as T;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

const book = (c: pg.Client, ctx: Ctx, time: string, party: number, date = ctx.day) =>
  asAnon<{ result: string; reference?: string; token?: string; reason?: string }>(c,
    'select public.tables_public_book($1,$2,$3,$4)',
    [ctx.slug, JSON.stringify({ serviceKey: 'dinner', date, time, party, name: 'Racer', phone: `05${Math.floor(10000000 + Math.random() * 89999999)}`, termsAccepted: true }), randomUUID(), randomUUID()]);

async function setup(admin: pg.Client, policy: Record<string, unknown> = {}): Promise<Ctx> {
  const tag = Math.random().toString(36).slice(2, 8);
  const [org, owner, host1, host2] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (const [id, role] of [[owner, 'o'], [host1, 'h1'], [host2, 'h2']] as const) {
    await admin.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [id, `race-${role}-${tag}@example.invalid`]);
  }
  await admin.query(`insert into public.organizations(id,slug,name,status) values ($1,$2,'Race','active')`, [org, `race-${tag}`]);
  await admin.query(`insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner'),($1,$3,'staff'),($1,$4,'staff')`, [org, owner, host1, host2]);
  await admin.query('insert into public.tables_organization_features(organization_id,enabled) values ($1,true)', [org]);
  const slug = `race-${tag}`;
  const t = Array.from({ length: 8 }, () => randomUUID());
  const created = await asUser<{ id: string }>(admin, owner, 'select public.tables_create_venue($1,$2,$3)', [org, 'Race Bistro', slug]);
  const venue = created.id;
  const saved = await asUser<{ lockVersion: number }>(admin, owner, 'select public.tables_save_draft($1,$2,0)', [venue, JSON.stringify(draft(t, policy))]);
  await asUser(admin, owner, 'select public.tables_publish_venue($1,$2)', [venue, saved.lockVersion]);
  for (const h of [host1, host2]) await asUser(admin, owner, `select public.tables_assign_staff($1,$2,'host')`, [venue, h]);
  const d = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return { org, owner, host1, host2, venue, slug, day: d(5), day2: d(6), t };
}

async function activeAllocations(admin: pg.Client, venue: string) {
  return (await admin.query(`select a.reservation_id, a.group_id, a.physical_table_id from public.tables_allocations a
    where a.venue_id=$1 and a.state in ('held','confirmed','seated')`, [venue])).rows as { reservation_id: string; group_id: string; physical_table_id: string }[];
}

async function overlaps(admin: pg.Client, venue: string) {
  return Number((await admin.query(`select count(*) n from public.tables_allocations a join public.tables_allocations b
    on a.physical_table_id=b.physical_table_id and a.id<b.id and a.occupied_during && b.occupied_during
    where a.venue_id=$1 and a.state in ('held','confirmed','seated') and b.state in ('held','confirmed','seated')`, [venue])).rows[0].n);
}

describe.skipIf(!url)('Tables inventory under real concurrency', () => {
  let admin: pg.Client;
  beforeAll(async () => { admin = await connect(); });
  afterAll(async () => { await admin?.end(); });

  it('eight guests race for the last table: exactly one wins', async () => {
    const ctx = await setup(admin);
    // Occupy every table except A1 at 19:00 (party sizes force distinct tables).
    for (const party of [2, 4, 4, 6, 6]) expect((await book(admin, ctx, '19:00', party)).result).toBe('confirmed');
    const racers = await Promise.all(Array.from({ length: 8 }, connect));
    const results = await Promise.allSettled(racers.map((c) => book(c, ctx, '19:00', 2)));
    await Promise.all(racers.map((c) => c.end()));
    const confirmed = results.filter((r) => r.status === 'fulfilled' && r.value.result === 'confirmed');
    const unavailable = results.filter((r) => r.status === 'fulfilled' && r.value.result === 'unavailable');
    expect(confirmed).toHaveLength(1);
    expect(unavailable).toHaveLength(7);
    expect(await overlaps(admin, ctx.venue)).toBe(0);
  });

  it('combination never partially allocates while singles compete for its member tables', async () => {
    const ctx = await setup(admin);
    const racers = await Promise.all(Array.from({ length: 10 }, connect));
    // Five parties of 8 need C1+C2; five parties of 5 want C1 or C2 alone.
    const results = await Promise.allSettled(racers.map((c, i) => book(c, ctx, '20:00', i % 2 ? 8 : 5)));
    await Promise.all(racers.map((c) => c.end()));
    const allocs = await activeAllocations(admin, ctx.venue);
    const byRes = new Map<string, Set<string>>();
    for (const a of allocs) byRes.set(a.reservation_id, (byRes.get(a.reservation_id) ?? new Set()).add(a.group_id));
    const parties = (await admin.query(`select id, party_size from public.tables_reservations where venue_id=$1 and status='confirmed'`, [ctx.venue])).rows as { id: string; party_size: number }[];
    for (const p of parties) {
      const rows = allocs.filter((a) => a.reservation_id === p.id);
      if (p.party_size === 8) expect(rows).toHaveLength(2); // both members or nothing
      else expect(rows).toHaveLength(1);
      expect(byRes.get(p.id)?.size).toBe(1);
    }
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    // Either one combination or up to two singles on C1/C2 — never a mix that overlaps.
    expect(await overlaps(admin, ctx.venue)).toBe(0);
    const covers = parties.reduce((s, p) => s + (p.party_size >= 5 ? 1 : 0), 0);
    expect(covers).toBeGreaterThan(0);
  });

  it('pacing cap holds under concurrent bookings for different tables', async () => {
    const ctx = await setup(admin, { pacing: { windowMinutes: 30, maxArrivals: 2 } });
    const racers = await Promise.all(Array.from({ length: 6 }, connect));
    const results = await Promise.allSettled(racers.map((c) => book(c, ctx, '18:30', 2)));
    await Promise.all(racers.map((c) => c.end()));
    const confirmed = results.filter((r) => r.status === 'fulfilled' && r.value.result === 'confirmed');
    expect(confirmed).toHaveLength(2);
  });

  it('idempotent retries in parallel create one reservation', async () => {
    const ctx = await setup(admin);
    const key = randomUUID();
    const client = randomUUID();
    const body = JSON.stringify({ serviceKey: 'dinner', date: ctx.day, time: '18:00', party: 2, name: 'Retry', phone: '0501231231', termsAccepted: true });
    const racers = await Promise.all(Array.from({ length: 5 }, connect));
    const results = await Promise.allSettled(racers.map((c) => asAnon<{ reference: string }>(c, 'select public.tables_public_book($1,$2,$3,$4)', [ctx.slug, body, key, client])));
    await Promise.all(racers.map((c) => c.end()));
    const refs = new Set(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.reference] : [])));
    expect(refs.size).toBe(1);
    const n = await admin.query('select count(*) n from public.tables_reservations where venue_id=$1', [ctx.venue]);
    expect(Number(n.rows[0].n)).toBe(1);
  });

  it('two hosts act on the same reservation with the same version: one wins, one gets a conflict', async () => {
    const ctx = await setup(admin);
    const b = await book(admin, ctx, '21:00', 2);
    const res = (await admin.query('select id, lock_version from public.tables_reservations where reference=$1', [b.reference])).rows[0];
    const [h1, h2] = await Promise.all([connect(), connect()]);
    const results = await Promise.allSettled([
      asUser(h1, ctx.host1, 'select public.tables_move($1,$2,$3)', [res.id, [ctx.t[1]], res.lock_version]),
      asUser(h2, ctx.host2, 'select public.tables_move($1,$2,$3)', [res.id, [ctx.t[2]], res.lock_version]),
    ]);
    await Promise.all([h1.end(), h2.end()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as { code?: string }).code).toBe('40001');
    expect((await activeAllocations(admin, ctx.venue)).filter((a) => a.reservation_id === res.id)).toHaveLength(1);
  });

  it('two hosts move different parties onto the same free table: one wins, nobody loses a table', async () => {
    const ctx = await setup(admin);
    const r1 = await book(admin, ctx, '19:30', 2);
    const r2 = await book(admin, ctx, '19:30', 2);
    const rows = (await admin.query('select id, lock_version from public.tables_reservations where reference = any($1) order by reference', [[r1.reference, r2.reference]])).rows;
    const [h1, h2] = await Promise.all([connect(), connect()]);
    const results = await Promise.allSettled(rows.map((row, i) => asUser([h1, h2][i]!, [ctx.host1, ctx.host2][i]!, 'select public.tables_move($1,$2,$3)', [row.id, [ctx.t[3]], row.lock_version])));
    await Promise.all([h1.end(), h2.end()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const allocs = await activeAllocations(admin, ctx.venue);
    for (const row of rows) expect(allocs.filter((a) => a.reservation_id === row.id)).toHaveLength(1);
    expect(await overlaps(admin, ctx.venue)).toBe(0);
  });

  it('cancellation racing a new booking keeps availability consistent', async () => {
    const ctx = await setup(admin);
    for (const party of [2, 2, 4, 4, 6, 6]) await book(admin, ctx, '18:00', party);
    const victim = (await admin.query(`select r.id, r.lock_version from public.tables_reservations r join public.tables_allocations a on a.reservation_id=r.id
      where r.venue_id=$1 and a.physical_table_id=$2 and a.state='confirmed'`, [ctx.venue, ctx.t[0]])).rows[0];
    const conns = await Promise.all(Array.from({ length: 5 }, connect));
    const [cancel, ...bookings] = await Promise.allSettled([
      asUser(conns[0]!, ctx.host1, `select public.tables_transition($1,'cancel',$2)`, [victim.id, victim.lock_version]),
      ...conns.slice(1).map((c) => book(c, ctx, '18:00', 2)),
    ]);
    await Promise.all(conns.map((c) => c.end()));
    expect(cancel!.status).toBe('fulfilled');
    const won = bookings.filter((r) => r.status === 'fulfilled' && (r.value as { result: string }).result === 'confirmed').length;
    expect(won).toBeLessThanOrEqual(1);
    expect(await overlaps(admin, ctx.venue)).toBe(0);
    const freeNow = await asAnon<{ services: { slots: { time: string }[] }[] }>(admin, 'select public.tables_public_availability($1,$2,2,null,$3)', [ctx.slug, ctx.day, randomUUID()]);
    const has1800 = freeNow.services[0]!.slots.some((s) => s.time === '18:00');
    expect(has1800).toBe(won === 0);
  });

  it('modify racing cancel on the same reservation: exactly one applies', async () => {
    const ctx = await setup(admin);
    const b = await book(admin, ctx, '20:30', 2);
    const [c1, c2] = await Promise.all([connect(), connect()]);
    const results = await Promise.allSettled([
      asAnon(c1, 'select public.tables_public_modify($1,$2,0,$3)', [b.token, JSON.stringify({ serviceKey: 'dinner', date: ctx.day, time: '21:00', party: 2 }), randomUUID()]),
      asAnon(c2, 'select public.tables_public_cancel($1,$2)', [b.token, randomUUID()]),
    ]);
    await Promise.all([c1.end(), c2.end()]);
    const r = (await admin.query('select status, local_time from public.tables_reservations where reference=$1', [b.reference])).rows[0];
    const active = (await activeAllocations(admin, ctx.venue)).length;
    if (r.status === 'cancelled') expect(active).toBe(0);
    else { expect(r.local_time).toBe('21:00'); expect(active).toBe(1); }
    expect(results.some((x) => x.status === 'fulfilled')).toBe(true);
  });

  it('crossing day moves in opposite directions never deadlock', async () => {
    const ctx = await setup(admin);
    const a = await book(admin, ctx, '18:00', 2, ctx.day);
    const b = await book(admin, ctx, '18:00', 2, ctx.day2);
    const rows = (await admin.query('select id, lock_version, reference from public.tables_reservations where reference = any($1)', [[a.reference, b.reference]])).rows;
    const ra = rows.find((x) => x.reference === a.reference);
    const rb = rows.find((x) => x.reference === b.reference);
    const [h1, h2] = await Promise.all([connect(), connect()]);
    const results = await Promise.allSettled([
      asUser(h1, ctx.host1, 'select public.tables_staff_update_reservation($1,$2,$3)', [ra.id, JSON.stringify({ date: ctx.day2, time: '19:00' }), ra.lock_version]),
      asUser(h2, ctx.host2, 'select public.tables_staff_update_reservation($1,$2,$3)', [rb.id, JSON.stringify({ date: ctx.day, time: '19:00' }), rb.lock_version]),
    ]);
    await Promise.all([h1.end(), h2.end()]);
    for (const r of results) if (r.status === 'rejected') expect((r.reason as { code?: string }).code).not.toBe('40P01');
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await overlaps(admin, ctx.venue)).toBe(0);
  });

  it('a failure after allocation leaves no partial reservation, allocation or event', async () => {
    const ctx = await setup(admin);
    await admin.query(`create or replace function private.tables_test_fail() returns trigger language plpgsql as $$
      begin if new.event_type = 'created' and new.metadata->>'source' = 'phone' then raise exception 'injected failure'; end if; return new; end $$`);
    await admin.query('create trigger tables_test_fail before insert on public.tables_reservation_events for each row execute function private.tables_test_fail()');
    try {
      await expect(asUser(admin, ctx.host1, 'select public.tables_staff_create_reservation($1,$2,$3)', [ctx.venue,
        JSON.stringify({ source: 'phone', serviceKey: 'dinner', date: ctx.day, time: '19:00', party: 8, name: 'Fail' }), randomUUID()])).rejects.toThrow(/injected failure/);
    } finally {
      await admin.query('drop trigger tables_test_fail on public.tables_reservation_events');
      await admin.query('drop function private.tables_test_fail()');
    }
    expect((await admin.query('select count(*) n from public.tables_reservations where venue_id=$1', [ctx.venue])).rows[0].n).toBe('0');
    expect((await activeAllocations(admin, ctx.venue)).length).toBe(0);
  });
});
