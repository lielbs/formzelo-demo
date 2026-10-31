import type { FieldAppearance, WorkflowField } from '../domain/schema';
import { inferArt } from '../theme/art';

/**
 * Picks the presentation for a field. An explicit `appearance` wins; `auto`
 * is decided from the field's own data so arbitrary generated workflows also
 * get sensible, rich controls. Presentation only — validation is unchanged.
 */
export function resolveAppearance(field: WorkflowField, optionArt: boolean): Exclude<FieldAppearance, 'auto'> | 'default' {
  if (field.appearance && field.appearance !== 'auto') return field.appearance;
  const opts = field.options ?? [];
  switch (field.type) {
    case 'radio':
    case 'multiselect': {
      if (opts.some((o) => o.swatch)) return 'swatches';
      const withArt = optionArt ? opts.filter((o, i) => inferArt(field, o, i, opts.length)).length : 0;
      if (opts.length > 0 && withArt >= Math.ceil(opts.length / 2)) return 'tiles';
      const short = opts.every((o) => o.label.length <= 18 && !o.description && !o.price);
      return short && opts.length <= 8 ? 'chips' : 'list';
    }
    case 'number':
      return field.min !== undefined && field.max !== undefined && field.max - field.min <= 500 ? 'stepper' : 'default';
    case 'textarea':
      return /ברכה|הקדשה|greeting/.test(`${field.label} ${field.key}`) ? 'card_preview' : 'default';
    default:
      return 'default';
  }
}
