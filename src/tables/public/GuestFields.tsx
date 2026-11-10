/**
 * Guest detail fields of the booking and waitlist pages, in the order, groups and wording the
 * venue published. Built-in operational fields (name, phone) are always present; optional ones
 * can be hidden; additional questions are validated again by the server.
 */
import type { ReactNode } from 'react';
import { cx } from '../../components/ui';
import { defaultFields, LIMITS, type FieldGroup, type PageConfig, type PageField, type PageKind } from '../domain/publicPages';
import { tx, type Lang } from './i18n';

export type GuestValues = Record<string, string | boolean>;

export function inputCls(invalid: boolean) {
  return cx('fz-input h-12 w-full rounded-xl border bg-white px-3.5 text-[16px] text-ink', invalid ? 'border-red-400' : 'border-cloud-300');
}

export function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}{required && <span aria-hidden className="ms-1 text-[var(--fz-accent)]">*</span>}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** Label and hint of a field: the venue's wording, else the standard guest copy. */
export function fieldText(f: PageField, lang: Lang): { label: string; hint?: string } {
  const s = tx(lang);
  const std: Record<string, { label: string; hint?: string }> = {
    name: { label: s.name }, phone: { label: s.phone, hint: s.phoneHint }, email: { label: s.email },
    requests: { label: s.requests, hint: s.requestsHint }, notes: { label: s.notes, hint: s.notesHint },
  };
  const base = std[f.key] ?? { label: f.label ?? '' };
  return { label: f.label?.trim() || base.label, hint: f.hint?.trim() || base.hint };
}

const BUILTIN_MAX: Record<string, number> = { name: 120, phone: 24, email: 254, requests: 500, notes: 200 };

export function GuestFields({ kind, page, lang, values, onChange, errors, prefix, disabled }: {
  kind: PageKind;
  /** The published page; null = the standard page (flat list, standard wording). */
  page: PageConfig | null;
  lang: Lang;
  values: GuestValues;
  onChange: (key: string, value: string | boolean) => void;
  errors: Record<string, string>;
  prefix: string;
  disabled?: boolean;
}) {
  const fields = (page?.fields ?? defaultFields(kind)).filter((f) => !f.hidden);
  const render = (f: PageField) => {
    const id = `${prefix}-${f.key}`;
    const { label, hint } = fieldText(f, lang);
    const err = errors[f.key];
    const describedBy = [hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
    const str = typeof values[f.key] === 'string' ? (values[f.key] as string) : '';
    const common = { id, 'aria-invalid': !!err, 'aria-describedby': describedBy, disabled };
    if (f.kind === 'builtin') {
      const required = f.key === 'name' || f.key === 'phone';
      const max = BUILTIN_MAX[f.key] ?? 120;
      const input = f.key === 'phone'
        ? <input {...common} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={str} maxLength={max} onChange={(e) => onChange(f.key, e.target.value)} className={cx(inputCls(!!err), 'text-start')} />
        : f.key === 'email'
          ? <input {...common} type="email" autoComplete="email" dir="ltr" value={str} maxLength={max} onChange={(e) => onChange(f.key, e.target.value)} className={cx(inputCls(!!err), 'text-start')} />
          : f.key === 'requests' || f.key === 'notes'
            ? <textarea {...common} value={str} maxLength={max} onChange={(e) => onChange(f.key, e.target.value)} className={cx(inputCls(!!err), 'min-h-[88px] py-2.5')} />
            : <input {...common} autoComplete="name" value={str} maxLength={max} onChange={(e) => onChange(f.key, e.target.value)} className={inputCls(!!err)} />;
      return <Field key={f.key} id={id} label={label} hint={hint} error={err} required={required}>{input}</Field>;
    }
    if (f.kind === 'checkbox') {
      return (
        <div key={f.key}>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input {...common} type="checkbox" checked={values[f.key] === true} onChange={(e) => onChange(f.key, e.target.checked)}
              className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />
            <span>{label}{f.required && <span aria-hidden className="ms-1 text-[var(--fz-accent)]">*</span>}{f.required && <span className="sr-only"> ({tx(lang).requiredMark})</span>}</span>
          </label>
          {hint && <p id={`${id}-hint`} className="ms-9 text-xs text-ink-muted">{hint}</p>}
          {err && <p id={`${id}-err`} className="ms-9 mt-1 text-sm text-red-700">{err}</p>}
        </div>
      );
    }
    const input = f.kind === 'select'
      ? (
        <select {...common} value={str} required={f.required} onChange={(e) => onChange(f.key, e.target.value)} className="ui-select fz-input h-12 w-full rounded-xl border border-cloud-300 bg-white px-3 text-[16px]">
          <option value="">{tx(lang).choose}</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
      : f.kind === 'textarea'
        ? <textarea {...common} value={str} maxLength={LIMITS.answerTextarea} required={f.required} onChange={(e) => onChange(f.key, e.target.value)} className={cx(inputCls(!!err), 'min-h-[88px] py-2.5')} />
        : <input {...common} value={str} maxLength={LIMITS.answerText} required={f.required} onChange={(e) => onChange(f.key, e.target.value)} className={inputCls(!!err)} />;
    return <Field key={f.key} id={id} label={label} hint={hint} error={err} required={f.required}>{input}</Field>;
  };

  if (!page) return <>{fields.map(render)}</>;
  const groups: FieldGroup[] = ['contact', 'extra'];
  return (
    <>
      {groups.map((g) => {
        const list = fields.filter((f) => f.group === g);
        if (!list.length) return null;
        const title = page.copy.groupTitles?.[g];
        return (
          <section key={g} aria-label={title || undefined} className="pp-card grid gap-4 rounded-2xl border border-cloud-200 bg-white p-4 sm:p-5">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {list.map(render)}
          </section>
        );
      })}
    </>
  );
}
