/**
 * Storage-agnostic repository contract. The UI talks only to this interface.
 * Today it is backed by localStorage (LocalStorageRepository); in production
 * each method maps to a server endpoint / Supabase RPC with real auth, so every
 * method is async even though localStorage is synchronous.
 */
import type {
  CustomerAction,
  QuoteRecord,
  Intake,
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
import type { ActionInput } from '../engine/actions';
import type { SlotAvailability } from '../engine/booking';
import type { OptionUsage } from '../engine/capacity';
import type { IntakeState } from '../engine/intake';
import type { Values } from '../engine/conditions';
import type { FieldErrors } from '../engine/validation';
import type { QuoteContent } from '../engine/quote';
import type { QuoteDecisionInput, TrackView } from './track';

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
  /** Owner: removes the process and its requests from the workspace; its public link stops at once. */
  deleteWorkflow(orgId: string, workflowId: string): Promise<void>;
  /** When and how much the public link accepts. Applies at once — no publish needed. */
  updateIntake(orgId: string, workflowId: string, intake: Intake): Promise<Workflow>;
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
  /** Is the public link taking new requests now (local counts)? */
  getIntakeState(slug: string): Promise<IntakeState>;
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

  // ---------- Formangle Actions ----------
  /** Owner: all actions of the workspace, or of one request. Newest first. */
  listActions(orgId: string, runId?: string): Promise<CustomerAction[]>;
  /** Owner: creates an immutable action on a request. Identical open actions are refused (double submit). */
  createAction(orgId: string, runId: string, input: ActionInput): Promise<CustomerAction>;
  /** Owner: withdraws an action the customer has not answered. Answered ones never change. */
  cancelAction(orgId: string, actionId: string): Promise<CustomerAction>;
  /** Customer (personal request link): the request's actions, oldest first. */
  getPublicActions(slug: string, runId: string): Promise<CustomerAction[]>;
  /** Customer: one answer per action. Production: authorised by a signed request token. */
  respondToAction(slug: string, runId: string, actionId: string, optionId: string): Promise<CustomerAction>;

  // ---------- Interactive quotes ----------
  /** Owner: every revision of the request's quotes, newest first. */
  listQuotes(orgId: string, runId: string): Promise<QuoteRecord[]>;
  /** Owner: creates the request's one draft, or saves it (optimistic lock on the revision). */
  saveQuoteDraft(orgId: string, runId: string, input: { quoteId?: string; content: QuoteContent }): Promise<QuoteRecord>;
  /** Owner: freezes the draft and shows it to the customer; an earlier open quote is superseded. */
  sendQuote(orgId: string, quoteId: string): Promise<QuoteRecord>;
  withdrawQuote(orgId: string, quoteId: string): Promise<QuoteRecord>;

  // ---------- The customer's request page ----------
  /** Owner: a link to the customer's own request page (production: a new secret link). */
  shareRequestLink(orgId: string, runId: string): Promise<string>;
  /** Owner: every link sent so far stops working. */
  revokeRequestLinks(orgId: string, runId: string): Promise<void>;
  /** Customer, right after submitting: the reference for their request page, if this browser has one. */
  customerAccess(slug: string, runId: string): Promise<string | null>;
  trackRequest(access: string): Promise<TrackView | null>;
  respondTracked(access: string, actionId: string, optionId: string): Promise<void>;
  decideQuote(access: string, quoteId: string, input: QuoteDecisionInput): Promise<void>;
  cancelTracked(access: string): Promise<void>;

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
