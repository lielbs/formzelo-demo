import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.generated';
import { createProductionRepository, ProductionCapabilityError } from './productionRepository';

function clientWithOrganizations(organizations: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(async () => ({ data: organizations, error: null })),
  };
  return { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;
}

const organization = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'rockstack-client',
  name: 'לקוח מאובטח',
  status: 'active',
  created_at: '2026-11-03T10:00:00.000Z',
  updated_at: '2026-11-03T10:00:00.000Z',
};

describe('production repository boundary', () => {
  it('loads only organizations returned through the authenticated RLS query', async () => {
    const client = clientWithOrganizations([organization]);
    const repo = createProductionRepository(client);
    await repo.init();
    expect(await repo.listOrganizations()).toEqual([expect.objectContaining({ id: organization.id, isDemo: false })]);
    expect(client.from).toHaveBeenCalledWith('organizations');
  });

  it('rejects a forged active organization id before issuing a tenant query', async () => {
    const client = clientWithOrganizations([organization]);
    const repo = createProductionRepository(client);
    await repo.init();
    await expect(repo.listRuns('20000000-0000-4000-8000-000000000002')).rejects.toThrow('not available');
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it('never falls back to demo persistence for unsupported production writes', async () => {
    const repo = createProductionRepository(clientWithOrganizations([organization]));
    await repo.init();
    await expect(repo.resetDemoData()).rejects.toBeInstanceOf(ProductionCapabilityError);
  });

  it('can be awaited: it is not mistaken for a promise', async () => {
    const repo = createProductionRepository(clientWithOrganizations([organization]));
    await expect(Promise.resolve(repo)).resolves.toBe(repo);
    expect((repo as unknown as { then?: unknown }).then).toBeUndefined();
  });
});
