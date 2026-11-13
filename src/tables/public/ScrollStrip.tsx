/**
 * A sideways strip (dates, party sizes) that works with a mouse as well as a finger: on devices
 * with a precise pointer, round arrows appear at an edge only when there is more to see that way,
 * and a vertical mouse wheel scrolls the strip sideways. Touch devices keep native swiping.
 * RTL-aware: "next" always means further along the reading direction.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../components/ui';

export function ScrollStrip({ children, className, label, lang = 'he' }: { children: ReactNode; className?: string; label?: string; lang?: 'he' | 'en' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ back: false, forward: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // RTL scrollLeft runs 0 → -max
    setEdges({ back: pos > 2, forward: max > 2 && pos < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // A vertical wheel over a strip that can scroll sideways moves it sideways (mouse users).
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const before = el.scrollLeft;
      el.scrollLeft += rtl ? -e.deltaY : e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [measure]);

  const go = (forward: boolean) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const step = Math.max(160, el.clientWidth * 0.75) * (forward ? 1 : -1) * (rtl ? -1 : 1);
    el.scrollBy({ left: step, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const he = lang === 'he';

  return (
    <div className="pp-strip relative">
      <div ref={ref} onScroll={measure} className={className} role="group" aria-label={label}>{children}</div>
      {edges.back && (
        <button type="button" aria-label={he ? 'הקודמים' : 'Previous'} onClick={() => go(false)} tabIndex={-1}
          className="pp-strip-arrow start-0">{he ? <ChevronRight className="h-5 w-5" aria-hidden /> : <ChevronLeft className="h-5 w-5" aria-hidden />}</button>
      )}
      {edges.forward && (
        <button type="button" aria-label={he ? 'הבאים' : 'Next'} onClick={() => go(true)} tabIndex={-1}
          className={cx('pp-strip-arrow end-0')}>{he ? <ChevronLeft className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}</button>
      )}
    </div>
  );
}
