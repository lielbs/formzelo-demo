import { useEffect } from 'react';

/**
 * Unsaved-change protection while `dirty`: reload / close (beforeunload) and
 * every in-app link or `[data-fz-leave]` control, caught in the capture phase
 * before the router handles the click. Elements inside `[data-fz-canvas]`
 * (live previews) are ignored.
 */
export function useUnsavedGuard(dirty: boolean, message = 'יש שינויים שלא נשמרו. לצאת בלי לשמור?') {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('a[href], [data-fz-leave]');
      if (!el || el.closest('[data-fz-canvas]')) return;
      if (el instanceof HTMLAnchorElement && (el.target === '_blank' || el.getAttribute('href')?.startsWith('#'))) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, message]);
}
