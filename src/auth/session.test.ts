import { describe, expect, it } from 'vitest';
import { resolveWorkforceAccess, sameAccess } from './session';

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

  it('treats a background re-check with the same user and memberships as unchanged', () => {
    const m = [{ organization_id: 'org-a', role: 'owner', status: 'active' }] as const;
    const a = resolveWorkforceAccess({ sub: 'user-a', email: 'o@example.test', exp: 1 }, [...m]);
    const b = resolveWorkforceAccess({ sub: 'user-a', email: 'o@example.test', exp: 2 }, [...m]);
    expect(sameAccess(a, b)).toBe(true);
    expect(sameAccess({ kind: 'loading' }, b)).toBe(false);
    expect(sameAccess(a, resolveWorkforceAccess({ sub: 'user-b', email: 'o@example.test' }, [...m]))).toBe(false);
    expect(sameAccess(a, resolveWorkforceAccess({ sub: 'user-a', email: 'o@example.test' }, [{ organization_id: 'org-a', role: 'staff', status: 'active' }]))).toBe(false);
    expect(sameAccess(a, resolveWorkforceAccess(null, []))).toBe(false);
  });
});
