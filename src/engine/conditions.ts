import type { AnswerValue, Condition, WorkflowConfig, WorkflowField, WorkflowStep } from '../domain/schema';

/** Answers keyed by field.key — the runtime state of a run in progress. */
export type Values = Record<string, AnswerValue | undefined>;

function isEmptyValue(v: AnswerValue | undefined): boolean {
  return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

/**
 * Declarative condition evaluation. Operators form a closed set, so workflow
 * configuration can never run arbitrary code.
 */
export function evaluateCondition(cond: Condition | undefined, values: Values): boolean {
  if (!cond) return true;
  const v = values[cond.fieldKey];
  switch (cond.operator) {
    case 'equals':
      return String(v ?? '') === String(cond.value ?? '');
    case 'notEquals':
      return String(v ?? '') !== String(cond.value ?? '');
    case 'includes':
      return Array.isArray(v) ? v.includes(String(cond.value)) : String(v ?? '').includes(String(cond.value ?? ''));
    case 'isTrue':
      return v === true || v === 'approved';
    case 'isFalse':
      return !(v === true || v === 'approved');
    case 'notEmpty':
      return !isEmptyValue(v);
    case 'isEmpty':
      return isEmptyValue(v);
    case 'gt':
      return Number(v) > Number(cond.value);
    case 'lt':
      return Number(v) < Number(cond.value);
    default: {
      const exhaustive: never = cond.operator;
      return exhaustive;
    }
  }
}

export const isFieldVisible = (field: WorkflowField, values: Values) => evaluateCondition(field.condition, values);

export const visibleSteps = (config: WorkflowConfig, values: Values): WorkflowStep[] =>
  config.steps.filter((s) => evaluateCondition(s.condition, values));

export const visibleFields = (step: WorkflowStep, values: Values): WorkflowField[] =>
  step.fields.filter((f) => isFieldVisible(f, values));

/** All fields the customer can currently see, across visible steps. */
export function allVisibleFields(config: WorkflowConfig, values: Values): WorkflowField[] {
  return visibleSteps(config, values).flatMap((s) => visibleFields(s, values));
}

export const OPERATOR_LABELS: Record<Condition['operator'], string> = {
  equals: 'שווה ל',
  notEquals: 'שונה מ',
  includes: 'כולל',
  isTrue: 'מסומן / מאושר',
  isFalse: 'לא מסומן / נדחה',
  notEmpty: 'מולא',
  isEmpty: 'ריק',
  gt: 'גדול מ',
  lt: 'קטן מ',
};
