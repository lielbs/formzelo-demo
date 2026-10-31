/**
 * "הוספת שדה" library: searchable, grouped, with a live preview that renders
 * the real customer field component in the workflow's own theme.
 */
import { Lock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cx, Modal } from '../../../components/ui';
import type { AnswerValue, WorkflowConfig } from '../../../domain/schema';
import type { WorkflowTheme } from '../../../domain/theme';
import type { Values } from '../../../engine/conditions';
import { computePrice } from '../../../engine/pricing';
import { FieldInput } from '../../../renderer/FieldInput';
import { ThemeScope } from '../../../theme/ThemeScope';
import { BLOCK_GROUPS, createBlocks, searchBlocks, type BlockAction, type BlockDef } from './blockLibrary';

const ACTION_LABEL: Record<BlockAction, string> = {
  presence: 'פותח את הגדרות הנוכחות הדיגיטלית',
  logic: 'פותח את מצב הלוגיקה',
  step: 'מוסיף שלב חדש לתהליך',
  booking: 'פותח את הגדרות ההזמנות והשעות',
  completion: 'פותח את הגדרות הסיום והתשלום',
};

function Preview({ def, theme, config, assets }: { def: BlockDef; theme: WorkflowTheme; config: WorkflowConfig; assets: Record<string, string> }) {
  const fields = useMemo(() => createBlocks(def, []), [def]);
  const [values, setValues] = useState<Values>({});
  const mini = useMemo<WorkflowConfig>(() => ({ ...config, pricing: { ...config.pricing, enabled: true }, steps: [{ id: 'lib', title: def.label, fields }] }), [config, def.label, fields]);
  if (def.unavailable) return <p className="rounded-xl bg-cloud p-4 text-sm leading-relaxed text-ink-muted">{def.unavailable}</p>;
  if (def.action) return <p className="rounded-xl bg-cloud p-4 text-sm leading-relaxed text-ink-muted">{def.hint}. {ACTION_LABEL[def.action]}.</p>;
  return (
    <ThemeScope theme={theme} className="fz-lib-preview rounded-xl p-4" style={{ background: 'var(--fz-surface)' }}>
      <div className="space-y-4">
        {fields.map((f) => (
          <FieldInput key={f.id} field={f} value={values[f.key]} values={values} assets={assets} config={mini} price={computePrice(mini, values)} onChange={(v: AnswerValue) => setValues((x) => ({ ...x, [f.key]: v }))} />
        ))}
      </div>
    </ThemeScope>
  );
}

export function FieldLibrary({
  open,
  onClose,
  onAdd,
  onAction,
  theme,
  config,
  assets,
  stepTitle,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (def: BlockDef) => void;
  onAction: (action: BlockAction) => void;
  theme: WorkflowTheme;
  config: WorkflowConfig;
  assets: Record<string, string>;
  stepTitle?: string;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState<BlockDef | null>(null);
  const found = searchBlocks(q);
  const current = focused ?? found.find((b) => !b.action && !b.unavailable) ?? null;

  return (
    <Modal open={open} onClose={onClose} title={stepTitle ? `הוספת שדה · ${stepTitle}` : 'הוספת שדה'} wide>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <label className="relative block">
            <span className="sr-only">חיפוש שדה</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש: טלפון, מחיר, תאריך, תנאים…"
              className="fz-input h-11 w-full rounded-xl border border-cloud-300 bg-white ps-9 pe-3 text-sm"
            />
          </label>
          {BLOCK_GROUPS.map((g) => {
            const items = found.filter((b) => b.group === g.id);
            if (!items.length) return null;
            return (
              <section key={g.id} aria-labelledby={`lib-${g.id}`}>
                <h3 id={`lib-${g.id}`} className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
                  {g.label} <span className="text-xs font-normal text-ink-muted">{g.hint}</span>
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        disabled={Boolean(b.unavailable)}
                        aria-describedby={`lib-h-${b.id}`}
                        onMouseEnter={() => setFocused(b)}
                        onFocus={() => setFocused(b)}
                        onClick={() => (b.action ? onAction(b.action) : onAdd(b))}
                        className={cx(
                          'flex h-full min-h-[64px] w-full items-start gap-3 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                          b.unavailable ? 'cursor-not-allowed border-dashed border-cloud-300 bg-cloud/50' : 'border-cloud-200 bg-white hover:border-orange hover:bg-orange-50',
                          current?.id === b.id && !b.unavailable && 'border-orange/60',
                        )}
                      >
                        <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', b.group === 'presentation' ? 'bg-teal-50 text-teal-600' : b.group === 'advanced' ? 'bg-sky-50 text-sky-700' : 'bg-cloud text-ink-muted')}>
                          {b.unavailable ? <Lock className="h-4 w-4" aria-hidden /> : <b.icon className="h-4 w-4" aria-hidden />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{b.label}</span>
                          <span id={`lib-h-${b.id}`} className="mt-0.5 block text-xs leading-snug text-ink-muted">
                            {b.unavailable ?? b.hint}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {found.length === 0 && <p className="rounded-xl bg-cloud p-4 text-center text-sm text-ink-muted">לא נמצא שדה בשם הזה. נסו מילה אחרת, למשל ״בחירה״ או ״מחיר״.</p>}
        </div>
        <aside className="hidden md:block" aria-label="תצוגה מקדימה של השדה">
          <div className="sticky top-0 space-y-2">
            <p className="text-xs font-semibold text-ink-muted">כך הלקוח יראה את זה</p>
            {current ? <Preview key={current.id} def={current} theme={theme} config={config} assets={assets} /> : null}
            <p className="text-[11px] leading-relaxed text-ink-soft">התצוגה משתמשת ברכיב האמיתי ובעיצוב של התהליך. אחרי ההוספה אפשר לשנות כותרת, אפשרויות ומחירים.</p>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
