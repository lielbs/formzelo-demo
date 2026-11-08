export interface OperatorOrganizationDependencies {
  allowedOrigin?: string;
  authenticate(jwt: string): Promise<{ userId: string } | null>;
  provision(input: { actorUserId: string; slug: string; name: string; ownerEmail: string }): Promise<{ organizationId: string; token: string; expiresAt: string }>;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const response = (status: number, body: Record<string, unknown>, origin?: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  },
});

export async function handleOperatorOrganization(request: Request, deps: OperatorOrganizationDependencies): Promise<Response> {
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
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const ownerEmail = typeof input.ownerEmail === 'string' ? input.ownerEmail.trim().toLowerCase() : '';
  if (!SLUG.test(slug) || slug.length > 80 || !name || name.length > 200 || !EMAIL.test(ownerEmail) || ownerEmail.length > 320) {
    return response(400, { error: 'invalid_request' }, origin);
  }

  try {
    const provisioned = await deps.provision({ actorUserId: identity.userId, slug, name, ownerEmail });
    return response(201, {
      organizationId: provisioned.organizationId,
      invitationToken: provisioned.token,
      invitationExpiresAt: provisioned.expiresAt,
    }, origin);
  } catch {
    return response(403, { error: 'operation_not_permitted' }, origin);
  }
}
