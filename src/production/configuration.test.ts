import { describe, expect, it, vi } from 'vitest';
import { IntegrationConnection, OrganizationConfiguration, resolveConnection, WorkflowConfiguration } from './configuration';
import { selectRepository } from './contracts';
import type { FormangleRepository } from '../data/repository';

const org = '30000000-0000-4000-8000-000000000001';
const id = '40000000-0000-4000-8000-000000000001';
const config = { schemaVersion: 1, locale: 'he-IL', timezone: 'Asia/Jerusalem', providerDefaults: {}, communication: { enabled: false, channels: [] }, workingHours: [] };
const connection: IntegrationConnection = { id, organizationId: org, category: 'payments', providerKey: 'test', state: 'connected' };

describe('production configuration boundaries', () => {
  it('accepts Hebrew business configuration without enabling providers', () => {
    expect(OrganizationConfiguration.parse(config).communication.enabled).toBe(false);
  });
  it('rejects credentials and unknown configuration fields', () => {
    expect(OrganizationConfiguration.safeParse({ ...config, apiKey: 'not-a-real-key' }).success).toBe(false);
    expect(WorkflowConfiguration.safeParse({ schemaVersion: 1, providerOverrides: { secret: 'x' }, approvalRequired: true, notificationChannels: [] }).success).toBe(false);
  });
  it('rejects invalid timezone and reversed working hours', () => {
    expect(OrganizationConfiguration.safeParse({ ...config, timezone: 'unknown-zone' }).success).toBe(false);
    expect(OrganizationConfiguration.safeParse({ ...config, workingHours: [{ weekday: 1, start: '18:00', end: '09:00' }] }).success).toBe(false);
  });
  it('requires UUID connection references rather than provider secrets', () => {
    expect(OrganizationConfiguration.safeParse({ ...config, providerDefaults: { payments: 'secret' } }).success).toBe(false);
  });
  it('does not silently choose a provider', () => {
    expect(resolveConnection(org, 'payments', {}, {}, [connection])).toBeNull();
  });
  it('inherits an organization provider and supports explicit disabling', () => {
    expect(resolveConnection(org, 'payments', { payments: id }, {}, [connection])).toBe(connection);
    expect(resolveConnection(org, 'payments', { payments: id }, { payments: null }, [connection])).toBeNull();
  });
  it('rejects cross-tenant and wrong-category connections', () => {
    expect(() => resolveConnection('another-org', 'payments', { payments: id }, {}, [connection])).toThrow('Integration unavailable');
    expect(() => resolveConnection(org, 'email', { email: id }, {}, [connection])).toThrow('Integration unavailable');
  });
  it.each(['not_configured', 'configured', 'test_pending', 'degraded', 'disabled'] as const)('does not report %s connections as operational', (state) => {
    expect(() => resolveConnection(org, 'payments', { payments: id }, {}, [{ ...connection, state }])).toThrow('Integration unavailable');
  });
  it('preserves local factory behavior and fails closed without production adapter', () => {
    const local = vi.fn(() => ({}) as FormangleRepository);
    selectRepository('local', { local });
    expect(local).toHaveBeenCalledOnce();
    expect(() => selectRepository('supabase', { local })).toThrow('Production repository is not configured');
    expect(local).toHaveBeenCalledOnce();
  });
});
