/**
 * Realtime revision reducer. The server bumps one counter per venue/service date in the same
 * transaction as every change. A device keeps the revision of the projection it shows:
 *  - an event with a revision <= the shown one is stale and ignored;
 *  - any newer revision means "refetch" (we never patch state from the event payload);
 *  - a reconnect, or an event older than our last fetch start, also refetches.
 */
export interface SyncState { shown: number; latestSeen: number; fetching: boolean; needsFetch: boolean }

export const initialSync = (shown = 0): SyncState => ({ shown, latestSeen: shown, fetching: false, needsFetch: true });

export type SyncEvent =
  | { type: 'reset' }
  | { type: 'revision'; revision: number }
  | { type: 'reconnect' }
  | { type: 'fetchStart' }
  | { type: 'fetched'; revision: number }
  | { type: 'fetchFailed' };

export function syncReducer(s: SyncState, e: SyncEvent): SyncState {
  switch (e.type) {
    case 'reset':
      return initialSync();
    case 'revision':
      if (e.revision <= s.shown && e.revision <= s.latestSeen) return s;
      return { ...s, latestSeen: Math.max(s.latestSeen, e.revision), needsFetch: e.revision > s.shown };
    case 'reconnect':
      return { ...s, needsFetch: true };
    case 'fetchStart':
      return { ...s, fetching: true, needsFetch: false };
    case 'fetched':
      // A projection older than what we already show (out-of-order response) is ignored by the caller.
      return { shown: Math.max(s.shown, e.revision), latestSeen: Math.max(s.latestSeen, e.revision), fetching: false,
        needsFetch: s.latestSeen > Math.max(s.shown, e.revision) };
    case 'fetchFailed':
      return { ...s, fetching: false, needsFetch: true };
  }
}

/** Whether a fetched projection may replace what is on screen. */
export const acceptProjection = (s: SyncState, revision: number) => revision >= s.shown;
