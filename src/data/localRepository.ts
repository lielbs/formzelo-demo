/**
 * localStorage implementation of FormzeloRepository.
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
  MetaSchema,
  OrgDataSchema,
  SCHEMA_VERSION,
  WorkflowConfigSchema,
  type Meta,
  type OrgData,
  type Organization,
  type RunEvent,
  type RunStatus,
  type UsageEvent,
  type Workflow,
  type WorkflowConfig,
  type WorkflowRun,
  type WorkflowVersion,
} from '../domain/schema';
import { ASSET_LIMITS, AssetSchema, WorkflowThemeSchema, type Asset, type WorkflowTheme } from '../domain/theme';
import { recommendTheme } from '../theme/resolver';
import { migrateMeta, migrateOrgData } from './migrations';
import type { Values } from '../engine/conditions';
import { buildSubmission, caseLinkNotification, referencePrefix, statusNotification, submitNotifications } from '../engine/runs';
import { assertTransition, STATUS_LABELS } from '../engine/transitions';
import { toRunAnswers, validateFields, validateRun } from '../engine/validation';
import { newId, nowIso, slugify } from '../lib/id';
import {
  DomainRuleError,
  NotFoundError,
  StorageQuotaError,
  ValidationFailedError,
  type FormzeloRepository,
  type PublicWorkflow,
  type StorageReport,
} from './repository';
import { buildSeed } from './seed';

/** Storage namespace. Independent of SCHEMA_VERSION so migrations happen in place. */
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

export class LocalStorageRepository implements FormzeloRepository {
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
    console.warn(`[formzelo] ${reason}`);
  }

  private readMeta(): Meta {
    const { value, migrated } = migrateMeta(this.readJson(META_KEY));
    const parsed = MetaSchema.safeParse(value);
    if (parsed.success) {
      if (migrated) this.writeMeta(parsed.data);
      return parsed.data;
    }
    if (this.store.getItem(META_KEY) !== null) this.quarantine(META_KEY, 'נתוני המטא בדפדפן היו פגומים ואופסו לנתוני דמו.');
    return this.seedAll();
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
        this.backup(orgKey(orgId), 'pre-v2');
        this.write(orgKey(orgId), parsed.data);
        console.info(`[formzelo] migrated workspace ${orgId} to schema v${SCHEMA_VERSION}`);
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
      const d = OrgDataSchema.safeParse(this.readJson(orgKey(id)));
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
    const design = WorkflowThemeSchema.parse(
      input.design ??
        recommendTheme({ templateKey: input.templateKey, title: config.title, description: config.description, prompt: input.sourcePrompt, industry: organization.industry }).theme,
    );
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
        // The design is frozen with the version; later draft edits never reach it.
        design: structuredClone(WorkflowThemeSchema.parse(wf.design)),
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

  async submitRun(slug: string, input: { values: Values; consent: boolean; runId?: string }) {
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

      const errors = validateRun(config, input.values);
      if (Object.keys(errors).length) throw new ValidationFailedError(errors);
      if (config.consent.required && !input.consent) throw new ValidationFailedError({ __consent: 'יש לאשר כדי לשלוח' });

      const sub = buildSubmission(config, input.values, existing?.caseAnswers ?? []);
      const at = nowIso();
      let run: WorkflowRun;
      if (existing) {
        const from = existing.status;
        assertTransition(from, 'submitted');
        Object.assign(existing, {
          status: 'submitted' as RunStatus,
          answers: sub.answers,
          priceLines: sub.priceLines,
          total: sub.total,
          payment: { status: 'none', amount: sub.deposit },
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
          reference: `${referencePrefix(d.organization)}-${d.runs.length + 1001}`,
          status: 'submitted',
          answers: sub.answers,
          caseAnswers: [],
          priceLines: sub.priceLines,
          total: sub.total,
          payment: { status: 'none', amount: sub.deposit },
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
        reference: `${referencePrefix(d.organization)}-${d.runs.length + 1001}`,
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
      if (to === 'approved' && version && version.config.pricing.depositPercent > 0 && run.payment.amount > 0) {
        run.payment = { ...run.payment, status: 'deposit_requested' };
      }
      this.event(d, run, {
        type: 'status_changed',
        actor: 'owner',
        from,
        to,
        message: `הסטטוס שונה מ"${STATUS_LABELS[from]}" ל"${STATUS_LABELS[to]}"${message ? ` — ${message}` : ''}`,
      });
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

  async markDepositPaid(orgId: string, runId: string) {
    return this.mutate(orgId, (d) => {
      const run = this.findRun(d, runId);
      if (run.payment.status !== 'deposit_requested') throw new DomainRuleError('לא נדרשה מקדמה עבור בקשה זו');
      run.payment = { ...run.payment, status: 'deposit_paid_simulated' };
      run.updatedAt = nowIso();
      this.event(d, run, { type: 'payment_simulated', actor: 'owner', message: 'מקדמה סומנה כשולמה (סימולציה — לא בוצע תשלום)' });
      return run;
    });
  }

  // ---------- assets (local images) ----------

  private readAssets(orgId: string): Asset[] {
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
    return Object.fromEntries(this.readAssets(orgId).filter((a) => wanted.has(a.id)).map((a) => [a.id, a.dataUrl]));
  }

  async saveAsset(orgId: string, input: Pick<Asset, 'kind' | 'name' | 'mime' | 'dataUrl' | 'width' | 'height'>) {
    this.readOrg(orgId); // workspace must exist
    const bytes = Math.ceil((input.dataUrl.length - input.dataUrl.indexOf(',') - 1) * 0.75);
    const limit = ASSET_LIMITS[input.kind].maxBytes;
    if (bytes > limit) throw new DomainRuleError(`התמונה גדולה מדי גם לאחר הקטנה (${Math.round(bytes / 1024)}KB). המקסימום הוא ${Math.round(limit / 1024)}KB.`);
    const assets = this.readAssets(orgId);
    const total = assets.reduce((s, a) => s + a.bytes, 0);
    if (total + bytes > ASSET_LIMITS.totalBytes) throw new DomainRuleError('נגמר המקום לתמונות בסביבת עבודה זו בדמו. מחקו תמונות שאינן בשימוש.');
    const asset = AssetSchema.parse({ ...input, id: newId('ast'), orgId, bytes, createdAt: nowIso() });
    this.write(assetKey(orgId), { assets: [...assets, asset] });
    this.emit();
    return asset;
  }

  async deleteAsset(orgId: string, assetId: string) {
    const d = this.readOrg(orgId);
    const uses = (t: WorkflowTheme) => t.logo.assetId === assetId || t.hero.coverAssetId === assetId;
    // Published versions are immutable, so an image they reference can't be removed.
    if (d.versions.some((v) => uses(v.design))) throw new DomainRuleError('התמונה משמשת גרסה שפורסמה ולכן לא ניתן למחוק אותה.');
    if (d.workflows.some((w) => uses(w.design))) throw new DomainRuleError('התמונה משמשת טיוטה שמורה. הסירו אותה מהעיצוב ושמרו לפני מחיקה.');
    this.write(assetKey(orgId), { assets: this.readAssets(orgId).filter((a) => a.id !== assetId) });
    this.emit();
  }

  // ---------- activity ----------

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
