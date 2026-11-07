import { describe, expect, it, vi } from 'vitest';
import { handleAccountOnboarding } from '../../supabase/functions/_shared/accountOnboarding';

const ORIGIN = 'https://formangle.rockstackds.com';
const ORG = '36000000-0000-4000-8000-000000000001';
const TOKEN = 'a'.repeat(64);

const call = (body: unknown, origin = ORIGIN, method = 'POST') =>
  new Request('https://example.test/functions/v1/account-onboarding', {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

describe('account creation from an invitation', () => {
  it('creates one account for the invited address only', async () => {
    const createAccount = vi.fn(async () => undefined);
    const res = await handleAccountOnboarding(call({ invitationToken: TOKEN, organizationId: ORG, password: 'correct-horse-9', email: 'attacker@evil.test' }), {
      allowedOrigin: ORIGIN,
      target: async () => ({ email: 'owner@business.test', accountExists: false }),
      createAccount,
    });
    expect(res.status).toBe(201);
    expect(createAccount).toHaveBeenCalledWith({ email: 'owner@business.test', password: 'correct-horse-9' });
  });

  it('never creates a second account and never reveals why a token failed', async () => {
    const createAccount = vi.fn(async () => undefined);
    const existing = await handleAccountOnboarding(call({ invitationToken: TOKEN, organizationId: ORG, password: 'correct-horse-9' }), {
      allowedOrigin: ORIGIN,
      target: async () => ({ email: 'o@b.test', accountExists: true }),
      createAccount,
    });
    expect(existing.status).toBe(409);
    const unknown = await handleAccountOnboarding(call({ invitationToken: TOKEN, organizationId: ORG, password: 'correct-horse-9' }), {
      allowedOrigin: ORIGIN,
      target: async () => null,
      createAccount,
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'invitation_unavailable' });
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('rejects other origins, malformed tokens and weak passwords before any lookup', async () => {
    const target = vi.fn(async () => ({ email: 'o@b.test', accountExists: false }));
    const deps = { allowedOrigin: ORIGIN, target, createAccount: vi.fn(async () => undefined) };
    expect((await handleAccountOnboarding(call({ invitationToken: TOKEN, organizationId: ORG, password: 'correct-horse-9' }, 'https://evil.test'), deps)).status).toBe(403);
    expect((await handleAccountOnboarding(call({ invitationToken: 'nope', organizationId: ORG, password: 'correct-horse-9' }), deps)).status).toBe(400);
    expect((await handleAccountOnboarding(call({ invitationToken: TOKEN, organizationId: ORG, password: 'short' }), deps)).status).toBe(400);
    expect((await handleAccountOnboarding(call({}, ORIGIN, 'GET'), deps)).status).toBe(405);
    expect(target).not.toHaveBeenCalled();
  });
});
