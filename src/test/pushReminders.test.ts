import { describe, expect, it } from 'vitest';
import { runPushReminders } from '../../supabase/functions/_shared/pushReminders';
import { generateVapidKeys, vapidAuthorization } from '../../supabase/functions/_shared/vapid';

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

describe('Web Push reminders (sender)', () => {
  it('signs a VAPID header the push service can verify with the published key', async () => {
    const keys = await generateVapidKeys();
    expect(fromB64url(keys.publicKey)).toHaveLength(65);
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://formangle.rockstackds.com', 1_800_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2]!)));
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 43200, sub: 'https://formangle.rockstackds.com' });
    const pub = await crypto.subtle.importKey('raw', fromB64url(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(m[3]!), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it('creates the key once, pushes what is due with no payload, and reports each outcome', async () => {
    let stored: unknown = null;
    const calls: [string, Record<string, unknown>][] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      if (fn === 'tables_push_key_init') {
        if (!stored && args.p_public_key) stored = { publicKey: args.p_public_key, privateJwk: args.p_private_jwk };
        return stored;
      }
      if (fn === 'tables_push_claim') return [
        { id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/one' },
        { id: 's2', endpoint: 'https://web.push.apple.com/two' },
        { id: 's3', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/three' },
      ];
      return null;
    };
    const sentBodies: unknown[] = [];
    const fetchStub = (async (url: string, init: RequestInit) => {
      sentBodies.push(init.body);
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^vapid t=.+, k=/);
      return new Response(null, { status: url.includes('two') ? 410 : url.includes('three') ? 500 : 201 });
    }) as unknown as typeof fetch;
    const r = await runPushReminders({ rpc, fetch: fetchStub });
    expect(r).toEqual({ claimed: 3, sent: 1, gone: 1, failed: 1 });
    expect(sentBodies.every((b) => b === undefined)).toBe(true);
    const results = calls.filter(([fn]) => fn === 'tables_push_result').map(([, a]) => `${a.p_id}:${a.p_outcome}`).sort();
    expect(results).toEqual(['s1:sent', 's2:gone', 's3:failed']);

    // Second run reuses the stored key instead of making a new one.
    const before = JSON.stringify(stored);
    await runPushReminders({ rpc, fetch: fetchStub });
    expect(JSON.stringify(stored)).toBe(before);
  });
});
