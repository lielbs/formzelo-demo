/**
 * Per-option places (e.g. "up to 30 participants per track").
 *
 * Like booking availability, usage is counted from submissions stored in THIS
 * browser. It is a demo aid and cannot stop two devices from taking the last
 * place; production would enforce it transactionally on the server.
 */
import type { WorkflowConfig, WorkflowRun } from '../domain/schema';
import { HOLDS_CAPACITY } from './booking';
import { allVisibleFields, type Values } from './conditions';
import type { FieldErrors } from './validation';

/** fieldKey → option value → places taken. */
export type OptionUsage = Record<string, Record<string, number>>;

const limitedFields = (config: WorkflowConfig) =>
  config.steps.flatMap((s) => s.fields).filter((f) => (f.type === 'radio' || f.type === 'select') && f.options?.some((o) => o.capacity));

export const hasOptionCapacity = (config: WorkflowConfig) => limitedFields(config).length > 0;

export function optionUsage(config: WorkflowConfig, runs: WorkflowRun[], excludeRunId?: string): OptionUsage {
  const usage: OptionUsage = {};
  const holding = runs.filter((r) => r.id !== excludeRunId && HOLDS_CAPACITY.includes(r.status));
  for (const f of limitedFields(config)) {
    const counts: Record<string, number> = {};
    for (const r of holding) {
      const v = r.answers.find((a) => a.fieldKey === f.key)?.value;
      if (typeof v === 'string') counts[v] = (counts[v] ?? 0) + 1;
    }
    usage[f.key] = counts;
  }
  return usage;
}

export function placesLeft(capacity: number | undefined, used: number | undefined): number | null {
  return capacity ? Math.max(0, capacity - (used ?? 0)) : null;
}

/** Rejects a choice whose places are taken (locally known). */
export function validateOptionCapacity(config: WorkflowConfig, values: Values, usage: OptionUsage): FieldErrors {
  const errors: FieldErrors = {};
  const visible = new Set(allVisibleFields(config, values).map((f) => f.key));
  for (const f of limitedFields(config)) {
    if (!visible.has(f.key)) continue;
    const v = values[f.key];
    const opt = f.options?.find((o) => o.value === v);
    if (opt?.capacity && placesLeft(opt.capacity, usage[f.key]?.[opt.value]) === 0) {
      errors[f.key] = `"${opt.label}" מלא לפי ההרשמות שנשמרו בדפדפן זה. בחרו אפשרות אחרת.`;
    }
  }
  return errors;
}
