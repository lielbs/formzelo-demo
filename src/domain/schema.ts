/**
 * Formzelo domain schema — the single source of truth for every entity.
 * Types are inferred from Zod so runtime validation (localStorage parsing,
 * imports) and compile-time types can never drift apart.
 *
 * Workflow logic is 100% declarative: conditions, pricing and validation are
 * data interpreted by pure functions in src/engine. Nothing here is ever eval'd.
 */
import { z } from 'zod';
import { WorkflowThemeSchema } from './theme';

/**
 * Data schema version. v2 added Workflow.design / WorkflowVersion.design and
 * optional field presentation hints; v1 payloads are migrated on read
 * (src/data/migrations.ts). The localStorage key namespace stays `formzelo:v1:`.
 */
export const SCHEMA_VERSION = 2;

const id = z.string().min(1);
const timestamp = z.string().min(1); // ISO-8601

// ---------- Workflow configuration ----------

export const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'date',
  'select',
  'radio',
  'multiselect',
  'checkbox',
  'decision',
  'file',
  'info',
] as const;
export const FieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'includes',
  'isTrue',
  'isFalse',
  'notEmpty',
  'isEmpty',
  'gt',
  'lt',
] as const;
export const ConditionSchema = z.object({
  fieldKey: z.string().min(1),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number()]).optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const FieldOptionSchema = z.object({
  id,
  label: z.string().min(1),
  value: z.string().min(1),
  price: z.number().min(0).optional(),
  description: z.string().optional(),
  /** Key of a local illustration (see renderer/Illustration). Never a remote URL. */
  image: z.string().optional(),
  /** Visual swatch for palette-style options (hex color). */
  swatch: z.string().optional(),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

export const FIELD_APPEARANCES = ['auto', 'tiles', 'list', 'chips', 'swatches', 'stepper', 'card_preview'] as const;
export type FieldAppearance = (typeof FIELD_APPEARANCES)[number];

export const WorkflowFieldSchema = z.object({
  id,
  /** Stable machine key used by conditions, pricing and answers. */
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'key must be snake_case latin'),
  label: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(FieldOptionSchema).optional(),
  /** Flat price for checkbox (when checked) or decision (when approved). */
  price: z.number().min(0).optional(),
  /** Multiply this field's price by the numeric value of another field (e.g. per-guest menu). */
  multiplyByKey: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  image: z.string().optional(),
  condition: ConditionSchema.optional(),
  /**
   * Optional presentation hint. `auto` (or absent) lets the renderer pick from the
   * field type and data — e.g. a quantity stepper for a bounded number.
   */
  appearance: z.enum(FIELD_APPEARANCES).optional(),
  /** Urgency of a decision item (e.g. a repair). Business data, shown as a badge. */
  priority: z.enum(['critical', 'recommended', 'optional']).optional(),
  /** Marks the field that holds the customer's display name / contact in the inbox. */
  role: z.enum(['customer_name', 'customer_phone', 'customer_email', 'date']).optional(),
});
export type WorkflowField = z.infer<typeof WorkflowFieldSchema>;

export const WorkflowStepSchema = z.object({
  id,
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(WorkflowFieldSchema),
  condition: ConditionSchema.optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const FeeSchema = z.object({
  id,
  label: z.string().min(1),
  amount: z.number().min(0),
  condition: ConditionSchema.optional(),
});
export type Fee = z.infer<typeof FeeSchema>;

export const PricingConfigSchema = z.object({
  enabled: z.boolean(),
  currency: z.literal('ILS'),
  fees: z.array(FeeSchema).default([]),
  /** Simulated deposit requested after owner approval (0 = none). */
  depositPercent: z.number().min(0).max(100).default(0),
  /** Label shown above the total, e.g. "הערכת מחיר". */
  totalLabel: z.string().default('סה״כ'),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export const BrandingSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoText: z.string().min(1).max(40),
});
export type Branding = z.infer<typeof BrandingSchema>;

export const WorkflowConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  /** public: anyone with the link starts a run. case: owner creates a run first and sends a personal link. */
  mode: z.enum(['public', 'case']).default('public'),
  /** Owner-only fields filled when creating a case; shown read-only to the customer. */
  caseFields: z.array(WorkflowFieldSchema).default([]),
  steps: z.array(WorkflowStepSchema).min(1),
  pricing: PricingConfigSchema,
  branding: BrandingSchema,
  consent: z.object({ required: z.boolean(), text: z.string() }),
  disclaimer: z.string().optional(),
  successMessage: z.string().default('הבקשה התקבלה. נחזור אליכם בהקדם.'),
});
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// ---------- Entities ----------

export const OrganizationSchema = z.object({
  id,
  slug: z.string().min(1),
  name: z.string().min(1),
  industry: z.string(),
  tagline: z.string().default(''),
  brand: BrandingSchema,
  contactEmail: z.string().default(''),
  isDemo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const MembershipSchema = z.object({
  id,
  orgId: id,
  userName: z.string(),
  role: z.enum(['owner', 'staff']),
  /** Memberships are simulated: there is no real authentication in the demo. */
  simulated: z.literal(true),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Membership = z.infer<typeof MembershipSchema>;

export const WorkflowSchema = z.object({
  id,
  orgId: id,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(['draft', 'published', 'archived']),
  templateKey: z.string(),
  draft: WorkflowConfigSchema,
  /** Draft design, stored separately from the business config. */
  design: WorkflowThemeSchema,
  publishedVersionId: z.string().optional(),
  /** True when the draft has edits not yet published. */
  hasUnpublishedChanges: z.boolean().default(false),
  sourcePrompt: z.string().optional(),
  isDemo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** Immutable snapshot. Never mutated after creation. */
export const WorkflowVersionSchema = z.object({
  id,
  orgId: id,
  workflowId: id,
  version: z.number().int().positive(),
  config: WorkflowConfigSchema,
  /** Design frozen together with the config at publish time. */
  design: WorkflowThemeSchema,
  publishedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

export const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

export const RunAnswerSchema = z.object({
  fieldId: id,
  fieldKey: z.string(),
  label: z.string(),
  value: AnswerValueSchema,
  displayValue: z.string(),
});
export type RunAnswer = z.infer<typeof RunAnswerSchema>;

export const RUN_STATUSES = [
  'awaiting_customer',
  'submitted',
  'in_review',
  'changes_requested',
  'approved',
  'rejected',
  'completed',
  'cancelled',
] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const PaymentSchema = z.object({
  status: z.enum(['none', 'deposit_requested', 'deposit_paid_simulated']),
  amount: z.number().min(0),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const PriceLineSchema = z.object({ label: z.string(), amount: z.number() });
export type PriceLine = z.infer<typeof PriceLineSchema>;

export const WorkflowRunSchema = z.object({
  id,
  orgId: id,
  workflowId: id,
  /** A run is permanently bound to the published version it was started on. */
  versionId: id,
  versionNumber: z.number().int().positive(),
  reference: z.string(),
  status: RunStatusSchema,
  answers: z.array(RunAnswerSchema),
  caseAnswers: z.array(RunAnswerSchema).default([]),
  priceLines: z.array(PriceLineSchema).default([]),
  total: z.number().min(0),
  payment: PaymentSchema,
  customerName: z.string().default(''),
  customerContact: z.string().default(''),
  consentAt: z.string().optional(),
  submittedAt: z.string().optional(),
  isDemo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const RunEventSchema = z.object({
  id,
  orgId: id,
  runId: id,
  type: z.enum([
    'case_created',
    'submitted',
    'resubmitted',
    'status_changed',
    'note_added',
    'notification_simulated',
    'payment_simulated',
  ]),
  actor: z.enum(['customer', 'owner', 'system']),
  message: z.string(),
  from: RunStatusSchema.optional(),
  to: RunStatusSchema.optional(),
  /** Internal notes are visible only in the dashboard. */
  internal: z.boolean().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const NotificationPreviewSchema = z.object({
  id,
  orgId: id,
  runId: id,
  channel: z.enum(['email', 'sms', 'whatsapp']),
  audience: z.enum(['customer', 'owner']),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  /** Always true: the demo never sends real messages. */
  simulated: z.literal(true),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type NotificationPreview = z.infer<typeof NotificationPreviewSchema>;

export const UsageEventSchema = z.object({
  id,
  orgId: id,
  type: z.enum([
    'workflow_generated',
    'workflow_created',
    'workflow_published',
    'workflow_duplicated',
    'link_copied',
    'run_started',
    'run_submitted',
  ]),
  workflowId: z.string().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;

/** Everything stored for one workspace under its own localStorage key. */
export const OrgDataSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  organization: OrganizationSchema,
  memberships: z.array(MembershipSchema),
  workflows: z.array(WorkflowSchema),
  versions: z.array(WorkflowVersionSchema),
  runs: z.array(WorkflowRunSchema),
  events: z.array(RunEventSchema),
  notifications: z.array(NotificationPreviewSchema),
  usage: z.array(UsageEventSchema),
});
export type OrgData = z.infer<typeof OrgDataSchema>;

export const MetaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  orgIds: z.array(z.string()),
  activeOrgId: z.string().nullable(),
  /** Global public-slug index: slug -> orgId. Lets /f/:slug resolve without scanning. */
  slugIndex: z.record(z.string(), z.string()),
  seededAt: z.string(),
});
export type Meta = z.infer<typeof MetaSchema>;
