/**
 * Busy-shift simulation on the local stack: a dinner rush with dozens of online bookings from
 * parallel guest connections, phone bookings and walk-ins, four hosts acting at the same time on
 * separate connections (arrive / seat / complete / move / no-show / cancel), late arrivals and an
 * active waitlist with offers, expiries and seating. Afterwards every inventory invariant is checked
 * and latency per command is measured. Results: test-evidence/tables/busy-shift.json.
 *
 *   FORMANGLE_PARITY_DB=postgres://postgres:postgres@127.0.0.1:54322/postgres npx vitest run src/tables/data/busyShift.test.ts
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.FORMANGLE_PARITY_DB;
if (url && !/@127\.0\.0\.1:54322\//.test(url)) throw new Error('Simulation runs only against the local stack');

const TZ = 'Asia/Jerusalem';
const localNow = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const localDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const hhmm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;

type Lat = Record<string, number[]>;
const lat: Lat = {};
const outcomes: Record<string, number> = {};
const count = (k: string) => { outcomes[k] = (outcomes[k] ?? 0) + 1; };

async function connect() { const c = new pg.Client({ connectionString: url }); await c.connect(); return c; }

async function call<T>(c: pg.Client, label: string, role: 'anon' | { user: string }, sql: string, params: unknown[]): Promise<{ ok: true; v: T } | { ok: false; code: string; msg: string }> {
  const t0 = performance.now();
  await c.query('begin');
  try {
    if (role === 'anon') await c.query('set local role anon');
    else { await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [role.user]); }
    const r = await c.query(sql, params);
    await c.query('commit');
    (lat[label] ??= []).push(performance.now() - t0);
    return { ok: true, v: Object.values(r.rows[0] ?? {})[0] as T };
  } catch (e) {
    await c.query('rollback');
    (lat[label] ??= []).push(performance.now() - t0);
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code ?? '?', msg: err.message ?? '' };
  }
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : 0; };

describe.skipIf(!url)('busy shift simulation', () => {
  let admin: pg.Client;
  const ids = { org: randomUUID(), owner: randomUUID(), manager: randomUUID(), hosts: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
  let venue = '';
  let slug = '';
  const day = localDate();
  const nowMin = Number(localNow().slice(0, 2)) * 60 + Number(localNow().slice(3));
  const startMin = Math.floor((nowMin - 120) / 15) * 15; // service started two hours ago
  const lastMin = startMin + 300; // last seating five hours after start
  const summary: Record<string, unknown> = {};

  beforeAll(async () => {
    admin = await connect();
    const tag = Math.random().toString(36).slice(2, 8);
    slug = `rush-${tag}`;
    const users = [['owner', ids.owner], ['manager', ids.manager], ...ids.hosts.map((h, i) => [`host${i}`, h])] as [string, string][];
    for (const [r, id] of users) await admin.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [id, `rush-${r}-${tag}@example.invalid`]);
    await admin.query(`insert into public.organizations(id,slug,name,status) values ($1,$2,'Rush','active')`, [ids.org, slug]);
    await admin.query(`insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner')`, [ids.org, ids.owner]);
    for (const [, id] of users.slice(1)) await admin.query(`insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'staff')`, [ids.org, id]);
    await admin.query('insert into public.tables_organization_features(organization_id,enabled) values ($1,true)', [ids.org]);
    const zone = randomUUID();
    // 30 tables: 10×2, 12×4, 6×6, 2×8; two combinations of 6-tops.
    const spec = [...Array(10).fill(2), ...Array(12).fill(4), ...Array(6).fill(6), 8, 8];
    const tables = spec.map((seats: number, i: number) => ({ id: randomUUID(), label: String(i + 1), zoneId: zone, minCovers: seats <= 2 ? 1 : seats - 2, maxCovers: seats,
      shape: 'square', x: (i % 6) * 120, y: Math.floor(i / 6) * 110, w: 80, h: 70 }));
    const six = tables.filter((t) => t.maxCovers === 6);
    const draft = {
      schema: 1, basics: { name: 'Rush Bistro', timezone: TZ },
      services: [{ key: 'dinner', name: 'Dinner', weekdays: [0, 1, 2, 3, 4, 5, 6], start: hhmm(startMin), lastSeating: hhmm(lastMin), durationMinutes: 90 }],
      zones: [{ id: zone, name: 'Hall' }], tables,
      combinations: [
        { id: randomUUID(), label: 'C1', tableIds: [six[0]!.id, six[1]!.id], minCovers: 7, maxCovers: 12, priority: 0 },
        { id: randomUUID(), label: 'C2', tableIds: [six[2]!.id, six[3]!.id], minCovers: 7, maxCovers: 12, priority: 1 },
      ],
      policy: { slotMinutes: 15, leadMinutes: 0, horizonDays: 30, minParty: 1, maxParty: 12, bufferMinutes: 10, approvalMode: 'conditional',
        pendingMode: 'unallocated', pendingHoldMinutes: 15, cancelCutoffMinutes: 0, modifyCutoffMinutes: 0, allowGuestModify: true,
        rules: [{ id: 'big', priority: 1, when: { partyAtLeast: 9 }, then: 'require_manual' }], waitlist: { publicEnabled: true, offerMinutes: 10 } },
      guest: { terms: 'Terms' },
    };
    const v = await call<{ id: string }>(admin, 'setup', { user: ids.owner }, 'select public.tables_create_venue($1,$2,$3)', [ids.org, 'Rush', slug]);
    if (!v.ok) throw new Error(v.msg);
    venue = v.v.id;
    const s = await call<{ lockVersion: number }>(admin, 'setup', { user: ids.owner }, 'select public.tables_save_draft($1,$2,0)', [venue, JSON.stringify(draft)]);
    if (!s.ok) throw new Error(s.msg);
    const p = await call(admin, 'setup', { user: ids.owner }, 'select public.tables_publish_venue($1,$2)', [venue, s.v.lockVersion]);
    if (!p.ok) throw new Error(p.msg);
    for (const h of ids.hosts) await call(admin, 'setup', { user: ids.owner }, `select public.tables_assign_staff($1,$2,'host')`, [venue, h]);
    await call(admin, 'setup', { user: ids.owner }, `select public.tables_assign_staff($1,$2,'manager')`, [venue, ids.manager]);
    summary.service = { date: day, start: hhmm(startMin), lastSeating: hhmm(lastMin), tables: tables.length, seats: spec.reduce((a: number, b: number) => a + b, 0) };
  });

  afterAll(async () => {
    const latency = Object.fromEntries(Object.entries(lat).filter(([k]) => k !== 'setup').map(([k, xs]) => [k, { n: xs.length, p50: Math.round(pct(xs, 50)), p95: Math.round(pct(xs, 95)), max: Math.round(Math.max(...xs)) }]));
    fs.mkdirSync('test-evidence/tables', { recursive: true });
    fs.writeFileSync('test-evidence/tables/busy-shift.json', JSON.stringify({ at: new Date().toISOString(), ...summary, outcomes, latencyMs: latency }, null, 2));
    console.log(JSON.stringify({ outcomes, latencyMs: latency, invariants: summary.invariants }, null, 1));
    await admin?.end();
  });

  it('runs a dinner rush with concurrent guests and four hosts and keeps every invariant', async () => {
    // 1) Earlier bookings made by the manager for slots already passed (late arrivals / no-shows later).
    for (let i = 0; i < 12; i++) {
      const t = hhmm(startMin + (i % 8) * 15);
      const r = await call(admin, 'staff_create', { user: ids.manager }, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue,
        JSON.stringify({ source: 'phone', serviceKey: 'dinner', date: day, time: t, party: 2 + (i % 5), name: `Early ${i}`, phone: `0501000${100 + i}`, overrideReason: 'booked earlier' }), randomUUID()]);
      count(r.ok ? 'early_booking_ok' : `early_booking_${r.ok ? '' : r.msg}`);
    }

    // 2) Online rush: 24 guest connections each try 3 bookings in parallel (72 attempts) for upcoming slots.
    const guests = await Promise.all(Array.from({ length: 24 }, connect));
    const upcoming = Array.from({ length: 12 }, (_, i) => hhmm(Math.ceil((nowMin + 15) / 15) * 15 + i * 15)).filter((t) => {
      const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      return ((m - startMin + 1440) % 1440) <= lastMin - startMin;
    });
    await Promise.all(guests.map(async (c, g) => {
      for (let k = 0; k < 3; k++) {
        const party = [2, 2, 3, 4, 4, 5, 6, 8, 10][(g + k) % 9]!;
        const t = upcoming[(g * 3 + k) % upcoming.length]!;
        const r = await call<{ result: string }>(c, 'public_book', 'anon', 'select public.tables_public_book($1,$2,$3,$4)', [slug,
          JSON.stringify({ serviceKey: 'dinner', date: day, time: t, party, name: `Guest ${g}-${k}`, phone: `+97252${String(g * 10 + k).padStart(7, '0')}`, termsAccepted: true }), randomUUID(), randomUUID()]);
        count(r.ok ? `online_${r.v.result}` : `online_error_${r.code}`);
      }
    }));
    await Promise.all(guests.map((c) => c.end()));

    // 3) Walk-ins and a waitlist at the door.
    const door = await connect();
    for (let i = 0; i < 6; i++) {
      const r = await call(door, 'walk_in', { user: ids.hosts[0]! }, 'select public.tables_staff_create_reservation($1,$2,$3)', [venue,
        JSON.stringify({ source: 'walk_in', date: day, party: 2 + (i % 3), name: `Walk-in ${i}`, seatNow: true }), randomUUID()]);
      count(r.ok ? 'walk_in_seated' : 'walk_in_no_table');
    }
    for (let i = 0; i < 8; i++) {
      const r = await call(door, 'waitlist_add', { user: ids.hosts[1]! }, 'select public.tables_waitlist_add($1,$2,$3)', [venue,
        JSON.stringify({ name: `Wait ${i}`, party: 2 + (i % 4), phone: `0547000${100 + i}` }), randomUUID()]);
      count(r.ok ? 'waitlist_added' : 'waitlist_add_failed');
    }

    // 4) Four hosts work the shift at the same time, each from its own connection, reading the same
    //    projection and acting on overlapping rows (so they collide on purpose).
    const hostConns = await Promise.all(ids.hosts.map(() => connect()));
    const rounds = 6;
    for (let round = 0; round < rounds; round++) {
      await Promise.all(hostConns.map(async (c, h) => {
        const shift = await call<{ reservations: { id: string; status: string; lockVersion: number; startsAt: string; tableIds: string[]; party: number }[]; tables: { id: string; maxCovers: number }[] }>(
          c, 'shift_projection', { user: ids.hosts[h]! }, 'select public.tables_shift($1,$2)', [venue, day]);
        if (!shift.ok) { count(`shift_error_${shift.code}`); return; }
        const wl = await call<{ id: string; status: string; lockVersion: number; suggestion: { tableIds: string[] } | null; offerExpiresAt: string | null }[]>(
          c, 'waitlist_projection', { user: ids.hosts[h]! }, 'select public.tables_waitlist($1,$2)', [venue, day]);
        const rs = shift.v.reservations;
        const pick = <T,>(xs: T[], n: number) => xs.filter((_, i) => (i + round + h) % 3 === 0).slice(0, n);
        const now = Date.now();
        // One connection = one host device: its actions run one after another (a pg client must not
        // interleave transactions); the four hosts still act in parallel against each other.
        let chain: Promise<void> = Promise.resolve();
        const tasks: Promise<void>[] = [];
        const act = (label: string, sql: string, params: unknown[]) => { chain = chain.then(async () => {
          const r = await call(c, label, { user: ids.hosts[h]! }, sql, params);
          count(r.ok ? `${label}_ok` : `${label}_${r.code === '40001' ? 'conflict' : r.msg.replace(/^tables:/, '')}`);
        }); tasks.push(chain); };
        // Hosts each pick from the same lists, so the same reservation is often hit twice.
        for (const r of pick(rs.filter((x) => x.status === 'confirmed' && new Date(x.startsAt).getTime() < now), 2)) {
          act(h % 2 ? 'no_show' : 'arrive', 'select public.tables_transition($1,$2,$3)', [r.id, h % 2 ? 'no_show' : 'arrive', r.lockVersion]);
        }
        for (const r of pick(rs.filter((x) => (x.status === 'arrived' || x.status === 'confirmed') && x.tableIds.length && new Date(x.startsAt).getTime() - now < 3 * 3600_000), 2)) {
          act('seat', `select public.tables_transition($1,'seat',$2)`, [r.id, r.lockVersion]);
        }
        for (const r of pick(rs.filter((x) => x.status === 'seated'), 2)) act('complete', `select public.tables_transition($1,'complete',$2)`, [r.id, r.lockVersion]);
        for (const r of pick(rs.filter((x) => ['confirmed', 'arrived'].includes(x.status) && x.tableIds.length), 1)) {
          const target = shift.v.tables.filter((t) => t.maxCovers >= r.party && !r.tableIds.includes(t.id))[(round + h) % 5];
          if (target) act('move', 'select public.tables_move($1,$2,$3)', [r.id, [target.id], r.lockVersion]);
        }
        for (const r of pick(rs.filter((x) => x.status === 'pending_approval'), 1)) act('approve', `select public.tables_decide_pending($1,'approve',$2)`, [r.id, r.lockVersion]);
        if (round === 2) for (const r of pick(rs.filter((x) => x.status === 'confirmed'), 1)) act('cancel', `select public.tables_transition($1,'cancel',$2)`, [r.id, r.lockVersion]);
        if (wl.ok) {
          for (const e of wl.v.filter((x) => x.status === 'waiting' && x.suggestion).slice(h, h + 1)) {
            act('waitlist_offer', 'select public.tables_waitlist_offer($1,$2,$3)', [e.id, e.suggestion!.tableIds, e.lockVersion]);
          }
          for (const e of wl.v.filter((x) => x.status === 'offered').slice(0, 1)) {
            act('waitlist_seat', 'select public.tables_waitlist_seat($1,null,$2)', [e.id, e.lockVersion]);
          }
        }
        await Promise.all(tasks);
      }));
      if (round === 3) {
        // Expire the open offers (as if 10 minutes passed) — the next host action must reclaim them once.
        await admin.query(`update public.tables_waitlist_entries set offer_expires_at = now() - interval '1 second' where venue_id=$1 and status='offered'`, [venue]);
        await admin.query(`update public.tables_allocations set expires_at = now() - interval '1 second' where venue_id=$1 and state='held' and waitlist_entry_id is not null`, [venue]);
        count('offers_forced_to_expire');
      }
    }
    await Promise.all([...hostConns.map((c) => c.end()), door.end()]);

    // 5) Invariants.
    const q = async (sql: string) => Number((await admin.query(sql, [venue])).rows[0].n);
    const inv = {
      overlappingActiveAllocations: await q(`select count(*) n from public.tables_allocations a join public.tables_allocations b on a.physical_table_id=b.physical_table_id and a.id<b.id
        and a.occupied_during && b.occupied_during where a.venue_id=$1 and a.state in ('held','confirmed','seated') and b.state in ('held','confirmed','seated')`),
      reservationsWithMoreThanOneActiveGroup: await q(`select count(*) n from (select reservation_id from public.tables_allocations where venue_id=$1 and state in ('held','confirmed','seated') and reservation_id is not null group by reservation_id having count(distinct group_id) > 1) x`),
      partialCombinations: await q(`select count(*) n from (select r.id from public.tables_reservations r join public.tables_allocations a on a.reservation_id=r.id and a.state in ('confirmed','seated')
        where r.venue_id=$1 group by r.id, r.party_size having sum((select max_covers from public.tables_physical_tables t where t.id=a.physical_table_id)) < r.party_size) x`),
      activeReservationWithReleasedOnlyTables: await q(`select count(*) n from public.tables_reservations r where r.venue_id=$1 and r.status='seated'
        and not exists (select 1 from public.tables_allocations a where a.reservation_id=r.id and a.state='seated')`),
      closedReservationsStillHoldingTables: await q(`select count(*) n from public.tables_reservations r join public.tables_allocations a on a.reservation_id=r.id
        where r.venue_id=$1 and r.status in ('cancelled','no_show','completed','rejected','expired') and a.state in ('held','confirmed','seated')`),
      lostUpdates: await q(`select count(*) n from public.tables_reservations r where r.venue_id=$1 and r.lock_version <> (select count(*) - 1 from public.tables_reservation_events e where e.reservation_id=r.id)`),
      waitlistHoldsAfterClose: await q(`select count(*) n from public.tables_allocations a join public.tables_waitlist_entries e on e.id=a.waitlist_entry_id
        where e.venue_id=$1 and a.state='held' and e.status not in ('offered')`),
      seatedWaitlistWithoutOneReservation: await q(`select count(*) n from public.tables_waitlist_entries e where e.venue_id=$1 and e.status='seated'
        and (select count(*) from public.tables_reservations r where r.id=e.reservation_id and r.source='waitlist') <> 1`),
      expiredOffersStillHeld: await q(`select count(*) n from public.tables_allocations where venue_id=$1 and state='held' and expires_at <= now()`),
    };
    // Projection consistency: the host projection agrees with the allocations table.
    const c = await connect();
    const projection = await call<{ reservations: { id: string; tableIds: string[]; status: string }[] }>(c, 'shift_projection', { user: ids.hosts[0]! }, 'select public.tables_shift($1,$2)', [venue, day]);
    await c.end();
    let mismatches = 0;
    if (projection.ok) {
      for (const r of projection.v.reservations) {
        const rows = (await admin.query(`select physical_table_id::text t from public.tables_allocations where reservation_id=$1 and state in ('held','confirmed','seated') order by 1`, [r.id])).rows.map((x) => x.t);
        if (JSON.stringify(rows) !== JSON.stringify([...r.tableIds].sort())) mismatches++;
      }
    }
    const totals = (await admin.query(`select status, count(*)::int n from public.tables_reservations where venue_id=$1 group by status order by status`, [venue])).rows;
    const wlTotals = (await admin.query(`select status, count(*)::int n from public.tables_waitlist_entries where venue_id=$1 group by status order by status`, [venue])).rows;
    summary.invariants = { ...inv, projectionMismatches: mismatches };
    summary.reservationsByStatus = Object.fromEntries(totals.map((r) => [r.status, r.n]));
    summary.waitlistByStatus = Object.fromEntries(wlTotals.map((r) => [r.status, r.n]));
    summary.revision = Number((await admin.query('select revision n from public.tables_shift_revisions where venue_id=$1 and service_date=$2', [venue, day])).rows[0]?.n ?? 0);

    for (const [k, v] of Object.entries(inv)) expect(v, k).toBe(0);
    expect(mismatches).toBe(0);
    expect(outcomes.online_confirmed ?? 0).toBeGreaterThan(10);
    expect(Object.keys(outcomes).some((k) => k.endsWith('_conflict'))).toBe(true); // hosts did collide
  }, 300_000);
});
