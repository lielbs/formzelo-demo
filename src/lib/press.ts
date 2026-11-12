/**
 * App-like tap feedback for every control in Formangle.
 *
 * The browser's :active state is unreliable on phones (iOS Safari barely shows it, and a quick tap
 * ends before anyone sees it), so presses are animated in code: the control sinks the moment a
 * finger touches it and springs back on release, held long enough to be seen on fast taps.
 * It animates the independent `scale` property through the Web Animations API, so it never fights
 * a control's own transform or transitions. Scrolling, dragging, disabled controls, reduced motion
 * and opted-out areas (`data-no-press`) are left alone.
 */
export const PRESSABLE = [
  'button:not([disabled])',
  'a[href]',
  'summary',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[data-press]',
].join(',');

/** Small controls sink more than wide ones, so the motion reads the same on every size. */
export function pressScale(width: number, height: number): number {
  const area = width * height;
  if (area >= 60_000) return 0.985; // cards and large panels
  if (width >= 200) return 0.97; // full-width buttons
  if (width <= 64 && height <= 64) return 0.88; // icon buttons, chips, tabs
  return 0.94;
}

const PRESS_IN = { duration: 110, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' as const };
const SPRING_OUT = { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' };
const MIN_HOLD_MS = 90;
const MOVE_CANCEL_PX = 10;

export function installPressFeedback(doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win || typeof Element === 'undefined' || !('animate' in Element.prototype)) return () => undefined;
  if (!win.CSS?.supports?.('scale', '1')) return () => undefined;
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let current: { el: HTMLElement; hold: Animation; start: number; scale: number; x: number; y: number } | null = null;

  const release = () => {
    if (!current) return;
    const { el, hold, start, scale } = current;
    current = null;
    const wait = Math.max(0, MIN_HOLD_MS - (performance.now() - start));
    win.setTimeout(() => {
      el.animate([{ scale: String(scale) }, { scale: '1' }], SPRING_OUT);
      hold.cancel();
    }, wait);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || reduced?.matches) return;
    const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
    if (!el || el.closest('[data-no-press]')) return;
    release();
    const r = el.getBoundingClientRect();
    const scale = pressScale(r.width, r.height);
    current = { el, hold: el.animate([{ scale: '1' }, { scale: String(scale) }], PRESS_IN), start: performance.now(), scale, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (current && Math.hypot(e.clientX - current.x, e.clientY - current.y) > MOVE_CANCEL_PX) release();
  };

  doc.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  doc.addEventListener('pointermove', onMove, { capture: true, passive: true });
  doc.addEventListener('pointerup', release, { capture: true, passive: true });
  doc.addEventListener('pointercancel', release, { capture: true, passive: true });
  win.addEventListener('blur', release);
  win.addEventListener('scroll', release, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('pointerdown', onDown, { capture: true });
    doc.removeEventListener('pointermove', onMove, { capture: true });
    doc.removeEventListener('pointerup', release, { capture: true });
    doc.removeEventListener('pointercancel', release, { capture: true });
    win.removeEventListener('blur', release);
    win.removeEventListener('scroll', release, { capture: true });
  };
}
