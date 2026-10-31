import type { PriceLine, WorkflowConfig, WorkflowField } from '../domain/schema';
import { allVisibleFields, evaluateCondition, type Values } from './conditions';

export interface PriceResult {
  lines: PriceLine[];
  total: number;
  deposit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function multiplier(field: WorkflowField, values: Values): number {
  if (!field.multiplyByKey) return 1;
  const n = Number(values[field.multiplyByKey]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fieldLines(field: WorkflowField, values: Values): PriceLine[] {
  const v = values[field.key];
  const m = multiplier(field, values);
  const suffix = field.multiplyByKey && m > 0 ? ` × ${m}` : '';
  switch (field.type) {
    case 'select':
    case 'radio': {
      const opt = field.options?.find((o) => o.value === v);
      return opt?.price ? [{ label: `${field.label}: ${opt.label}${suffix}`, amount: opt.price * m }] : [];
    }
    case 'multiselect': {
      const selected = Array.isArray(v) ? v : [];
      return (field.options ?? [])
        .filter((o) => selected.includes(o.value) && o.price)
        .map((o) => ({ label: `${o.label}${suffix}`, amount: (o.price ?? 0) * m }));
    }
    case 'checkbox':
      return v === true && field.price ? [{ label: `${field.label}${suffix}`, amount: field.price * m }] : [];
    case 'decision':
      return v === 'approved' && field.price ? [{ label: field.label, amount: field.price * m }] : [];
    case 'number': {
      const n = Number(v);
      return field.price && Number.isFinite(n) && n > 0
        ? [{ label: `${field.label} × ${n}`, amount: field.price * n }]
        : [];
    }
    default:
      return [];
  }
}

/**
 * Pure, declarative price calculation. Hidden fields never contribute,
 * so toggling a condition can't leave a stale charge behind.
 */
export function computePrice(config: WorkflowConfig, values: Values): PriceResult {
  if (!config.pricing.enabled) return { lines: [], total: 0, deposit: 0 };
  const lines: PriceLine[] = allVisibleFields(config, values).flatMap((f) => fieldLines(f, values));
  for (const fee of config.pricing.fees) {
    if (evaluateCondition(fee.condition, values)) lines.push({ label: fee.label, amount: fee.amount });
  }
  const normalized = lines.map((l) => ({ ...l, amount: round2(l.amount) }));
  const total = round2(normalized.reduce((sum, l) => sum + l.amount, 0));
  const deposit = round2((total * (config.pricing.depositPercent ?? 0)) / 100);
  return { lines: normalized, total, deposit };
}

/** True when the field participates in pricing — used to badge it in the editor. */
export function fieldHasPrice(field: WorkflowField): boolean {
  return Boolean(field.price) || Boolean(field.options?.some((o) => o.price));
}
