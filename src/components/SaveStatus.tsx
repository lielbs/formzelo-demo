import { Check, Loader2 } from 'lucide-react';
import type { SaveState } from '../lib/draftSaver';
import { cx } from './ui';

/** Words for the save state of a draft. `conflictText` names what someone else changed. */
export function saveStatusText(state: SaveState, at?: Date | null, conflictText = 'מישהו אחר שינה את ההגדרות'): string {
  return {
    idle: '',
    saving: 'שומר…',
    saved: at ? `נשמר ${at.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'נשמר',
    error: 'לא נשמר — בדקו את החיבור',
    conflict: conflictText,
  }[state];
}

/**
 * The one save indicator used by every editor ("שומר… / נשמר 20:15 / לא נשמר"). A screen may show it
 * twice (top and bottom); only one copy may announce, so pass `announce={false}` to the other.
 */
export function SaveStatus({ state, at, conflictText, announce = true }: { state: SaveState; at?: Date | null; conflictText?: string; announce?: boolean }) {
  return (
    <span {...(announce ? { role: 'status', 'aria-live': 'polite' as const } : { 'aria-hidden': true })} className={cx('inline-flex items-center gap-1.5 text-xs', state === 'error' || state === 'conflict' ? 'font-medium text-red-700' : 'text-ink-muted')}>
      {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {state === 'saved' && <Check className="h-3.5 w-3.5 text-teal" aria-hidden />}
      {saveStatusText(state, at, conflictText)}
    </span>
  );
}
