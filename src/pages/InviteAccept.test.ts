import { describe, expect, it } from 'vitest';
import { parseInviteFragment } from './InviteAccept';

describe('invitation fragment parsing', () => {
  it('reads the raw token only from the URL fragment', () => {
    expect(parseInviteFragment('#invitation_token=abc123&organization_id=10000000-0000-4000-8000-000000000001')).toEqual({
      token: 'abc123',
      organizationId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('fails closed when either binding value is missing', () => {
    expect(parseInviteFragment('#invitation_token=abc123')).toBeNull();
    expect(parseInviteFragment('#organization_id=10000000-0000-4000-8000-000000000001')).toBeNull();
  });
});
