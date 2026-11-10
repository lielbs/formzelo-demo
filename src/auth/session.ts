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

/**
 * True when a re-check found the same signed-in access (same user, email and memberships).
 * Background re-checks (token refresh, tab focus) keep the current state in that case, so pages
 * are not unmounted and unsaved input is not lost.
 */
export function sameAccess(a: { kind: string }, b: WorkforceAccess): boolean {
  if (a.kind !== b.kind) return false;
  if (b.kind === 'unauthenticated') return true;
  const prev = a as Exclude<WorkforceAccess, { kind: 'unauthenticated' }>;
  if (prev.userId !== b.userId || prev.email !== b.email) return false;
  if (b.kind === 'unauthorized') return true;
  const key = (m: readonly Membership[]) => m.map((x) => `${x.organization_id}:${x.role}:${x.status}`).sort().join('|');
  return key((prev as Extract<WorkforceAccess, { kind: 'authenticated' }>).memberships) === key(b.memberships);
}
