/**
 * Bidirectional text helpers. Numeric ranges and times inside Hebrew sentences are wrapped in
 * Unicode isolates (LRI … PDI) so "7–12" never displays as "12–7".
 */
export const iso = (s: string) => `\u2066${s}\u2069`;
export const range = (a: number | string, b: number | string) => iso(`${a}–${b}`);
