import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkflowConfigSchema, type Organization, type RunStatus, type Workflow, type WorkflowRun } from '../domain/schema';
import { WorkflowThemeSchema } from '../domain/theme';
import type { Database, Json } from './database.generated';
import type { FormangleRepository } from '../data/repository';

export class ProductionCapabilityError extends Error {
  constructor(capability: string) {
    super(`Production capability is not available: ${capability}`);
    this.name = 'ProductionCapabilityError';
  }
}

function jsonObject(value: Json): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid production record');
  return value as Record<string, unknown>;
}

function mapOrganization(row: Database['public']['Tables']['organizations']['Row']): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    industry: 'סביבת ייצור',
    tagline: '',
    brand: { primaryColor: '#ea580c', logoText: row.name.slice(0, 40) },
    contactEmail: '',
    isDemo: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkflow(row: Database['public']['Tables']['workflows']['Row']): Workflow {
  const config = WorkflowConfigSchema.parse(jsonObject(row.draft_config));
  const design = WorkflowThemeSchema.parse(jsonObject(row.draft_design));
  return {
    id: row.id,
    orgId: row.organization_id,
    slug: row.public_slug,
    status: row.status as Workflow['status'],
    templateKey: 'production',
    draft: config,
    design,
    publishedVersionId: row.published_version_id ?? undefined,
    hasUnpublishedChanges: row.status === 'published' && row.lock_version > 0,
    isDemo: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: Database['public']['Tables']['submissions']['Row']): WorkflowRun {
  const answers = jsonObject(row.answers);
  return {
    id: row.id,
    orgId: row.organization_id,
    workflowId: row.workflow_id,
    versionId: row.workflow_version_id,
    versionNumber: 1,
    reference: row.id.slice(0, 8).toUpperCase(),
    status: ({ received: 'submitted' }[row.status] ?? row.status) as RunStatus,
    answers: Array.isArray(answers.answers) ? (answers.answers as WorkflowRun['answers']) : [],
    caseAnswers: [],
    priceLines: [],
    total: row.total_minor / 100,
    payment: { status: 'none', amount: 0, kind: 'none' },
    customerName: typeof answers.customerName === 'string' ? answers.customerName : '',
    customerContact: typeof answers.customerContact === 'string' ? answers.customerContact : '',
    submittedAt: row.created_at,
    isDemo: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureSelectedOrganization(allowed: ReadonlySet<string>, orgId: string) {
  if (!allowed.has(orgId)) throw new Error('Organization is not available to this session');
}

/**
 * First production slice: RLS-backed organization, workflow and submission reads.
 * Every unimplemented mutation rejects explicitly; it can never fall back to demo storage.
 */
export function createProductionRepository(client: SupabaseClient<Database>): FormangleRepository {
  const listeners = new Set<() => void>();
  let organizations: Organization[] = [];
  let activeOrgId: string | null = null;

  const supported = {
    async init() {
      const { data, error } = await client.from('organizations').select('id, slug, name, status, created_at, updated_at').in('status', ['active', 'onboarding']);
      if (error) throw new Error('Unable to load authorized organizations');
      organizations = (data ?? []).map(mapOrganization);
      activeOrgId = organizations[0]?.id ?? null;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async listOrganizations() { return [...organizations]; },
    async getActiveOrgId() { return activeOrgId; },
    async setActiveOrgId(orgId: string) {
      ensureSelectedOrganization(new Set(organizations.map((item) => item.id)), orgId);
      activeOrgId = orgId;
      listeners.forEach((listener) => listener());
    },
    async listWorkflows(orgId: string) {
      ensureSelectedOrganization(new Set(organizations.map((item) => item.id)), orgId);
      const { data, error } = await client.from('workflows').select('*').eq('organization_id', orgId).order('updated_at', { ascending: false });
      if (error) throw new Error('Unable to load workflows');
      return (data ?? []).map(mapWorkflow);
    },
    async listRuns(orgId: string) {
      ensureSelectedOrganization(new Set(organizations.map((item) => item.id)), orgId);
      const { data, error } = await client.from('submissions').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (error) throw new Error('Unable to load submissions');
      return (data ?? []).map(mapRun);
    },
    async listEvents() { return []; },
    async listNotifications() { return []; },
    async listUsage() { return []; },
    async listActions() { return []; },
  };

  return new Proxy(supported, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver);
      if (typeof property === 'string') return async () => { throw new ProductionCapabilityError(property); };
      return undefined;
    },
  }) as unknown as FormangleRepository;
}
