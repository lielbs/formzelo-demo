/**
 * localStorage implementation of FormangleRepository.
 *
 * Layout (each workspace isolated under its own key):
 *   formzelo:v1:meta          -> Meta (org list, active org, public slug index)
 *   formzelo:v1:org:<orgId>   -> OrgData (workflows, versions, runs, events, ...)
 *   formzelo:v1:assets:<orgId> -> { assets: Asset[] } (downscaled local images, kept
 *                                 out of OrgData so versions never duplicate them)
 *
 * The key namespace stays `v1`; the payload's schemaVersion is migrated in place
 * on first read (src/data/migrations.ts) and written back.
 *
 * Every read is validated with Zod. Corrupt payloads are backed up to
 * formzelo:v1:corrupt:<key> and the demo workspace is re-seeded, so a bad
 * manual edit never crashes the app.
 */
import {
  IntakeSchema,
  MetaSchema,
  OrgDataSchema,
  SCHEMA_VERSION,
  WorkflowConfigSchema,
  type CustomerAction,
  type Intake,
  type Meta,
  type OrgData,
  type Organization,
  type QuoteRecord,
  type RunEvent,
  type RunStatus,
  type UsageEvent,
  type Workflow,
  type WorkflowConfig,
  type WorkflowRun,
  type WorkflowVersion,
} from '../domain/schema';
import { ASSET_LIMITS, AssetSchema, BrandKitSchema, WorkflowThemeSchema, type Asset, type BrandKit, type WorkflowTheme } from '../domain/theme';
import { actionStatus, actionSummary, buildAction, cancel as cancelAct, isDuplicate, respond as respondAct, type ActionInput } from '../engine/actions';
import { CUSTOMER_CANCELLABLE, slotAvailability, validateBooking } from '../engine/booking';
import { normalizeLink } from '../engine/presence';
import { optionUsage, validateOptionCapacity } from '../engine/capacity';
import { hasOpenRequestFrom, intakeState } from '../engine/intake';
import { initialPayment, paymentOnApproval, simulatePaid } from '../engine/completion';
import { computePrice } from '../engine/pricing';
import { QuoteContentSchema, quoteTotals, type QuoteContent } from '../engine/quote';
import { isoDay } from '../lib/format';
import { trackPath, type QuoteDecisionInput, type TrackView } from './track';
import { freezeTheme } from '../theme/brand';
import { recommendTheme } from '../theme/resolver';
import { migrateMeta, migrateOrgData } from './migrations';
import type { Values } from '../engine/conditions';
import { buildSubmission, caseLinkNotification, nextReference, statusNotification, submitNotifications } from '../engine/runs';
import { assertTransition, STATUS_LABELS } from '../engine/transitions';
import { toRunAnswers, validateFields, validateRun } from '../engine/validation';
import { newId, nowIso, slugify } from '../lib/id';
import {
  DomainRuleError,
  NotFoundError,
  StorageQuotaError,
  ValidationFailedError,
  type FormangleRepository,
  type PublicWorkflow,
  type StorageReport,
} from './repository';
import { buildSeed, LATER_DEMO_ORGS } from './seed';
import { isShowcaseId, showcaseAssets } from './showcase';
import { assetSrc } from '../lib/links';

/** Storage namespace. Independent of SCHEMA_VERSION so migrations happen in place. */
// Historical namespace from the product's previous name (Formzelo). Kept on purpose: renaming it would orphan every
// visitor's saved workspaces. Not product-facing.
const PREFIX = 'formzelo:v1:';
const META_KEY = `${PREFIX}meta`;
const orgKey = (orgId: string) => `${PREFIX}org:${orgId}`;
const assetKey = (orgId: string) => `${PREFIX}assets:${orgId}`;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export class LocalStorageRepository implements FormangleRepository {
  private listeners = new Set<() => void>();
  private warnings: string[] = [];

  constructor(private readonly store: KeyValueStore = window.localStorage) {
    if (typeof window !== 'undefined') {
      // Another tab (e.g. the public link) wrote to storage — refresh this one.
      window.addEventListener('storage', (e) => {
        if (e.key === null || e.key.startsWith(PREFIX)) this.emit();
      });
    }
  }

  // ---------- low-level storage ----------

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private write(key: string, value: unknown) {
    try {
      this.store.setItem(key, JSON.stringify(value));
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) throw new StorageQuotaError();
      throw err;
    }
  }

  private readJson(key: string): unknown {
    const raw = this.store.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return Symbol.for('corrupt');
    }
  }

  private backup(key: string, label: string) {
    const raw = this.store.getItem(key);
    if (raw === null) return;
    try {
      this.store.setItem(`${PREFIX}${label}:${key.slice(PREFIX.length)}:${Date.now()}`, raw);
    } catch {
      /* backup is best-effort when quota is full */
    }
  }

  private quarantine(key: string, reason: string) {
    this.backup(key, 'corrupt');
    this.warnings.push(reason);
    console.warn(`[formangle] ${reason}`);
  }

  private readMeta(): Meta {
    const { value, migrated } = migrateMeta(this.readJson(META_KEY));
    const parsed = MetaSchema.safeParse(value);
    if (parsed.success) {
      if (migrated) {
        this.writeMeta(parsed.data);
        return this.addLaterDemoOrgs(parsed.data);
      }
      return parsed.data;
    }
    if (this.store.getItem(META_KEY) !== null) this.quarantine(META_KEY, 'נתוני המטא בדפדפן היו פגומים ואופסו לנתוני דמו.');
    return this.seedAll();
  }

  /** Demo workspaces introduced after a browser was seeded are added alongside existing data (never replacing it). */
  private addLaterDemoOrgs(meta: Meta): Meta {
    const missing = Object.entries(LATER_DEMO_ORGS).filter(([id]) => !meta.orgIds.includes(id) && this.store.getItem(orgKey(id)) === null);
    if (!missing.length) return meta;
    const next: Meta = { ...meta, orgIds: [...meta.orgIds], slugIndex: { ...meta.slugIndex } };
    for (const [id, build] of missing) {
      const data = build(Date.now());
      // Never let a new demo slug shadow a workflow the owner already published.
      if (data.workflows.some((w) => next.slugIndex[w.slug])) continue;
      this.write(orgKey(id), data);
      next.orgIds.push(id);
      data.workflows.forEach((w) => (next.slugIndex[w.slug] = id));
    }
    this.writeMeta(next);
    return next;
  }

  private writeMeta(meta: Meta) {
    this.write(META_KEY, meta);
  }

  private readOrg(orgId: string): OrgData {
    const { value, migrated } = migrateOrgData(this.readJson(orgKey(orgId)));
    const parsed = OrgDataSchema.safeParse(value);
    if (parsed.success) {
      if (migrated) {
        // Keep the original payload until the migrated one is safely written.
        this.backup(orgKey(orgId), `pre-v${SCHEMA_VERSION}`);
        this.write(orgKey(orgId), parsed.data);
        // Migrations may add workflows (e.g. new demo flows) — keep public slugs resolvable.
        this.reindexSlugs();
        console.info(`[formangle] migrated workspace ${orgId} to schema v${SCHEMA_VERSION}`);
      }
      return parsed.data;
    }
    this.quarantine(orgKey(orgId), `נתוני סביבת העבודה ${orgId} היו פגומים ושוחזרו מנתוני הדמו.`);
    const fresh = buildSeed().find((d) => d.organization.id === orgId);
    if (!fresh) throw new NotFoundError('Workspace');
    this.write(orgKey(orgId), fresh);
    this.reindexSlugs();
    return fresh;
  }

  /** Read-modify-write one workspace. The mutator may throw to abort without writing. */
  private mutate<T>(orgId: string, fn: (data: OrgData) => T): T {
    const data = this.readOrg(orgId);
    const result = fn(data);
    // Validate before persisting so invalid state can never reach storage.
    this.write(orgKey(orgId), OrgDataSchema.parse(data));
    this.emit();
    return result;
  }

  private seedAll(): Meta {
    const orgs = buildSeed();
    for (const d of orgs) this.write(orgKey(d.organization.id), d);
    const meta: Meta = {
      schemaVersion: SCHEMA_VERSION,
      orgIds: orgs.map((d) => d.organization.id),
      activeOrgId: null,
      slugIndex: Object.fromEntries(orgs.flatMap((d) => d.workflows.map((w) => [w.slug, d.organization.id]))),
      seededAt: nowIso(),
    };
    this.writeMeta(meta);
    return meta;
  }

  private reindexSlugs() {
    const meta = MetaSchema.safeParse(this.readJson(META_KEY));
    if (!meta.success) return;
    const slugIndex: Record<string, string> = {};
    for (const id of meta.data.orgIds) {
      const d = OrgDataSchema.safeParse(migrateOrgData(this.readJson(orgKey(id))).value);
      if (d.success) d.data.workflows.forEach((w) => (slugIndex[w.slug] = id));
    }
    this.writeMeta({ ...meta.data, slugIndex });
  }

  private uniqueSlug(base: string): string {
    const meta = this.readMeta();
    let slug = base;
    while (meta.slugIndex[slug]) slug = slugify(base.replace(/-[a-z0-9]{4}$/, ''), 'flow');
    return slug;
  }

  private registerSlug(slug: string, orgId: string) {
    const meta = this.readMeta();
    this.writeMeta({ ...meta, slugIndex: { ...meta.slugIndex, [slug]: orgId } });
  }

  private usage(data: OrgData, type: UsageEvent['type'], workflowId?: string) {
    const at = nowIso();
    data.usage.push({ id: newId('use'), orgId: data.organization.id, type, workflowId, createdAt: at, updatedAt: at });
  }

  private event(data: OrgData, run: WorkflowRun, e: Pick<RunEvent, 'type' | 'actor' | 'message'> & Partial<RunEvent>): RunEvent {
    const at = nowIso();
    const ev: RunEvent = { id: newId('evt'), orgId: data.organization.id, runId: run.id, internal: false, createdAt: at, updatedAt: at, ...e };
    data.events.push(ev);
    return ev;
  }

  private findWorkflow(data: OrgData, workflowId: string): Workflow {
    const wf = data.workflows.find((w) => w.id === workflowId);
    if (!wf) throw new NotFoundError('Workflow');
    return wf;
  }

  private findRun(data: OrgData, runId: string): WorkflowRun {
    const run = data.runs.find((r) => r.id === runId);
    if (!run) throw new NotFoundError('Run');
    return run;
  }

  private publishedVersion(data: OrgData, wf: Workflow): WorkflowVersion {
    const v = data.versions.find((x) => x.id === wf.publishedVersionId);
    if (!v) throw new DomainRuleError('התהליך עדיין לא פורסם');
    return v;
  }

  // ---------- workspace ----------

  async init() {
    this.readMeta();
  }

  async listOrganizations(): Promise<Organization[]> {
    return this.readMeta().orgIds.map((id) => this.readOrg(id).organization);
  }

  async getActiveOrgId() {
    return this.readMeta().activeOrgId;
  }

  async setActiveOrgId(orgId: string) {
    const meta = this.readMeta();
    if (!meta.orgIds.includes(orgId)) throw new NotFoundError('Workspace');
    this.writeMeta({ ...meta, activeOrgId: orgId });
    this.emit();
  }

  async updateOrganization(orgId: string, patch: Partial<Pick<Organization, 'name' | 'tagline' | 'brand' | 'contactEmail'>>) {
    return this.mutate(orgId, (d) => {
      d.organization = { ...d.organization, ...patch, updatedAt: nowIso() };
      return d.organization;
    });
  }

  // ---------- workflows ----------

  async listWorkflows(orgId: string) {
    return [...this.readOrg(orgId).workflows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getWorkflow(orgId: string, workflowId: string) {
    return this.readOrg(orgId).workflows.find((w) => w.id === workflowId) ?? null;
  }

  async createWorkflow(orgId: string, input: { config: WorkflowConfig; templateKey: string; sourcePrompt?: string; design?: WorkflowTheme }) {
    const config = WorkflowConfigSchema.parse(input.config);
    const organization = this.readOrg(orgId).organization;
    // New workflows inherit the workspace brand kit unless a design says otherwise.
    const design = WorkflowThemeSchema.parse({
      inheritBrand: true,
      ...(input.design ??
        recommendTheme({ templateKey: input.templateKey, title: config.title, description: config.description, prompt: input.sourcePrompt, industry: organization.industry }).theme),
    });
    const slug = this.uniqueSlug(slugify(organization.slug, 'flow'));
    const wf = this.mutate(orgId, (d) => {
      const at = nowIso();
      const w: Workflow = {
        id: newId('wf'),
        orgId,
        slug,
        status: 'draft',
        templateKey: input.templateKey,
        draft: config,
        design,
        hasUnpublishedChanges: true,
        sourcePrompt: input.sourcePrompt,
        isDemo: false,
        createdAt: at,
        updatedAt: at,
      };
      d.workflows.push(w);
      this.usage(d, input.sourcePrompt ? 'workflow_generated' : 'workflow_created', w.id);
      return w;
    });
    this.registerSlug(slug, orgId);
    return wf;
  }

  async saveDraft(orgId: string, workflowId: string, config: WorkflowConfig, design?: WorkflowTheme) {
    const valid = WorkflowConfigSchema.parse(config);
    const validDesign = design ? WorkflowThemeSchema.parse(design) : undefined;
    if (validDesign) this.assertAssetsExist(orgId, validDesign);
    return this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      wf.draft = valid;
      if (validDesign) wf.design = validDesign;
      wf.hasUnpublishedChanges = true;
      wf.updatedAt = nowIso();
      return wf;
    });
  }

  async publishWorkflow(orgId: string, workflowId: string) {
    return this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      if (wf.status === 'archived') throw new DomainRuleError('לא ניתן לפרסם תהליך בארכיון');
      const previous = d.versions.filter((v) => v.workflowId === wf.id);
      const at = nowIso();
      const version: WorkflowVersion = {
        id: newId('ver'),
        orgId,
        workflowId: wf.id,
        version: previous.length + 1,
        config: structuredClone(WorkflowConfigSchema.parse(wf.draft)),
        // The RESOLVED design (brand kit applied) is frozen with the version;
        // later draft or brand-kit edits never reach it.
        design: freezeTheme(WorkflowThemeSchema.parse(wf.design), d.brandKit),
        publishedAt: at,
        createdAt: at,
        updatedAt: at,
      };
      d.versions.push(version);
      wf.publishedVersionId = version.id;
      wf.status = 'published';
      wf.hasUnpublishedChanges = false;
      wf.updatedAt = at;
      this.usage(d, 'workflow_published', wf.id);
      return version;
    });
  }

  async duplicateWorkflow(orgId: string, workflowId: string) {
    const source = this.findWorkflow(this.readOrg(orgId), workflowId);
    const slug = this.uniqueSlug(slugify(source.slug.replace(/-[a-z0-9]{4}$/, ''), 'flow'));
    const copy = this.mutate(orgId, (d) => {
      const at = nowIso();
      const config = structuredClone(source.draft);
      config.title = `${config.title} (עותק)`;
      const w: Workflow = {
        ...structuredClone(source),
        id: newId('wf'),
        slug,
        status: 'draft',
        draft: config,
        publishedVersionId: undefined,
        hasUnpublishedChanges: true,
        isDemo: false,
        createdAt: at,
        updatedAt: at,
      };
      d.workflows.push(w);
      this.usage(d, 'workflow_duplicated', w.id);
      return w;
    });
    this.registerSlug(slug, orgId);
    return copy;
  }

  async setArchived(orgId: string, workflowId: string, archived: boolean) {
    return this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      wf.status = archived ? 'archived' : wf.publishedVersionId ? 'published' : 'draft';
      wf.updatedAt = nowIso();
      return wf;
    });
  }

  async deleteWorkflow(orgId: string, workflowId: string) {
    let slug = '';
    this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      slug = wf.slug;
      const runIds = new Set(d.runs.filter((r) => r.workflowId === workflowId).map((r) => r.id));
      d.workflows = d.workflows.filter((w) => w.id !== workflowId);
      d.versions = d.versions.filter((v) => v.workflowId !== workflowId);
      d.runs = d.runs.filter((r) => !runIds.has(r.id));
      d.events = d.events.filter((e) => !e.runId || !runIds.has(e.runId));
      d.notifications = d.notifications.filter((n) => !n.runId || !runIds.has(n.runId));
      d.actions = d.actions.filter((a) => !runIds.has(a.runId));
      d.quotes = d.quotes.filter((q) => !runIds.has(q.runId));
      d.usage = d.usage.filter((u) => u.workflowId !== workflowId);
    });
    const meta = this.readMeta();
    if (slug && meta.slugIndex[slug]) {
      const { [slug]: _gone, ...rest } = meta.slugIndex;
      this.writeMeta({ ...meta, slugIndex: rest });
    }
  }

  async updateIntake(orgId: string, workflowId: string, intake: Intake) {
    const parsed = IntakeSchema.parse(intake);
    return this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      wf.intake = parsed;
      wf.updatedAt = nowIso();
      return wf;
    });
  }

  async listVersions(orgId: string, workflowId: string) {
    return this.readOrg(orgId)
      .versions.filter((v) => v.workflowId === workflowId)
      .sort((a, b) => b.version - a.version);
  }

  async getVersion(orgId: string, versionId: string) {
    return this.readOrg(orgId).versions.find((v) => v.id === versionId) ?? null;
  }

  async restoreVersionToDraft(orgId: string, workflowId: string, versionId: string) {
    return this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      const v = d.versions.find((x) => x.id === versionId && x.workflowId === workflowId);
      if (!v) throw new NotFoundError('Version');
      wf.draft = structuredClone(v.config);
      wf.design = structuredClone(v.design);
      wf.hasUnpublishedChanges = true;
      wf.updatedAt = nowIso();
      return wf;
    });
  }

  // ---------- public flow ----------

  async resolvePublic(slug: string): Promise<PublicWorkflow | null> {
    const orgId = this.readMeta().slugIndex[slug];
    if (!orgId) return null;
    const d = this.readOrg(orgId);
    const workflow = d.workflows.find((w) => w.slug === slug);
    if (!workflow || workflow.status !== 'published') return null;
    const version = d.versions.find((v) => v.id === workflow.publishedVersionId);
    if (!version) return null;
    return { organization: d.organization, workflow, version };
  }

  async getPublicRun(slug: string, runId: string) {
    const orgId = this.readMeta().slugIndex[slug];
    if (!orgId) return null;
    const d = this.readOrg(orgId);
    const wf = d.workflows.find((w) => w.slug === slug);
    const run = d.runs.find((r) => r.id === runId && r.workflowId === wf?.id);
    const version = run && d.versions.find((v) => v.id === run.versionId);
    return run && version ? { run, version } : null;
  }

  async submitRun(slug: string, input: { values: Values; consent: boolean; runId?: string; payNow?: boolean }) {
    const pub = await this.resolvePublic(slug);
    if (!pub) throw new NotFoundError('Workflow');
    return this.mutate(pub.organization.id, (d) => {
      const wf = this.findWorkflow(d, pub.workflow.id);
      const existing = input.runId ? this.findRun(d, input.runId) : undefined;
      if (existing && existing.workflowId !== wf.id) throw new NotFoundError('Run');
      if (!existing && pub.version.config.mode === 'case') {
        throw new DomainRuleError('תהליך זה דורש קישור אישי מהעסק');
      }
      // A run always uses the version it is bound to — never a newer draft.
      const version = existing ? d.versions.find((v) => v.id === existing.versionId)! : this.publishedVersion(d, wf);
      const config = version.config;

      const errors = {
        ...validateRun(config, input.values),
        // Local, best-effort availability — see engine/booking.ts for the limits.
        ...validateBooking(config, input.values, d.runs.filter((r) => r.workflowId === wf.id), existing?.id),
        ...validateOptionCapacity(config, input.values, optionUsage(config, d.runs.filter((r) => r.workflowId === wf.id), existing?.id)),
      };
      if (Object.keys(errors).length) throw new ValidationFailedError(errors);
      if (config.consent.required && !input.consent) throw new ValidationFailedError({ __consent: 'יש לאשר כדי לשלוח' });

      const sub = buildSubmission(config, input.values, existing?.caseAnswers ?? []);
      // New public requests respect the owner's intake rules; a returning customer (changes requested) never does.
      if (!existing) {
        const wfRuns = d.runs.filter((r) => r.workflowId === wf.id);
        const state = intakeState(wf.intake, wfRuns);
        if (!state.open) throw new DomainRuleError(wf.intake?.closedMessage || state.message || 'הטופס סגור כרגע');
        if (wf.intake?.onePerContact && hasOpenRequestFrom(sub.customerContact, wfRuns)) {
          throw new DomainRuleError('כבר התקבלה מכם בקשה פתוחה. נחזור אליכם עליה — אין צורך לשלוח שוב.');
        }
      }
      const at = nowIso();
      // Price is recomputed here from the version's config, never trusted from the client.
      const payment = initialPayment(config, computePrice(config, input.values), Boolean(input.payNow), at);
      let run: WorkflowRun;
      if (existing) {
        const from = existing.status;
        assertTransition(from, 'submitted');
        Object.assign(existing, {
          status: 'submitted' as RunStatus,
          answers: sub.answers,
          priceLines: sub.priceLines,
          total: sub.total,
          payment,
          completionMode: config.completion?.mode,
          customerName: sub.customerName || existing.customerName,
          customerContact: sub.customerContact || existing.customerContact,
          consentAt: input.consent ? at : undefined,
          submittedAt: at,
          updatedAt: at,
        });
        run = existing;
        this.event(d, run, {
          type: from === 'changes_requested' ? 'resubmitted' : 'submitted',
          actor: 'customer',
          from,
          to: 'submitted',
          message: from === 'changes_requested' ? 'הלקוח/ה עדכן/ה ושלח/ה מחדש' : 'הלקוח/ה שלח/ה את ההחלטות',
        });
      } else {
        run = {
          id: newId('run'),
          orgId: d.organization.id,
          workflowId: wf.id,
          versionId: version.id,
          versionNumber: version.version,
          reference: nextReference(d.organization, d.runs),
          status: 'submitted',
          answers: sub.answers,
          caseAnswers: [],
          priceLines: sub.priceLines,
          total: sub.total,
          payment,
          completionMode: config.completion?.mode,
          customerName: sub.customerName,
          customerContact: sub.customerContact,
          consentAt: input.consent ? at : undefined,
          submittedAt: at,
          isDemo: false,
          createdAt: at,
          updatedAt: at,
        };
        d.runs.push(run);
        this.event(d, run, { type: 'submitted', actor: 'customer', to: 'submitted', message: 'הלקוח/ה שלח/ה את הבקשה' });
      }
      if (payment.status === 'paid_simulated' || payment.status === 'deposit_paid_simulated') {
        this.event(d, run, { type: 'payment_simulated', actor: 'customer', message: 'הלקוח/ה לחץ/ה על תשלום מדומה — לא בוצע חיוב' });
      }
      d.notifications.push(...submitNotifications(d.organization, run, config.title));
      this.usage(d, 'run_submitted', wf.id);
      return run;
    });
  }

  // ---------- runs (owner) ----------

  async listRuns(orgId: string) {
    return [...this.readOrg(orgId).runs].sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt));
  }

  async getRun(orgId: string, runId: string) {
    return this.readOrg(orgId).runs.find((r) => r.id === runId) ?? null;
  }

  async createCase(orgId: string, workflowId: string, caseValues: Values, publicBaseUrl: string) {
    return this.mutate(orgId, (d) => {
      const wf = this.findWorkflow(d, workflowId);
      if (wf.status !== 'published') throw new DomainRuleError('יש לפרסם את התהליך לפני פתיחת תיק');
      const version = this.publishedVersion(d, wf);
      const config = version.config;
      if (config.mode !== 'case') throw new DomainRuleError('תהליך זה אינו מבוסס תיקים');
      const errors = validateFields(config.caseFields, caseValues);
      if (Object.keys(errors).length) throw new ValidationFailedError(errors);
      const caseAnswers = toRunAnswers(config.caseFields, caseValues);
      const sub = buildSubmission(config, {}, caseAnswers);
      const at = nowIso();
      const run: WorkflowRun = {
        id: newId('run'),
        orgId,
        workflowId: wf.id,
        versionId: version.id,
        versionNumber: version.version,
        reference: nextReference(d.organization, d.runs),
        status: 'awaiting_customer',
        answers: [],
        caseAnswers,
        priceLines: [],
        total: 0,
        payment: { status: 'none', amount: 0 },
        customerName: sub.customerName,
        customerContact: sub.customerContact,
        isDemo: false,
        createdAt: at,
        updatedAt: at,
      };
      d.runs.push(run);
      this.event(d, run, { type: 'case_created', actor: 'owner', to: 'awaiting_customer', message: 'נפתח תיק ונוצר קישור אישי ללקוח' });
      const n = caseLinkNotification(d.organization, run, `${publicBaseUrl}/f/${wf.slug}?r=${run.id}`);
      if (n) d.notifications.push(n);
      this.usage(d, 'run_started', wf.id);
      return run;
    });
  }

  async transitionRun(orgId: string, runId: string, to: RunStatus, message?: string) {
    return this.mutate(orgId, (d) => {
      const run = this.findRun(d, runId);
      const from = run.status;
      assertTransition(from, to);
      if (to === 'submitted') throw new DomainRuleError('רק הלקוח יכול לשלוח בקשה');
      const version = d.versions.find((v) => v.id === run.versionId);
      run.status = to;
      run.updatedAt = nowIso();
      if (to === 'approved' && version) run.payment = paymentOnApproval(version.config, run.payment, run.updatedAt);
      this.event(d, run, {
        type: 'status_changed',
        actor: 'owner',
        from,
        to,
        message: `הסטטוס שונה מ"${STATUS_LABELS[from]}" ל"${STATUS_LABELS[to]}"${message ? ` — ${message}` : ''}`,
      });
      if (to === 'approved' && version?.config.booking?.enabled) {
        this.event(d, run, { type: 'booking_confirmed', actor: 'owner', message: 'ההזמנה אושרה — השולחן/התור שמור (דמו מקומי)' });
      }
      const n = statusNotification(d.organization, run, to, message);
      if (n) {
        d.notifications.push(n);
        this.event(d, run, { type: 'notification_simulated', actor: 'system', message: `הודעת ${n.channel} מדומה הוכנה ל-${n.to} (לא נשלחה)` });
      }
      return run;
    });
  }

  async addNote(orgId: string, runId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new ValidationFailedError({ note: 'ההערה ריקה' });
    if (trimmed.length > 1000) throw new ValidationFailedError({ note: 'עד 1000 תווים' });
    return this.mutate(orgId, (d) => this.event(d, this.findRun(d, runId), { type: 'note_added', actor: 'owner', message: trimmed, internal: true }));
  }

  async markPaymentPaid(orgId: string, runId: string) {
    return this.mutate(orgId, (d) => {
      const run = this.findRun(d, runId);
      const at = nowIso();
      const paid = simulatePaid(run.payment, at);
      if (!paid) throw new DomainRuleError('אין תשלום פתוח עבור בקשה זו');
      const wasDeposit = run.payment.status === 'deposit_requested';
      run.payment = paid;
      run.updatedAt = at;
      this.event(d, run, { type: 'payment_simulated', actor: 'owner', message: `${wasDeposit ? 'מקדמה' : 'תשלום'} סומן כשולם (סימולציה — לא בוצע חיוב)` });
      return run;
    });
  }

  /** @deprecated kept for older callers; use markPaymentPaid. */
  async markDepositPaid(orgId: string, runId: string) {
    return this.markPaymentPaid(orgId, runId);
  }

  async getBookingAvailability(slug: string, date: string) {
    const pub = await this.resolvePublic(slug);
    const booking = pub?.version.config.booking;
    if (!pub || !booking?.enabled) return [];
    const runs = this.readOrg(pub.organization.id).runs.filter((r) => r.workflowId === pub.workflow.id);
    return slotAvailability(booking, date, runs);
  }

  async getOptionUsage(slug: string) {
    const pub = await this.resolvePublic(slug);
    if (!pub) return {};
    const runs = this.readOrg(pub.organization.id).runs.filter((r) => r.workflowId === pub.workflow.id);
    return optionUsage(pub.version.config, runs);
  }

  async getIntakeState(slug: string) {
    const pub = await this.resolvePublic(slug);
    if (!pub) return intakeState(undefined, []);
    const runs = this.readOrg(pub.organization.id).runs.filter((r) => r.workflowId === pub.workflow.id);
    return intakeState(pub.workflow.intake, runs);
  }

  async cancelRunByCustomer(slug: string, runId: string) {
    const pub = await this.resolvePublic(slug);
    if (!pub) throw new NotFoundError('Workflow');
    return this.mutate(pub.organization.id, (d) => {
      const run = this.findRun(d, runId);
      if (run.workflowId !== pub.workflow.id) throw new NotFoundError('Run');
      const version = d.versions.find((v) => v.id === run.versionId);
      if (!version?.config.booking?.enabled) throw new DomainRuleError('אפשר לבטל דרך הקישור רק בקשות הזמנה');
      if (!CUSTOMER_CANCELLABLE.includes(run.status)) throw new DomainRuleError('לא ניתן לבטל את הבקשה במצב הנוכחי');
      const from = run.status;
      assertTransition(from, 'cancelled');
      run.status = 'cancelled';
      run.updatedAt = nowIso();
      this.event(d, run, { type: 'status_changed', actor: 'customer', from, to: 'cancelled', message: 'הלקוח ביטל את בקשת ההזמנה דרך הקישור האישי' });
      return run;
    });
  }

  // ---------- brand kit ----------

  async getBrandKit(orgId: string): Promise<BrandKit> {
    return this.readOrg(orgId).brandKit;
  }

  async updateBrandKit(orgId: string, kit: BrandKit) {
    const valid = BrandKitSchema.parse({ ...kit, updatedAt: nowIso() });
    // Validated at the trust boundary too, not only in the editor.
    for (const l of valid.links) {
      if (!l.value.trim() ? l.enabled : !normalizeLink(l.platform, l.value).ok) throw new DomainRuleError(`הקישור "${l.label || l.platform}" אינו תקין`);
    }
    const ids = new Set(this.readAssets(orgId).map((a) => a.id));
    for (const id of [valid.logoAssetId, valid.secondaryLogoAssetId, valid.coverAssetId]) {
      if (id && !ids.has(id)) throw new DomainRuleError('תמונה שנבחרה לערכת המותג לא נמצאה. בחרו אותה מחדש.');
    }
    // Published versions keep their frozen design; only drafts that inherit see the change.
    return this.mutate(orgId, (d) => {
      d.brandKit = valid;
      return valid;
    });
  }

  // ---------- assets (local images) ----------

  /** Uploaded assets plus, for demo workspaces, the showcase library (static files, never stored). */
  private readAssets(orgId: string): Asset[] {
    return [...this.readStoredAssets(orgId), ...showcaseAssets(orgId)];
  }

  private readStoredAssets(orgId: string): Asset[] {
    const raw = this.readJson(assetKey(orgId));
    if (raw === undefined) return [];
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { assets?: unknown }).assets) ? (raw as { assets: unknown[] }).assets : [];
    // Invalid entries are skipped, not fatal: the renderer falls back to illustrations.
    return list.flatMap((a) => {
      const r = AssetSchema.safeParse(a);
      return r.success && r.data.orgId === orgId ? [r.data] : [];
    });
  }

  private assertAssetsExist(orgId: string, design: WorkflowTheme) {
    const ids = new Set(this.readAssets(orgId).map((a) => a.id));
    for (const id of [design.logo.assetId, design.hero.coverAssetId]) {
      if (id && !ids.has(id)) throw new DomainRuleError('תמונה שנבחרה לעיצוב לא נמצאה. בחרו אותה מחדש.');
    }
  }

  async listAssets(orgId: string) {
    return this.readAssets(orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAssetUrls(orgId: string, ids: (string | undefined)[]): Promise<Record<string, string>> {
    const wanted = new Set(ids.filter(Boolean));
    if (!wanted.size) return {};
    return Object.fromEntries(this.readAssets(orgId).filter((a) => wanted.has(a.id)).map((a) => [a.id, assetSrc(a.dataUrl)]));
  }

  async saveAsset(orgId: string, input: Pick<Asset, 'kind' | 'name' | 'mime' | 'dataUrl' | 'width' | 'height'>) {
    this.readOrg(orgId); // workspace must exist
    const bytes = Math.ceil((input.dataUrl.length - input.dataUrl.indexOf(',') - 1) * 0.75);
    const limit = ASSET_LIMITS[input.kind].maxBytes;
    if (bytes > limit) throw new DomainRuleError(`התמונה גדולה מדי גם לאחר הקטנה (${Math.round(bytes / 1024)}KB). המקסימום הוא ${Math.round(limit / 1024)}KB.`);
    const assets = this.readStoredAssets(orgId);
    const total = assets.reduce((s, a) => s + a.bytes, 0);
    if (total + bytes > ASSET_LIMITS.totalBytes) throw new DomainRuleError('נגמר המקום לתמונות בסביבת עבודה זו בדמו. מחקו תמונות שאינן בשימוש.');
    const asset = AssetSchema.parse({ ...input, id: newId('ast'), orgId, bytes, createdAt: nowIso() });
    this.write(assetKey(orgId), { assets: [...assets, asset] });
    this.emit();
    return asset;
  }

  async deleteAsset(orgId: string, assetId: string) {
    if (isShowcaseId(assetId)) throw new DomainRuleError('תמונות של עסק הדמו הן חלק מהדמו ולא ניתן למחוק אותן.');
    const d = this.readOrg(orgId);
    const uses = (t: WorkflowTheme) => t.logo.assetId === assetId || t.hero.coverAssetId === assetId;
    // Published versions are immutable, so an image they reference can't be removed.
    if (d.versions.some((v) => uses(v.design))) throw new DomainRuleError('התמונה משמשת גרסה שפורסמה ולכן לא ניתן למחוק אותה.');
    if (d.workflows.some((w) => uses(w.design))) throw new DomainRuleError('התמונה משמשת טיוטה שמורה. הסירו אותה מהעיצוב ושמרו לפני מחיקה.');
    const k = d.brandKit;
    if ([k.logoAssetId, k.secondaryLogoAssetId, k.coverAssetId].includes(assetId)) throw new DomainRuleError('התמונה משמשת בערכת המותג. הסירו אותה משם ושמרו לפני מחיקה.');
    const inBlocks = (cfg: WorkflowConfig) => cfg.steps.some((st) => st.fields.some((f) => f.media?.includes(assetId) || f.options?.some((o) => o.image === assetId)));
    if (d.versions.some((v) => inBlocks(v.config))) throw new DomainRuleError('התמונה משמשת גרסה שפורסמה ולכן לא ניתן למחוק אותה.');
    if (d.workflows.some((w) => inBlocks(w.draft))) throw new DomainRuleError('התמונה משמשת בתוכן של טיוטה שמורה. הסירו אותה ושמרו לפני מחיקה.');
    this.write(assetKey(orgId), { assets: this.readStoredAssets(orgId).filter((a) => a.id !== assetId) });
    this.emit();
  }

  // ---------- activity ----------

  // ---------- Formangle Actions ----------

  async listActions(orgId: string, runId?: string) {
    return this.readOrg(orgId)
      .actions.filter((a) => !runId || a.runId === runId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createAction(orgId: string, runId: string, input: ActionInput) {
    return this.mutate(orgId, (d) => {
      const run = this.findRun(d, runId);
      let action: CustomerAction;
      try {
        action = buildAction(input, run, { id: newId('act') }, nowIso());
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') throw new ValidationFailedError({ action: 'פרטי הפעולה אינם תקינים' });
        throw new DomainRuleError(e instanceof Error ? e.message : 'לא ניתן ליצור את הפעולה');
      }
      if (isDuplicate(d.actions, action)) throw new DomainRuleError('פעולה זהה כבר נשלחה ללקוח וממתינה. אם משהו השתנה, בטלו אותה ושלחו חדשה');
      d.actions.push(action);
      run.updatedAt = action.createdAt;
      this.event(d, run, {
        type: 'action_created',
        actor: 'owner',
        actionId: action.id,
        message: `${action.kind === 'update' ? 'עדכון ללקוח' : 'נפתחה בקשה ללקוח'}: ${actionSummary(action)}`,
      });
      return action;
    });
  }

  async cancelAction(orgId: string, actionId: string) {
    return this.mutate(orgId, (d) => {
      const i = d.actions.findIndex((a) => a.id === actionId);
      if (i < 0) throw new NotFoundError('Action');
      let next: CustomerAction;
      try {
        next = cancelAct(d.actions[i]!, nowIso());
      } catch (e) {
        throw new DomainRuleError(e instanceof Error ? e.message : 'לא ניתן לבטל');
      }
      d.actions[i] = next;
      this.event(d, this.findRun(d, next.runId), { type: 'action_cancelled', actor: 'owner', actionId: next.id, message: `הבקשה ללקוח בוטלה: ${actionSummary(next)}` });
      return next;
    });
  }

  async getPublicActions(slug: string, runId: string) {
    const found = await this.getPublicRun(slug, runId);
    if (!found) return [];
    return this.readOrg(found.run.orgId)
      .actions.filter((a) => a.runId === runId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async respondToAction(slug: string, runId: string, actionId: string, optionId: string) {
    const found = await this.getPublicRun(slug, runId);
    if (!found) throw new NotFoundError('Run');
    return this.mutate(found.run.orgId, (d) => {
      const i = d.actions.findIndex((a) => a.id === actionId && a.runId === runId);
      if (i < 0) throw new NotFoundError('Action');
      let next: CustomerAction;
      try {
        next = respondAct(d.actions[i]!, optionId, nowIso());
      } catch (e) {
        throw new DomainRuleError(e instanceof Error ? e.message : 'לא ניתן לשמור את התשובה');
      }
      d.actions[i] = next;
      const run = this.findRun(d, runId);
      run.updatedAt = next.updatedAt;
      this.event(d, run, { type: 'action_responded', actor: 'customer', actionId: next.id, message: `הלקוח/ה בחר/ה "${next.response!.label}" — ${actionSummary(next)}` });
      return next;
    });
  }

  // ---------- interactive quotes (demo: same rules as the server) ----------

  async listQuotes(orgId: string, runId: string) {
    return this.readOrg(orgId).quotes.filter((q) => q.runId === runId).sort((a, b) => b.revision - a.revision);
  }

  async saveQuoteDraft(orgId: string, runId: string, input: { quoteId?: string; content: QuoteContent }) {
    const parsed = QuoteContentSchema.safeParse(input.content);
    if (!parsed.success) throw new ValidationFailedError({ quote: parsed.error.issues[0]?.message ?? 'ההצעה אינה תקינה' });
    const content = parsed.data;
    const total = quoteTotals(content).total;
    return this.mutate(orgId, (d) => {
      const run = this.findRun(d, runId);
      if (run.status === 'cancelled' || run.status === 'rejected') throw new DomainRuleError('הבקשה סגורה');
      const at = nowIso();
      if (input.quoteId) {
        const q = d.quotes.find((x) => x.id === input.quoteId && x.runId === runId);
        if (!q || q.status !== 'draft') throw new DomainRuleError('ההצעה השתנתה. רעננו ונסו שוב.');
        Object.assign(q, { content, total, lockVersion: q.lockVersion + 1, updatedAt: at });
        return q;
      }
      if (d.quotes.some((x) => x.runId === runId && x.status === 'draft')) throw new DomainRuleError('כבר יש טיוטת הצעה לבקשה הזו');
      const revision = Math.max(0, ...d.quotes.filter((x) => x.runId === runId).map((x) => x.revision)) + 1;
      const q: QuoteRecord = { id: newId('quo'), orgId, runId, revision, status: 'draft', content, total, lockVersion: 0, createdAt: at, updatedAt: at };
      d.quotes.push(q);
      return q;
    });
  }

  async sendQuote(orgId: string, quoteId: string) {
    return this.mutate(orgId, (d) => {
      const q = d.quotes.find((x) => x.id === quoteId);
      if (!q || q.status !== 'draft') throw new DomainRuleError('ההצעה השתנתה. רעננו ונסו שוב.');
      const run = this.findRun(d, q.runId);
      if (run.status === 'cancelled' || run.status === 'rejected') throw new DomainRuleError('הבקשה סגורה');
      const content = QuoteContentSchema.parse(q.content);
      if (content.validUntil && content.validUntil < isoDay()) throw new DomainRuleError('תאריך התוקף של ההצעה כבר עבר');
      const at = nowIso();
      for (const other of d.quotes) if (other.runId === q.runId && (other.status === 'sent' || other.status === 'changes_requested')) other.status = 'superseded';
      Object.assign(q, { status: 'sent', sentAt: at, lockVersion: q.lockVersion + 1, updatedAt: at });
      this.event(d, run, { type: 'quote_sent', actor: 'owner', message: `נשלחה הצעת מחיר: ${content.title}` });
      return q;
    });
  }

  async withdrawQuote(orgId: string, quoteId: string) {
    return this.mutate(orgId, (d) => {
      const q = d.quotes.find((x) => x.id === quoteId);
      if (!q || !['draft', 'sent', 'changes_requested'].includes(q.status)) throw new DomainRuleError('אי אפשר לבטל את ההצעה הזו');
      const wasSent = Boolean(q.sentAt);
      Object.assign(q, { status: 'withdrawn', lockVersion: q.lockVersion + 1, updatedAt: nowIso() });
      if (wasSent) this.event(d, this.findRun(d, q.runId), { type: 'quote_withdrawn', actor: 'owner', message: 'הצעת המחיר בוטלה' });
      return q;
    });
  }

  // ---------- the customer's request page (demo: this browser only) ----------

  private demoAccess(access: string): { slug: string; runId: string } | null {
    const m = /^demo~([a-z0-9-]+)~([A-Za-z0-9_-]+)$/.exec(access);
    return m ? { slug: m[1]!, runId: m[2]! } : null;
  }

  async shareRequestLink(orgId: string, runId: string) {
    return this.mutate(orgId, (d) => {
      const run = this.findRun(d, runId);
      const wf = this.findWorkflow(d, run.workflowId);
      this.event(d, run, { type: 'link_shared', actor: 'owner', message: 'נוצר קישור לעמוד הבקשה של הלקוח', internal: true });
      return trackPath(`demo~${wf.slug}~${run.id}`);
    });
  }

  async revokeRequestLinks(): Promise<void> {
    throw new DomainRuleError('בדמו הקישור לעמוד הבקשה קבוע ונשמר רק בדפדפן הזה.');
  }

  async customerAccess(slug: string, runId: string) {
    return (await this.getPublicRun(slug, runId)) ? `demo~${slug}~${runId}` : null;
  }

  async trackRequest(access: string): Promise<TrackView | null> {
    const ref = this.demoAccess(access);
    const found = ref && (await this.getPublicRun(ref.slug, ref.runId));
    if (!ref || !found) return null;
    const d = this.readOrg(found.run.orgId);
    const { run, version } = found;
    const today = isoDay();
    const shown = ['submitted', 'resubmitted', 'status_changed', 'action_created', 'action_responded', 'quote_sent', 'quote_decided', 'quote_withdrawn'];
    return {
      access,
      business: { name: d.organization.name, description: d.brandKit.description || undefined, links: d.brandKit.links },
      workflow: { slug: ref.slug, title: version.config.title, design: version.design, booking: Boolean(version.config.booking?.enabled) },
      request: {
        id: run.id,
        reference: run.reference,
        status: run.status,
        createdAt: run.submittedAt ?? run.createdAt,
        answers: run.answers,
        priceLines: run.priceLines,
        total: run.total,
        cancellable: ['submitted', 'in_review', 'changes_requested'].includes(run.status),
      },
      timeline: d.events
        .filter((e) => e.runId === run.id && !e.internal && shown.includes(e.type))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((e) => ({ type: e.type === 'status_changed' ? `status:${e.to ?? ''}` : e.type, at: e.createdAt })),
      actions: d.actions
        .filter((a) => a.runId === run.id && a.status !== 'cancelled')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((a) => ({ ...a, status: actionStatus(a) })),
      quotes: d.quotes
        .filter((q) => q.runId === run.id && q.status !== 'draft' && q.status !== 'withdrawn')
        .sort((a, b) => b.revision - a.revision)
        .map((q) => {
          const content = QuoteContentSchema.parse(q.content);
          return {
            id: q.id,
            revision: q.revision,
            content,
            totals: quoteTotals(content),
            sentAt: q.sentAt,
            validUntil: content.validUntil,
            decidedAt: q.decidedAt,
            status: q.status === 'sent' && content.validUntil && content.validUntil < today ? 'expired' : q.status,
            decision: q.decision && { decision: q.decision.decision, selections: q.decision.selections, comment: q.decision.comment, total: q.decision.total },
          };
        }),
    };
  }

  async respondTracked(access: string, actionId: string, optionId: string) {
    const ref = this.demoAccess(access);
    if (!ref) throw new NotFoundError('Run');
    const action = (await this.getPublicActions(ref.slug, ref.runId)).find((a) => a.id === actionId);
    // The same answer again is a harmless retry, as on the server.
    if (action?.status === 'responded' && action.response?.optionId === optionId) return;
    await this.respondToAction(ref.slug, ref.runId, actionId, optionId);
  }

  async decideQuote(access: string, quoteId: string, input: QuoteDecisionInput) {
    const ref = this.demoAccess(access);
    const found = ref && (await this.getPublicRun(ref.slug, ref.runId));
    if (!found) throw new NotFoundError('Run');
    if (input.decision === 'changes_requested' && !input.comment?.trim()) throw new ValidationFailedError({ comment: 'כתבו מה לשנות' });
    this.mutate(found.run.orgId, (d) => {
      const q = d.quotes.find((x) => x.id === quoteId && x.runId === found.run.id);
      if (!q || q.status === 'draft' || q.status === 'withdrawn') throw new NotFoundError('Quote');
      if (q.decision?.key === input.key) return;
      if (q.status !== 'sent') throw new DomainRuleError('ההצעה הזו כבר אינה פתוחה להחלטה');
      const content = QuoteContentSchema.parse(q.content);
      if (content.validUntil && content.validUntil < isoDay()) throw new DomainRuleError('תוקף ההצעה פג. פנו לעסק להצעה מעודכנת.');
      let total: number;
      try {
        total = quoteTotals(content, input.decision === 'approved' ? input.selections : {}).total;
      } catch {
        throw new DomainRuleError('הבחירה אינה תואמת את ההצעה');
      }
      const at = nowIso();
      const comment = input.comment?.trim() || undefined;
      Object.assign(q, {
        status: input.decision,
        decidedAt: at,
        lockVersion: q.lockVersion + 1,
        updatedAt: at,
        decision: { decision: input.decision, selections: input.decision === 'approved' ? input.selections : {}, comment, total, key: input.key },
      });
      const run = this.findRun(d, q.runId);
      const verb = input.decision === 'approved' ? 'אישר/ה את' : input.decision === 'declined' ? 'דחה/תה את' : 'ביקש/ה שינויים ב';
      this.event(d, run, { type: 'quote_decided', actor: 'customer', message: `הלקוח/ה ${verb}הצעת המחיר${comment ? ` — ${comment}` : ''}` });
      if (input.decision === 'approved' && ['submitted', 'in_review', 'changes_requested'].includes(run.status)) {
        const from = run.status;
        run.status = 'approved';
        run.updatedAt = at;
        const version = d.versions.find((v) => v.id === run.versionId);
        if (version) run.payment = paymentOnApproval(version.config, run.payment, at);
        this.event(d, run, { type: 'status_changed', actor: 'customer', from, to: 'approved', message: 'הבקשה אושרה עם אישור הצעת המחיר' });
      }
    });
  }

  async cancelTracked(access: string) {
    const ref = this.demoAccess(access);
    const found = ref && (await this.getPublicRun(ref.slug, ref.runId));
    if (!ref || !found) throw new NotFoundError('Run');
    if (found.run.status === 'cancelled') return;
    this.mutate(found.run.orgId, (d) => {
      const run = this.findRun(d, ref.runId);
      if (!['submitted', 'in_review', 'changes_requested'].includes(run.status)) throw new DomainRuleError('לא ניתן לבטל את הבקשה במצב הנוכחי');
      const from = run.status;
      run.status = 'cancelled';
      run.updatedAt = nowIso();
      for (const q of d.quotes) if (q.runId === run.id && q.status === 'sent') q.status = 'superseded';
      this.event(d, run, { type: 'status_changed', actor: 'customer', from, to: 'cancelled', message: 'הלקוח ביטל את הבקשה מעמוד הבקשה' });
    });
  }

  async listEvents(orgId: string, runId?: string) {
    return this.readOrg(orgId)
      .events.filter((e) => !runId || e.runId === runId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listNotifications(orgId: string, runId?: string) {
    return this.readOrg(orgId)
      .notifications.filter((n) => !runId || n.runId === runId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listUsage(orgId: string) {
    return this.readOrg(orgId).usage;
  }

  async trackUsage(orgId: string, type: UsageEvent['type'], workflowId?: string) {
    this.mutate(orgId, (d) => this.usage(d, type, workflowId));
  }

  // ---------- admin ----------

  async listMemberships(orgId: string) {
    return this.readOrg(orgId).memberships;
  }

  async exportWorkspace(orgId: string) {
    return structuredClone(this.readOrg(orgId));
  }

  async resetDemoData() {
    const keys: string[] = [];
    for (let i = 0; i < this.store.length; i++) {
      const k = this.store.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => this.store.removeItem(k));
    this.warnings = [];
    this.seedAll();
    this.emit();
  }

  async storageReport(): Promise<StorageReport> {
    let bytes = 0;
    let keys = 0;
    for (let i = 0; i < this.store.length; i++) {
      const k = this.store.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      keys++;
      bytes += (k.length + (this.store.getItem(k)?.length ?? 0)) * 2; // UTF-16
    }
    return { bytes, keys, approxQuotaBytes: 5 * 1024 * 1024, warnings: [...this.warnings] };
  }
}
