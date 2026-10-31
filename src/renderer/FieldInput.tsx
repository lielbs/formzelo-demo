import { AlertCircle, CalendarDays, Check, FileUp, Info, Minus, Plus, X } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { AnswerValue, WorkflowField } from '../domain/schema';
import type { Values } from '../engine/conditions';
import { formatCurrency, isoDay } from '../lib/format';
import { hasArt, inferArt, OptionArt } from '../theme/art';
import { resolveAppearance } from './appearance';

interface Props {
  field: WorkflowField;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  onBlur?: () => void;
  error?: string;
  /** Infer local illustrations for options without an explicit image. */
  optionArt?: boolean;
  /** All current answers — lets previews (e.g. a greeting card) show related values. */
  values?: Values;
}

const inputId = (key: string) => `f-${key}`;
export const fieldDomId = inputId;

const PRIORITY_LABELS = { critical: 'בטיחותי — מומלץ בחום', recommended: 'מומלץ', optional: 'לבחירתך' } as const;

function Help({ field, error }: { field: WorkflowField; error?: string }) {
  return (
    <>
      {field.helpText && field.type !== 'decision' && (
        <p id={`${inputId(field.key)}-help`} className="fz-help">
          {field.helpText}
        </p>
      )}
      {error && (
        <p id={`${inputId(field.key)}-err`} role="alert" className="fz-error">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </>
  );
}

const describedBy = (f: WorkflowField, error?: string) =>
  [f.helpText && `${inputId(f.key)}-help`, error && `${inputId(f.key)}-err`].filter(Boolean).join(' ') || undefined;

function Label({ field, htmlFor }: { field: WorkflowField; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="fz-label">
      {field.label}
      {field.required && (
        <span className="fz-req" aria-hidden>
          *
        </span>
      )}
      {field.required && <span className="fz-sr"> (שדה חובה)</span>}
    </label>
  );
}

function ArtFigure({ name, className }: { name: string; className: string }) {
  return (
    <span className={className}>
      <OptionArt name={name} />
      <span className="fz-art-caption">איור להמחשה</span>
    </span>
  );
}

function hebrewDate(iso: string): string | null {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function FieldInput({ field, value, onChange, onBlur, error, optionArt = true, values = {} }: Props) {
  const id = inputId(field.key);
  const appearance = resolveAppearance(field, optionArt);
  const aria = { id, onBlur, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy(field, error), 'aria-required': field.required || undefined };
  const wrap = (children: ReactNode) => <div className="fz-field">{children}</div>;

  switch (field.type) {
    case 'info':
      return (
        <div className="fz-note fz-field" role="note">
          <Info className="mt-0.5 h-4 w-4 shrink-0 fz-ink" aria-hidden />
          <div>
            <p className="font-semibold">{field.label}</p>
            {field.helpText && <p className="mt-0.5 fz-muted">{field.helpText}</p>}
          </div>
        </div>
      );

    case 'textarea': {
      const text = String(value ?? '');
      const max = field.max ?? 1000;
      const sender = values.sender ?? values.name ?? values.full_name;
      return wrap(
        <>
          <Label field={field} htmlFor={id} />
          <textarea {...aria} className="fz-control" rows={appearance === 'card_preview' ? 3 : 4} value={text} placeholder={field.placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} />
          <p className="fz-counter" data-near={text.length > max * 0.9} aria-live="polite">
            {text.length}/{max}
          </p>
          {appearance === 'card_preview' && (
            <figure className="fz-cardpreview" aria-label="תצוגה מקדימה של הכרטיס">
              <span className="fz-cardpreview-tag">תצוגת הכרטיס</span>
              <p className="fz-cardpreview-text" data-empty={!text.trim()}>
                {text.trim() || field.placeholder || 'כאן תופיע הברכה שלכם'}
              </p>
              {typeof sender === 'string' && sender.trim() && <figcaption className="fz-cardpreview-sign">באהבה, {sender}</figcaption>}
            </figure>
          )}
          <Help field={field} error={error} />
        </>,
      );
    }

    case 'select':
      return wrap(
        <>
          <Label field={field} htmlFor={id} />
          <select {...aria} className="fz-control" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
            <option value="">בחרו…</option>
            {field.options?.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
                {o.price ? ` — ${formatCurrency(o.price)}` : ''}
              </option>
            ))}
          </select>
          <Help field={field} error={error} />
        </>,
      );

    case 'radio':
    case 'multiselect': {
      const multi = field.type === 'multiselect';
      const selected = multi ? (Array.isArray(value) ? value : []) : value;
      const opts = field.options ?? [];
      const kind = appearance === 'tiles' ? 'tile' : appearance === 'chips' ? 'chip' : appearance === 'swatches' ? 'swatch' : 'row';
      return (
        <fieldset className="fz-field" aria-describedby={describedBy(field, error)} aria-invalid={Boolean(error) || undefined}>
          <legend className="fz-label fz-legend">
            {field.label}
            {field.required && (
              <span className="fz-req" aria-hidden>
                *
              </span>
            )}
            {multi && <span className="fz-muted text-xs font-normal"> · אפשר לבחור כמה</span>}
          </legend>
          <div
            className="fz-options"
            data-appearance={appearance === 'default' ? 'list' : appearance}
            data-invalid={Boolean(error) || undefined}
            // Balanced grids: 4 → 2×2, 3/6 → rows of 3, never a lonely orphan tile.
            style={{ '--cols': opts.length % 3 === 0 ? 3 : opts.length >= 7 ? 4 : 2 } as CSSProperties}
            // Options with descriptions read better as horizontal cards on phones.
            data-rich={opts.some((o) => o.description) || undefined}
            id={id}
            tabIndex={-1}
          >
            {opts.map((o, i) => {
              const checked = multi ? (selected as string[]).includes(o.value) : selected === o.value;
              const art = kind === 'tile' ? (optionArt ? inferArt(field, o, i, opts.length) : hasArt(o.image) ? o.image : undefined) : undefined;
              const price = o.price ? (
                <span className="fz-opt-price">
                  {formatCurrency(o.price)}
                  {field.multiplyByKey && <span className="fz-opt-unit"> / לאדם</span>}
                </span>
              ) : null;
              const input = (
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={field.key}
                  value={o.value}
                  checked={checked}
                  onBlur={onBlur}
                  onChange={() => {
                    if (!multi) return onChange(o.value);
                    const arr = selected as string[];
                    onChange(checked ? arr.filter((x) => x !== o.value) : [...arr, o.value]);
                  }}
                />
              );
              if (kind === 'tile') {
                return (
                  <label key={o.id} className="fz-option" data-kind="tile">
                    {input}
                    {art ? <ArtFigure name={art} className="fz-tile-art" /> : null}
                    <span className="fz-tile-check" aria-hidden>
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span className="fz-opt-body">
                      <span className="fz-opt-label">{o.label}</span>
                      {o.description && <span className="fz-opt-desc">{o.description}</span>}
                      {price && <span className="fz-tile-foot">{price}</span>}
                    </span>
                  </label>
                );
              }
              if (kind === 'chip') {
                return (
                  <label key={o.id} className="fz-option" data-kind="chip">
                    {input}
                    <span className="fz-opt-label">{o.label}</span>
                    {price}
                  </label>
                );
              }
              return (
                <label key={o.id} className="fz-option" data-kind={kind}>
                  {input}
                  {kind === 'swatch' ? (
                    <span className="fz-swatch" style={{ background: o.swatch ?? 'var(--fz-surface-alt)' }} aria-hidden />
                  ) : (
                    <span className="fz-indicator" data-shape={multi ? 'box' : 'circle'} aria-hidden />
                  )}
                  <span className="fz-opt-body">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="fz-opt-label">{o.label}</span>
                      {price}
                    </span>
                    {o.description && <span className="fz-opt-desc">{o.description}</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <Help field={field} error={error} />
        </fieldset>
      );
    }

    case 'checkbox': {
      const art = optionArt ? inferArt(field) : hasArt(field.image) ? field.image : undefined;
      return wrap(
        <>
          <label className="fz-option fz-check" data-kind="row">
            <input id={id} type="checkbox" checked={value === true} onBlur={onBlur} onChange={(e) => onChange(e.target.checked)} aria-describedby={describedBy(field, error)} aria-invalid={Boolean(error) || undefined} />
            <span className="fz-indicator" data-shape="box" aria-hidden />
            {art && art !== 'generic_tool' && (
              <span className="fz-check-art" aria-hidden>
                <OptionArt name={art} />
              </span>
            )}
            <span className="fz-opt-body">
              <span className="flex items-baseline justify-between gap-2">
                <span className="fz-opt-label">
                  {field.label}
                  {field.required && (
                    <span className="fz-req" aria-hidden>
                      *
                    </span>
                  )}
                </span>
                {field.price ? <span className="fz-opt-price">+{formatCurrency(field.price)}{field.multiplyByKey && <span className="fz-opt-unit"> / לאדם</span>}</span> : null}
              </span>
              {field.helpText && <span className="fz-opt-desc">{field.helpText}</span>}
            </span>
          </label>
          {error && (
            <p role="alert" className="fz-error">
              <AlertCircle className="h-4 w-4" aria-hidden /> {error}
            </p>
          )}
        </>,
      );
    }

    case 'decision':
      return <DecisionCard field={field} value={value} onChange={onChange} onBlur={onBlur} error={error} optionArt={optionArt} />;

    case 'file':
      return <FileDrop field={field} value={value} onChange={onChange} error={error} />;

    case 'number':
      if (appearance === 'stepper') {
        const n = typeof value === 'number' ? value : value === '' || value === undefined || value === null ? undefined : Number(value);
        const min = field.min ?? 0;
        const max = field.max ?? Number.MAX_SAFE_INTEGER;
        const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
        return wrap(
          <>
            <Label field={field} htmlFor={id} />
            <div className="fz-qty" data-invalid={Boolean(error) || undefined} dir="ltr">
              <button type="button" aria-label={`הפחתת ${field.label}`} disabled={n !== undefined && n <= min} onClick={() => set((n ?? min) - 1)}>
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <input
                {...aria}
                type="number"
                inputMode="numeric"
                min={field.min}
                max={field.max}
                value={n === undefined || Number.isNaN(n) ? '' : n}
                placeholder={String(min)}
                onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
              />
              <button type="button" aria-label={`הוספת ${field.label}`} disabled={n !== undefined && n >= max} onClick={() => set(n === undefined ? min : n + 1)}>
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <Help field={field} error={error} />
          </>,
        );
      }
      return <TextInput field={field} value={value} onChange={onChange} onBlur={onBlur} error={error} />;
    default:
      return <TextInput field={field} value={value} onChange={onChange} onBlur={onBlur} error={error} />;
  }
}

function TextInput({ field, value, onChange, onBlur, error }: Omit<Props, 'values' | 'optionArt'>) {
  const id = inputId(field.key);
  const htmlType = { email: 'email', phone: 'tel', number: 'number', date: 'date' }[field.type as string] ?? 'text';
  const ltr = ['email', 'phone', 'number', 'date'].includes(field.type);
  const isDate = field.type === 'date';
  const pretty = isDate && typeof value === 'string' && value ? hebrewDate(value) : null;
  return (
    <div className="fz-field">
      <Label field={field} htmlFor={id} />
      <div className="fz-input-wrap">
        {isDate && <CalendarDays className="fz-input-icon" aria-hidden />}
        <input
          id={id}
          onBlur={onBlur}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(field, error)}
          aria-required={field.required || undefined}
          className={isDate ? 'fz-control has-icon' : 'fz-control'}
          type={htmlType}
          dir={ltr ? 'ltr' : undefined}
          style={ltr ? { textAlign: 'right' } : undefined}
          inputMode={field.type === 'phone' ? 'tel' : field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email' : undefined}
          autoComplete={field.role === 'customer_name' ? 'name' : field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : undefined}
          placeholder={field.placeholder}
          min={field.type === 'number' ? field.min : isDate && field.min !== undefined ? isoDay(field.min) : undefined}
          max={field.type === 'number' ? field.max : isDate && field.max !== undefined ? isoDay(field.max) : undefined}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
        />
      </div>
      {pretty && <p className="fz-date-preview">{pretty}</p>}
      <Help field={field} error={error} />
    </div>
  );
}

function DecisionCard({ field, value, onChange, onBlur, error, optionArt }: Omit<Props, 'values'>) {
  const id = inputId(field.key);
  const art = optionArt ? inferArt(field) : hasArt(field.image) ? field.image : undefined;
  const state = value === 'approved' ? 'approved' : value === 'declined' ? 'declined' : 'pending';
  return (
    <fieldset className="fz-decision fz-field" data-state={state} data-invalid={Boolean(error) || undefined} aria-labelledby={`${id}-title`} aria-describedby={describedBy(field, error)}>
      <div className="fz-decision-top">
        {art && <ArtFigure name={art} className="fz-decision-art" />}
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span id={`${id}-title`} className="fz-decision-title">
              {field.label}
            </span>
            <span className="fz-decision-price">{formatCurrency(field.price ?? 0)}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {field.priority && (
              <span className="fz-badge" data-tone={field.priority}>
                {PRIORITY_LABELS[field.priority]}
              </span>
            )}
            <span className="fz-badge" data-tone={state === 'approved' ? 'success' : undefined} aria-live="polite">
              {state === 'approved' ? 'מאושר' : state === 'declined' ? 'נדחה' : 'ממתין להחלטה'}
            </span>
          </span>
          {field.helpText && (
            <p id={`${id}-help`} className="fz-help">
              {field.helpText}
            </p>
          )}
        </div>
      </div>
      <div className="fz-decision-actions" role="radiogroup" aria-label={`החלטה עבור ${field.label}`} id={id} tabIndex={-1}>
        {(
          [
            ['approved', 'אישור התיקון', Check],
            ['declined', 'לא עכשיו', X],
          ] as const
        ).map(([v, label, Icon]) => (
          <label key={v} className="fz-decide" data-v={v}>
            <input type="radio" name={field.key} value={v} checked={value === v} onChange={() => onChange(v)} onBlur={onBlur} />
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="fz-error">
          <AlertCircle className="h-4 w-4" aria-hidden /> {error}
        </p>
      )}
    </fieldset>
  );
}

function FileDrop({ field, value, onChange, error }: Pick<Props, 'field' | 'value' | 'onChange' | 'error'>) {
  const id = inputId(field.key);
  const [over, setOver] = useState(false);
  // Only metadata is kept. The file content never leaves the browser input.
  const accept = (f?: File) => onChange(f ? `${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)` : '');
  return (
    <div className="fz-field">
      <Label field={field} htmlFor={id} />
      <label
        className="fz-drop"
        data-over={over || undefined}
        data-invalid={Boolean(error) || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="fz-drop-icon" aria-hidden>
          <FileUp className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{value ? 'החלפת קובץ' : 'בחירת קובץ או גרירה לכאן'}</span>
          <span className="fz-help mt-0.5 block">בדמו נשמרים שם הקובץ וגודלו בלבד</span>
        </span>
        <input id={id} type="file" className="fz-sr" aria-describedby={describedBy(field, error)} aria-invalid={Boolean(error) || undefined} onChange={(e) => accept(e.target.files?.[0])} />
      </label>
      {value ? (
        <span className="fz-filechip">
          <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{String(value)}</span>
          <button type="button" aria-label={`הסרת הקובץ מ-${field.label}`} onClick={() => onChange('')}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ) : null}
      <Help field={field} error={error} />
    </div>
  );
}
