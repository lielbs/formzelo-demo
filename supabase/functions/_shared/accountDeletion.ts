/**
 * "Delete my account" (App Review 5.1.1(v)). The signed-in user removes their own account and nobody
 * else's: the identity comes from the verified session token, never from the request body.
 * The database first ends the user's memberships (refusing to leave a team without an owner, and
 * closing a business the user runs alone); only then is the sign-in itself removed.
 */
export interface AccountDeletionDependencies {
  allowedOrigin?: string;
  authenticate(jwt: string): Promise<{ userId: string } | null>;
  /** Throws Error('team_needs_owner') when the user is the only owner of a team with other members. */
  prepare(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

/** The client sends this only after the person typed the confirmation word. */
export const ACCOUNT_DELETION_CONFIRM = 'delete-my-account';

const response = (status: number, body: Record<string, unknown>, origin?: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  },
});

export async function handleAccountDeletion(request: Request, deps: AccountDeletionDependencies): Promise<Response> {
  const origin = request.headers.get('origin') ?? undefined;
  if (deps.allowedOrigin && origin !== deps.allowedOrigin) return response(403, { error: 'origin_not_permitted' });
  if (request.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin ?? '',
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '600',
      vary: 'Origin',
    },
  });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' }, origin);
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return response(401, { error: 'authentication_required' }, origin);
  const identity = await deps.authenticate(authorization.slice(7));
  if (!identity) return response(401, { error: 'authentication_required' }, origin);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return response(400, { error: 'invalid_request' }, origin); }
  if (body.confirm !== ACCOUNT_DELETION_CONFIRM) return response(400, { error: 'confirmation_required' }, origin);

  try {
    await deps.prepare(identity.userId);
  } catch (e) {
    if (e instanceof Error && e.message === 'team_needs_owner') return response(409, { error: 'team_needs_owner' }, origin);
    return response(500, { error: 'deletion_failed' }, origin);
  }
  try {
    await deps.deleteUser(identity.userId);
  } catch {
    return response(500, { error: 'deletion_failed' }, origin);
  }
  return response(200, { deleted: true }, origin);
}
