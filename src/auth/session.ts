import type { Database } from '../production/database.generated';

export type Membership = Pick<
  Database['public']['Tables']['organization_memberships']['Row'],
  'organization_id' | 'role' | 'status'
>;

export interface ClaimsLike {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
}

export type WorkforceAccess =
  | { kind: 'unauthenticated' }
  | { kind: 'unauthorized'; userId: string; email: string | null }
  | {
      kind: 'authenticated';
      userId: string;
      email: string | null;
      expiresAt: number | null;
      memberships: readonly Membership[];
    };

/** Membership rows—not user metadata or JWT app hints—authorize tenant access. */
export function resolveWorkforceAccess(claims: ClaimsLike | null, memberships: readonly Membership[]): WorkforceAccess {
  if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) return { kind: 'unauthenticated' };

  const email = typeof claims.email === 'string' ? claims.email : null;
  const activeMemberships = memberships.filter((membership) => membership.status === 'active');
  if (activeMemberships.length === 0) return { kind: 'unauthorized', userId: claims.sub, email };

  return {
    kind: 'authenticated',
    userId: claims.sub,
    email,
    expiresAt: typeof claims.exp === 'number' ? claims.exp : null,
    memberships: activeMemberships,
  };
}
