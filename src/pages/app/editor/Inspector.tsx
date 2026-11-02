/**
 * Studio inspector panels. Every control edits the real WorkflowConfig, which
 * the canvas renders immediately through the generic renderer.
 */
import { ArrowDown, ArrowUp, CalendarPlus, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ImagePicker } from '../../../components/ImagePicker';
import { Badge, Button, cx, FieldLabel, Input, Select, Textarea } from '../../../components/ui';
import {
  COMPLETION_MODES,
  FIELD_TYPES,
  HIGHLIGHT_ICONS,
  isDisplayField,
  type Booking,
  type Completion,
  type Condition,
  type FieldAppearance,
  type FieldOption,
  type FieldType,
  type WorkflowConfig,
  type WorkflowField,
  type WorkflowStep,
} from '../../../domain/schema';
import type { Asset } from '../../../domain/theme';
import { WEEKDAY_LABELS } from '../../../engine/booking';
import { COMPLETION_LABELS, safeExternalUrl } from '../../../engine/completion';
import { OPERATOR_LABELS } from '../../../engine/conditions';
import { field as makeField, option as makeOption } from '../../../engine/templates';
import { PAYMENT_PROVIDERS } from '../../../integrations/payments';
import { newId } from '../../../lib/id';
import { ART_KEYS } from '../../../theme/art';
import { ConditionEditor, FIELD_TYPE_LABELS, move, uniqueKey } from './FieldEditor';

const APPEARANCE_LABELS: Record<FieldAppearance, string> = {
  auto: 'אוטומטי',
  tiles: 'אריחים עם איור',
  image_cards: 'כרטיסי תמונה',
  list: 'רשימה',
  chips: 'תגיות',
  swatches: 'דוגמיות צבע',
  stepper: 'כמות +/−',
  card_preview: 'תצוגת כרטיס ברכה',
};
const ART_LABELS: Record<string, string> = {
  bouquet_s: 'זר קטן',
  bouquet_m: 'זר בינוני',
  bouquet_l: 'זר שופע',
  bouquet_xl: 'זר פרימיום',
  menu_classic: 'צלחת קלאסית',
  menu_chef: 'מנות טעימה',
  menu_vegan: 'צלחת טבעונית',
  wine: 'יין',
  cake: 'עוגה',
  decor: 'עיצוב שולחן',
  dj: 'תקליט / DJ',
  private_room: 'חדר פרטי',
  gift: 'מתנה',
  brakes: 'בלמים',
  filter: 'פילטר',
  wipers: 'מגבים',
  generic_tool: 'כלי עבודה',
};
const ICON_LABELS: Record<(typeof HIGHLIGHT_ICONS)[number], string> = {
  sparkles: 'ניצוץ',
  truck: 'משלוח',
  leaf: 'עלה',
  shield: 'מגן',
  clock: 'שעון',
  heart: 'לב',
  star: 'כוכב',
  check: 'וי',
  wrench: 'מפתח',
  chef: 'שף',
  calendar: 'לוח שנה',
  phone: 'טלפון',
};
const HAS_OPTIONS: FieldType[] = ['select', 'radio', 'multiselect', 'time'];
const parseNum = (v: string) => (v === '' ? undefined : Number(v));

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MediaSelect({ value, onChange, images, label }: { value?: string; onChange: (v?: string) => void; images: Asset[]; label: string }) {
  return (
    <Select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className="text-xs">
      <option value="">ללא תמונה</option>
      <optgroup label="איורים מקומיים">
        {ART_KEYS.map((k) => (
          <option key={k} value={k}>
            {ART_LABELS[k] ?? k}
          </option>
        ))}
      </optgroup>
      {images.length > 0 && (
        <optgroup label="תמונות שהועלו">
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

function OptionRows({ f, onChange, priced, images }: { f: WorkflowField; onChange: (f: WorkflowField) => void; priced: boolean; images: Asset[] }) {
  const options = f.options ?? [];
  const set = (opts: FieldOption[]) => onChange({ ...f, options: opts });
  const patch = (id: string, p: Partial<FieldOption>) => set(options.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const rich = f.type !== 'time' && f.type !== 'select';
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-muted">{f.type === 'time' ? 'שעות אפשריות (HH:MM)' : 'אפשרויות'}</p>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={o.id} className="rounded-xl border border-cloud-200 p-2.5">
            <div className="flex items-center gap-1.5">
              <Input aria-label={`תווית אפשרות ${i + 1}`} value={o.label} onChange={(e) => patch(o.id, f.type === 'time' ? { label: e.target.value, value: e.target.value } : { label: e.target.value })} className="min-w-0 flex-1 !h-9" dir={f.type === 'time' ? 'ltr' : undefined} />
              {priced && f.type !== 'time' && (
                <Input aria-label={`מחיר אפשרות ${i + 1}`} type="number" min={0} dir="ltr" placeholder="₪" value={o.price ?? ''} onChange={(e) => patch(o.id, { price: parseNum(e.target.value) })} className="!h-9 w-20" />
              )}
              <Button size="sm" variant="ghost" aria-label="העלאה" disabled={i === 0} onClick={() => set(move(options, i, -1))}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="הורדה" disabled={i === options.length - 1} onClick={() => set(move(options, i, 1))}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" aria-label={`מחיקת ${o.label}`} disabled={options.length <= 1} onClick={() => set(options.filter((x) => x.id !== o.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {rich && (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                <Input aria-label={`תיאור אפשרות ${i + 1}`} placeholder="תיאור קצר (אופציונלי)" value={o.description ?? ''} onChange={(e) => patch(o.id, { description: e.target.value || undefined })} className="!h-9 text-xs" />
                {f.type === 'radio' && (
                  <Input
                    aria-label={`מספר מקומות לאפשרות ${i + 1}`}
                    type="number"
                    min={1}
                    dir="ltr"
                    placeholder="מקומות (ללא הגבלה)"
                    value={o.capacity ?? ''}
                    onChange={(e) => {
                      const n = parseNum(e.target.value);
                      patch(o.id, { capacity: n && n >= 1 ? Math.round(n) : undefined });
                    }}
                    className="!h-9 text-xs sm:col-span-2"
                  />
                )}
                {f.appearance === 'swatches' ? (
                  <div className="flex items-center gap-1.5">
                    <input type="color" aria-label={`צבע אפשרות ${i + 1}`} value={o.swatch ?? '#cccccc'} onChange={(e) => patch(o.id, { swatch: e.target.value.toUpperCase() })} className="h-9 w-10 rounded-lg border border-cloud-300 bg-white p-0.5" />
                    <span className="text-xs text-ink-muted" dir="ltr">
                      {o.swatch}
                    </span>
                  </div>
                ) : (
                  <MediaSelect label={`תמונה לאפשרות ${i + 1}`} value={o.image} onChange={(v) => patch(o.id, { image: v })} images={images} />
                )}
              </div>
            )}
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
          set([...options, f.type === 'time' ? makeOption('17:00', '17:00') : { id: newId('opt'), label: `אפשרות ${options.length + 1}`, value: uniqueKey(values, 'option') }]);
        }}
      >
        {f.type === 'time' ? 'שעה' : 'אפשרות'}
      </Button>
    </div>
  );
}

export function FieldInspector({
  f,
  allFields,
  earlier,
  priced,
  images,
  orgId,
  onChange,
  onDelete,
  onDuplicate,
}: {
  f: WorkflowField;
  allFields: WorkflowField[];
  /** Answerable fields before this one — the only valid condition sources. */
  earlier: WorkflowField[];
  priced: boolean;
  images: Asset[];
  orgId: string;
  onChange: (f: WorkflowField) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const id = `ins-${f.id}`;
  const display = isDisplayField(f);
  const numeric = allFields.filter((o) => o.type === 'number' && o.key !== f.key);
  const appearanceFor = (t: FieldType): FieldAppearance[] =>
    t === 'radio' || t === 'multiselect' ? ['auto', 'tiles', 'image_cards', 'list', 'chips', 'swatches'] : t === 'number' ? ['auto', 'stepper'] : t === 'textarea' ? ['auto', 'card_preview'] : [];
  const appearances = appearanceFor(f.type);

  return (
    <Panel
      title={FIELD_TYPE_LABELS[f.type]}
      actions={
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            שכפול
          </Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete}>
            מחיקה
          </Button>
        </div>
      }
    >
      <div>
        <FieldLabel htmlFor={`${id}-label`}>{display ? 'כותרת' : 'תווית השדה'}</FieldLabel>
        <Input id={`${id}-label`} value={f.label} invalid={!f.label.trim()} onChange={(e) => onChange({ ...f, label: e.target.value })} />
      </div>
      {!display && f.type !== 'info' && (
        <div className="flex gap-1.5" role="radiogroup" aria-label="חובה או רשות">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={f.required === v}
              onClick={() => onChange({ ...f, required: v })}
              className={cx('min-h-[36px] flex-1 rounded-lg border text-xs font-medium transition', f.required === v ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:text-ink')}
            >
              {v ? 'שדה חובה' : 'רשות'}
            </button>
          ))}
        </div>
      )}
      {appearances.length > 1 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">תצוגה</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="תצוגת השדה">
            {appearances.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={(f.appearance ?? 'auto') === a}
                onClick={() => onChange({ ...f, appearance: a === 'auto' ? undefined : a })}
                className={cx('min-h-[34px] rounded-lg border px-2.5 text-xs font-medium', (f.appearance ?? 'auto') === a ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:text-ink')}
              >
                {APPEARANCE_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
      )}

      {(f.type === 'heading' || f.type === 'terms') && (
        <div>
          <FieldLabel htmlFor={`${id}-content`}>תוכן (טקסט רגיל; שורה ריקה = פסקה חדשה)</FieldLabel>
          <Textarea id={`${id}-content`} rows={5} maxLength={4000} value={f.content ?? ''} onChange={(e) => onChange({ ...f, content: e.target.value || undefined })} />
        </div>
      )}
      {f.type !== 'heading' && f.type !== 'terms' && f.type !== 'highlights' && (
        <div>
          <FieldLabel htmlFor={`${id}-help`}>{f.type === 'info' ? 'תוכן ההודעה' : f.type === 'divider' ? 'טקסט על הקו (אופציונלי)' : display ? 'כיתוב' : 'טקסט עזרה'}</FieldLabel>
          <Input id={`${id}-help`} value={f.helpText ?? ''} onChange={(e) => onChange({ ...f, helpText: e.target.value || undefined })} />
        </div>
      )}

      {f.type === 'highlights' && (
        <div>
          <p className="mb-2 text-xs font-medium text-ink-muted">פריטים (עד 8)</p>
          <ul className="space-y-2">
            {(f.items ?? []).map((it, i) => (
              <li key={it.id} className="grid gap-1.5 rounded-xl border border-cloud-200 p-2.5 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Input aria-label={`כותרת פריט ${i + 1}`} value={it.title} maxLength={60} onChange={(e) => onChange({ ...f, items: f.items!.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)) })} className="!h-9" />
                <Input aria-label={`טקסט פריט ${i + 1}`} placeholder="טקסט (אופציונלי)" maxLength={160} value={it.text ?? ''} onChange={(e) => onChange({ ...f, items: f.items!.map((x) => (x.id === it.id ? { ...x, text: e.target.value || undefined } : x)) })} className="!h-9 text-xs" />
                <Select aria-label={`אייקון פריט ${i + 1}`} value={it.icon ?? 'sparkles'} onChange={(e) => onChange({ ...f, items: f.items!.map((x) => (x.id === it.id ? { ...x, icon: e.target.value as typeof it.icon } : x)) })} className="!h-9 text-xs">
                  {HIGHLIGHT_ICONS.map((ic) => (
                    <option key={ic} value={ic}>
                      {ICON_LABELS[ic]}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" aria-label={`מחיקת פריט ${i + 1}`} onClick={() => onChange({ ...f, items: f.items!.filter((x) => x.id !== it.id) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" icon={Plus} className="mt-2" disabled={(f.items?.length ?? 0) >= 8} onClick={() => onChange({ ...f, items: [...(f.items ?? []), { id: newId('hl'), title: 'יתרון', icon: 'check' }] })}>
            פריט
          </Button>
        </div>
      )}

      {(f.type === 'image' || f.type === 'gallery') && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-muted">{f.type === 'image' ? 'תמונה' : 'תמונות בגלריה (עד 12)'}</p>
          {(f.media ?? []).map((m, i) => (
            <div key={`${m}-${i}`} className="flex gap-1.5">
              <MediaSelect label={`תמונה ${i + 1}`} value={m} images={images} onChange={(v) => onChange({ ...f, media: v ? f.media!.map((x, j) => (j === i ? v : x)) : f.media!.filter((_, j) => j !== i) })} />
              <Button size="sm" variant="ghost" aria-label={`הסרת תמונה ${i + 1}`} onClick={() => onChange({ ...f, media: f.media!.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {(f.type === 'gallery' || !(f.media ?? []).length) && (f.media?.length ?? 0) < 12 && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange({ ...f, media: [...(f.media ?? []), 'decor'] })}>
              תמונה
            </Button>
          )}
          <ImagePicker kind="image" label="העלאת תמונה משלכם" hint="מוקטנת ל-900px ונשמרת בדפדפן בלבד (עד 160KB)." selected={undefined} assets={images} urls={{}} orgId={orgId} onSelect={(assetId) => assetId && onChange({ ...f, media: f.type === 'image' ? [assetId] : [...(f.media ?? []), assetId].slice(0, 12) })} />
        </div>
      )}

      {HAS_OPTIONS.includes(f.type) && <OptionRows f={f} onChange={onChange} priced={priced} images={images} />}

      {f.type === 'decision' && (
        <div>
          <FieldLabel htmlFor={`${id}-prio`}>דחיפות</FieldLabel>
          <Select id={`${id}-prio`} value={f.priority ?? ''} onChange={(e) => onChange({ ...f, priority: (e.target.value || undefined) as WorkflowField['priority'] })}>
            <option value="">ללא</option>
            <option value="critical">בטיחותי — מומלץ בחום</option>
            <option value="recommended">מומלץ</option>
            <option value="optional">לבחירתך</option>
          </Select>
        </div>
      )}
      {priced && ['checkbox', 'decision', 'number'].includes(f.type) && (
        <div>
          <FieldLabel htmlFor={`${id}-price`}>{f.type === 'number' ? 'מחיר ליחידה (₪)' : f.type === 'decision' ? 'מחיר אם מאושר (₪)' : 'מחיר אם מסומן (₪)'}</FieldLabel>
          <Input id={`${id}-price`} type="number" min={0} dir="ltr" className="w-40" value={f.price ?? ''} onChange={(e) => onChange({ ...f, price: parseNum(e.target.value) })} />
        </div>
      )}
      {/* Progressive disclosure: everyday settings above, rarely-needed ones here (open when one is in use). */}
      <details className="group rounded-xl border border-cloud-200 bg-cloud/40 p-3" open={Boolean(f.condition || f.multiplyByKey) || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-ink-muted marker:hidden hover:text-ink">
          <span>
            הגדרות מתקדמות
            <span className="block text-[11px] font-normal text-ink-soft">הצגה מותנית, הכפלת מחיר, הגבלות, סוג השדה ומזהה פנימי</span>
            {(f.condition || f.multiplyByKey || f.role) && (
              <span className="text-xs font-normal text-sky-700"> · {[f.condition && 'מותנה', f.multiplyByKey && 'הכפלת מחיר', f.role && 'תיבת בקשות'].filter(Boolean).join(' · ')}</span>
            )}
          </span>
          <span aria-hidden className="text-xs transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-4">
      <div>
        <FieldLabel htmlFor={`${id}-type`}>שינוי סוג השדה</FieldLabel>
        <Select
          id={`${id}-type`}
          value={f.type}
          onChange={(e) => {
            const type = e.target.value as FieldType;
            const needsOptions = HAS_OPTIONS.includes(type) && !f.options?.length;
            onChange({
              ...f,
              type,
              appearance: appearanceFor(type).includes(f.appearance ?? 'auto') ? f.appearance : undefined,
              options: needsOptions ? [makeOption('option_1', 'אפשרות 1')] : f.options,
              required: isDisplayField({ type }) ? false : f.required,
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

        {['text', 'textarea', 'email', 'phone', 'number'].includes(f.type) && (
          <div>
            <FieldLabel htmlFor={`${id}-ph`}>טקסט מקום (placeholder)</FieldLabel>
            <Input id={`${id}-ph`} value={f.placeholder ?? ''} onChange={(e) => onChange({ ...f, placeholder: e.target.value || undefined })} />
          </div>
        )}
        {priced && (['radio', 'select', 'multiselect', 'checkbox'] as FieldType[]).includes(f.type) && numeric.length > 0 && (
          <div>
            <FieldLabel htmlFor={`${id}-mult`}>הכפלת המחיר בערך של</FieldLabel>
            <Select id={`${id}-mult`} value={f.multiplyByKey ?? ''} onChange={(e) => onChange({ ...f, multiplyByKey: e.target.value || undefined })}>
              <option value="">ללא הכפלה</option>
              {numeric.map((n) => (
                <option key={n.id} value={n.key}>
                  {n.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        {(f.type === 'number' || f.type === 'date' || f.type === 'text' || f.type === 'textarea') && (
          <div className="grid grid-cols-2 gap-3">
            {f.type !== 'text' && f.type !== 'textarea' && (
              <div>
                <FieldLabel htmlFor={`${id}-min`}>{f.type === 'date' ? 'מינימום (ימים מהיום)' : 'ערך מינימלי'}</FieldLabel>
                <Input id={`${id}-min`} type="number" dir="ltr" value={f.min ?? ''} onChange={(e) => onChange({ ...f, min: parseNum(e.target.value) })} />
              </div>
            )}
            <div>
              <FieldLabel htmlFor={`${id}-max`}>{f.type === 'date' ? 'מקסימום (ימים מהיום)' : f.type === 'number' ? 'ערך מקסימלי' : 'אורך מקסימלי'}</FieldLabel>
              <Input id={`${id}-max`} type="number" dir="ltr" value={f.max ?? ''} onChange={(e) => onChange({ ...f, max: parseNum(e.target.value) })} />
            </div>
          </div>
        )}
        {!display && (
          <div>
            <FieldLabel htmlFor={`${id}-role`}>שימוש בתיבת הבקשות</FieldLabel>
            <Select id={`${id}-role`} value={f.role ?? ''} onChange={(e) => onChange({ ...f, role: (e.target.value || undefined) as WorkflowField['role'] })}>
              <option value="">ללא</option>
              <option value="customer_name">שם הלקוח</option>
              <option value="customer_phone">טלפון הלקוח</option>
              <option value="customer_email">אימייל הלקוח</option>
              <option value="date">תאריך הבקשה</option>
            </Select>
          </div>
        )}
        <ConditionEditor field={f} others={earlier} onChange={(condition) => onChange({ ...f, condition })} />
        <p className="text-[11px] text-ink-soft">
          מזהה פנימי: <code dir="ltr">{f.key}</code> · חישובים ותנאים הם הצהרתיים בלבד — לעולם לא מורץ קוד מהגדרות.
        </p>
        </div>
      </details>
    </Panel>
  );
}

export function StepInspector({
  step,
  index,
  count,
  earlier,
  onChange,
  onMove,
  onDelete,
}: {
  step: WorkflowStep;
  index: number;
  count: number;
  /** Answerable fields in earlier steps — the only valid condition sources. */
  earlier: WorkflowField[];
  onChange: (s: WorkflowStep) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const pseudo = { ...makeField('step_condition', step.title, 'info'), condition: step.condition };
  return (
    <Panel
      title={`שלב ${index + 1}`}
      actions={
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" aria-label="העלאת שלב" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="הורדת שלב" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="danger" icon={Trash2} disabled={count <= 1} onClick={onDelete}>
            מחיקה
          </Button>
        </div>
      }
    >
      <div>
        <FieldLabel htmlFor="st-title" required>
          שם השלב
        </FieldLabel>
        <Input id="st-title" value={step.title} invalid={!step.title.trim()} onChange={(e) => onChange({ ...step, title: e.target.value })} />
      </div>
      <div>
        <FieldLabel htmlFor="st-desc">תיאור קצר</FieldLabel>
        <Textarea id="st-desc" rows={2} value={step.description ?? ''} onChange={(e) => onChange({ ...step, description: e.target.value || undefined })} />
      </div>
      <ConditionEditor field={pseudo} subject="השלב" others={earlier} onChange={(condition) => onChange({ ...step, condition })} />
      <p className="text-xs text-ink-muted">{step.fields.length} רכיבים בשלב. תנאי שלב מסתיר את כל השלב כשאינו מתקיים.</p>
    </Panel>
  );
}

/** What the customer will see on their request page (same classes as the live button, owner-side colours). */
function ExternalPaymentPreview({ url, label, afterApproval }: { url: string | null; label?: string; afterApproval: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-cloud-300 p-3">
      <p className="text-xs font-medium text-ink-muted">כך זה ייראה ללקוח{afterApproval ? ' (אחרי האישור)' : ''}</p>
      {url ? (
        <>
          <span className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-midnight text-sm font-semibold text-white" aria-hidden>
            <ExternalLink className="h-4 w-4" /> {label || 'מעבר לעמוד התשלום של העסק'}
          </span>
          <p className="mt-1.5 text-center text-[11px] text-ink-muted">
            עמוד התשלום של העסק באתר חיצוני (<bdi dir="ltr">{new URL(url).hostname}</bdi>)
          </p>
        </>
      ) : (
        <p className="mt-2 rounded-lg bg-cloud px-3 py-2 text-center text-xs text-ink-muted">הכפתור יופיע כשתדביקו קישור https תקין.</p>
      )}
    </div>
  );
}

export function CompletionInspector({ config, update }: { config: WorkflowConfig; update: (fn: (d: WorkflowConfig) => void) => void }) {
  const c: Completion = config.completion ?? { mode: config.pricing.enabled ? (config.pricing.depositPercent > 0 ? 'deposit' : 'quote') : 'request' };
  const needsPrice = ['calculated', 'deposit', 'pay_after_approval', 'quote'].includes(c.mode);
  const setC = (patch: Partial<Completion>) => update((d) => void (d.completion = { ...c, ...patch }));
  const urlBad = c.mode === 'external_link' && c.externalUrl && !safeExternalUrl(c.externalUrl);
  const allFields = config.steps.flatMap((s) => s.fields);
  const setFee = (i: number, patch: Partial<WorkflowConfig['pricing']['fees'][number]>) =>
    update((d) => {
      d.pricing.fees[i] = { ...d.pricing.fees[i]!, ...patch };
    });

  return (
    <Panel title="סיום ותשלום">
      <p className="text-xs leading-relaxed text-ink-muted">חישוב המחיר ואיסוף התשלום נפרדים. תהליך בלי תשלום מתפרסם בלי שום ספק סליקה, ולא נראה כמו חשבונית פתוחה.</p>
      <div className="grid gap-2" role="radiogroup" aria-label="אופן הסיום">
        {COMPLETION_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={c.mode === m}
            onClick={() => setC({ mode: m })}
            className={cx('rounded-xl border p-3 text-start transition', c.mode === m ? 'border-midnight bg-cloud ring-1 ring-midnight/20' : 'border-cloud-300 hover:border-ink-soft')}
          >
            <span className="block text-sm font-semibold">{COMPLETION_LABELS[m].title}</span>
            <span className="block text-xs text-ink-muted">{COMPLETION_LABELS[m].description}</span>
          </button>
        ))}
      </div>
      {c.mode === 'fixed' && (
        <div>
          <FieldLabel htmlFor="cp-fixed">סכום קבוע (₪)</FieldLabel>
          <Input id="cp-fixed" type="number" min={0} dir="ltr" className="w-40" value={c.fixedAmount ?? ''} onChange={(e) => setC({ fixedAmount: parseNum(e.target.value) })} />
        </div>
      )}
      {c.mode === 'deposit' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="cp-dep">אחוז מקדמה</FieldLabel>
            <Input id="cp-dep" type="number" min={1} max={100} dir="ltr" value={c.depositPercent ?? 20} onChange={(e) => setC({ depositPercent: Math.min(100, Math.max(1, Number(e.target.value) || 20)) })} />
          </div>
          <div>
            <FieldLabel htmlFor="cp-timing">מתי</FieldLabel>
            <Select id="cp-timing" value={c.depositTiming ?? 'after_approval'} onChange={(e) => setC({ depositTiming: e.target.value as Completion['depositTiming'] })}>
              <option value="after_approval">רק אחרי אישור העסק</option>
              <option value="on_submit">בשליחה</option>
            </Select>
          </div>
        </div>
      )}
      {(c.mode === 'fixed' || c.mode === 'calculated') && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={Boolean(c.allowPayLater)} onChange={(e) => setC({ allowPayLater: e.target.checked })} />
          לאפשר ללקוח לבחור ״תשלום מאוחר יותר״
        </label>
      )}
      {c.mode === 'external_link' && (
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="cp-url">קישור לעמוד התשלום של העסק</FieldLabel>
            <Input id="cp-url" dir="ltr" placeholder="https://" value={c.externalUrl ?? ''} invalid={Boolean(urlBad)} onChange={(e) => setC({ externalUrl: e.target.value.trim() || undefined })} />
            {urlBad && <p className="mt-1 text-xs text-red-600">נדרש קישור https תקין</p>}
          </div>
          <div>
            <FieldLabel htmlFor="cp-urllabel">טקסט הכפתור</FieldLabel>
            <Input id="cp-urllabel" maxLength={60} value={c.externalLabel ?? ''} placeholder="מעבר לתשלום" onChange={(e) => setC({ externalLabel: e.target.value || undefined })} />
          </div>
          <div>
            <FieldLabel htmlFor="cp-timing-ext">מתי הלקוח רואה את הקישור</FieldLabel>
            <Select id="cp-timing-ext" value={c.externalTiming ?? 'on_submit'} onChange={(e) => setC({ externalTiming: e.target.value as Completion['externalTiming'] })}>
              <option value="on_submit">מיד אחרי השליחה</option>
              <option value="after_approval">רק אחרי שהעסק מאשר</option>
            </Select>
          </div>
          <ExternalPaymentPreview url={safeExternalUrl(c.externalUrl)} label={c.externalLabel} afterApproval={c.externalTiming === 'after_approval'} />
          <div className="rounded-xl bg-cloud p-3 text-xs leading-relaxed text-ink-muted">
            <p className="font-semibold text-ink">קישור קבוע, לא דרישת תשלום אישית</p>
            <p className="mt-1">הדביקו עמוד תשלום שכבר יצרתם אצל ספק הסליקה שלכם. כל הלקוחות מקבלים אותו עמוד, והסכום נקבע שם. סכום אישי לכל לקוח דורש חיבור לספק הסליקה, שאינו קיים בדמו — אפשר לשלוח ללקוח פעולה עם הסכום מתוך עמוד הבקשה.</p>
            <p className="mt-1">Formangle לא שומר פרטי כרטיס, לא יודע אם שולם, ולא מסמן בקשה כשולמה בגלל שהקישור נפתח.</p>
          </div>
        </div>
      )}
      {!['request', 'quote'].includes(c.mode) && (
        <div>
          <FieldLabel htmlFor="cp-provider">ספק סליקה מועדף (לעתיד)</FieldLabel>
          <Select id="cp-provider" value={c.providerId ?? ''} onChange={(e) => setC({ providerId: e.target.value || undefined })}>
            <option value="">— לא נבחר —</option>
            {PAYMENT_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · לא מחובר
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-ink-muted">בדמו כל תשלום הוא סימולציה מסומנת. הבחירה נשמרת לתכנון בלבד.</p>
        </div>
      )}

      <div className="border-t border-cloud-200 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={config.pricing.enabled} onChange={(e) => update((d) => void (d.pricing.enabled = e.target.checked))} />
          חישוב מחיר ללקוח
        </label>
        {needsPrice && !config.pricing.enabled && <p className="mt-1 text-xs text-amber-700">אופן הסיום הזה מבוסס על סכום מחושב — הפעילו חישוב מחיר.</p>}
        {config.pricing.enabled && (
          <div className="mt-3 space-y-3">
            <div>
              <FieldLabel htmlFor="cp-total">כותרת הסכום</FieldLabel>
              <Input id="cp-total" value={config.pricing.totalLabel} onChange={(e) => update((d) => void (d.pricing.totalLabel = e.target.value))} />
            </div>
            <p className="text-sm font-medium">עמלות קבועות</p>
            <ul className="space-y-2">
              {config.pricing.fees.map((fee, i) => (
                <li key={fee.id} className="rounded-xl border border-cloud-200 p-2.5">
                  <div className="flex gap-1.5">
                    <Input aria-label="שם העמלה" value={fee.label} onChange={(e) => setFee(i, { label: e.target.value })} className="!h-9 min-w-0 flex-1" />
                    <Input aria-label="סכום העמלה" type="number" min={0} dir="ltr" value={fee.amount} onChange={(e) => setFee(i, { amount: Number(e.target.value) || 0 })} className="!h-9 w-24" />
                    <Button size="sm" variant="ghost" aria-label={`מחיקת ${fee.label}`} onClick={() => update((d) => void d.pricing.fees.splice(i, 1))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Select
                    aria-label="תנאי לעמלה"
                    className="mt-1.5 !h-9 text-xs"
                    value={fee.condition ? `${fee.condition.fieldKey}|${fee.condition.operator}` : ''}
                    onChange={(e) => {
                      const [fieldKey, operator] = e.target.value.split('|');
                      setFee(i, { condition: fieldKey ? ({ fieldKey, operator } as Condition) : undefined });
                    }}
                  >
                    <option value="">חלה תמיד</option>
                    {allFields
                      .filter((x) => x.type === 'checkbox' || x.type === 'decision')
                      .map((x) => (
                        <option key={x.id} value={`${x.key}|isTrue`}>
                          רק אם: {x.label} — {OPERATOR_LABELS.isTrue}
                        </option>
                      ))}
                  </Select>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => update((d) => void d.pricing.fees.push({ id: newId('fee'), label: 'עמלה', amount: 0 }))}>
              עמלה
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const HOURS = Array.from({ length: 19 }, (_, i) => toHHMM((i + 6) * 60)); // 06:00 … 24:00

/** "From 09:00 to 18:00, every 30 minutes" → the offered start times. Single times can still be removed. */
function hoursToSlots(from: string, to: string, every: number): string[] {
  const out: string[] = [];
  for (let at = toMin(from); at + every <= toMin(to) && out.length < 48; at += every) out.push(toHHMM(at));
  return out;
}

function SlotEditor({ slots, onChange }: { slots: string[]; onChange: (s: string[]) => void }) {
  const first = slots[0] ?? '09:00';
  const gap = slots.length > 1 ? toMin(slots[1]!) - toMin(slots[0]!) : 60;
  const [from, setFrom] = useState(HOURS.includes(first) ? first : '09:00');
  const [to, setTo] = useState(() => {
    const end = slots.length ? toHHMM(Math.min(24 * 60, toMin(slots[slots.length - 1]!) + gap)) : '18:00';
    return HOURS.includes(end) ? end : '18:00';
  });
  const [every, setEvery] = useState([15, 20, 30, 45, 60, 90, 120].includes(gap) ? gap : 60);
  const preview = hoursToSlots(from, to, every);
  return (
    <fieldset className="space-y-2 rounded-xl border border-cloud-200 p-3">
      <legend className="px-1 text-sm font-medium">שעות שהלקוח יכול לבחור</legend>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <FieldLabel htmlFor="sl-from">מ־</FieldLabel>
          <Select id="sl-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {HOURS.slice(0, -1).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="sl-to">עד</FieldLabel>
          <Select id="sl-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {HOURS.slice(1).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="sl-every">כל</FieldLabel>
          <Select id="sl-every" value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} דק׳` : m === 60 ? 'שעה' : m === 90 ? 'שעה וחצי' : 'שעתיים'}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button size="sm" variant="secondary" disabled={!preview.length || preview.join() === slots.join()} onClick={() => onChange(preview)}>
        {preview.length ? `עדכון ל-${preview.length} שעות` : 'הטווח קצר מדי'}
      </Button>
      <ul className="flex flex-wrap gap-1.5" aria-label="השעות המוצעות עכשיו">
        {slots.map((t) => (
          <li key={t}>
            <button
              type="button"
              dir="ltr"
              aria-label={`הסרת ${t}`}
              disabled={slots.length <= 1}
              onClick={() => onChange(slots.filter((x) => x !== t))}
              className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-cloud px-2.5 text-xs font-medium text-ink hover:bg-cloud-200 disabled:opacity-60"
            >
              {t} <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">לחיצה על שעה מסירה אותה (למשל הפסקת צהריים).</p>
    </fieldset>
  );
}

export function BookingInspector({ config, update }: { config: WorkflowConfig; update: (fn: (d: WorkflowConfig) => void) => void }) {
  const fields = config.steps.flatMap((s) => s.fields);
  const dates = fields.filter((f) => f.type === 'date');
  const times = fields.filter((f) => f.type === 'time');
  const numbers = fields.filter((f) => f.type === 'number');
  const b: Booking | undefined = config.booking;
  const setB = (patch: Partial<Booking>) => update((d) => void (d.booking = { ...(d.booking as Booking), ...patch }));
  /** Offered times live in two places that must agree: the booking rules and the time field's options. */
  const setSlots = (slots: string[]) =>
    update((d) => {
      if (!d.booking) return;
      d.booking.slots = slots;
      const time = d.steps.flatMap((s) => s.fields).find((f) => f.key === d.booking!.timeKey);
      if (time) time.options = slots.map((t) => time.options?.find((o) => o.value === t) ?? makeOption(t, t));
    });

  const enable = () =>
    update((d) => {
      let date = d.steps.flatMap((s) => s.fields).find((f) => f.type === 'date');
      let time = d.steps.flatMap((s) => s.fields).find((f) => f.type === 'time');
      const first = d.steps[0]!;
      if (!date) {
        date = makeField('booking_date', 'תאריך', 'date', { required: true, min: 0, max: 60, role: 'date' });
        first.fields.unshift(date);
      }
      if (!time) {
        time = makeField('booking_time', 'שעה', 'time', { required: true, options: ['18:00', '19:00', '20:00', '21:00'].map((t) => makeOption(t, t)) });
        first.fields.splice(first.fields.indexOf(date) + 1, 0, time);
      }
      d.booking = {
        enabled: true,
        dateKey: date.key,
        timeKey: time.key,
        guestsKey: d.steps.flatMap((s) => s.fields).find((f) => f.type === 'number')?.key,
        openWeekdays: [0, 1, 2, 3, 4],
        slots: (time.options ?? []).map((o) => o.value),
        capacityPerSlot: 10,
        capacityUnit: 'bookings',
      };
    });

  return (
    <Panel title="הזמנות ושעות">
      <p className="text-xs leading-relaxed text-ink-muted">
        בקשה להזמנה נשארת <strong className="font-medium text-ink">בקשה</strong> עד שהעסק מאשר. הזמינות בדמו מחושבת מבקשות שנשמרו בדפדפן זה בלבד — היא לא מונעת הזמנה כפולה ממכשירים שונים.
      </p>
      {!b?.enabled ? (
        <Button icon={CalendarPlus} onClick={enable}>
          הפעלת כללי הזמנה
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="bk-date">שדה תאריך</FieldLabel>
              <Select id="bk-date" value={b.dateKey} onChange={(e) => setB({ dateKey: e.target.value })}>
                {dates.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="bk-time">שדה שעה</FieldLabel>
              <Select id="bk-time" value={b.timeKey ?? ''} onChange={(e) => setB({ timeKey: e.target.value || undefined, slots: times.find((t) => t.key === e.target.value)?.options?.map((o) => o.value) ?? b.slots })}>
                <option value="">ללא</option>
                {times.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="bk-guests">שדה משתתפים</FieldLabel>
              <Select id="bk-guests" value={b.guestsKey ?? ''} onChange={(e) => setB({ guestsKey: e.target.value || undefined })}>
                <option value="">ללא</option>
                {numbers.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">ימי פעילות</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, d) => {
                const on = b.openWeekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? b.openWeekdays.filter((x) => x !== d) : [...b.openWeekdays, d].sort();
                      if (next.length) setB({ openWeekdays: next });
                    }}
                    className={cx('min-h-[34px] rounded-lg border px-2.5 text-xs font-medium', on ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted')}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {b.timeKey ? (
            <SlotEditor slots={b.slots} onChange={setSlots} />
          ) : (
            <p className="text-xs text-ink-muted">אין שדה שעה — הלקוח בוחר תאריך בלבד. כדי להציע שעות, בחרו ״שדה שעה״ למעלה.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="bk-cap">קיבולת לכל שעה</FieldLabel>
              <Input id="bk-cap" type="number" min={1} max={1000} dir="ltr" value={b.capacityPerSlot} onChange={(e) => setB({ capacityPerSlot: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
            <div>
              <FieldLabel htmlFor="bk-unit">נספרת לפי</FieldLabel>
              <Select id="bk-unit" value={b.capacityUnit} onChange={(e) => setB({ capacityUnit: e.target.value as Booking['capacityUnit'] })}>
                <option value="bookings">מספר הזמנות</option>
                <option value="guests" disabled={!b.guestsKey}>
                  מספר משתתפים
                </option>
              </Select>
            </div>
          </div>
          <div className="space-y-3 border-t border-cloud-200 pt-3">
            <p className="text-sm font-medium">מתי אפשר להזמין</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor="bk-notice">התראה מראש</FieldLabel>
                <Select id="bk-notice" value={b.minNoticeHours ?? ''} onChange={(e) => setB({ minNoticeHours: Number(e.target.value) || undefined })}>
                  <option value="">אפשר גם לאותו יום</option>
                  {[2, 4, 12, 24, 48, 72].map((h) => (
                    <option key={h} value={h}>
                      לפחות {h} שעות מראש
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="bk-ahead">עד כמה קדימה</FieldLabel>
                <Select id="bk-ahead" value={b.maxDaysAhead ?? ''} onChange={(e) => setB({ maxDaysAhead: Number(e.target.value) || undefined })}>
                  <option value="">ללא הגבלה</option>
                  {[7, 14, 30, 60, 90, 180].map((d) => (
                    <option key={d} value={d}>
                      עד {d} ימים קדימה
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="bk-day">מקסימום ליום</FieldLabel>
                <Input
                  id="bk-day"
                  type="number"
                  min={1}
                  dir="ltr"
                  placeholder="ללא הגבלה"
                  value={b.maxPerDay ?? ''}
                  onChange={(e) => setB({ maxPerDay: Math.floor(Number(e.target.value)) > 0 ? Math.floor(Number(e.target.value)) : undefined })}
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="bk-closed">ימים סגורים (חג, חופשה)</FieldLabel>
              <Input
                id="bk-closed"
                type="date"
                dir="ltr"
                value=""
                onChange={(e) => {
                  const d = e.target.value;
                  if (d && !(b.closedDates ?? []).includes(d)) setB({ closedDates: [...(b.closedDates ?? []), d].sort().slice(-120) });
                }}
              />
              {(b.closedDates ?? []).length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="ימים סגורים">
                  {b.closedDates!.map((d) => (
                    <li key={d}>
                      <button
                        type="button"
                        aria-label={`הסרת ${d}`}
                        onClick={() => setB({ closedDates: b.closedDates!.filter((x) => x !== d) })}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-cloud px-2.5 text-xs font-medium text-ink hover:bg-cloud-200"
                        dir="ltr"
                      >
                        {d.split('-').reverse().join('.')} ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-ink-muted">הלקוח רואה בלוח השנה רק תאריכים שאפשר לבחור, ומקבל הסבר ברור אם בחר יום סגור.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setB({ enabled: false })}>
            כיבוי כללי הזמנה
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function NextStepsEditor({ steps, onChange }: { steps: string[]; onChange: (s: string[]) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">״מה קורה עכשיו״ במסך הסיום</p>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <Badge tone="neutral">{i + 1}</Badge>
            <Input aria-label={`שלב המשך ${i + 1}`} value={s} maxLength={160} onChange={(e) => onChange(steps.map((x, j) => (j === i ? e.target.value : x)))} className="!h-9 flex-1 text-sm" />
            <Button size="sm" variant="ghost" aria-label={`מחיקת שלב המשך ${i + 1}`} onClick={() => onChange(steps.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" icon={Plus} className="mt-2" disabled={steps.length >= 6} onClick={() => onChange([...steps, 'נחזור אליכם בהקדם'])}>
        שלב
      </Button>
    </div>
  );
}
