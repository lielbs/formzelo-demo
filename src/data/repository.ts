/**
 * Storage-agnostic repository contract. The UI talks only to this interface.
 * Today it is backed by localStorage (LocalStorageRepository); in production
 * each method maps to a server endpoint / Supabase RPC with real auth, so every
 * method is async even though localStorage is synchronous.
 */
import type {
  Membership,
  NotificationPreview,
  OrgData,
  Organization,
  RunEvent,
  RunStatus,
  UsageEvent,
  Workflow,
  WorkflowConfig,
  WorkflowRun,
  WorkflowVersion,
} from '../domain/schema';
import type { Asset, BrandKit, WorkflowTheme } from '../domain/theme';
import type { SlotAvailability } from '../engine/booking';
import type { OptionUsage } from '../engine/capacity';
import type { Values } from '../engine/conditions';
import type { FieldErrors } from '../engine/validation';

export interface PublicWorkflow {
  organization: Organization;
  workflow: Workflow;
  version: WorkflowVersion;
}

export interface StorageReport {
  bytes: number;
  keys: number;
  /** Rough browser quota; most browsers allow ~5 MB per origin. */
  approxQuotaBytes: number;
  warnings: string[];
}

export interface FormangleRepository {
  init(): Promise<void>;
  subscribe(listener: () => void): () => void;

  listOrganizations(): Promise<Organization[]>;
  getActiveOrgId(): Promise<string | null>;
  setActiveOrgId(orgId: string): Promise<void>;
  updateOrganization(orgId: string, patch: Partial<Pick<Organization, 'name' | 'tagline' | 'brand' | 'contactEmail'>>): Promise<Organization>;

  listWorkflows(orgId: string): Promise<Workflow[]>;
  getWorkflow(orgId: string, workflowId: string): Promise<Workflow | null>;
  /** Without `design`, the local theme resolver picks one from the template and text. */
  createWorkflow(orgId: string, input: { config: WorkflowConfig; templateKey: string; sourcePrompt?: string; design?: WorkflowTheme }): Promise<Workflow>;
  /** Saves the business config and (optionally) the draft design. Published versions are never touched. */
  saveDraft(orgId: string, workflowId: string, config: WorkflowConfig, design?: WorkflowTheme): Promise<Workflow>;
  publishWorkflow(orgId: string, workflowId: string): Promise<WorkflowVersion>;
  duplicateWorkflow(orgId: string, workflowId: string): Promise<Workflow>;
  setArchived(orgId: string, workflowId: string, archived: boolean): Promise<Workflow>;
  listVersions(orgId: string, workflowId: string): Promise<WorkflowVersion[]>;
  restoreVersionToDraft(orgId: string, workflowId: string, versionId: string): Promise<Workflow>;

  resolvePublic(slug: string): Promise<PublicWorkflow | null>;
  getPublicRun(slug: string, runId: string): Promise<{ run: WorkflowRun; version: WorkflowVersion } | null>;
  /** `payNow`: the customer pressed the clearly-labelled SIMULATED payment button. No money moves. */
  submitRun(slug: string, input: { values: Values; consent: boolean; runId?: string; payNow?: boolean }): Promise<WorkflowRun>;
  /** Local, best-effort slot usage for a booking workflow — not a cross-device guarantee. */
  getBookingAvailability(slug: string, date: string): Promise<SlotAvailability[]>;
  /** Local, best-effort places taken per limited option (e.g. a track with 30 places). */
  getOptionUsage(slug: string): Promise<OptionUsage>;
  /** The customer withdraws their own booking request through their personal link. */
  cancelRunByCustomer(slug: string, runId: string): Promise<WorkflowRun>;

  listRuns(orgId: string): Promise<WorkflowRun[]>;
  getRun(orgId: string, runId: string): Promise<WorkflowRun | null>;
  getVersion(orgId: string, versionId: string): Promise<WorkflowVersion | null>;
  createCase(orgId: string, workflowId: string, caseValues: Values, publicBaseUrl: string): Promise<WorkflowRun>;
  transitionRun(orgId: string, runId: string, to: RunStatus, message?: string): Promise<WorkflowRun>;
  addNote(orgId: string, runId: string, text: string): Promise<RunEvent>;
  /** Marks an outstanding deposit / payment as paid — SIMULATION ONLY. */
  markPaymentPaid(orgId: string, runId: string): Promise<WorkflowRun>;
  markDepositPaid(orgId: string, runId: string): Promise<WorkflowRun>;

  getBrandKit(orgId: string): Promise<BrandKit>;
  /** Updates the workspace brand kit. Published versions are never affected. */
  updateBrandKit(orgId: string, kit: BrandKit): Promise<BrandKit>;

  /** Local, downscaled images for logos / covers. Production: object storage + CDN. */
  listAssets(orgId: string): Promise<Asset[]>;
  getAssetUrls(orgId: string, ids: (string | undefined)[]): Promise<Record<string, string>>;
  saveAsset(orgId: string, input: Pick<Asset, 'kind' | 'name' | 'mime' | 'dataUrl' | 'width' | 'height'>): Promise<Asset>;
  deleteAsset(orgId: string, assetId: string): Promise<void>;

  listEvents(orgId: string, runId?: string): Promise<RunEvent[]>;
  listNotifications(orgId: string, runId?: string): Promise<NotificationPreview[]>;
  listUsage(orgId: string): Promise<UsageEvent[]>;
  trackUsage(orgId: string, type: UsageEvent['type'], workflowId?: string): Promise<void>;

  listMemberships(orgId: string): Promise<Membership[]>;
  /** Full JSON export of one workspace (for backup / migration to a server). */
  exportWorkspace(orgId: string): Promise<OrgData>;
  resetDemoData(): Promise<void>;
  storageReport(): Promise<StorageReport>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationFailedError extends Error {
  constructor(public readonly errors: FieldErrors) {
    super('Validation failed');
    this.name = 'ValidationFailedError';
  }
}

export class StorageQuotaError extends Error {
  constructor() {
    super('האחסון המקומי בדפדפן מלא. מחקו נתוני דמו או אפסו את הדמו.');
    this.name = 'StorageQuotaError';
  }
}

export class DomainRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainRuleError';
  }
}
