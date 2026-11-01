/**
 * Template library gallery: categories, search and themed thumbnails drawn
 * with each template's own design (real theme tokens + hero artwork).
 */
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cx } from '../../components/ui';
import { isDisplayField } from '../../domain/schema';
import { searchTemplates, TEMPLATE_CATEGORIES, TEMPLATE_LIBRARY, type LibraryTemplate, type TemplateCategory } from '../../engine/library';
import { SignatureMark } from '../../theme/SignatureMark';
import { buildTheme, PRESETS } from '../../theme/presets';
import { ThemeScope } from '../../theme/ThemeScope';

const CATEGORY_LABEL = Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c.id, c.label])) as Record<TemplateCategory, string>;

export function TemplateGallery({ selected, onPick }: { selected?: string; onPick: (t: LibraryTemplate) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<TemplateCategory | 'all'>('all');
  // Built once: counts shown on the cards come from the real template data.
  const stats = useMemo(
    () =>
      Object.fromEntries(
        TEMPLATE_LIBRARY.map((t) => {
          const c = t.build();
          const fields = c.steps.flatMap((s) => s.fields).filter((f) => !isDisplayField(f));
          return [t.id, { steps: c.steps.length, fields: fields.length, priced: c.pricing.enabled, logic: fields.some((f) => f.condition) }];
        }),
      ),
    [],
  );
  const themes = useMemo(() => Object.fromEntries(TEMPLATE_LIBRARY.map((t) => [t.id, buildTheme(t.preset)])), []);
  const list = searchTemplates(q, cat);

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">חיפוש תבנית</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש: עוגה, טכנאי, חוג, צימר, עורך דין…"
          className="fz-input h-11 w-full rounded-xl border border-cloud-300 bg-white ps-9 pe-3 text-sm"
        />
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="סינון לפי תחום">
        {[{ id: 'all' as const, label: `הכול · ${TEMPLATE_LIBRARY.length}` }, ...TEMPLATE_CATEGORIES].map((c) => (
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
      <ul className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="תבניות">
        {list.map((t) => {
          const on = selected === t.id;
          const s = stats[t.id]!;
          const theme = themes[t.id]!;
          return (
            <li key={t.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(t)}
                className={cx(
                  'group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                  on ? 'border-midnight ring-2 ring-midnight/15' : 'border-cloud-200 hover:-translate-y-0.5 hover:shadow-card',
                )}
              >
                <ThemeScope theme={theme} className="relative h-[92px] w-full overflow-hidden" style={{ background: 'var(--fz-hero-bg)', color: 'var(--fz-hero-text)' }}>
                  <SignatureMark theme={theme} letter={t.title} />
                  <span className="relative flex h-full flex-col justify-end p-3">
                    <span className="text-[10px] font-medium opacity-75">{CATEGORY_LABEL[t.category]}</span>
                    <span className="fz-display text-[calc(1.05rem*var(--fz-display-scale))] leading-tight">{t.title}</span>
                  </span>
                </ThemeScope>
                <span className="flex flex-1 flex-col gap-1.5 p-3">
                  <span className="text-xs leading-snug text-ink-muted">{t.description}</span>
                  <span className="mt-auto flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
                    <span>
                      {s.steps} שלבים · {s.fields} שאלות
                    </span>
                    {s.priced && <span className="rounded-full bg-teal-50 px-1.5 text-teal-600">מחיר</span>}
                    {s.logic && <span className="rounded-full bg-sky-50 px-1.5 text-sky-700">תנאים</span>}
                    <span className="ms-auto">{PRESETS[t.preset].meta.nameHe}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="rounded-xl bg-cloud p-4 text-center text-sm text-ink-muted">לא נמצאה תבנית. נסו מילה אחרת, או התחילו מתיאור במילים שלכם.</p>}
    </div>
  );
}
