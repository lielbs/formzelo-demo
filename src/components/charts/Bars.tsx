/**
 * Light SVG charts (UX audit 2026-11, D4): grouped bars and a day × hour heat grid, in a few
 * hundred lines instead of the ~100 KB charting library. Decorative for screen readers (aria-hidden):
 * every chart sits next to a table with the same numbers.
 */
import { useState } from 'react';

export interface BarSeries { key: string; label: string; color: string }

/** Grouped bars, newest on the left (RTL reading order), with a light grid and a hover readout. */
export function GroupedBars({ data, series, height = 240, labelOf }: {
  data: Record<string, number | string>[]; series: BarSeries[]; height?: number; labelOf: (row: Record<string, number | string>) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const nice = niceMax(max);
  const W = 1000; const H = 300; const pad = { top: 16, bottom: 28, side: 36 };
  const plotW = W - pad.side; const plotH = H - pad.top - pad.bottom;
  const band = plotW / Math.max(1, data.length);
  const bw = Math.max(2, (band * 0.72) / series.length);
  const y = (v: number) => pad.top + plotH - (v / nice) * plotH;
  const ticks = [0, nice / 2, nice];
  const every = Math.ceil(data.length / 12);
  return (
    <div className="relative" style={{ height }}>
      <div className="mb-1 flex flex-wrap gap-3 text-xs text-ink-muted" aria-hidden>
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
        {hover != null && data[hover] && <span className="ms-auto font-medium text-ink">{labelOf(data[hover]!)}: {series.map((s) => `${s.label} ${data[hover]![s.key]}`).join(' · ')}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H - pad.bottom}`} preserveAspectRatio="none" className="h-[calc(100%-2.75rem)] w-full" aria-hidden onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke="#E8EAEE" strokeDasharray="4 4" />)}
        {data.map((d, i) => {
          // Index 0 is the oldest day: drawn on the right, like the reading direction.
          const x0 = plotW - (i + 1) * band + (band - bw * series.length) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={plotW - (i + 1) * band} y={pad.top} width={band} height={plotH} fill={hover === i ? '#F3F4F6' : 'transparent'} />
              {series.map((s, k) => {
                const v = Number(d[s.key]) || 0;
                return <rect key={s.key} x={x0 + k * bw} y={y(v)} width={bw - 1} height={Math.max(0, pad.top + plotH - y(v))} rx={2} fill={s.color} />;
              })}
            </g>
          );
        })}
      </svg>
      {/* Axis labels in HTML: the stretched SVG would distort text. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 bottom-6">
        {ticks.map((t) => (
          <span key={t} className="absolute end-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-muted" style={{ top: `${((y(t) - pad.top) / plotH) * 100}%` }}>{Math.round(t)}</span>
        ))}
      </div>
      <div aria-hidden className="relative h-5 text-[11px] text-ink-muted" style={{ marginInlineEnd: `${(pad.side / W) * 100}%` }}>
        {data.map((d, i) => i % every === 0 && (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${(1 - (i + 0.5) / data.length) * 100}%` }}>{labelOf(d)}</span>
        ))}
      </div>
    </div>
  );
}

const niceMax = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
};

/** Busy hours: weekdays (rows) × hours (columns), darker = more covers. */
export function HeatGrid({ cells, days, hours, valueLabel }: {
  cells: { dow: number; hour: number; value: number }[]; days: string[]; hours: number[]; valueLabel: string;
}) {
  const max = Math.max(1, ...cells.map((c) => c.value));
  const at = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.value ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <caption className="sr-only">{valueLabel} לפי יום בשבוע ושעה</caption>
        <thead><tr><th scope="col" className="w-10" />{hours.map((h) => <th key={h} scope="col" className="font-normal tabular-nums text-ink-muted"><bdi dir="ltr">{String(h).padStart(2, '0')}</bdi></th>)}</tr></thead>
        <tbody>
          {days.map((label, d) => (
            <tr key={d}>
              <th scope="row" className="pe-1 text-start font-medium text-ink-muted">{label}</th>
              {hours.map((h) => {
                const v = at(d, h);
                const a = v ? 0.12 + 0.88 * (v / max) : 0;
                return (
                  <td key={h} title={`${label} ${String(h).padStart(2, '0')}:00 · ${v} ${valueLabel}`}
                    className="h-8 min-w-8 rounded-md text-center tabular-nums"
                    style={{ background: v ? `rgba(194, 65, 12, ${a.toFixed(2)})` : '#F3F4F6', color: a > 0.55 ? '#fff' : '#3F4A5A' }}>
                    {v || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
