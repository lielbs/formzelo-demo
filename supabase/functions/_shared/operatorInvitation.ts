export interface OperatorInvitationDependencies {
  allowedOrigin?: string;
  authenticate(jwt: string): Promise<{ userId: string } | null>;
  createInvitation(input: { actorUserId: string; organizationId: string; email: string }): Promise<{ token: string; expiresAt: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const response = (status: number, body: Record<string, unknown>, origin?: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  },
});

export async function handleOperatorInvitation(request: Request, deps: OperatorInvitationDependencies): Promise<Response> {
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

  let body: unknown;
  try { body = await request.json(); } catch { return response(400, { error: 'invalid_request' }, origin); }
  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const organizationId = typeof input.organizationId === 'string' ? input.organizationId : '';
  if (!EMAIL.test(email) || email.length > 320 || !UUID.test(organizationId)) return response(400, { error: 'invalid_request' }, origin);

  try {
    const invitation = await deps.createInvitation({ actorUserId: identity.userId, organizationId, email });
    return response(201, { invitationToken: invitation.token, organizationId, expiresAt: invitation.expiresAt }, origin);
  } catch {
    return response(403, { error: 'operation_not_permitted' }, origin);
  }
}
