import { z } from 'zod';
import type { AnswerValue, RunAnswer, WorkflowConfig, WorkflowField } from '../domain/schema';
import { formatCurrency, formatDate, isoDay } from '../lib/format';
import { allVisibleFields, isFieldVisible, type Values } from './conditions';

export type FieldErrors = Record<string, string>;

const REQUIRED = 'שדה חובה';
const PHONE_RE = /^0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/;

/**
 * Builds a Zod validator for one field from its declarative config.
 * Date `min`/`max` mean "days from today"; number `min`/`max` are value bounds.
 */
export function fieldValidator(field: WorkflowField, today = new Date()): z.ZodType<unknown> {
  const req = field.required;
  switch (field.type) {
    case 'info':
      return z.any();
    case 'email': {
      const s = z.string().trim().email('כתובת אימייל לא תקינה');
      return req ? s : z.union([z.literal(''), s]).optional();
    }
    case 'phone': {
      const s = z.string().trim().regex(PHONE_RE, 'מספר טלפון לא תקין (לדוגמה 050-1234567)');
      return req ? s : z.union([z.literal(''), s]).optional();
    }
    case 'number': {
      let n = z.coerce.number({ message: 'יש להזין מספר' });
      if (field.min !== undefined) n = n.min(field.min, `מינימום ${field.min}`);
      if (field.max !== undefined) n = n.max(field.max, `מקסימום ${field.max}`);
      return z.preprocess((v) => (v === '' || v === null ? undefined : v), req ? n : n.optional());
    }
    case 'date': {
      let s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'יש לבחור תאריך');
      if (field.min !== undefined) {
        const minDay = isoDay(field.min, today);
        s = s.refine((v) => v >= minDay, `התאריך המוקדם ביותר: ${formatDate(minDay)}`);
      }
      if (field.max !== undefined) {
        const maxDay = isoDay(field.max, today);
        s = s.refine((v) => v <= maxDay, `התאריך המאוחר ביותר: ${formatDate(maxDay)}`);
      }
      return req ? s : z.union([z.literal(''), s]).optional();
    }
    case 'select':
    case 'radio': {
      const allowed = (field.options ?? []).map((o) => o.value);
      const s = z.string().refine((v) => allowed.includes(v), 'יש לבחור אפשרות');
      return req ? s : z.union([z.literal(''), s]).optional();
    }
    case 'multiselect': {
      const allowed = (field.options ?? []).map((o) => o.value);
      let a = z.array(z.string().refine((v) => allowed.includes(v), 'אפשרות לא חוקית'));
      if (req) a = a.min(1, 'יש לבחור לפחות אפשרות אחת');
      if (field.max !== undefined) a = a.max(field.max, `ניתן לבחור עד ${field.max}`);
      return req ? a : a.optional();
    }
    case 'checkbox':
      return req ? z.literal(true, { message: 'יש לסמן כדי להמשיך' }) : z.boolean().optional();
    case 'decision': {
      const s = z.enum(['approved', 'declined'], { message: 'יש לאשר או לדחות' });
      return req ? s : s.optional();
    }
    case 'file':
    case 'text':
    case 'textarea':
    default: {
      // For text fields `max` is the maximum length in characters.
      let s = z.string().trim();
      if (field.max !== undefined) s = s.max(field.max, `עד ${field.max} תווים`);
      return req ? s.min(1, REQUIRED) : s.optional();
    }
  }
}

/** Validates the given (visible) fields. Hidden fields are skipped entirely. */
export function validateFields(fields: WorkflowField[], values: Values, today = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of fields) {
    if (field.type === 'info' || !isFieldVisible(field, values)) continue;
    const raw = values[field.key];
    if (field.required && (raw === undefined || raw === null || raw === '')) {
      errors[field.key] = field.type === 'decision' ? 'יש לאשר או לדחות' : field.type === 'checkbox' ? 'יש לסמן כדי להמשיך' : REQUIRED;
      continue;
    }
    const res = fieldValidator(field, today).safeParse(raw);
    if (!res.success) errors[field.key] = res.error.issues[0]?.message ?? 'ערך לא תקין';
  }
  return errors;
}

export function validateRun(config: WorkflowConfig, values: Values, today = new Date()): FieldErrors {
  return validateFields(allVisibleFields(config, values), values, today);
}

export function displayValue(field: WorkflowField, value: AnswerValue | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  switch (field.type) {
    case 'select':
    case 'radio': {
      const o = field.options?.find((x) => x.value === value);
      return o ? (o.price ? `${o.label} (${formatCurrency(o.price)})` : o.label) : String(value);
    }
    case 'multiselect':
      return Array.isArray(value) && value.length
        ? value.map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(', ')
        : '—';
    case 'checkbox':
      return value === true ? 'כן' : 'לא';
    case 'decision':
      return value === 'approved' ? 'אושר' : value === 'declined' ? 'נדחה' : '—';
    case 'date':
      return formatDate(String(value));
    default:
      return String(value);
  }
}

/** Serializes visible answers into RunAnswer records with human-readable values. */
export function toRunAnswers(fields: WorkflowField[], values: Values): RunAnswer[] {
  return fields
    .filter((f) => f.type !== 'info' && isFieldVisible(f, values))
    .map((f) => {
      const v = values[f.key];
      return {
        fieldId: f.id,
        fieldKey: f.key,
        label: f.label,
        value: v === undefined ? null : v,
        displayValue: displayValue(f, v),
      };
    });
}

export function answersToValues(answers: RunAnswer[]): Values {
  return Object.fromEntries(answers.map((a) => [a.fieldKey, a.value ?? undefined]));
}
