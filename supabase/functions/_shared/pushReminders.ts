/**
 * Sends the due booking reminders as empty Web Push messages (the guest's device fetches the
 * booking itself when the push arrives). Runs every 10 minutes from pg_cron. Safe to call any
 * number of times: each address is claimed in the database before it is pushed, so nothing is
 * sent twice, and calls with nothing due cost one small query.
 */
import { generateVapidKeys, vapidAuthorization, type VapidKeys } from './vapid.ts';

export const SUBJECT = 'https://formangle.rockstackds.com';

export interface PushDeps {
  /** Calls a database function with the service role. */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
  fetch: typeof fetch;
  now?: () => number;
}

export interface RunResult { claimed: number; sent: number; gone: number; failed: number }

async function signingKeys(deps: PushDeps): Promise<VapidKeys> {
  const existing = await deps.rpc('tables_push_key_init', { p_public_key: null, p_private_jwk: {} }) as VapidKeys | null;
  if (existing?.publicKey && existing.privateJwk) return existing;
  // First run: create the key here, store it once (a parallel run's key wins if it was first).
  const fresh = await generateVapidKeys();
  const stored = await deps.rpc('tables_push_key_init', { p_public_key: fresh.publicKey, p_private_jwk: fresh.privateJwk }) as VapidKeys | null;
  if (!stored?.publicKey) throw new Error('push key unavailable');
  return stored;
}

export async function runPushReminders(deps: PushDeps): Promise<RunResult> {
  const keys = await signingKeys(deps);
  const due = (await deps.rpc('tables_push_claim', { p_limit: 200 }) as { id: string; endpoint: string }[] | null) ?? [];
  const result: RunResult = { claimed: due.length, sent: 0, gone: 0, failed: 0 };
  const auth = new Map<string, Promise<string>>();
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const one = async (row: { id: string; endpoint: string }) => {
    let outcome: 'sent' | 'gone' | 'failed' = 'failed';
    try {
      const origin = new URL(row.endpoint).origin;
      if (!auth.has(origin)) auth.set(origin, vapidAuthorization(row.endpoint, keys, SUBJECT, now));
      const res = await deps.fetch(row.endpoint, {
        method: 'POST',
        headers: { Authorization: await auth.get(origin)!, TTL: '1800', Urgency: 'high', 'Content-Length': '0' },
        signal: AbortSignal.timeout(8000),
      });
      outcome = res.ok ? 'sent' : res.status === 404 || res.status === 410 ? 'gone' : 'failed';
    } catch {
      outcome = 'failed';
    }
    result[outcome]++;
    await deps.rpc('tables_push_result', { p_id: row.id, p_outcome: outcome });
  };
  for (let i = 0; i < due.length; i += 20) await Promise.all(due.slice(i, i + 20).map(one));
  return result;
}
