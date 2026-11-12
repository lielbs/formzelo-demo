/**
 * One quiet card at the top of the studio: first steps, notes from the generator and
 * built-in advice (engine/advisor). Collapsed it is a single line, so the form stays in view.
 */
import { ChevronDown, Lightbulb, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, cx } from '../../../components/ui';
import type { Advice } from '../../../engine/advisor';

export type CoachStep = [label: string, done: boolean, action: (() => void) | undefined];

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-viewer convenience only */
  }
};

const VISIBLE = 3;

export function StudioCoach({
  workflowId,
  steps,
  notes,
  onClearNotes,
  advice,
  onFix,
}: {
  workflowId: string;
  steps?: CoachStep[];
  notes?: string[];
  onClearNotes: () => void;
  advice: Advice[];
  onFix: (a: Advice) => void;
}) {
  const openKey = `formzelo:ui:coach:${workflowId}`;
  const dismissKey = `formzelo:ui:coach-dismissed:${workflowId}`;
  const [open, setOpen] = useState(() => {
    const saved = read(openKey);
    if (saved) return saved === 'open';
    // Phones start collapsed: the form itself comes first on a small screen.
    return typeof window === 'undefined' || window.matchMedia?.('(min-width: 768px)').matches !== false;
  });
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(read(dismissKey) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [all, setAll] = useState(false);

  const tips = advice.filter((a) => !dismissed.includes(a.id));
  const done = steps?.filter(([, d]) => d).length ?? 0;
  const noteCount = notes?.length ?? 0;
  if (!tips.length && !noteCount && (!steps || done === steps.length)) return null;

  const toggle = () => {
    setOpen(!open);
    write(openKey, open ? 'closed' : 'open');
  };
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    write(dismissKey, JSON.stringify(next));
  };
  const summary = [steps && `${done}/${steps.length} צעדים`, tips.length > 0 && `${tips.length} המלצות`, noteCount > 0 && `${noteCount} לבדיקה`].filter(Boolean).join(' · ');

  return (
    <section aria-label="העוזר של הסטודיו" className="mb-4 rounded-xl border border-cloud-200 bg-white">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-xl p-3 text-start hover:bg-cloud/50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">העוזר שלכם</span>
          <span className="line-clamp-2 break-words text-xs text-ink-muted">{summary}</span>
        </span>
        {steps && (
          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-cloud-200 sm:block" aria-hidden>
            <span className="block h-full rounded-full bg-teal" style={{ width: `${(done / steps.length) * 100}%` }} />
          </span>
        )}
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-ink-soft transition', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="space-y-3 border-t border-cloud-200 p-3">
          {steps && done < steps.length && (
            <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="צעדים ראשונים">
              {steps.map(([label, isDone, action], i) => (
                <li key={label}>
                  <button
                    type="button"
                    disabled={!action}
                    onClick={action}
                    className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition', isDone ? 'border-teal-50 bg-teal-50 text-teal-600' : 'border-cloud-300 text-ink-muted hover:border-ink-soft hover:text-ink')}
                  >
                    <span className={cx('flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold', isDone ? 'bg-teal text-white' : 'bg-cloud-200 text-ink')} aria-hidden>
                      {isDone ? '✓' : i + 1}
                    </span>
                    {label}
                    <span className="sr-only">{isDone ? ' (בוצע)' : ''}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {noteCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-sm text-amber-900">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Lightbulb className="h-4 w-4" aria-hidden /> לבדיקה לפני פרסום
                </p>
                <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium hover:bg-amber-100" onClick={onClearNotes}>
                  <X className="h-3.5 w-3.5" aria-hidden /> סימון כנבדק
                </button>
              </div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[13px]">
                {notes!.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {tips.length > 0 && (
            <ul className="space-y-2" aria-label="המלצות">
              {(all ? tips : tips.slice(0, VISIBLE)).map((a) => (
                <li key={a.id} className="flex flex-col gap-2 rounded-lg bg-cloud/60 p-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                      <Badge tone="neutral" className="!px-2 !py-0 text-[10px]">
                        {a.area}
                      </Badge>
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{a.why}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant={a.fix.kind === 'apply' ? 'primary' : 'secondary'} onClick={() => onFix(a)}>
                      {a.fix.label}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dismiss(a.id)}>
                      לא עכשיו
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {tips.length > VISIBLE && (
            <button type="button" className="text-xs font-medium text-orange-700 underline-offset-2 hover:underline" onClick={() => setAll(!all)}>
              {all ? 'פחות המלצות' : `עוד ${tips.length - VISIBLE} המלצות`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
