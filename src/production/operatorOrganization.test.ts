import { describe, expect, it, vi } from 'vitest';
import { handleOperatorOrganization } from '../../supabase/functions/_shared/operatorOrganization';

const URL = 'https://example.test/functions/v1/operator-organizations';

function request(body: unknown, token = 'valid.jwt') {
  return new Request(URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('operator organization provisioning boundary', () => {
  it('normalizes input and binds the verified caller as actor', async () => {
    const provision = vi.fn(async () => ({ organizationId: 'org-id', token: 'raw-once', expiresAt: 'later' }));
    const response = await handleOperatorOrganization(request({ slug: ' New-Business ', name: ' עסק חדש ', ownerEmail: 'Owner@Example.com ' }), {
      authenticate: async () => ({ userId: 'verified-operator' }),
      provision,
    });
    expect(response.status).toBe(201);
    expect(provision).toHaveBeenCalledWith({ actorUserId: 'verified-operator', slug: 'new-business', name: 'עסק חדש', ownerEmail: 'owner@example.com' });
    expect(await response.json()).toEqual(expect.objectContaining({ invitationToken: 'raw-once' }));
  });

  it('rejects anonymous, invalid and cross-origin requests before provisioning', async () => {
    const provision = vi.fn();
    expect((await handleOperatorOrganization(new Request(URL, { method: 'POST' }), { authenticate: vi.fn(), provision })).status).toBe(401);
    expect((await handleOperatorOrganization(request({ slug: '../bad', name: '', ownerEmail: 'bad' }), { authenticate: async () => ({ userId: 'operator' }), provision })).status).toBe(400);
    expect((await handleOperatorOrganization(new Request(URL, { method: 'POST', headers: { origin: 'https://evil.example' } }), {
      allowedOrigin: 'https://formangle.rockstackds.com', authenticate: vi.fn(), provision,
    })).status).toBe(403);
    expect(provision).not.toHaveBeenCalled();
  });

  it('does not leak privileged failure details', async () => {
    const response = await handleOperatorOrganization(request({ slug: 'valid-business', name: 'Valid', ownerEmail: 'owner@example.com' }), {
      authenticate: async () => ({ userId: 'unauthorized' }),
      provision: async () => { throw new Error('service role and database details'); },
    });
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('{"error":"operation_not_permitted"}');
  });
});
