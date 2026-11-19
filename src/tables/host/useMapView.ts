import { useCallback, useEffect, useRef, useState } from 'react';

export interface Rect { x: number; y: number; w: number; h: number }

export const MAX_SCALE = 5;
const DRAG_SLOP = 6; // px a finger may wander before a tap becomes a drag
const DOUBLE_TAP_MS = 320;

/** The room grown to the box's shape, so scale 1 shows the whole room centred and filling the box. */
export function baseRect(room: Rect, boxW: number, boxH: number): Rect {
  if (!boxW || !boxH) return room;
  const ar = boxW / boxH;
  if (room.w / room.h > ar) {
    const h = room.w / ar;
    return { x: room.x, y: room.y - (h - room.h) / 2, w: room.w, h };
  }
  const w = room.h * ar;
  return { x: room.x - (w - room.w) / 2, y: room.y, w, h: room.h };
}

/** The visible part of the room at a scale and centre, kept inside the room. */
export function viewRect(base: Rect, s: number, cx: number, cy: number): Rect {
  const w = base.w / s;
  const h = base.h / s;
  return {
    x: Math.min(Math.max(cx - w / 2, base.x), base.x + base.w - w),
    y: Math.min(Math.max(cy - h / 2, base.y), base.y + base.h - h),
    w, h,
  };
}

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(1, s));

/**
 * Zoom and pan for the host's floor map, like a maps app: pinch or Ctrl+wheel to zoom, drag to
 * move, double-tap the floor to zoom in. While the whole room is showing, one finger still scrolls
 * the page (touch-action pan-y), so the map never traps the screen; once zoomed in, one finger
 * moves the map. A drag never counts as a tap on a table.
 */
export function useMapView(room: Rect, resetKey: string) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ s: 1, cx: room.x + room.w / 2, cy: room.y + room.h / 2 });
  const base = baseRect(room, size.w, size.h);
  const rect = viewRect(base, view.s, view.cx, view.cy);

  // Latest values for the native listeners and pointer handlers (no re-binding on every frame).
  const live = useRef({ base, rect, size, s: view.s });
  live.current = { base, rect, size, s: view.s };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e!.contentRect.width), h: Math.floor(e!.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A different set of tables (another zone): start again from the whole room.
  useEffect(() => { setView({ s: 1, cx: room.x + room.w / 2, cy: room.y + room.h / 2 }); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Set a scale so that the room point under (px, py) — box pixels — stays under it. */
  const zoomAt = useCallback((s2: number, px: number, py: number, from?: Rect) => {
    const { base: b, rect: r0, size: sz } = live.current;
    if (!sz.w || !sz.h) return;
    const r = from ?? r0;
    const s = clampScale(s2);
    const rx = r.x + (px / sz.w) * r.w;
    const ry = r.y + (py / sz.h) * r.h;
    const w = b.w / s;
    const h = b.h / s;
    const next = viewRect(b, s, rx - (px / sz.w) * w + w / 2, ry - (py / sz.h) * h + h / 2);
    setView({ s, cx: next.x + w / 2, cy: next.y + h / 2 });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const { base: b, rect: r, size: sz, s } = live.current;
    if (!sz.w || s <= 1) return;
    const next = viewRect(b, s, r.x + r.w / 2 - (dx / sz.w) * r.w, r.y + r.h / 2 - (dy / sz.h) * r.h);
    setView({ s, cx: next.x + next.w / 2, cy: next.y + next.h / 2 });
  }, []);

  const zoomBy = useCallback((f: number) => {
    const { size: sz, s } = live.current;
    zoomAt(s * f, sz.w / 2, sz.h / 2);
  }, [zoomAt]);

  const reset = useCallback(() => {
    const { base: b } = live.current;
    setView({ s: 1, cx: b.x + b.w / 2, cy: b.y + b.h / 2 });
  }, []);

  // Pointer gestures.
  const g = useRef({
    pts: new Map<number, { x: number; y: number }>(),
    last: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    moved: false,
    pinch: null as null | { dist: number; rect: Rect; s: number },
    lastTap: { t: 0, x: 0, y: 0 },
    type: 'mouse',
  });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const b = el.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const pinchInfo = () => {
      const [a, b] = [...g.current.pts.values()];
      return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } };
    };
    const beginPinch = () => {
      const { dist, mid } = pinchInfo();
      // Anchor the pinch at its midpoint in room coordinates; later frames re-derive from this.
      g.current.pinch = { dist, rect: live.current.rect, s: live.current.s };
      g.current.last = mid;
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = local(e);
      g.current.type = e.pointerType;
      g.current.pts.set(e.pointerId, p);
      if (g.current.pts.size === 1) { g.current.start = p; g.current.last = p; g.current.moved = false; g.current.pinch = null; }
      if (g.current.pts.size === 2) { g.current.moved = true; beginPinch(); }
    };
    const move = (e: PointerEvent) => {
      const st = g.current;
      if (!st.pts.has(e.pointerId)) return;
      const p = local(e);
      st.pts.set(e.pointerId, p);
      if (st.pts.size >= 2 && st.pinch) {
        const { dist, mid } = pinchInfo();
        const s2 = st.pinch.s * (dist / st.pinch.dist);
        // Zoom around where the pinch started, then follow the fingers as they travel.
        const { size: sz } = live.current;
        const r = st.pinch.rect;
        const startMid = st.last;
        const rx = r.x + (startMid.x / sz.w) * r.w;
        const ry = r.y + (startMid.y / sz.h) * r.h;
        const b = live.current.base;
        const s = clampScale(s2);
        const w = b.w / s;
        const h = b.h / s;
        const next = viewRect(b, s, rx - (mid.x / sz.w) * w + w / 2, ry - (mid.y / sz.h) * h + h / 2);
        setView({ s, cx: next.x + w / 2, cy: next.y + h / 2 });
        return;
      }
      const dx = p.x - st.last.x;
      const dy = p.y - st.last.y;
      if (!st.moved) {
        if (Math.hypot(p.x - st.start.x, p.y - st.start.y) < DRAG_SLOP) return;
        if (live.current.s <= 1) return; // whole room showing: nothing to move, the page scrolls
        st.moved = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
      st.last = p;
      panBy(dx, dy);
    };
    const up = (e: PointerEvent) => {
      const st = g.current;
      if (!st.pts.has(e.pointerId)) return;
      st.pts.delete(e.pointerId);
      if (st.pts.size === 1) {
        // Lifting one finger of a pinch: carry on dragging with the other, without a jump.
        st.pinch = null;
        st.last = [...st.pts.values()][0]!;
        return;
      }
      if (st.pts.size === 0 && !st.moved && e.type === 'pointerup' && e.pointerType !== 'mouse') {
        // Double-tap on the floor (not on a table) zooms in; at the closest zoom it shows the room again.
        const p = local(e);
        const onTable = (e.target as Element | null)?.closest?.('[data-table]');
        const prev = st.lastTap;
        if (!onTable && e.timeStamp - prev.t < DOUBLE_TAP_MS && Math.hypot(p.x - prev.x, p.y - prev.y) < 30) {
          st.lastTap = { t: 0, x: 0, y: 0 };
          if (live.current.s >= MAX_SCALE - 0.01) reset(); else zoomAt(live.current.s * 2, p.x, p.y);
        } else {
          st.lastTap = { t: e.timeStamp, x: p.x, y: p.y };
        }
      }
    };
    // A drag or pinch is not a tap: swallow the click it would otherwise end with.
    const click = (e: MouseEvent) => {
      if (g.current.moved) { e.stopPropagation(); e.preventDefault(); g.current.moved = false; }
    };
    const dbl = (e: MouseEvent) => {
      if (g.current.type !== 'mouse') return; // touch has its own double-tap above
      if ((e.target as Element | null)?.closest?.('[data-table]')) return;
      const p = local(e);
      if (live.current.s >= MAX_SCALE - 0.01) reset(); else zoomAt(live.current.s * 2, p.x, p.y);
    };
    // Ctrl/⌘ + wheel and trackpad pinch (which arrives as ctrl+wheel) zoom; a plain wheel scrolls the page.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = local(e);
      // A mouse wheel notch (~100) is one gentle step; a trackpad pinch sends many small deltas.
      const f = Math.abs(e.deltaY) >= 40 ? (e.deltaY < 0 ? 1.25 : 1 / 1.25) : Math.exp(-e.deltaY * 0.01);
      zoomAt(live.current.s * f, p.x, p.y);
    };
    // Two fingers belong to the map, never to the page (or the browser's own page zoom).
    const touch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('dblclick', dbl);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchmove', touch, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('dblclick', dbl);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchmove', touch);
    };
  }, [panBy, zoomAt, reset]);

  return { boxRef, rect, scale: view.s, zoomBy, reset, size };
}
