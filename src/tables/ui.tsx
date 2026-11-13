/** Small shared pieces for Formangle Tables screens (owner, host, guest). */
import { AlertTriangle, Ban, Check, CheckCircle2, Circle, Clock, Loader2, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cx } from '../components/ui';
import { STATUS_HE, TABLE_STATE_HE } from './domain/status';
import type { ReservationStatus, TableDef, TableLiveState, TableShape } from './domain/types';
import { loadCache } from '../lib/loadCache';

/** Left-to-right island for phone numbers, codes, times and mixed strings inside RTL text. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={cx('fz-ltr', className)}>{children}</bdi>;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon; count?: number }[]; label: string; size?: 'md' | 'lg';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = document.dir === 'rtl' ? -1 : 1;
    let next = i;
    if (e.key === 'ArrowRight') next = i + dir;
    else if (e.key === 'ArrowLeft') next = i - dir;
    else return;
    e.preventDefault();
    const n = (next + options.length) % options.length;
    onChange(options[n]!.value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-cloud-300 bg-cloud p-1">
      {options.map((o, i) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
              size === 'lg' ? 'h-11 text-sm' : 'h-9 text-sm',
              active ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="truncate">{o.label}</span>
            {o.count != null && <span className="rounded-full bg-cloud-200 px-1.5 text-xs tabular-nums text-ink-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_STYLE: Record<ReservationStatus | 'late', { cls: string; icon: LucideIcon }> = {
  pending_approval: { cls: 'border-amber-300 bg-amber-50 text-amber-900', icon: Clock },
  confirmed: { cls: 'fz-st-confirmed', icon: Circle },
  arrived: { cls: 'fz-st-arrived', icon: Users },
  seated: { cls: 'border-teal-200 bg-teal-50 text-teal-900', icon: CheckCircle2 },
  completed: { cls: 'border-cloud-300 bg-cloud text-ink-muted', icon: Check },
  cancelled: { cls: 'border-cloud-300 bg-white text-ink-muted line-through decoration-1', icon: Ban },
  rejected: { cls: 'border-cloud-300 bg-white text-ink-muted', icon: Ban },
  no_show: { cls: 'border-red-200 bg-red-50 text-red-800', icon: AlertTriangle },
  expired: { cls: 'border-cloud-300 bg-white text-ink-muted', icon: Clock },
  late: { cls: 'border-orange-300 bg-orange-50 text-orange-800', icon: AlertTriangle },
};

/** Status is always icon + text, never colour alone. */
export function StatusChip({ status, late, className }: { status: ReservationStatus; late?: boolean; className?: string }) {
  const key = late ? 'late' : status;
  const s = STATUS_STYLE[key];
  const Icon = s.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', s.cls, className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {late ? 'מאחרים' : STATUS_HE[status]}
    </span>
  );
}

/** Table colours are CSS variables (see tables.css) so light and dark themes share one drawing. */
export const TABLE_FILL: Record<TableLiveState, { fill: string; stroke: string; text: string; pattern?: string }> = {
  ready: { fill: 'var(--fz-t-ready-fill)', stroke: 'var(--fz-t-ready-stroke)', text: 'var(--fz-t-ready-text)' },
  reserved_soon: { fill: 'var(--fz-t-soon-fill)', stroke: 'var(--fz-t-soon-stroke)', text: 'var(--fz-t-soon-text)' },
  occupied: { fill: 'var(--fz-t-occ-fill)', stroke: 'var(--fz-t-occ-stroke)', text: 'var(--fz-t-occ-text)' },
  cleaning: { fill: 'var(--fz-t-clean-fill)', stroke: 'var(--fz-t-clean-stroke)', text: 'var(--fz-t-clean-text)', pattern: 'url(#fz-stripes)' },
  unavailable: { fill: 'var(--fz-t-off-fill)', stroke: 'var(--fz-t-off-stroke)', text: 'var(--fz-t-off-text)', pattern: 'url(#fz-cross)' },
};

export const TABLE_STATE_SYMBOL: Record<TableLiveState, string> = { ready: '○', reserved_soon: '◔', occupied: '●', cleaning: '≈', unavailable: '×' };

export function StateLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="מקרא מצבי שולחן">
      {(Object.keys(TABLE_FILL) as TableLiveState[]).map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]" style={{ background: TABLE_FILL[s].fill, borderColor: TABLE_FILL[s].stroke, color: TABLE_FILL[s].text }}>
            {TABLE_STATE_SYMBOL[s]}
          </span>
          {TABLE_STATE_HE[s]}
        </li>
      ))}
    </ul>
  );
}

export interface FloorItem extends Pick<TableDef, 'id' | 'label' | 'x' | 'y' | 'w' | 'h' | 'shape' | 'maxCovers'> {
  rotation?: number;
  state?: TableLiveState;
  /** Short, number-only second line (e.g. "2–4" or "19:30 · 4"); mixed-direction text stays out of the map. */
  caption?: string;
  /** What a screen reader hears in addition to label, seats and state. */
  spoken?: string;
  highlight?: boolean;
  dim?: boolean;
}

/** Bounding box of all tables plus a margin; the viewBox never mirrors in RTL. */
export function floorBounds(items: Pick<FloorItem, 'x' | 'y' | 'w' | 'h'>[], margin = 30) {
  if (!items.length) return { x: 0, y: 0, w: 600, h: 400 };
  const minX = Math.min(...items.map((t) => t.x));
  const minY = Math.min(...items.map((t) => t.y));
  const maxX = Math.max(...items.map((t) => t.x + t.w));
  const maxY = Math.max(...items.map((t) => t.y + t.h));
  return { x: minX - margin, y: minY - margin, w: Math.max(200, maxX - minX + margin * 2), h: Math.max(160, maxY - minY + margin * 2) };
}

function Shape({ shape, w, h, fill, stroke, selected }: { shape: TableShape; w: number; h: number; fill: string; stroke: string; selected?: boolean }) {
  const style = { fill, stroke, strokeWidth: selected ? 4 : 2 };
  if (shape === 'round') return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} style={style} />;
  if (shape === 'bar') return <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 2} style={style} />;
  return <rect x={2} y={2} width={w - 4} height={h - 4} rx={shape === 'square' ? 8 : 10} style={style} />;
}

/**
 * The floor as an SVG. Physical coordinates are drawn as stored (dir="ltr" on the SVG), so a
 * Hebrew interface never mirrors the room. Tables are buttons in DOM order (zone, then label),
 * which is also the keyboard order; an accessible list elsewhere offers the same actions.
 */
export function FloorCanvas({
  items, selectedId, onSelect, label, onPointerDownTable, svgRef, zoom = 1, minHeight = 220, maxHeight, editable = false,
}: {
  items: FloorItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  label: string;
  onPointerDownTable?: (e: ReactPointerEvent<SVGGElement>, id: string) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  zoom?: number;
  minHeight?: number;
  maxHeight?: string;
  editable?: boolean;
}) {
  const b = floorBounds(items);
  const vw = b.w / zoom;
  const vh = b.h / zoom;
  const vx = b.x + (b.w - vw) / 2;
  const vy = b.y + (b.h - vh) / 2;
  return (
    <div className="fz-floor w-full" style={{ aspectRatio: `${vw} / ${vh}`, maxHeight: maxHeight ?? '70vh', minHeight }}>
    <svg
      ref={svgRef}
      {...{ dir: 'ltr' }}
      role="group"
      aria-label={label}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full touch-none select-none rounded-xl"
      style={{ background: 'var(--fz-floor-bg)', direction: 'ltr', unicodeBidi: 'isolate' }}
    >
      <defs>
        <pattern id="fz-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" style={{ fill: 'none', stroke: 'var(--fz-floor-grid)', strokeWidth: 1 }} />
        </pattern>
        <pattern id="fz-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" style={{ fill: 'var(--fz-t-clean-fill)' }} />
          <line x1="0" y1="0" x2="0" y2="8" style={{ stroke: 'var(--fz-t-clean-line)', strokeWidth: 3 }} />
        </pattern>
        <pattern id="fz-cross" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" style={{ fill: 'var(--fz-t-off-fill)' }} />
          <path d="M0 0 L10 10 M10 0 L0 10" style={{ stroke: 'var(--fz-t-off-line)', strokeWidth: 1.2 }} />
        </pattern>
      </defs>
      {editable && <rect x={b.x - 2000} y={b.y - 2000} width={b.w + 4000} height={b.h + 4000} fill="url(#fz-grid)" />}
      {items.map((t) => {
        const st = t.state ?? 'ready';
        const c = TABLE_FILL[st];
        const selected = t.id === selectedId;
        const fontSize = Math.max(12, Math.min(22, Math.min(t.w, t.h) / 3.2));
        return (
          <g
            key={t.id}
            data-table={t.label}
            transform={`translate(${t.x} ${t.y}) rotate(${t.rotation ?? 0} ${t.w / 2} ${t.h / 2})`}
            className={cx('cursor-pointer [&:has(:focus-visible)>.fz-focus]:opacity-100', t.dim && 'opacity-40')}
            onClick={() => onSelect?.(t.id)}
            onPointerDown={onPointerDownTable ? (e) => onPointerDownTable(e, t.id) : undefined}
          >
            <rect className="fz-focus" x={-6} y={-6} width={t.w + 12} height={t.h + 12} rx={14} opacity={0} style={{ fill: 'none', stroke: 'var(--fz-floor-focus)', strokeWidth: 3 }} />
            {t.highlight && <rect x={-8} y={-8} width={t.w + 16} height={t.h + 16} rx={16} style={{ fill: 'none', stroke: 'var(--fz-floor-candidate)', strokeWidth: 3, strokeDasharray: '6 4' }} />}
            <Shape shape={t.shape} w={t.w} h={t.h} fill={c.pattern ?? c.fill} stroke={selected ? 'var(--fz-floor-focus)' : c.stroke} selected={selected} />
            <text x={t.w / 2} y={t.h / 2 + (t.caption ? -4 : 1)} aria-hidden textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} style={{ fill: c.text, fontVariantNumeric: 'tabular-nums' }}>
              {t.label}
            </text>
            {t.caption && (
              <text aria-hidden x={t.w / 2} y={t.h / 2 + fontSize * 0.75} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(11, fontSize * 0.6)} style={{ fill: c.text, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>
                {t.caption}
              </text>
            )}
            <rect x={0} y={0} width={t.w} height={t.h} rx={8} role="button" tabIndex={0} aria-pressed={selected} aria-label={`שולחן ${t.label}, ${t.maxCovers} מקומות${t.state ? `, ${TABLE_STATE_HE[st]}` : ''}${t.spoken ? `, ${t.spoken}` : ''}`}
              style={{ fill: 'transparent', outline: 'none' }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(t.id); } }} />
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
export function SaveIndicator({ state, at }: { state: SaveState; at?: Date | null }) {
  const text = {
    idle: '',
    saving: 'שומר…',
    saved: at ? `נשמר ${at.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'נשמר',
    error: 'לא נשמר — בדקו את החיבור',
    conflict: 'מישהו אחר שינה את ההגדרות',
  }[state];
  return (
    <span role="status" aria-live="polite" className={cx('inline-flex items-center gap-1.5 text-xs', state === 'error' || state === 'conflict' ? 'font-medium text-red-700' : 'text-ink-muted')}>
      {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {state === 'saved' && <Check className="h-3.5 w-3.5 text-teal" aria-hidden />}
      {text}
    </span>
  );
}

/** Async loader with a stale-safe result; exposes reload. */

/**
 * Loads data for a screen. With a `cacheName`, a screen you return to shows its last data at once
 * and refreshes underneath (the name keeps different queries apart, also in minified builds).
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], cacheName?: string) {
  const key = cacheName ? `${cacheName}|${JSON.stringify(deps)}` : '';
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>(() => {
    const cached = key ? (loadCache.get(key) as T | undefined) : undefined;
    return { data: cached ?? null, error: null, loading: cached === undefined };
  });
  const gen = useRef(0);
  const load = useCallback(async () => {
    const g = ++gen.current;
    const cached = key ? (loadCache.get(key) as T | undefined) : undefined;
    setState((s) => ({ data: cached ?? s.data, loading: true, error: null }));
    try {
      const data = await fn();
      if (key) loadCache.set(key, data);
      if (g === gen.current) setState({ data, error: null, loading: false });
    } catch (e) {
      if (g === gen.current) setState((s) => ({ ...s, error: e as Error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load, setData: (d: T) => { if (key) loadCache.set(key, d); setState((s) => ({ ...s, data: d })); } };
}

export function Hint({ children, icon: Icon = Sparkles, tone = 'neutral' }: { children: ReactNode; icon?: LucideIcon; tone?: 'neutral' | 'warn' }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm', tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-cloud-200 bg-cloud text-ink-muted')}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function NumberField({ id, label, value, onChange, min, max, step = 1, suffix, hint }: {
  id: string; label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; hint?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={text}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => setText(String(value))}
          className="fz-input h-11 w-24 rounded-xl border border-cloud-300 bg-white px-3 text-[15px] tabular-nums text-ink hover:border-ink-soft"
        />
        {suffix && <span className="min-w-0 text-sm text-ink-muted">{suffix}</span>}
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
