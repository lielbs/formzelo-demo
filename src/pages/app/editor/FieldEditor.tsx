import { ArrowDown, ArrowUp, ChevronDown, GitBranch, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, cx, FieldLabel, Input, Select } from '../../../components/ui';
import { CONDITION_OPERATORS, FIELD_TYPES, type Condition, type FieldType, type WorkflowField } from '../../../domain/schema';
import { OPERATOR_LABELS } from '../../../engine/conditions';
import { fieldHasPrice } from '../../../engine/pricing';
import { newId } from '../../../lib/id';

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'טקסט קצר',
  textarea: 'טקסט ארוך',
  email: 'אימייל',
  phone: 'טלפון',
  number: 'מספר',
  date: 'תאריך',
  select: 'רשימה נפתחת',
  radio: 'בחירה אחת (כרטיסים)',
  multiselect: 'בחירה מרובה',
  checkbox: 'תיבת סימון',
  decision: 'אישור / דחייה',
  file: 'קובץ (שם בלבד)',
  info: 'הודעת מידע',
};

const HAS_OPTIONS: FieldType[] = ['select', 'radio', 'multiselect'];
const HAS_FLAT_PRICE: FieldType[] = ['checkbox', 'decision', 'number'];
const VALUELESS_OPS: Condition['operator'][] = ['isTrue', 'isFalse', 'notEmpty', 'isEmpty'];

export function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function uniqueKey(existing: string[], base = 'field'): string {
  let i = existing.length + 1;
  while (existing.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

const parseNum = (v: string) => (v === '' ? undefined : Number(v));

function ConditionEditor({ field, others, onChange }: { field: WorkflowField; others: WorkflowField[]; onChange: (c?: Condition) => void }) {
  const c = field.condition;
  const source = others.find((f) => f.key === c?.fieldKey);
  if (!c) {
    return (
      <Button size="sm" variant="ghost" icon={GitBranch} disabled={!others.length} onClick={() => others[0] && onChange({ fieldKey: others[0].key, operator: 'notEmpty' })}>
        הוספת תנאי הצגה
      </Button>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-cloud-300 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <GitBranch className="h-3.5 w-3.5" aria-hidden /> הצג שדה זה רק אם:
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select aria-label="שדה מקור לתנאי" value={c.fieldKey} onChange={(e) => onChange({ ...c, fieldKey: e.target.value, value: undefined })}>
          {others.map((o) => (
            <option key={o.id} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select aria-label="אופרטור" value={c.operator} onChange={(e) => onChange({ ...c, operator: e.target.value as Condition['operator'] })}>
          {CONDITION_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </Select>
        {!VALUELESS_OPS.includes(c.operator) &&
          (source?.options?.length ? (
            <Select aria-label="ערך לתנאי" value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value })}>
              <option value="">בחרו ערך</option>
              {source.options.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input aria-label="ערך לתנאי" value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: ['gt', 'lt'].includes(c.operator) ? Number(e.target.value) : e.target.value })} />
          ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => onChange(undefined)}>
        הסרת התנאי
      </Button>
    </div>
  );
}

function OptionsEditor({ field, onChange, priced }: { field: WorkflowField; onChange: (f: WorkflowField) => void; priced: boolean }) {
  const options = field.options ?? [];
  const set = (opts: WorkflowField['options']) => onChange({ ...field, options: opts });
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-muted">אפשרויות</p>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Input aria-label={`תווית אפשרות ${i + 1}`} value={o.label} onChange={(e) => set(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} className="min-w-0 flex-1" />
            {priced && (
              <Input
                aria-label={`מחיר אפשרות ${i + 1}`}
                type="number"
                min={0}
                dir="ltr"
                placeholder="₪"
                value={o.price ?? ''}
                onChange={(e) => set(options.map((x) => (x.id === o.id ? { ...x, price: parseNum(e.target.value) } : x)))}
                className="w-24"
              />
            )}
            <div className="flex">
              <Button size="sm" variant="ghost" aria-label="העלאה" onClick={() => set(move(options, i, -1))} disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="הורדה" onClick={() => set(move(options, i, 1))} disabled={i === options.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" aria-label={`מחיקת ${o.label}`} onClick={() => set(options.filter((x) => x.id !== o.id))} disabled={options.length <= 1}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="secondary"
        icon={Plus}
        className="mt-2"
        onClick={() => {
          const values = options.map((o) => o.value);
          set([...options, { id: newId('opt'), label: `אפשרות ${options.length + 1}`, value: uniqueKey(values, 'option') }]);
        }}
      >
        אפשרות
      </Button>
    </div>
  );
}

export function FieldEditor({
  field,
  others,
  numericKeys,
  priced,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: {
  field: WorkflowField;
  others: WorkflowField[];
  numericKeys: WorkflowField[];
  priced: boolean;
  index: number;
  count: number;
  onChange: (f: WorkflowField) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `fe-${field.id}`;
  return (
    <li className={cx('rounded-xl border bg-white transition', open ? 'border-ink-soft shadow-card' : 'border-cloud-200')}>
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        >
          <ChevronDown className={cx('h-4 w-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{field.label}</span>
            <span className="flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
              {FIELD_TYPE_LABELS[field.type]}
              {field.required && <Badge tone="orange">חובה</Badge>}
              {fieldHasPrice(field) && <Badge tone="teal">מחיר</Badge>}
              {field.condition && <Badge tone="blue">מותנה</Badge>}
            </span>
          </span>
        </button>
        <Button size="sm" variant="ghost" aria-label="העלאת שדה" onClick={() => onMove(-1)} disabled={index === 0}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="הורדת שדה" onClick={() => onMove(1)} disabled={index === count - 1}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" aria-label={`מחיקת השדה ${field.label}`} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div id={id} className="space-y-4 border-t border-cloud-200 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor={`${id}-label`}>תווית</FieldLabel>
              <Input id={`${id}-label`} value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} />
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-type`}>סוג שדה</FieldLabel>
              <Select
                id={`${id}-type`}
                value={field.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  const needsOptions = HAS_OPTIONS.includes(type) && !field.options?.length;
                  onChange({
                    ...field,
                    type,
                    options: needsOptions ? [{ id: newId('opt'), label: 'אפשרות 1', value: 'option_1' }] : field.options,
                    required: type === 'info' ? false : field.required,
                  });
                }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel htmlFor={`${id}-help`}>{field.type === 'info' ? 'תוכן ההודעה' : 'טקסט עזרה / תיאור'}</FieldLabel>
            <Input id={`${id}-help`} value={field.helpText ?? ''} onChange={(e) => onChange({ ...field, helpText: e.target.value || undefined })} />
          </div>
          {['text', 'textarea', 'email', 'phone', 'number'].includes(field.type) && (
            <div>
              <FieldLabel htmlFor={`${id}-ph`}>טקסט מקום (placeholder)</FieldLabel>
              <Input id={`${id}-ph`} value={field.placeholder ?? ''} onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })} />
            </div>
          )}
          {field.type !== 'info' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
              שדה חובה
            </label>
          )}
          {HAS_OPTIONS.includes(field.type) && <OptionsEditor field={field} onChange={onChange} priced={priced} />}
          {priced && HAS_FLAT_PRICE.includes(field.type) && (
            <div>
              <FieldLabel htmlFor={`${id}-price`}>{field.type === 'number' ? 'מחיר ליחידה (₪)' : field.type === 'decision' ? 'מחיר אם מאושר (₪)' : 'מחיר אם מסומן (₪)'}</FieldLabel>
              <Input id={`${id}-price`} type="number" min={0} dir="ltr" className="w-40" value={field.price ?? ''} onChange={(e) => onChange({ ...field, price: parseNum(e.target.value) })} />
            </div>
          )}
          {priced && (HAS_OPTIONS.includes(field.type) || field.type === 'checkbox') && numericKeys.length > 0 && (
            <div>
              <FieldLabel htmlFor={`${id}-mult`}>הכפלת המחיר בערך של</FieldLabel>
              <Select id={`${id}-mult`} value={field.multiplyByKey ?? ''} onChange={(e) => onChange({ ...field, multiplyByKey: e.target.value || undefined })} className="max-w-xs">
                <option value="">ללא הכפלה</option>
                {numericKeys.map((n) => (
                  <option key={n.id} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {(field.type === 'number' || field.type === 'date') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor={`${id}-min`}>{field.type === 'date' ? 'מינימום (ימים מהיום)' : 'ערך מינימלי'}</FieldLabel>
                <Input id={`${id}-min`} type="number" dir="ltr" value={field.min ?? ''} onChange={(e) => onChange({ ...field, min: parseNum(e.target.value) })} />
              </div>
              <div>
                <FieldLabel htmlFor={`${id}-max`}>{field.type === 'date' ? 'מקסימום (ימים מהיום)' : 'ערך מקסימלי'}</FieldLabel>
                <Input id={`${id}-max`} type="number" dir="ltr" value={field.max ?? ''} onChange={(e) => onChange({ ...field, max: parseNum(e.target.value) })} />
              </div>
            </div>
          )}
          <ConditionEditor field={field} others={others} onChange={(condition) => onChange({ ...field, condition })} />
          <p className="text-[11px] text-ink-soft">
            מזהה פנימי: <code className="ltr">{field.key}</code>
          </p>
        </div>
      )}
    </li>
  );
}

export function FieldListEditor({
  fields,
  allFields,
  priced,
  onChange,
}: {
  fields: WorkflowField[];
  allFields: WorkflowField[];
  priced: boolean;
  onChange: (fields: WorkflowField[]) => void;
}) {
  const [newType, setNewType] = useState<FieldType>('text');
  const numeric = allFields.filter((f) => f.type === 'number');
  return (
    <div>
      {fields.length === 0 && <p className="rounded-xl bg-cloud p-3 text-center text-sm text-ink-muted">אין שדות עדיין. הוסיפו את הראשון.</p>}
      <ul className="space-y-2">
        {fields.map((f, i) => (
          <FieldEditor
            key={f.id}
            field={f}
            index={i}
            count={fields.length}
            priced={priced}
            numericKeys={numeric.filter((n) => n.key !== f.key)}
            others={allFields.filter((o) => o.key !== f.key && o.type !== 'info')}
            onChange={(nf) => onChange(fields.map((x) => (x.id === f.id ? nf : x)))}
            onMove={(dir) => onChange(move(fields, i, dir))}
            onDelete={() => {
              const dependents = allFields.filter((x) => x.condition?.fieldKey === f.key || x.multiplyByKey === f.key);
              const msg = dependents.length
                ? `השדה "${f.label}" משמש בתנאים או בחישוב של: ${dependents.map((d) => d.label).join(', ')}. למחוק בכל זאת?`
                : `למחוק את השדה "${f.label}"?`;
              if (window.confirm(msg)) onChange(fields.filter((x) => x.id !== f.id));
            }}
          />
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select aria-label="סוג שדה חדש" value={newType} onChange={(e) => setNewType(e.target.value as FieldType)} className="w-auto">
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Button
          size="md"
          variant="secondary"
          icon={Plus}
          onClick={() =>
            onChange([
              ...fields,
              {
                id: newId('fld'),
                key: uniqueKey(allFields.map((x) => x.key)),
                label: FIELD_TYPE_LABELS[newType],
                type: newType,
                required: false,
                options: HAS_OPTIONS.includes(newType) ? [{ id: newId('opt'), label: 'אפשרות 1', value: 'option_1' }] : undefined,
              },
            ])
          }
        >
          הוספת שדה
        </Button>
      </div>
    </div>
  );
}
