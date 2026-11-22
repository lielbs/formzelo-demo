/**
 * Suggested table combinations (UX audit 2026-11, A2.4): two tables of the same zone that stand
 * side by side (a short gap, lined up) can be pushed together for a larger party. The host keeps
 * the final say; this only proposes pairs not already defined.
 */
import type { CombinationDef, TableDef } from './types';

const GAP = 40; // floor units between the facing edges

function adjacent(a: TableDef, b: TableDef): boolean {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  return (overlapY >= Math.min(a.h, b.h) * 0.6 && gapX >= 0 && gapX <= GAP) || (overlapX >= Math.min(a.w, b.w) * 0.6 && gapY >= 0 && gapY <= GAP);
}

export interface ComboSuggestion { tableIds: [string, string]; label: string; minCovers: number; maxCovers: number }

export function suggestCombinations(tables: TableDef[], existing: CombinationDef[], limit = 6): ComboSuggestion[] {
  const taken = new Set(existing.map((c) => [...c.tableIds].sort().join('|')));
  const out: ComboSuggestion[] = [];
  const sorted = [...tables].filter((t) => t.shape !== 'bar').sort((a, b) => a.label.localeCompare(b.label, 'he', { numeric: true }));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!; const b = sorted[j]!;
      if (a.zoneId !== b.zoneId || !adjacent(a, b)) continue;
      const key = [a.id, b.id].sort().join('|');
      if (taken.has(key)) continue;
      const max = a.maxCovers + b.maxCovers;
      out.push({ tableIds: [a.id, b.id], label: `${a.label}+${b.label}`, minCovers: Math.max(a.maxCovers, b.maxCovers) + 1, maxCovers: max });
    }
  }
  return out.sort((x, y) => y.maxCovers - x.maxCovers).slice(0, limit);
}
