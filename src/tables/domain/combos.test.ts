import { describe, expect, it } from 'vitest';
import { suggestCombinations } from './combos';
import type { TableDef } from './types';

const t = (label: string, x: number, y: number, extra: Partial<TableDef> = {}): TableDef => ({ id: `t${label}`, label, zoneId: 'a', minCovers: 2, maxCovers: 4, shape: 'square', x, y, w: 70, h: 70, ...extra });

describe('suggested combinations', () => {
  it('pairs tables side by side in the same zone, never across zones or far apart', () => {
    const tables = [t('1', 0, 0), t('2', 100, 0), t('3', 400, 0), t('4', 0, 100), t('5', 100, 0, { id: 't5', zoneId: 'b' })];
    const s = suggestCombinations(tables, []);
    expect(s.map((x) => x.label).sort()).toEqual(['1+2', '1+4']);
    expect(s[0]).toMatchObject({ minCovers: 5, maxCovers: 8 });
  });
  it('skips pairs already defined and bar seats', () => {
    const tables = [t('1', 0, 0), t('2', 100, 0), t('ב1', 0, 100, { shape: 'bar' })];
    expect(suggestCombinations(tables, [{ id: 'c', label: '1+2', tableIds: ['t2', 't1'], minCovers: 5, maxCovers: 8, priority: 0 }])).toEqual([]);
  });
});
