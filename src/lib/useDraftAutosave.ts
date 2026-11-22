import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DraftSaver, type SaveState } from './draftSaver';

export type { SaveState } from './draftSaver';

/**
 * React wrapper of `DraftSaver`: autosaves a draft after a short pause, saves before the screen
 * unmounts and warns the browser when leaving with unsaved changes. Pair with `<SaveStatus/>`.
 *
 *   const autosave = useDraftAutosave<Draft>(async (d) => { const r = await saveDraft(id, d, lock.current); lock.current = r.lockVersion; },
 *     { isConflict: (e) => (e as TablesError).isConflict });
 *   onChange: setDraft(next); autosave.queue(next);
 */
export function useDraftAutosave<T>(save: (value: T) => Promise<void>, options: { isConflict?: (error: unknown) => boolean; delay?: number } = {}) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const conflictRef = useRef(options.isConflict);
  conflictRef.current = options.isConflict;
  const [state, setState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const saver = useMemo(() => new DraftSaver<T>({
    save: (value) => saveRef.current(value),
    isConflict: (error) => conflictRef.current?.(error) ?? false,
    delay: options.delay,
    onState: (s, at) => { setState(s); setSavedAt(at); },
  // The saver lives as long as the screen; `delay` is read once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (saver.busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('beforeunload', before); void saver.flush(); };
  }, [saver]);

  const queue = useCallback((value: T) => saver.queue(value), [saver]);
  const flush = useCallback(() => saver.flush(), [saver]);
  const discard = useCallback(() => saver.discard(), [saver]);
  return { state, savedAt, queue, flush, discard, get busy() { return saver.busy; } };
}
