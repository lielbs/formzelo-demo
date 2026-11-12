import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_DELETION_CONFIRM, handleAccountDeletion } from '../../supabase/functions/_shared/accountDeletion';

const URL = 'https://example.test/functions/v1/account-deletion';
const ORIGIN = 'https://formangle.rockstackds.com';

const request = (body: unknown, token: string | null = 'valid.jwt', origin = ORIGIN) => new Request(URL, {
  method: 'POST',
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', origin },
  body: JSON.stringify(body),
});

const deps = (over: Partial<Parameters<typeof handleAccountDeletion>[1]> = {}) => ({
  allowedOrigin: ORIGIN,
  authenticate: vi.fn(async () => ({ userId: 'me' })),
  prepare: vi.fn(async () => undefined),
  deleteUser: vi.fn(async () => undefined),
  ...over,
});

describe('account deletion boundary', () => {
  it('deletes only the verified caller, after the database has ended their memberships', async () => {
    const prepare = vi.fn(async () => undefined);
    const deleteUser = vi.fn(async () => undefined);
    const d = deps({ prepare, deleteUser });
    const res = await handleAccountDeletion(request({ confirm: ACCOUNT_DELETION_CONFIRM, userId: 'someone-else' }), d);
    expect(res.status).toBe(200);
    expect(d.prepare).toHaveBeenCalledWith('me');
    expect(d.deleteUser).toHaveBeenCalledWith('me');
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]!);
  });

  it('refuses without a session, without confirmation, or from another site', async () => {
    const d = deps();
    expect((await handleAccountDeletion(request({ confirm: ACCOUNT_DELETION_CONFIRM }, null), d)).status).toBe(401);
    expect((await handleAccountDeletion(request({ confirm: 'yes' }), d)).status).toBe(400);
    expect((await handleAccountDeletion(request({ confirm: ACCOUNT_DELETION_CONFIRM }, 'valid.jwt', 'https://evil.example'), d)).status).toBe(403);
    const anon = deps({ authenticate: vi.fn(async () => null) });
    expect((await handleAccountDeletion(request({ confirm: ACCOUNT_DELETION_CONFIRM }), anon)).status).toBe(401);
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(anon.deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the account when the team would be left without an owner', async () => {
    const d = deps({ prepare: vi.fn(async () => { throw new Error('team_needs_owner'); }) });
    const res = await handleAccountDeletion(request({ confirm: ACCOUNT_DELETION_CONFIRM }), d);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'team_needs_owner' });
    expect(d.deleteUser).not.toHaveBeenCalled();
  });
});
