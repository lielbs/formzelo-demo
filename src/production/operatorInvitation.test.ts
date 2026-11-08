import { describe, expect, it, vi } from 'vitest';
import { handleOperatorInvitation } from '../../supabase/functions/_shared/operatorInvitation';

const URL = 'https://example.test/functions/v1/operator-invitations';
const body = { email: 'Owner@Example.com ', organizationId: '10000000-0000-4000-8000-000000000001' };

function request(input: unknown = body, token = 'valid.jwt') {
  return new Request(URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

describe('operator invitation API boundary', () => {
  it('uses the authenticated caller id and normalizes the target email', async () => {
    const createInvitation = vi.fn(async () => ({ token: 'raw-once', expiresAt: '2026-11-05T00:00:00Z' }));
    const response = await handleOperatorInvitation(request(), {
      authenticate: async () => ({ userId: 'authenticated-user' }),
      createInvitation,
    });
    expect(response.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledWith({
      actorUserId: 'authenticated-user',
      organizationId: body.organizationId,
      email: 'owner@example.com',
    });
    expect(await response.json()).toEqual(expect.objectContaining({ invitationToken: 'raw-once' }));
  });

  it('rejects anonymous callers before privileged work', async () => {
    const createInvitation = vi.fn();
    const response = await handleOperatorInvitation(new Request(URL, { method: 'POST' }), {
      authenticate: vi.fn(),
      createInvitation,
    });
    expect(response.status).toBe(401);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('cannot impersonate an operator with request body fields', async () => {
    const createInvitation = vi.fn(async () => ({ token: 'raw-once', expiresAt: 'later' }));
    await handleOperatorInvitation(request({ ...body, actorUserId: 'forged', role: 'platform_operator' }), {
      authenticate: async () => ({ userId: 'real-user' }),
      createInvitation,
    });
    expect(createInvitation).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'real-user' }));
  });

  it('returns a non-sensitive denial for authorization and database failures', async () => {
    const response = await handleOperatorInvitation(request(), {
      authenticate: async () => ({ userId: 'unauthorized-user' }),
      createInvitation: async () => { throw new Error('service role secret and database details'); },
    });
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('{"error":"operation_not_permitted"}');
  });

  it('answers the browser preflight for every header supabase-js sends', async () => {
    const preflight = await handleOperatorInvitation(new Request(URL, { method: 'OPTIONS', headers: { origin: 'https://formangle.rockstackds.com' } }), {
      allowedOrigin: 'https://formangle.rockstackds.com', authenticate: vi.fn(), createInvitation: vi.fn(),
    });
    expect(preflight.status).toBe(204);
    const allowed = preflight.headers.get('access-control-allow-headers')!.split(',').map((h) => h.trim());
    expect(allowed).toEqual(expect.arrayContaining(['authorization', 'apikey', 'content-type', 'x-client-info']));
  });

  it('rejects requests from an unapproved browser origin', async () => {
    const response = await handleOperatorInvitation(new Request(URL, {
      method: 'POST',
      headers: { origin: 'https://evil.example', authorization: 'Bearer valid.jwt', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), {
      allowedOrigin: 'https://formangle.rockstackds.com',
      authenticate: async () => ({ userId: 'operator' }),
      createInvitation: vi.fn(),
    });
    expect(response.status).toBe(403);
  });
});
