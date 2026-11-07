import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  IntakeSchema,
  type CustomerAction,
  type QuoteRecord,
  SCHEMA_VERSION,
  WorkflowConfigSchema,
  type Membership,
  type Organization,
  type RunEvent,
  type RunStatus,
  type Workflow,
  type WorkflowRun,
  type WorkflowVersion,
} from '../domain/schema';
import { BrandKitSchema, PresenceLinkSchema, WorkflowThemeSchema, type BrandKit } from '../domain/theme';
import type { FormangleRepository } from '../data/repository';
import { DomainRuleError, NotFoundError, ValidationFailedError } from '../data/repository';
import { trackPath, type QuoteDecisionInput, type TrackView } from '../data/track';
import { ActionInputSchema, type ActionInput } from '../engine/actions';
import { QuoteContentSchema, quoteTotals, type QuoteContent } from '../engine/quote';
import { freezeTheme } from '../theme/brand';
import type { Database, Json } from './database.generated';
import { formatDay, type ClosedReason, type IntakeState } from '../engine/intake';
import { STATUS_LABELS } from '../engine/transitions';
import type { SlotAvailability } from '../engine/booking';
import type { OptionUsage } from '../engine/capacity';
import { throwPortalError, throwRuleError } from './ruleErrors';

export class ProductionCapabilityError extends Error {
  constructor(capability: string) {
    super(`Production capability is not available: ${capability}`);
    this.name = 'ProductionCapabilityError';
  }
}

/** Customer-facing sentence for a closed form; mirrors intakeState() in src/engine/intake.ts. */
function closedMessage(reason: ClosedReason, state: Record<string, unknown>): string {
  switch (reason) {
    case 'paused': return 'הטופס סגור כרגע לבקשות חדשות.';
    case 'not_yet': return typeof state.opensOn === 'string' ? `ההרשמה נפתחת ב-${formatDay(state.opensOn)}.` : 'הטופס עוד לא נפתח.';
    case 'ended': return 'ההרשמה הסתיימה.';
    case 'holiday': return typeof state.nextOpen === 'string' ? `אנחנו סגורים היום. אפשר לשלוח בקשה החל מ-${formatDay(state.nextOpen)}.` : 'אנחנו סגורים היום.';
    case 'total': return 'כל המקומות נתפסו.';
    case 'day': return 'התקבלו כל הבקשות להיום. אפשר לחזור מחר.';
    case 'week': return 'התקבלו כל הבקשות לשבוע הזה. אפשר לחזור ביום ראשון.';
  }
}

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type WorkflowRow = Database['public']['Tables']['workflows']['Row'];
type VersionRow = Database['public']['Tables']['workflow_versions']['Row'];

function jsonObject(value: Json): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid production record');
  return value as Record<string, unknown>;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function fail(error: PostgrestError | null, fallback: string): never {
  if (error?.code === '40001') throw new DomainRuleError('התהליך השתנה במכשיר או חלון אחר. רעננו לפני שמירה נוספת.');
  if (error?.code === '42501') throw new DomainRuleError('אין הרשאה לבצע את הפעולה בסביבת העבודה הזו.');
  if (error?.code === '22023') throw new DomainRuleError('השרת דחה מסמך תהליך שאינו תקין.');
  throw new Error(fallback);
}

type OrganizationProjection = OrganizationRow & {
  organization_settings?: { config: Json } | { config: Json }[] | null;
  brand_configurations?: { config: Json } | { config: Json }[] | null;
};

function relationConfig(value: OrganizationProjection['organization_settings']): Record<string, unknown> {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation ? jsonObject(relation.config) : {};
}

function mapOrganization(row: OrganizationProjection): Organization {
  const settings = relationConfig(row.organization_settings);
  const brand = relationConfig(row.brand_configurations);
  const palette = brand.palette && typeof brand.palette === 'object' && !Array.isArray(brand.palette) ? brand.palette as Record<string, unknown> : {};
  const primaryColor = typeof settings.primaryColor === 'string' ? settings.primaryColor : typeof palette.primary === 'string' ? palette.primary : '#EA580C';
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    industry: typeof settings.industry === 'string' ? settings.industry : '',
    tagline: typeof settings.tagline === 'string' ? settings.tagline : '',
    brand: { primaryColor, logoText: row.name.slice(0, 40) },
    contactEmail: typeof settings.contactEmail === 'string' ? settings.contactEmail : '',
    isDemo: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    orgId: row.organization_id,
    slug: row.public_slug,
    status: row.status as Workflow['status'],
    templateKey: row.template_key,
    draft: WorkflowConfigSchema.parse(jsonObject(row.draft_config)),
    design: WorkflowThemeSchema.parse(jsonObject(row.draft_design)),
    publishedVersionId: row.published_version_id ?? undefined,
    hasUnpublishedChanges: row.status !== 'published' || row.published_lock_version !== row.lock_version,
    intake: IntakeSchema.parse(jsonObject(row.intake)),
    sourcePrompt: row.source_prompt ?? undefined,
    isDemo: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: VersionRow): WorkflowVersion {
  return {
    id: row.id,
    orgId: row.organization_id,
    workflowId: row.workflow_id,
    version: row.version_number,
    config: WorkflowConfigSchema.parse(jsonObject(row.config)),
    design: WorkflowThemeSchema.parse(jsonObject(row.design)),
    publishedAt: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

function mapRun(row: Database['public']['Tables']['submissions']['Row'] & { workflow_versions?: { version_number: number } | null }): WorkflowRun {
  const payload = jsonObject(row.answers);
  return {
    id: row.id,
    orgId: row.organization_id,
    workflowId: row.workflow_id,
    versionId: row.workflow_version_id,
    versionNumber: row.workflow_versions?.version_number ?? 1,
    reference: row.id.slice(0, 8).toUpperCase(),
    status: ({ received: 'submitted' }[row.status] ?? row.status) as RunStatus,
    answers: Array.isArray(payload.answers) ? payload.answers as WorkflowRun['answers'] : [],
    caseAnswers: [],
    priceLines: Array.isArray(payload.priceLines) ? payload.priceLines as WorkflowRun['priceLines'] : [],
    total: row.total_minor / 100,
    payment: { status: 'none', amount: 0, kind: 'none' },
    customerName: typeof payload.customerName === 'string' ? payload.customerName : '',
    customerContact: typeof payload.customerContact === 'string' ? payload.customerContact : '',
    submittedAt: row.created_at,
    isDemo: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type QuoteRow = Database['public']['Tables']['quotes']['Row'];
type ActionRow = Database['public']['Tables']['customer_actions']['Row'] & {
  submissions: { workflow_id: string; workflow_version_id: string; workflow_versions: { version_number: number } | null } | null;
};

const runStatus = (status: string) => ({ received: 'submitted' }[status] ?? status) as RunStatus;

function mapQuote(row: QuoteRow): QuoteRecord {
  const decision = row.decision && typeof row.decision === 'object' && !Array.isArray(row.decision) ? (row.decision as Record<string, unknown>) : null;
  const decisionTotals = decision?.totals && typeof decision.totals === 'object' ? (decision.totals as Record<string, unknown>) : {};
  return {
    id: row.id, orgId: row.organization_id, runId: row.submission_id, revision: row.revision, status: row.status as QuoteRecord['status'],
    content: jsonObject(row.content), total: row.total_minor / 100, sentAt: row.sent_at ?? undefined, viewedAt: row.viewed_at ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    decision: decision ? {
      decision: decision.decision as 'approved' | 'declined' | 'changes_requested',
      selections: (decision.selections ?? {}) as Record<string, number>,
      comment: typeof decision.comment === 'string' ? decision.comment : undefined,
      total: Number(decisionTotals.total ?? 0),
    } : undefined,
    lockVersion: row.lock_version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapAction(row: ActionRow): CustomerAction {
  return {
    id: row.id, orgId: row.organization_id, runId: row.submission_id,
    workflowId: row.submissions?.workflow_id ?? row.submission_id, versionId: row.submissions?.workflow_version_id ?? row.submission_id,
    versionNumber: row.submissions?.workflow_versions?.version_number ?? 1,
    kind: row.kind as CustomerAction['kind'], title: row.title, description: row.description,
    amount: row.amount_minor === null ? undefined : row.amount_minor / 100, note: row.note ?? undefined,
    options: (Array.isArray(row.options) ? row.options : []) as CustomerAction['options'],
    expiresAt: row.expires_at ?? undefined, status: row.status as CustomerAction['status'],
    response: row.response ? (row.response as unknown as CustomerAction['response']) : undefined,
    cancelledAt: row.cancelled_at ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapTrack(access: string, root: Record<string, unknown>): TrackView {
  const business = jsonObject(root.business as Json);
  const brand = business.brand && typeof business.brand === 'object' ? (business.brand as Record<string, unknown>) : {};
  const workflow = jsonObject(root.workflow as Json);
  const request = jsonObject(root.request as Json);
  const booking = workflow.booking && typeof workflow.booking === 'object' ? (workflow.booking as Record<string, unknown>) : null;
  const links = PresenceLinkSchema.array().safeParse(brand.links);
  return {
    access,
    business: { name: String(brand.displayName || business.name), description: typeof brand.description === 'string' && brand.description ? brand.description : undefined, links: links.success ? links.data : [] },
    workflow: { slug: String(workflow.slug), title: String(workflow.title), design: WorkflowThemeSchema.parse(workflow.design), booking: booking?.enabled === true },
    request: {
      id: String(request.id), reference: String(request.reference), status: runStatus(String(request.status)), createdAt: String(request.createdAt),
      answers: Array.isArray(request.answers) ? request.answers as TrackView['request']['answers'] : [],
      priceLines: Array.isArray(request.priceLines) ? (request.priceLines as { label: string; amount: number }[]).map((l) => ({ label: l.label, amount: Number(l.amount) })) : [],
      total: Number(request.total) || 0, cancellable: request.cancellable === true,
    },
    timeline: (Array.isArray(root.timeline) ? root.timeline : []).map((e) => {
      const ev = e as Record<string, unknown>;
      return { type: String(ev.type), message: typeof ev.message === 'string' ? ev.message : undefined, at: String(ev.at) };
    }),
    actions: (Array.isArray(root.actions) ? root.actions : []).map((a) => {
      const x = a as Record<string, unknown>;
      return {
        id: String(x.id), kind: x.kind as TrackView['actions'][number]['kind'], title: String(x.title), description: String(x.description ?? ''),
        amount: x.amount === null || x.amount === undefined ? undefined : Number(x.amount), note: typeof x.note === 'string' ? x.note : undefined,
        options: (Array.isArray(x.options) ? x.options : []) as TrackView['actions'][number]['options'], status: x.status as TrackView['actions'][number]['status'],
        response: x.response ? (x.response as TrackView['actions'][number]['response']) : undefined,
        expiresAt: typeof x.expiresAt === 'string' ? x.expiresAt : undefined, createdAt: String(x.createdAt),
      };
    }),
    quotes: (Array.isArray(root.quotes) ? root.quotes : []).map((q) => {
      const x = q as Record<string, unknown>;
      const content = QuoteContentSchema.parse(x.content);
      const decision = x.decision && typeof x.decision === 'object' ? (x.decision as Record<string, unknown>) : null;
      const decisionTotals = decision?.totals && typeof decision.totals === 'object' ? (decision.totals as Record<string, unknown>) : {};
      return {
        id: String(x.id), revision: Number(x.revision), status: x.status as TrackView['quotes'][number]['status'], content,
        totals: quoteTotals(content), sentAt: typeof x.sentAt === 'string' ? x.sentAt : undefined,
        validUntil: typeof x.validUntil === 'string' ? x.validUntil : undefined, decidedAt: typeof x.decidedAt === 'string' ? x.decidedAt : undefined,
        decision: decision ? {
          decision: decision.decision as 'approved' | 'declined' | 'changes_requested', selections: (decision.selections ?? {}) as Record<string, number>,
          comment: typeof decision.comment === 'string' ? decision.comment : undefined, total: Number(decisionTotals.total ?? 0),
        } : undefined,
      };
    }),
  };
}

/** RLS-backed production adapter. It never falls back to local or demo persistence. */
export function createProductionRepository(client: SupabaseClient<Database>): FormangleRepository {
  const listeners = new Set<() => void>();
  const locks = new Map<string, number>();
  const submissionLocks = new Map<string, number>();
  const publicClientToken = crypto.randomUUID();
  const pendingSubmissions = new Map<string, { payload: string; key: string }>();
  const quoteLocks = new Map<string, number>();
  /** Request-page references for requests submitted in this browser session. */
  const accessByRun = new Map<string, string>();
  let organizations: Organization[] = [];
  let activeOrgId: string | null = null;
  const allowed = () => new Set(organizations.map((item) => item.id));
  const assertOrg = (orgId: string) => {
    if (!allowed().has(orgId)) throw new Error('Organization is not available to this session');
  };
  const emit = () => listeners.forEach((listener) => listener());
  const remember = (row: WorkflowRow) => {
    locks.set(row.id, row.lock_version);
    return mapWorkflow(row);
  };
  const expectedLock = async (orgId: string, workflowId: string) => {
    const known = locks.get(workflowId);
    if (known !== undefined) return known;
    const { data, error } = await client.from('workflows').select('lock_version').eq('organization_id', orgId).eq('id', workflowId).maybeSingle();
    if (error) fail(error, 'Unable to load workflow revision');
    if (!data) throw new NotFoundError('Workflow');
    locks.set(workflowId, data.lock_version);
    return data.lock_version;
  };

  const supported = {
    async init() {
      const { data, error } = await client.from('organizations').select('id,slug,name,status,created_at,updated_at,organization_settings(config),brand_configurations(config)').in('status', ['active', 'onboarding']);
      if (error) fail(error, 'Unable to load authorized organizations');
      organizations = (data ?? []).map(mapOrganization);
      if (!activeOrgId || !organizations.some((item) => item.id === activeOrgId)) activeOrgId = organizations[0]?.id ?? null;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async listOrganizations() { return [...organizations]; },
    async getActiveOrgId() { return activeOrgId; },
    async setActiveOrgId(orgId: string) { assertOrg(orgId); activeOrgId = orgId; emit(); },
    async updateOrganization(orgId: string, patch: Parameters<FormangleRepository['updateOrganization']>[1]) {
      assertOrg(orgId);
      const current = organizations.find((item) => item.id === orgId);
      if (!current) throw new NotFoundError('Organization');
      const next = {
        ...current,
        ...patch,
        brand: patch.brand ?? current.brand,
      };
      const { data, error } = await client.rpc('update_organization_profile', {
        p_organization_id: orgId,
        p_name: next.name,
        p_tagline: next.tagline,
        p_contact_email: next.contactEmail,
        p_primary_color: next.brand.primaryColor,
      });
      if (error || !data?.[0]) fail(error, 'Unable to update organization profile');
      const stored: Organization = { ...next, name: data[0].name, updatedAt: data[0].updated_at };
      organizations = organizations.map((item) => item.id === orgId ? stored : item);
      emit();
      return stored;
    },
    async listWorkflows(orgId: string) {
      assertOrg(orgId);
      const { data, error } = await client.from('workflows').select('*').eq('organization_id', orgId).order('updated_at', { ascending: false });
      if (error) fail(error, 'Unable to load workflows');
      return (data ?? []).map(remember);
    },
    async getWorkflow(orgId: string, workflowId: string) {
      assertOrg(orgId);
      const { data, error } = await client.from('workflows').select('*').eq('organization_id', orgId).eq('id', workflowId).maybeSingle();
      if (error) fail(error, 'Unable to load workflow');
      return data ? remember(data) : null;
    },
    async createWorkflow(orgId: string, input: Parameters<FormangleRepository['createWorkflow']>[1]) {
      assertOrg(orgId);
      const config = WorkflowConfigSchema.parse(input.config);
      const design = WorkflowThemeSchema.parse(input.design);
      const { data, error } = await client.rpc('create_workflow', {
        organization_id: orgId,
        config: toJson(config),
        design: toJson(design),
        template_key: input.templateKey,
        source_prompt: input.sourcePrompt,
        schema_version: SCHEMA_VERSION,
      });
      if (error || !data?.[0]) fail(error, 'Unable to create workflow');
      emit();
      return remember(data[0]);
    },
    async saveDraft(orgId: string, workflowId: string, config: Parameters<FormangleRepository['saveDraft']>[2], design?: Parameters<FormangleRepository['saveDraft']>[3]) {
      assertOrg(orgId);
      const current = design ? null : await supported.getWorkflow(orgId, workflowId);
      const { data, error } = await client.rpc('save_workflow_draft', {
        organization_id: orgId,
        workflow_id: workflowId,
        expected_lock_version: await expectedLock(orgId, workflowId),
        config: toJson(WorkflowConfigSchema.parse(config)),
        design: toJson(WorkflowThemeSchema.parse(design ?? current?.design)),
        schema_version: SCHEMA_VERSION,
      });
      if (error || !data?.[0]) fail(error, 'Unable to save workflow');
      emit();
      return remember(data[0]);
    },
    async publishWorkflow(orgId: string, workflowId: string) {
      assertOrg(orgId);
      const workflow = await supported.getWorkflow(orgId, workflowId);
      if (!workflow) throw new NotFoundError('Workflow');
      const { data, error } = await client.rpc('publish_workflow', {
        organization_id: orgId,
        workflow_id: workflowId,
        expected_lock_version: await expectedLock(orgId, workflowId),
        published_design: toJson(freezeTheme(workflow.design, await supported.getBrandKit(orgId))),
        engine_version: 'formangle-v1',
      });
      if (error || !data?.[0]) fail(error, 'Unable to publish workflow');
      locks.set(workflowId, (locks.get(workflowId) ?? 0) + 1);
      emit();
      return mapVersion(data[0]);
    },
    async duplicateWorkflow(orgId: string, workflowId: string) {
      assertOrg(orgId);
      const { data, error } = await client.rpc('duplicate_workflow', { organization_id: orgId, workflow_id: workflowId });
      if (error || !data?.[0]) fail(error, 'Unable to duplicate workflow');
      emit();
      return remember(data[0]);
    },
    async setArchived(orgId: string, workflowId: string, archived: boolean) {
      assertOrg(orgId);
      const { data, error } = await client.rpc('set_workflow_archived', {
        organization_id: orgId,
        workflow_id: workflowId,
        expected_lock_version: await expectedLock(orgId, workflowId),
        archived,
      });
      if (error || !data?.[0]) fail(error, 'Unable to update workflow state');
      emit();
      return remember(data[0]);
    },
    async updateIntake(orgId: string, workflowId: string, intake: Parameters<FormangleRepository['updateIntake']>[2]) {
      assertOrg(orgId);
      const { data, error } = await client.rpc('update_workflow_intake', {
        organization_id: orgId,
        workflow_id: workflowId,
        expected_lock_version: await expectedLock(orgId, workflowId),
        intake: toJson(IntakeSchema.parse(intake)),
      });
      if (error || !data?.[0]) fail(error, 'Unable to update intake settings');
      emit();
      return remember(data[0]);
    },
    async listVersions(orgId: string, workflowId: string) {
      assertOrg(orgId);
      const { data, error } = await client.from('workflow_versions').select('*').eq('organization_id', orgId).eq('workflow_id', workflowId).order('version_number', { ascending: false });
      if (error) fail(error, 'Unable to load workflow versions');
      return (data ?? []).map(mapVersion);
    },
    async getVersion(orgId: string, versionId: string) {
      assertOrg(orgId);
      const { data, error } = await client.from('workflow_versions').select('*').eq('organization_id', orgId).eq('id', versionId).maybeSingle();
      if (error) fail(error, 'Unable to load workflow version');
      return data ? mapVersion(data) : null;
    },
    async restoreVersionToDraft(orgId: string, workflowId: string, versionId: string) {
      assertOrg(orgId);
      const { data, error } = await client.rpc('restore_workflow_version', {
        organization_id: orgId,
        workflow_id: workflowId,
        version_id: versionId,
        expected_lock_version: await expectedLock(orgId, workflowId),
      });
      if (error || !data?.[0]) fail(error, 'Unable to restore workflow version');
      emit();
      return remember(data[0]);
    },
    async listRuns(orgId: string) {
      assertOrg(orgId);
      const { data, error } = await client.from('submissions').select('*, workflow_versions(version_number)').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (error) fail(error, 'Unable to load submissions');
      return (data ?? []).map((row) => { submissionLocks.set(row.id, row.lock_version); return mapRun(row); });
    },
    async getRun(orgId: string, runId: string) {
      assertOrg(orgId);
      const { data, error } = await client.from('submissions').select('*, workflow_versions(version_number)').eq('organization_id', orgId).eq('id', runId).maybeSingle();
      if (error) fail(error, 'Unable to load submission');
      if (!data) return null;
      submissionLocks.set(data.id, data.lock_version);
      return mapRun(data);
    },
    async resolvePublic(slug: string) {
      const { data, error } = await client.rpc('resolve_public_workflow', { p_slug: slug });
      if (error) fail(error, 'Unable to resolve public workflow');
      if (!data) return null;
      const root = jsonObject(data);
      const organizationData = jsonObject(root.organization as Json);
      const workflowData = jsonObject(root.workflow as Json);
      const versionData = jsonObject(root.version as Json);
      const organization: Organization = {
        id: String(organizationData.id), slug: String(organizationData.slug), name: String(organizationData.name),
        industry: 'עסק', tagline: '', brand: { primaryColor: '#EA580C', logoText: String(organizationData.name).slice(0, 40) },
        contactEmail: '', isDemo: false, createdAt: String(organizationData.createdAt), updatedAt: String(organizationData.updatedAt),
      };
      const workflow: Workflow = {
        id: String(workflowData.id), orgId: String(workflowData.orgId), slug: String(workflowData.slug), status: 'published',
        templateKey: String(workflowData.templateKey), draft: WorkflowConfigSchema.parse(workflowData.draft),
        design: WorkflowThemeSchema.parse(workflowData.design), publishedVersionId: String(workflowData.publishedVersionId),
        hasUnpublishedChanges: false, intake: IntakeSchema.parse(workflowData.intake), isDemo: false,
        createdAt: String(workflowData.createdAt), updatedAt: String(workflowData.updatedAt),
      };
      const version: WorkflowVersion = {
        id: String(versionData.id), orgId: String(versionData.orgId), workflowId: String(versionData.workflowId),
        version: Number(versionData.version), config: WorkflowConfigSchema.parse(versionData.config), design: WorkflowThemeSchema.parse(versionData.design),
        publishedAt: String(versionData.publishedAt), createdAt: String(versionData.createdAt), updatedAt: String(versionData.updatedAt),
      };
      return { organization, workflow, version };
    },
    async submitRun(slug: string, input: Parameters<FormangleRepository['submitRun']>[1]) {
      if (input.runId) throw new ProductionCapabilityError('public request resubmission token');
      // A retry of the same answers (lost connection, double tap) reuses its key, so the server
      // returns the stored request instead of creating a second one.
      const payload = JSON.stringify([slug, input.values, input.consent]);
      const pending = pendingSubmissions.get(slug);
      const idempotencyKey = pending?.payload === payload ? pending.key : crypto.randomUUID();
      pendingSubmissions.set(slug, { payload, key: idempotencyKey });
      const { data, error } = await client.rpc('submit_public_workflow', {
        p_slug: slug,
        p_answers: toJson(input.values),
        p_consent: input.consent,
        p_idempotency_key: idempotencyKey,
        p_client_token: publicClientToken,
      });
      if (error) {
        // Without a database code the request may not have arrived: keep the key for the retry.
        if (!error.code) throw new Error('Unable to submit workflow');
        pendingSubmissions.delete(slug);
        const resolved = error.message.startsWith('intake_') ? await supported.resolvePublic(slug).catch(() => null) : null;
        throwRuleError(error, resolved?.workflow.intake?.closedMessage);
        fail(error, 'Unable to submit workflow');
      }
      pendingSubmissions.delete(slug);
      const result = jsonObject(data);
      const token = await client.rpc('public_request_tracking_token', { p_slug: slug, p_idempotency_key: idempotencyKey, p_client_token: publicClientToken });
      if (!token.error && typeof token.data === 'string') accessByRun.set(String(result.id), token.data);
      const stored = jsonObject(result.answers as Json);
      return {
        id: String(result.id), orgId: String(result.organizationId), workflowId: String(result.workflowId), versionId: String(result.versionId),
        versionNumber: Number(result.versionNumber), reference: String(result.id).slice(0, 8).toUpperCase(), status: 'submitted',
        answers: Array.isArray(stored.answers) ? stored.answers as WorkflowRun['answers'] : [], caseAnswers: [],
        priceLines: Array.isArray(stored.priceLines) ? stored.priceLines as WorkflowRun['priceLines'] : [], total: Number(result.totalMinor) / 100,
        payment: { status: 'none', amount: 0, kind: 'none' }, customerName: typeof stored.customerName === 'string' ? stored.customerName : '',
        customerContact: typeof stored.customerContact === 'string' ? stored.customerContact : '', consentAt: typeof stored.consentAt === 'string' ? stored.consentAt : undefined,
        submittedAt: String(result.createdAt), isDemo: false, createdAt: String(result.createdAt), updatedAt: String(result.updatedAt),
      };
    },
    async getPublicRun() { return null; },
    async getIntakeState(slug: string): Promise<IntakeState> {
      const { data, error } = await client.rpc('public_intake_state', { p_slug: slug });
      if (error) fail(error, 'Unable to load intake state');
      if (!data) return { open: false, reason: 'paused', message: 'הטופס אינו זמין.', counts: { total: 0, today: 0, week: 0 } };
      const state = jsonObject(data);
      const counts = jsonObject(state.counts as Json);
      const reason = typeof state.reason === 'string' ? state.reason as ClosedReason : undefined;
      const resolved = reason ? await supported.resolvePublic(slug).catch(() => null) : null;
      return {
        open: state.open === true,
        reason,
        message: reason ? resolved?.workflow.intake?.closedMessage || closedMessage(reason, state) : undefined,
        counts: { total: Number(counts.total) || 0, today: Number(counts.today) || 0, week: Number(counts.week) || 0 },
      };
    },
    async getBookingAvailability(slug: string, date: string): Promise<SlotAvailability[]> {
      const { data, error } = await client.rpc('public_booking_availability', { p_slug: slug, p_date: date });
      if (error) fail(error, 'Unable to load availability');
      return Array.isArray(data) ? (data as unknown as SlotAvailability[]) : [];
    },
    async getOptionUsage(slug: string): Promise<OptionUsage> {
      const { data, error } = await client.rpc('public_option_usage', { p_slug: slug });
      if (error) fail(error, 'Unable to load option usage');
      return data && typeof data === 'object' && !Array.isArray(data) ? (data as unknown as OptionUsage) : {};
    },
    async getAssetUrls() { return {}; },
    async listAssets() { return []; },
    async transitionRun(orgId: string, runId: string, to: RunStatus, message?: string) {
      assertOrg(orgId);
      const expected = submissionLocks.get(runId);
      if (expected === undefined) await supported.getRun(orgId, runId);
      const databaseStatus = to === 'submitted' ? 'received' : to;
      const { data, error } = await client.rpc('transition_submission_status', {
        p_organization_id: orgId, p_submission_id: runId,
        p_expected_lock_version: submissionLocks.get(runId) ?? 0, p_to_status: databaseStatus,
        p_message: message?.trim() || undefined,
      });
      if (error || !data?.[0]) fail(error, 'Unable to update submission status');
      submissionLocks.set(runId, data[0].lock_version);
      emit();
      return mapRun(data[0]);
    },
    async listEvents(orgId: string, runId?: string): Promise<RunEvent[]> {
      assertOrg(orgId);
      let query = client.from('submission_events').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (runId) query = query.eq('submission_id', runId);
      let notesQuery = client.from('submission_notes').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (runId) notesQuery = notesQuery.eq('submission_id', runId);
      const [{ data, error }, notes] = await Promise.all([query, notesQuery]);
      if (error) fail(error, 'Unable to load submission events');
      if (notes.error) fail(notes.error, 'Unable to load notes');
      const events: RunEvent[] = (data ?? []).map((row) => {
        const status = row.event_type.startsWith('status:') ? row.event_type.slice(7) as RunStatus : undefined;
        const base = { id: row.id, orgId: row.organization_id, runId: row.submission_id, actor: (row.actor_user_id ? 'owner' : 'customer') as RunEvent['actor'], internal: row.visibility !== 'customer' && row.event_type !== 'submitted', createdAt: row.created_at, updatedAt: row.created_at };
        const said = row.message ? ` — ${row.message}` : '';
        if (status) return { ...base, type: 'status_changed', to: runStatus(status), message: `הסטטוס עודכן ל"${STATUS_LABELS[runStatus(status)]}"${said}` };
        if (row.event_type === 'submitted') return { ...base, type: 'submitted', message: 'הבקשה נשלחה' };
        if (row.event_type.startsWith('action:')) return { ...base, type: 'action_created', message: `נשלחה בקשה ללקוח${said}` };
        if (row.event_type === 'action_responded') return { ...base, type: 'action_responded', message: `הלקוח/ה ענה/תה${said}` };
        if (row.event_type === 'action_cancelled') return { ...base, type: 'action_cancelled', message: 'הבקשה ללקוח בוטלה' };
        if (row.event_type === 'quote_sent') return { ...base, type: 'quote_sent', message: `נשלחה הצעת מחיר${said}` };
        if (row.event_type === 'quote_withdrawn') return { ...base, type: 'quote_withdrawn', message: 'הצעת המחיר בוטלה' };
        if (row.event_type.startsWith('quote_')) {
          const verb = { quote_approved: 'אישר/ה את', quote_declined: 'דחה/תה את', quote_changes_requested: 'ביקש/ה שינויים ב' }[row.event_type] ?? 'ענה/תה על';
          return { ...base, type: 'quote_decided', message: `הלקוח/ה ${verb}הצעת המחיר${said}` };
        }
        if (row.event_type === 'tracking_link_issued') return { ...base, type: 'link_shared', message: 'נוצר קישור חדש לעמוד הבקשה' };
        if (row.event_type === 'tracking_links_revoked') return { ...base, type: 'link_shared', message: 'כל הקישורים הקודמים לעמוד הבקשה בוטלו' };
        return { ...base, type: 'status_changed', message: row.event_type };
      });
      const noteEvents: RunEvent[] = (notes.data ?? []).map((n) => ({ id: n.id, orgId: n.organization_id, runId: n.submission_id, type: 'note_added', actor: 'owner', message: n.body, internal: true, createdAt: n.created_at, updatedAt: n.created_at }));
      return [...events, ...noteEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getBrandKit(orgId: string): Promise<BrandKit> {
      assertOrg(orgId);
      const { data, error } = await client.from('brand_configurations').select('config').eq('organization_id', orgId).single();
      if (error) fail(error, 'Unable to load brand settings');
      return BrandKitSchema.parse(jsonObject(data.config));
    },
    async updateBrandKit(orgId: string, kit: BrandKit) {
      assertOrg(orgId);
      const valid = BrandKitSchema.parse({ ...kit, updatedAt: new Date().toISOString() });
      const { data, error } = await client.from('brand_configurations').update({ config: toJson(valid) as NonNullable<Json> }).eq('organization_id', orgId).select('config').single();
      if (error) fail(error, 'Unable to update brand settings');
      emit();
      return BrandKitSchema.parse(jsonObject(data.config));
    },
    async listMemberships(orgId: string): Promise<Membership[]> {
      assertOrg(orgId);
      const { data, error } = await client.from('organization_memberships').select('organization_id,user_id,role,status,created_at,updated_at').eq('organization_id', orgId).eq('status', 'active');
      if (error) fail(error, 'Unable to load members');
      return (data ?? []).map((row) => ({
        id: `${row.organization_id}:${row.user_id}`,
        orgId: row.organization_id,
        userName: `משתמש ${row.user_id.slice(0, 8)}`,
        role: row.role as Membership['role'],
        simulated: true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    // ---------- notes, customer actions and quotes ----------
    async addNote(orgId: string, runId: string, text: string): Promise<RunEvent> {
      assertOrg(orgId);
      const body = text.trim();
      if (!body) throw new ValidationFailedError({ note: 'ההערה ריקה' });
      const { data, error } = await client.rpc('add_submission_note', { p_organization_id: orgId, p_submission_id: runId, p_body: body });
      if (error || !data?.[0]) { if (error) throwPortalError(error); fail(error, 'Unable to save note'); }
      emit();
      const row = data[0];
      return { id: row.id, orgId, runId, type: 'note_added', actor: 'owner', message: row.body, internal: true, createdAt: row.created_at, updatedAt: row.created_at };
    },
    async listActions(orgId: string, runId?: string): Promise<CustomerAction[]> {
      assertOrg(orgId);
      let query = client.from('customer_actions').select('*, submissions(workflow_id, workflow_version_id, workflow_versions(version_number))').eq('organization_id', orgId).order('created_at', { ascending: false });
      if (runId) query = query.eq('submission_id', runId);
      const { data, error } = await query;
      if (error) fail(error, 'Unable to load customer actions');
      return (data ?? []).map((row) => mapAction(row as unknown as ActionRow));
    },
    async createAction(orgId: string, runId: string, input: ActionInput): Promise<CustomerAction> {
      assertOrg(orgId);
      const parsed = ActionInputSchema.safeParse(input);
      if (!parsed.success) throw new ValidationFailedError({ action: parsed.error.issues[0]?.message ?? 'פרטי הפעולה אינם תקינים' });
      const v = parsed.data;
      const payload = { kind: v.kind, title: v.title, description: v.description, amount: v.amount ?? null, note: v.note ?? null,
        options: v.kind === 'update' ? null : v.options ?? null, expiresAt: v.expiresAt ? new Date(`${v.expiresAt}T23:59:59`).toISOString() : null };
      const { data, error } = await client.rpc('create_customer_action', { p_organization_id: orgId, p_submission_id: runId, p_input: toJson(payload) });
      if (error || !data?.[0]) { if (error) throwPortalError(error); fail(error, 'Unable to create action'); }
      emit();
      return (await supported.listActions(orgId, runId)).find((a) => a.id === data[0]!.id)!;
    },
    async cancelAction(orgId: string, actionId: string): Promise<CustomerAction> {
      assertOrg(orgId);
      const { data, error } = await client.rpc('cancel_customer_action', { p_organization_id: orgId, p_action_id: actionId });
      if (error || !data?.[0]) { if (error) throwPortalError(error); fail(error, 'Unable to cancel action'); }
      emit();
      return (await supported.listActions(orgId, data[0].submission_id)).find((a) => a.id === actionId)!;
    },
    async listQuotes(orgId: string, runId: string): Promise<QuoteRecord[]> {
      assertOrg(orgId);
      const { data, error } = await client.from('quotes').select('*').eq('organization_id', orgId).eq('submission_id', runId).order('revision', { ascending: false });
      if (error) fail(error, 'Unable to load quotes');
      return (data ?? []).map((row) => { quoteLocks.set(row.id, row.lock_version); return mapQuote(row); });
    },
    async saveQuoteDraft(orgId: string, runId: string, input: { quoteId?: string; content: QuoteContent }): Promise<QuoteRecord> {
      assertOrg(orgId);
      const parsed = QuoteContentSchema.safeParse(input.content);
      if (!parsed.success) throw new ValidationFailedError({ quote: parsed.error.issues[0]?.message ?? 'ההצעה אינה תקינה' });
      const { data, error } = await client.rpc('save_quote_draft', {
        p_organization_id: orgId, p_submission_id: runId, p_quote_id: input.quoteId ?? null as unknown as string,
        p_content: toJson(parsed.data), p_expected_lock_version: input.quoteId ? quoteLocks.get(input.quoteId) ?? 0 : null as unknown as number,
      });
      if (error || !data?.[0]) { if (error?.code === '40001') fail(error, ''); if (error) throwPortalError(error); fail(error, 'Unable to save quote'); }
      quoteLocks.set(data[0].id, data[0].lock_version);
      emit();
      return mapQuote(data[0]);
    },
    async sendQuote(orgId: string, quoteId: string): Promise<QuoteRecord> {
      assertOrg(orgId);
      const { data, error } = await client.rpc('send_quote', { p_organization_id: orgId, p_quote_id: quoteId, p_expected_lock_version: quoteLocks.get(quoteId) ?? 0 });
      if (error || !data?.[0]) { if (error?.code === '40001') fail(error, ''); if (error) throwPortalError(error); fail(error, 'Unable to send quote'); }
      quoteLocks.set(quoteId, data[0].lock_version);
      emit();
      return mapQuote(data[0]);
    },
    async withdrawQuote(orgId: string, quoteId: string): Promise<QuoteRecord> {
      assertOrg(orgId);
      const { data, error } = await client.rpc('withdraw_quote', { p_organization_id: orgId, p_quote_id: quoteId });
      if (error || !data?.[0]) { if (error) throwPortalError(error); fail(error, 'Unable to withdraw quote'); }
      emit();
      return mapQuote(data[0]);
    },

    // ---------- the customer's request page ----------
    async shareRequestLink(orgId: string, runId: string) {
      assertOrg(orgId);
      const { data, error } = await client.rpc('issue_tracking_link', { p_organization_id: orgId, p_submission_id: runId });
      if (error || typeof data !== 'string') { if (error) throwPortalError(error); fail(error, 'Unable to create link'); }
      emit();
      return trackPath(data);
    },
    async revokeRequestLinks(orgId: string, runId: string) {
      assertOrg(orgId);
      const { error } = await client.rpc('revoke_tracking_links', { p_organization_id: orgId, p_submission_id: runId });
      if (error) fail(error, 'Unable to revoke links');
      emit();
    },
    async customerAccess(_slug: string, runId: string) {
      return accessByRun.get(runId) ?? null;
    },
    async trackRequest(access: string): Promise<TrackView | null> {
      const { data, error } = await client.rpc('public_track_request', { p_token: access });
      if (error) fail(error, 'Unable to load request');
      return data ? mapTrack(access, jsonObject(data)) : null;
    },
    async respondTracked(access: string, actionId: string, optionId: string) {
      const { error } = await client.rpc('public_respond_action', { p_token: access, p_action_id: actionId, p_option_id: optionId });
      if (error) { throwPortalError(error); fail(error, 'Unable to save answer'); }
    },
    async decideQuote(access: string, quoteId: string, input: QuoteDecisionInput) {
      const { error } = await client.rpc('public_decide_quote', {
        p_token: access, p_quote_id: quoteId, p_decision: input.decision, p_selections: toJson(input.selections),
        p_comment: input.comment?.trim() || null as unknown as string, p_key: input.key,
      });
      if (error) { throwPortalError(error); fail(error, 'Unable to save decision'); }
    },
    async cancelTracked(access: string) {
      const { error } = await client.rpc('public_cancel_request', { p_token: access });
      if (error) { throwPortalError(error); fail(error, 'Unable to cancel request'); }
    },
    async storageReport() { return { bytes: 0, keys: 0, approxQuotaBytes: 1, warnings: ['נתוני הייצור נשמרים ב-Supabase ומסתנכרנים בין מכשירים מורשים.'] }; },
    async listNotifications() { return []; },
    async listUsage() { return []; },
    async trackUsage() {},
  };

  return new Proxy(supported, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver);
      // Not a thenable: the repository is returned from async functions and awaited.
      if (property === 'then') return undefined;
      if (typeof property === 'string') return async () => { throw new ProductionCapabilityError(property); };
      return undefined;
    },
  }) as unknown as FormangleRepository;
}
