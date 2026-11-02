/**
 * Design library picker: category filter + live thumbnails built from the
 * real theme tokens. Used on the creation screen, in the studio and in the
 * Brand Kit, so every place offers the same library.
 */
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, cx } from '../components/ui';
import type { ThemePresetId } from '../domain/theme';
import { buildTheme, PRESET_CATEGORIES, PRESET_LIST, type PresetCategory } from './presets';
import { PresetPreview } from './PresetPreview';

export function PresetPicker({
  value,
  onChange,
  recommended,
  label = 'בחירת עיצוב',
  columns = 'sm:grid-cols-3',
  details = false,
  initial,
}: {
  value: ThemePresetId;
  onChange: (id: ThemePresetId) => void;
  recommended?: ThemePresetId;
  label?: string;
  columns?: string;
  /** Show the "best for" line under each design. */
  details?: boolean;
  /** Start with only the best few (recommendation, current choice, same field); the rest one tap away. */
  initial?: number;
}) {
  const [cat, setCat] = useState<PresetCategory | 'all'>('all');
  const [expanded, setExpanded] = useState(!initial);
  const thumbs = useMemo(() => Object.fromEntries(PRESET_LIST.map((p) => [p.id, buildTheme(p.id)])), []);
  const list = PRESET_LIST.filter((p) => cat === 'all' || p.category === cat)
    // The recommendation and the current choice lead the list.
    .sort((a, b) => Number(b.id === recommended) - Number(a.id === recommended) || Number(b.id === value) - Number(a.id === value));
  const near = PRESET_LIST.find((p) => p.id === recommended)?.category;
  const shown = expanded
    ? list
    : [...list].sort((a, b) => Number(b.id === recommended || b.id === value) - Number(a.id === recommended || a.id === value) || Number(b.category === near) - Number(a.category === near)).slice(0, initial);

  return (
    <div className="space-y-3">
      {expanded && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="סינון עיצובים לפי תחום">
          {[{ id: 'all' as const, label: `הכול · ${PRESET_LIST.length}` }, ...PRESET_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => setCat(c.id)}
              className={cx(
                'min-h-[32px] shrink-0 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                cat === c.id ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:border-ink-soft hover:text-ink',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className={cx('grid grid-cols-2 gap-2.5', columns)} role="radiogroup" aria-label={label}>
        {shown.map((p) => {
          const on = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${p.experience} — ${p.nameHe}${p.id === recommended ? ' (מומלץ)' : ''}`}
              onClick={() => onChange(p.id)}
              className={cx('rounded-2xl border bg-white p-1.5 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', on ? 'border-midnight ring-2 ring-midnight/15' : 'border-cloud-200 hover:border-ink-soft')}
            >
              <PresetPreview theme={thumbs[p.id]!} />
              <span className="flex items-center gap-1 px-1 pb-0.5 pt-1.5">
                <span className="text-sm font-semibold">{p.experience}</span>
                {p.id === recommended && <Badge tone="teal">מומלץ</Badge>}
                {on && <Check className="ms-auto h-4 w-4 text-midnight" aria-hidden />}
              </span>
              <span className="block px-1 text-[11px] text-ink-muted">{p.nameHe}</span>
              {details && <span className="block px-1 pt-0.5 text-[11px] leading-snug text-ink-soft">{p.bestFor}</span>}
            </button>
          );
        })}
      </div>
      {initial && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-sm font-medium text-orange-700 underline-offset-2 hover:underline" aria-expanded={expanded}>
          {expanded ? 'פחות עיצובים' : `כל ${PRESET_LIST.length} העיצובים`}
        </button>
      )}
    </div>
  );
}
