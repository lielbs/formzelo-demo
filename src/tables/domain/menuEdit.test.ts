import { describe, expect, it } from 'vitest';
import type { MenuDoc } from '../data/client';
import { cloneWithNewIds, duplicateItem, duplicateSection, ensureIds, moveItem, moveSection, newItemId, parseMenuText, searchItems } from './menuEdit';

let n = 0;
const make = () => `id${String(++n).padStart(6, '0')}`;
const doc = (): MenuDoc => ({ sections: [
  { title: 'פתיחה', items: [{ name: 'סלט', price: '42' }, { name: 'מרק', price: '38', description: 'עגבניות צלויות' }] },
  { title: 'עיקריות', items: [{ name: 'ניוקי', price: '68' }] },
] });

describe('menu editing', () => {
  it('ids follow the server rule and are kept once given', () => {
    expect(newItemId()).toMatch(/^[a-z0-9]{6,24}$/);
    const a = ensureIds(doc(), make);
    expect(a.sections.every((s) => s.id && s.items.every((it) => it.id))).toBe(true);
    expect(ensureIds(a, make)).toBe(a); // nothing to add: same object
  });

  it('moves items within and across sections, and sections up and down', () => {
    const d = doc();
    expect(moveItem(d, { s: 0, i: 1 }, { s: 0, i: 0 }).sections[0]!.items.map((x) => x.name)).toEqual(['מרק', 'סלט']);
    const across = moveItem(d, { s: 0, i: 0 }, { s: 1, i: 99 });
    expect(across.sections.map((s) => s.items.map((x) => x.name))).toEqual([['מרק'], ['ניוקי', 'סלט']]);
    expect(moveSection(d, 1, -1).sections.map((s) => s.title)).toEqual(['עיקריות', 'פתיחה']);
    expect(moveSection(d, 0, -1)).toBe(d);
    expect(d.sections[0]!.items).toHaveLength(2); // original untouched
  });

  it('duplicates an item and a section with new ids, right after the original', () => {
    const d = ensureIds(doc(), make);
    const di = duplicateItem(d, 0, 0, make);
    expect(di.sections[0]!.items.map((x) => x.name)).toEqual(['סלט', 'סלט (עותק)', 'מרק']);
    expect(di.sections[0]!.items[1]!.id).not.toBe(di.sections[0]!.items[0]!.id);
    const ds = duplicateSection(d, 0, make);
    expect(ds.sections.map((s) => s.title)).toEqual(['פתיחה', 'פתיחה (עותק)', 'עיקריות']);
    const ids = ds.sections.flatMap((s) => s.items.map((it) => it.id));
    expect(new Set(ids).size).toBe(ids.length);
    const whole = cloneWithNewIds(d, make);
    expect(whole.sections[0]!.items[0]!.id).not.toBe(d.sections[0]!.items[0]!.id);
  });

  it('finds items by name or description', () => {
    expect(searchItems(doc(), 'עגבני')).toEqual([{ s: 0, i: 1 }]);
    expect(searchItems(doc(), 'ניוק')).toEqual([{ s: 1, i: 0 }]);
    expect(searchItems(doc(), '  ')).toEqual([]);
  });
});

describe('paste your menu', () => {
  it('reads titles, dishes, prices and descriptions', () => {
    const s = parseMenuText(`קוקטיילים
ספריץ אשכוליות 54
Old Fashioned מעושן ₪62
  בורבון, סירופ דמררה
- ביטרס תפוזים

יין
כוס / בקבוק 40/160
קאווה 45 ש"ח`);
    expect(s.map((x) => x.title)).toEqual(['קוקטיילים', 'יין']);
    expect(s[0]!.items).toEqual([
      { name: 'ספריץ אשכוליות', price: '54' },
      { name: 'Old Fashioned מעושן', price: '62', description: 'בורבון, סירופ דמררה ביטרס תפוזים' },
    ]);
    expect(s[1]!.items).toEqual([{ name: 'כוס / בקבוק', price: '40/160' }, { name: 'קאווה', price: '45' }]);
  });

  it('puts dishes before any title under "מנות" and keeps decimals', () => {
    expect(parseMenuText('לחם הבית 18.5\nחומוס - 32')).toEqual([{ title: 'מנות', items: [{ name: 'לחם הבית', price: '18.5' }, { name: 'חומוס', price: '32' }] }]);
  });

  it('a line of only a price is not a dish', () => {
    expect(parseMenuText('קינוחים\n54\nטירמיסו 42')[0]!.items.map((i) => i.name)).toEqual(['טירמיסו']);
  });
});
