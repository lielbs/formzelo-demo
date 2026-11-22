/**
 * Menu editing as pure functions (UX audit 2026-11, A9): stable ids, moving and duplicating items
 * and sections, search, and "paste your menu" import. The editor screen stays thin and every
 * operation is tested. Documents are never mutated: each function returns a new one.
 */
import type { MenuDoc, MenuItem, MenuSection } from '../data/client';

/** A short lowercase token (matches the server's sold-out id rule: ^[a-z0-9]{6,24}$). */
export function newItemId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
}

/** Gives every section and item an id (older menus have none); keeps the ids already there. */
export function ensureIds(doc: MenuDoc, make: () => string = newItemId): MenuDoc {
  let changed = false;
  const sections = doc.sections.map((s) => {
    const items = s.items.map((it) => (it.id ? it : ((changed = true), { ...it, id: make() })));
    if (s.id && items.every((it, i) => it === s.items[i])) return s;
    changed = true;
    return { ...s, id: s.id ?? make(), items };
  });
  return changed ? { ...doc, sections } : doc;
}

const withSections = (doc: MenuDoc, sections: MenuSection[]): MenuDoc => ({ ...doc, sections });

/** Moves an item to another place (another section too); positions are clamped. */
export function moveItem(doc: MenuDoc, from: { s: number; i: number }, to: { s: number; i: number }): MenuDoc {
  const item = doc.sections[from.s]?.items[from.i];
  if (!item || !doc.sections[to.s]) return doc;
  const sections = doc.sections.map((s) => ({ ...s, items: [...s.items] }));
  sections[from.s]!.items.splice(from.i, 1);
  const target = sections[to.s]!.items;
  target.splice(Math.max(0, Math.min(to.i, target.length)), 0, item);
  return withSections(doc, sections);
}

/** Moves a section one place up (-1) or down (+1). */
export function moveSection(doc: MenuDoc, s: number, dir: -1 | 1): MenuDoc {
  const t = s + dir;
  if (t < 0 || t >= doc.sections.length) return doc;
  const sections = [...doc.sections];
  [sections[s], sections[t]] = [sections[t]!, sections[s]!];
  return withSections(doc, sections);
}

/** A copy of an item right after it, with a new id ("שם (עותק)"). */
export function duplicateItem(doc: MenuDoc, s: number, i: number, make: () => string = newItemId): MenuDoc {
  const item = doc.sections[s]?.items[i];
  if (!item) return doc;
  const copy: MenuItem = { ...structuredClone(item), id: make(), name: `${item.name} (עותק)`.slice(0, 100) };
  const sections = doc.sections.map((x, k) => (k === s ? { ...x, items: [...x.items.slice(0, i + 1), copy, ...x.items.slice(i + 1)] } : x));
  return withSections(doc, sections);
}

/** A copy of a section (and its items, with new ids) right after it. */
export function duplicateSection(doc: MenuDoc, s: number, make: () => string = newItemId): MenuDoc {
  const sec = doc.sections[s];
  if (!sec) return doc;
  const copy: MenuSection = { ...structuredClone(sec), id: make(), title: `${sec.title} (עותק)`.slice(0, 80), items: sec.items.map((it) => ({ ...structuredClone(it), id: make() })) };
  return withSections(doc, [...doc.sections.slice(0, s + 1), copy, ...doc.sections.slice(s + 1)]);
}

/** A whole menu with fresh ids (for "duplicate menu"). */
export function cloneWithNewIds(doc: MenuDoc, make: () => string = newItemId): MenuDoc {
  return { ...structuredClone(doc), sections: doc.sections.map((s) => ({ ...structuredClone(s), id: make(), items: s.items.map((it) => ({ ...structuredClone(it), id: make() })) })) };
}

/** Positions of the items whose name or description contains the query (any letter case). */
export function searchItems(doc: MenuDoc, query: string): { s: number; i: number }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: { s: number; i: number }[] = [];
  doc.sections.forEach((sec, s) => sec.items.forEach((it, i) => {
    if (`${it.name} ${it.description ?? ''}`.toLowerCase().includes(q)) out.push({ s, i });
  }));
  return out;
}

const PRICE_AT_END = /^(.*?)[\s.·\-–—:|]*(₪\s?\d+(?:[.,]\d{1,2})?(?:\s?\/\s?\d+(?:[.,]\d{1,2})?)?|\d+(?:[.,]\d{1,2})?(?:\s?\/\s?\d+(?:[.,]\d{1,2})?)?\s?(?:₪|ש"ח|ש״ח|שח|nis)?)\s*$/i;

/**
 * "Paste your menu" (A9.5). One line per dish: a line that ends in a price ("ספריץ 54", "₪48",
 * "40/55") is a dish; a line without a price is a category title; a line right after a dish that
 * starts with "-" or is indented is that dish's description. Empty lines are ignored. Dishes before
 * the first title go to "מנות". Returns sections ready to append (ids added by the caller).
 */
export function parseMenuText(text: string): MenuSection[] {
  const sections: MenuSection[] = [];
  let current: MenuSection | null = null;
  let last: MenuItem | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) { last = null; continue; }
    const desc = /^\s{2,}|^\s*[-•*]\s+/.test(raw) && last;
    const line = raw.trim().replace(/^[-•*]\s+/, '');
    if (desc && last) { last.description = [last.description, line].filter(Boolean).join(' ').slice(0, 400); continue; }
    const m = PRICE_AT_END.exec(line);
    if (m && m[1]!.trim()) {
      if (!current) { current = { title: 'מנות', items: [] }; sections.push(current); }
      const price = m[2]!.replace(/\s+/g, '').replace(/^₪/, '').replace(/(₪|ש"ח|ש״ח|שח|nis)$/i, '');
      last = { name: m[1]!.trim().slice(0, 100), price: price.slice(0, 24) };
      current.items.push(last);
    } else {
      current = { title: line.slice(0, 80), items: [] };
      sections.push(current);
      last = null;
    }
  }
  return sections.filter((s) => s.items.length > 0 || sections.length === 1);
}
