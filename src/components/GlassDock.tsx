import type { LucideIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './ui';

export interface DockItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Route for navigation docks; without it the item calls onSelect. */
  to?: string;
  onSelect?: () => void;
  badge?: number;
  badgeLabel?: string;
  /** Accessible name when it differs from the visible label. */
  ariaLabel?: string;
  /** For an item that opens a menu. */
  expanded?: boolean;
}

export interface DockAction {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Formangle's phone dock: a floating frosted-glass capsule whose highlight slides to the current
 * item. Tap an item, or drag a finger along the capsule — the highlight follows and settles on the
 * nearest item when released. A round glass action button sits beside it.
 *
 * mode "radio" (views of one screen): a radiogroup with arrow-key navigation.
 * mode "nav" (app sections): links with aria-current; Tab moves between them.
 * hideFrom: the width from which the page shows its own navigation instead.
 */
export function GlassDock({ label, items, active, mode, onChoose, action, hideFrom }: {
  label: string; items: DockItem[]; active: number; mode: 'radio' | 'nav';
  onChoose: (index: number) => void; action?: DockAction; hideFrom: 'md' | 'lg';
}) {
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; x: number; dragging: boolean } | null>(null);
  const [drag, setDrag] = useState<{ x: number; hot: number } | null>(null);
  const n = items.length;

  /** Finger position along the capsule, from its start edge (the right one in Hebrew). */
  const measure = (clientX: number) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const cell = (r.width - 10) / n;
    const fromStart = rtl ? r.right - 5 - clientX : clientX - r.left - 5;
    const offset = Math.min(Math.max(fromStart - cell / 2, 0), cell * (n - 1));
    return { x: rtl ? -offset : offset, hot: Math.round(offset / cell) };
  };
  const choose = (i: number) => { if (i !== active && items[i]) onChoose(i); };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'radio') return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'ArrowRight' ? (rtl ? -1 : 1) : 0;
    if (!step) return;
    e.preventDefault();
    const next = ((active < 0 ? 0 : active) + step + n) % n;
    choose(next);
    box.current?.querySelectorAll<HTMLElement>('[data-dock-item]')[next]?.focus();
  };

  const glow = drag
    ? { transform: `translateX(${drag.x}px) scale(1.06, 1.08)`, opacity: 1 }
    : { transform: `translateX(${-100 * Math.max(active, 0)}%)`, opacity: active < 0 ? 0 : 1 };
  const ActionIcon = action?.icon;
  const actionCls = 'fz-glass fz-dock-action';

  return (
    <nav aria-label={label} className={cx('fz-dock', hideFrom === 'md' ? 'fz-dock-phone' : 'fz-dock-handheld')}>
      <div ref={box} role={mode === 'radio' ? 'radiogroup' : undefined} aria-label={mode === 'radio' ? 'תצוגה' : undefined}
        className="fz-glass fz-dock-items" data-dragging={drag ? '' : undefined}
        style={{ ['--fz-dock-n' as string]: n }}
        onPointerDown={(e) => { if (e.button === 0) press.current = { id: e.pointerId, x: e.clientX, dragging: false }; }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          if (!p.dragging && Math.abs(e.clientX - p.x) < 8) return;
          if (!p.dragging) { p.dragging = true; box.current?.setPointerCapture(e.pointerId); }
          const m = measure(e.clientX);
          setDrag((d) => { if (d && d.hot !== m.hot) navigator.vibrate?.(6); return m; });
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          if (!p?.dragging) return;
          choose(measure(e.clientX).hot);
          setDrag(null);
        }}
        onPointerCancel={() => { press.current = null; setDrag(null); }}
        onKeyDown={onKeyDown}>
        <span className="fz-dock-glow" aria-hidden style={glow} />
        {items.map((it, i) => {
          const on = i === active;
          const Icon = it.icon;
          const inner = (
            <>
              <Icon key={on ? 'on' : 'off'} className="fz-dock-icon h-[22px] w-[22px]" aria-hidden />
              <span>{it.label}</span>
              {!!it.badge && <span className="fz-dock-badge" aria-label={it.badgeLabel ?? String(it.badge)}>{it.badge}</span>}
            </>
          );
          const common = { 'data-dock-item': '', 'data-hot': drag?.hot === i ? '' : undefined, className: 'fz-dock-item' };
          if (mode === 'radio') {
            return (
              <button key={it.key} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => choose(i)} {...common}>{inner}</button>
            );
          }
          return it.to ? (
            <Link key={it.key} to={it.to} aria-label={it.ariaLabel} aria-current={on ? 'page' : undefined} data-on={on || undefined} {...common}>{inner}</Link>
          ) : (
            <button key={it.key} type="button" aria-label={it.ariaLabel} aria-expanded={it.expanded} data-on={on || undefined} onClick={() => it.onSelect?.()} {...common}>{inner}</button>
          );
        })}
      </div>
      {action && ActionIcon && (action.to ? (
        <Link to={action.to} aria-label={action.label} title={action.label} className={actionCls}><ActionIcon className="h-7 w-7" aria-hidden /></Link>
      ) : (
        <button type="button" onClick={action.onClick} disabled={action.disabled} aria-label={action.label} title={action.label} className={actionCls}>
          <ActionIcon className="h-7 w-7" aria-hidden />
        </button>
      ))}
    </nav>
  );
}
