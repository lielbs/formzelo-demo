import { z } from 'zod';

export const ProviderCategory = z.enum(['payments', 'email', 'sms', 'whatsapp', 'crm', 'calendar', 'webhook']);
export const ConnectionState = z.enum(['not_configured', 'configured', 'test_pending', 'connected', 'degraded', 'disabled']);
const ConnectionId = z.uuid();
const Channel = z.enum(['email', 'sms', 'whatsapp']);
const ProviderSelections = z.partialRecord(ProviderCategory, ConnectionId.nullable());

/** Safe configuration only. Unknown keys (including credential fields) are rejected. */
export const OrganizationConfiguration = z.strictObject({
  schemaVersion: z.literal(1),
  locale: z.enum(['he-IL', 'en-US']),
  timezone: z.string().max(80).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Invalid timezone'),
  providerDefaults: ProviderSelections,
  communication: z.strictObject({ channels: z.array(Channel).max(3), enabled: z.boolean() }),
  workingHours: z.array(z.strictObject({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).refine((hours) => hours.start < hours.end, 'Use separate windows across midnight')).max(21),
});

export const WorkflowConfiguration = z.strictObject({
  schemaVersion: z.literal(1),
  providerOverrides: ProviderSelections,
  // No default settlement, messaging, retention or token lifetime policy is selected here.
  paymentTiming: z.enum(['disabled', 'before_approval', 'after_approval']).optional(),
  approvalRequired: z.boolean(),
  notificationChannels: z.array(Channel).max(3),
});

export const IntegrationConnection = z.strictObject({
  id: ConnectionId,
  organizationId: z.uuid(),
  category: ProviderCategory,
  providerKey: z.string().regex(/^[a-z0-9_-]{1,80}$/),
  state: ConnectionState,
});
export type IntegrationConnection = z.infer<typeof IntegrationConnection>;

/** null explicitly disables an inherited provider; undefined inherits. Never picks a fallback. */
export function resolveConnection(
  organizationId: string,
  category: z.infer<typeof ProviderCategory>,
  defaults: z.infer<typeof ProviderSelections>,
  overrides: z.infer<typeof ProviderSelections>,
  connections: readonly IntegrationConnection[],
): IntegrationConnection | null {
  const id = overrides[category] === undefined ? defaults[category] : overrides[category];
  if (id == null) return null;
  const connection = connections.find((item) => item.id === id && item.organizationId === organizationId && item.category === category);
  if (!connection || connection.state !== 'connected') throw new Error('Integration unavailable');
  return connection;
}
