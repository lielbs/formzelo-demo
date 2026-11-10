/**
 * Query performance at synthetic 1 / 20 / 100-venue volumes (local stack, synthetic data only).
 * Each venue: 30 tables, 3 turns per table per day for 30 days (2,700 reservations + allocations +
 * events). Measures the hot paths a guest and a host hit, and keeps the plan of the candidate
 * search. Results: test-evidence/tables/scale.json.
 *
 *   TABLES_SCALE=1 FORMANGLE_PARITY_DB=postgres://postgres:postgres@127.0.0.1:54322/postgres npx vitest run src/tables/data/scale.test.ts
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

const url = process.env.FORMANGLE_PARITY_DB;
const run = !!url && process.env.TABLES_SCALE === '1';
if (url && !/@127\.0\.0\.1:54322\//.test(url)) throw new Error('Scale test runs only against the local stack');

const TZ = 'Asia/Jerusalem';
const localDate = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });

describe.skipIf(!run)('Tables query cost at 1 / 20 / 100 venues', () => {
  it('keeps the hot paths bounded as data grows', async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    const as = async (user: string | null, sql: string, params: unknown[]) => {
      await c.query('begin');
      if (user) { await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [user]); } else await c.query('set local role anon');
      const t0 = performance.now();
      const r = await c.query(sql, params);
      const ms = performance.now() - t0;
      await c.query('rollback');
      return { ms, row: Object.values(r.rows[0] ?? {})[0] };
    };
    const owner = randomUUID();
    // A business may have at most 20 venues, so 100 venues are spread over 5 businesses (same owner).
    const orgs = Array.from({ length: 5 }, () => randomUUID());
    const tag = Math.random().toString(36).slice(2, 7);
    await c.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [owner, `scale-${tag}@example.invalid`]);
    for (const [n, org] of orgs.entries()) {
      await c.query(`insert into public.organizations(id,slug,name,status) values ($1,$2,'Scale','active')`, [org, `scale-${tag}-o${n}`]);
      await c.query(`insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner')`, [org, owner]);
      await c.query('insert into public.tables_organization_features(organization_id,enabled) values ($1,true)', [org]);
    }

    const venues: { id: string; slug: string; tables: string[] }[] = [];
    const results: Record<string, unknown>[] = [];
    const firstDay = localDate(1);

    async function addVenue(i: number) {
      const org = orgs[Math.floor(i / 20)]!;
      const zone = randomUUID();
      const tables = Array.from({ length: 30 }, () => randomUUID());
      const draft = {
        schema: 1, basics: { name: `Scale ${i}`, timezone: TZ },
        services: [{ key: 'dinner', name: 'Dinner', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', lastSeating: '23:00', durationMinutes: 105 }],
        zones: [{ id: zone, name: 'Hall' }],
        tables: tables.map((id, k) => ({ id, label: String(k + 1), zoneId: zone, minCovers: 1, maxCovers: [2, 4, 6][k % 3], shape: 'square', x: (k % 6) * 100, y: Math.floor(k / 6) * 100, w: 70, h: 70 })),
        combinations: [{ id: randomUUID(), label: 'C', tableIds: [tables[2], tables[5]], minCovers: 7, maxCovers: 12, priority: 0 }],
        policy: { slotMinutes: 15, leadMinutes: 0, horizonDays: 60, minParty: 1, maxParty: 12, bufferMinutes: 15, approvalMode: 'auto', pendingMode: 'unallocated', pendingHoldMinutes: 15, cancelCutoffMinutes: 120, modifyCutoffMinutes: 120, allowGuestModify: true, rules: [] },
        guest: { terms: 'T' },
      };
      const slug = `scale-${tag}-${i}`;
      await c.query('begin'); await c.query('set local role authenticated'); await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [owner]);
      const created = (await c.query('select public.tables_create_venue($1,$2,$3) v', [org, `Scale ${i}`, slug])).rows[0].v;
      const saved = (await c.query('select public.tables_save_draft($1,$2,$3) v', [created.id, JSON.stringify(draft), created.lockVersion])).rows[0].v;
      await c.query('select public.tables_publish_venue($1,$2)', [created.id, saved.lockVersion]);
      await c.query('commit');
      // 30 days × 30 tables × 3 turns, non-overlapping per table (18:00, 20:00, 22:00 + 105 min + 15 buffer).
      await c.query(`
        with d as (select generate_series(0, 29) dd), t as (select unnest($2::uuid[]) tid, generate_series(1, 30) k), s as (select unnest(array['18:00','20:00','22:00']) tm),
        rows0 as (
          select gen_random_uuid() rid, gen_random_uuid() gid, t.tid, t.k, ($3::date + d.dd) sd, s.tm,
            ((($3::date + d.dd) + s.tm::time) at time zone '${TZ}') st, row_number() over () - 1 n
          from d, t, s)
        , rows as (select r0.*, 'S' || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789', ((n / 1336336) % 34)::int + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789', ((n / 39304) % 34)::int + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789', ((n / 1156) % 34)::int + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789', ((n / 34) % 34)::int + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789', ((n / 1) % 34)::int + 1, 1) ref from rows0 r0)
        , ins as (
          insert into public.tables_reservations(id, organization_id, venue_id, version_id, reference, service_key, service_date, local_time, starts_at, ends_at,
            buffer_minutes, party_size, status, source, approval, guest_name, idempotency_key, request_hash)
          select rid, $4, $1, (select current_version_id from public.tables_venues where id = $1), ref, 'dinner', sd, tm, st, st + interval '105 minutes',
            15, 2, 'confirmed', 'phone', 'auto', 'Synthetic', gen_random_uuid(), md5(rid::text) || md5(gid::text)
          from rows returning id)
        insert into public.tables_allocations(organization_id, venue_id, physical_table_id, group_id, reservation_id, occupied_during, state)
        select $4, $1, tid, gid, rid, tstzrange(st, st + interval '120 minutes', '[)'), 'confirmed' from rows`,
      [created.id, tables, firstDay, org]);
      venues.push({ id: created.id, slug, tables });
    }

    // Seeded bookings are 'phone' bookings: 2,700 'online' rows created this second would (correctly) trip the venue flood guard
    // (300 online bookings / 15 min) and every public booking attempt would be refused.
    // References are sequential (S + row number in the A–Z2–9 alphabet): random 6-char prefixes collide for 2,700 rows (~20 % per venue).
    async function measure(volume: number) {
      const v0 = venues[0]!;
      const day = localDate(3);
      const times = { availability: [] as number[], bookAttempt: [] as number[], shift: [] as number[], staffAvailability: [] as number[] };
      for (let k = 0; k < 7; k++) {
        times.availability.push((await as(null, 'select public.tables_public_availability($1,$2,4,null,$3)', [v0.slug, day, randomUUID()])).ms);
        times.bookAttempt.push((await as(null, 'select public.tables_public_book($1,$2,$3,$4)', [v0.slug, JSON.stringify({ serviceKey: 'dinner', date: day, time: '19:00', party: 2, name: 'x', phone: '0501234567', termsAccepted: true }), randomUUID(), randomUUID()])).ms);
        times.shift.push((await as(owner, 'select public.tables_shift($1,$2)', [v0.id, day])).ms);
        times.staffAvailability.push((await as(owner, 'select public.tables_staff_availability($1,$2,4,null)', [v0.id, day])).ms);
      }
      const med = (xs: number[]) => Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);
      const counts = (await c.query(`select (select count(*) from public.tables_reservations) r, (select count(*) from public.tables_allocations) a`)).rows[0];
      const plan = (await c.query(`explain (analyze, buffers, format text) select * from private.tables_candidates($1, tstzrange(($2::date + time '19:00') at time zone '${TZ}', ($2::date + time '21:00') at time zone '${TZ}', '[)'), 4, null, false, null, 5)`, [v0.id, day])).rows.map((r) => r['QUERY PLAN']).join('\n');
      results.push({ venues: volume, reservations: Number(counts.r), allocations: Number(counts.a), medianMs: Object.fromEntries(Object.entries(times).map(([k, xs]) => [k, med(xs)])), candidatePlanExecution: /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] });
      fs.mkdirSync('test-evidence/tables', { recursive: true });
      fs.writeFileSync(`test-evidence/tables/scale-plan-${volume}.txt`, plan);
    }

    for (let i = 0; i < 100; i++) {
      await addVenue(i);
      if (i === 0 || i === 19 || i === 99) await measure(i + 1);
    }
    await c.query('analyze');
    fs.writeFileSync('test-evidence/tables/scale.json', JSON.stringify({ at: new Date().toISOString(), note: 'local disposable stack, Podman WSL2 (4 vCPU, 6 GiB); not a Cloud Micro measurement', results }, null, 2));
    console.log(JSON.stringify(results, null, 1));
    await c.end();
    const last = results[results.length - 1] as { medianMs: Record<string, number> };
    expect(last.medianMs.bookAttempt).toBeLessThan(1500);
  }, 1_800_000);
});
