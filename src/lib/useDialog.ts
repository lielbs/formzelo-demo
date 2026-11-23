import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last: only the top one answers Escape and Tab. */
const stack: symbol[] = [];

/**
 * The behaviour every dialog shares (Modal and the Tables sheet): the page behind does not scroll,
 * Tab stays inside, Escape closes only the top dialog, and focus returns to the opener.
 *
 * Set up once per opening. `onClose` and `initialFocus` are read through refs, so a parent that
 * re-renders on every keystroke (and passes a new arrow each time) never moves the focus.
 */
export function useDialog(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  initialFocus?: (panel: HTMLElement) => HTMLElement | null | undefined,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const focusRef = useRef(initialFocus);
  focusRef.current = initialFocus;

  useEffect(() => {
    if (!open) return;
    const me = Symbol('dialog');
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      // Capture phase + stopImmediatePropagation: a panel behind the dialog never sees this Escape.
      if (e.key === 'Escape') { e.stopImmediatePropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      // Tab pressed before the dialog took focus (or after a click outside it): bring focus inside.
      if (!panel.current.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => {
      const el = panel.current;
      if (el) (focusRef.current?.(el) ?? el).focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      // Restore what was there before; the last dialog to close leaves the page scrollable.
      document.body.style.overflow = overflow;
      clearTimeout(t);
      opener?.focus?.();
    };
  }, [open, panel]);
}
