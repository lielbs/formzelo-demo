/** Shared deterministic Hebrew text matching used by the template generator and theme resolver. */

export function normalizeHebrew(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, '') // niqqud & cantillation
    .replace(/[״"']/g, '')
    .replace(/[^֐-׿a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const HEBREW_PREFIXES = 'והבלמשכ';

/** Token forms with up to two attached Hebrew prefix letters removed (ו/ה/ב/ל/מ/ש/כ). */
export function tokenStems(token: string): string[] {
  const stems = [token];
  if (HEBREW_PREFIXES.includes(token[0] ?? '')) {
    stems.push(token.slice(1));
    if (HEBREW_PREFIXES.includes(token[1] ?? '')) stems.push(token.slice(2));
  }
  return stems;
}

/** Phrases match as substrings; single words must start a token (after prefixes), so "זר" won't match "עזרה". */
export function tokenMatches(text: string, tokens: string[], keyword: string): boolean {
  const kw = normalizeHebrew(keyword);
  if (kw.includes(' ')) return text.includes(kw);
  return tokens.some((t) => tokenStems(t).some((s) => s.startsWith(kw)));
}
