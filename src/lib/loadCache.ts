/**
 * Last results of screen queries, so a screen you return to appears at once and refreshes underneath.
 * Cleared whenever the signed-in person changes, so nobody ever sees the previous person's data.
 */
export const loadCache = new Map<string, unknown>();
const clearers = new Set<() => void>();
export function onClearLoadCache(fn: () => void) { clearers.add(fn); }
export function clearLoadCache() {
  loadCache.clear();
  clearers.forEach((fn) => fn());
}
