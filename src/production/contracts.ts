import type { FormangleRepository } from '../data/repository';
import type { WorkflowConfig } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';

// Hand-authored command/projection contracts, NOT generated database types.
// Generate Database from the real local database before implementing a Supabase adapter.
export type OrganizationRole = 'owner' | 'staff';
export interface TenantScope { organizationId: string; }
export interface CommandContext extends TenantScope {
  requestId: string;
  idempotencyKey: string;
  expectedRevision: number;
}
export interface WorkflowDraftRecord extends TenantScope {
  id: string;
  schemaVersion: number;
  config: WorkflowConfig;
  design: WorkflowTheme;
  revision: number;
}
export interface PublishedWorkflowRecord extends Omit<WorkflowDraftRecord, 'revision'> {
  workflowId: string;
  versionNumber: number;
  engineVersion: string;
  publishedAt: string;
}
export type DomainEventType =
  | 'workflow.submitted' | 'request.approved' | 'request.rejected'
  | 'customer_action.responded' | 'booking.confirmed' | 'booking.cancelled'
  | 'payment.confirmed' | 'payment.failed' | 'follow_up.due';
export interface EventEnvelope extends TenantScope {
  id: string;
  type: DomainEventType;
  schemaVersion: 1;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string;
  // No answer bodies, contact details or token material in queue envelopes.
}
export type DeclarativeCondition = {
  field: 'event.type' | 'workflow.id' | 'request.status';
  operator: 'eq' | 'in';
  values: readonly string[];
};
export interface AutomationDefinition extends TenantScope {
  id: string;
  version: number;
  enabled: boolean;
  trigger: DomainEventType;
  conditions: readonly DeclarativeCondition[];
  actions: readonly { type: 'send_message' | 'create_checkout' | 'crm_upsert' | 'calendar_update' | 'webhook'; connectionId: string; templateId: string }[];
}
export interface AdapterContext extends TenantScope {
  connectionId: string;
  correlationId: string;
  idempotencyKey: string;
  deadline: string;
  signal: AbortSignal;
  // Inject only in the server worker. Return value must never enter logs/events.
  withCredentials<T>(use: (credentials: Readonly<Record<string, string>>) => Promise<T>): Promise<T>;
}
export type ProviderResult =
  | { outcome: 'accepted'; providerReference: string }
  | { outcome: 'failed'; category: 'authentication' | 'invalid_input' | 'rate_limit' | 'transient' | 'unknown'; retryAfterMs?: number };
export interface MessageAdapter {
  send(input: { templateId: string; recipientReference: string }, context: AdapterContext): Promise<ProviderResult>;
}
export interface PaymentAdapter {
  createCheckout(input: { submissionId: string; amountMinor: number; currency: string }, context: AdapterContext): Promise<ProviderResult>;
}
export interface ExternalSystemAdapter {
  execute(input: { operation: string; resourceReference: string }, context: AdapterContext): Promise<ProviderResult>;
}
export type ExecutionState = 'pending' | 'leased' | 'retry_wait' | 'succeeded' | 'dead_letter';
export interface ExecutionRecord extends TenantScope {
  eventId: string;
  ruleVersion: number;
  actionIndex: number;
  idempotencyKey: string;
  attempt: number;
  maxAttempts: number;
  state: ExecutionState;
  leaseExpiresAt: string | null;
  nextAttemptAt: string | null;
}

/** Composition seam for development harnesses; existing demo bootstrap is unchanged. */
export function selectRepository(
  mode: 'local' | 'supabase',
  factories: { local: () => FormangleRepository; supabase?: () => FormangleRepository },
): FormangleRepository {
  if (mode === 'local') return factories.local();
  if (mode !== 'supabase' || !factories.supabase) throw new Error('Production repository is not configured');
  return factories.supabase();
}
