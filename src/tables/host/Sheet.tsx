import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on phones, centred dialog from 768 px. Escape and the scrim close it, Tab stays
 * inside, the page behind does not scroll, and focus returns to the opener.
 */
export function Sheet({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() ?? panel.current?.focus(), 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
      opener?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fz-tables" dir="rtl">
      <div className="hs-sheet-scrim" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="hs-sheet focus:outline-none">
        <div className="hs-sheet-grip" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="hs-muted mt-0.5 text-sm">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה"
            className="hs-muted -me-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--hs-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="hs-sheet-foot flex gap-2 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
