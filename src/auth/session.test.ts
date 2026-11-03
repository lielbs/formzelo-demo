import { describe, expect, it } from 'vitest';
import { resolveWorkforceAccess } from './session';

describe('resolveWorkforceAccess', () => {
  it('fails closed without verified claims', () => {
    expect(resolveWorkforceAccess(null, [])).toEqual({ kind: 'unauthenticated' });
    expect(resolveWorkforceAccess({ sub: 42 }, [])).toEqual({ kind: 'unauthenticated' });
  });

  it('does not authorize a valid identity without an active database membership', () => {
    expect(resolveWorkforceAccess({ sub: 'user-a', email: 'owner@example.test' }, [
      { organization_id: 'org-a', role: 'owner', status: 'suspended' },
    ])).toEqual({ kind: 'unauthorized', userId: 'user-a', email: 'owner@example.test' });
  });

  it('authorizes from active membership rows and ignores user metadata roles', () => {
    expect(resolveWorkforceAccess({ sub: 'user-a', email: 'owner@example.test', exp: 1234 }, [
      { organization_id: 'org-a', role: 'owner', status: 'active' },
      { organization_id: 'org-b', role: 'staff', status: 'suspended' },
    ])).toEqual({
      kind: 'authenticated',
      userId: 'user-a',
      email: 'owner@example.test',
      expiresAt: 1234,
      memberships: [{ organization_id: 'org-a', role: 'owner', status: 'active' }],
    });
  });
});
