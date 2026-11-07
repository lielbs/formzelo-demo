/**
 * Account creation from an invitation. Public sign-up stays disabled and nothing is emailed:
 * the single-use invitation token is the credential. The function creates at most one
 * confirmed account, for the invitation's own address, while the invitation is pending.
 * Membership is granted later by accept_owner_invitation, as the signed-in user.
 */
export interface AccountOnboardingDependencies {
  allowedOrigin?: string;
  /** The pending invitation's address, or null when the token is not valid for this organization. */
  target(input: { token: string; organizationId: string }): Promise<{ email: string; accountExists: boolean } | null>;
  createAccount(input: { email: string; password: string }): Promise<void>;
}

const TOKEN = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const response = (status: number, body: Record<string, unknown>, origin?: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  },
});

export async function handleAccountOnboarding(request: Request, deps: AccountOnboardingDependencies): Promise<Response> {
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

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return response(400, { error: 'invalid_request' }, origin); }
  const token = typeof body.invitationToken === 'string' ? body.invitationToken : '';
  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!TOKEN.test(token) || !UUID.test(organizationId)) return response(400, { error: 'invalid_request' }, origin);
  if (password.length < 10 || password.length > 72 || password.trim() !== password) return response(400, { error: 'weak_password' }, origin);

  try {
    const target = await deps.target({ token, organizationId });
    // Expired, revoked, accepted or forged: one answer, so tokens cannot be probed.
    if (!target) return response(404, { error: 'invitation_unavailable' }, origin);
    if (target.accountExists) return response(409, { error: 'account_exists', email: target.email }, origin);
    await deps.createAccount({ email: target.email, password });
    return response(201, { email: target.email }, origin);
  } catch {
    return response(500, { error: 'onboarding_failed' }, origin);
  }
}
