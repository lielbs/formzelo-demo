/**
 * Keeps a host device's shift projection current: one Realtime subscription to the venue's
 * revision row, refetch on any newer revision, reconnect or gap, 30 s polling while the channel is
 * down, and an honest connection state for the UI. Never patches state from event payloads.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getProductionSupabaseClient } from '../../production/supabaseClient';
import { acceptProjection, initialSync, syncReducer } from '../domain/revision';
import type { TablesError } from '../domain/errors';
import type { Shift, WaitlistEntry } from '../domain/types';
import { getShift, getWaitlist } from './client';

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

export function useShiftSync(venueId: string, date: string) {
  const [shift, setShift] = useState<(Shift & { waitlist: WaitlistEntry[] }) | null>(null);
  const [error, setError] = useState<TablesError | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [sync, dispatch] = useReducer(syncReducer, undefined, () => initialSync());
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const key = `${venueId}|${date}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  const refetch = useCallback(async () => {
    const requestedFor = keyRef.current;
    dispatch({ type: 'fetchStart' });
    try {
      const [s, w] = await Promise.all([getShift(venueId, date), getWaitlist(venueId, date)]);
      if (keyRef.current !== requestedFor) return;
      if (!acceptProjection(syncRef.current, s.revision) && syncRef.current.shown > 0) {
        dispatch({ type: 'fetched', revision: syncRef.current.shown });
        return;
      }
      setShift({ ...s, waitlist: w });
      setError(null);
      setLastSync(new Date());
      dispatch({ type: 'fetched', revision: s.revision });
    } catch (e) {
      setError(e as TablesError);
      dispatch({ type: 'fetchFailed' });
    }
  }, [venueId, date]);

  // New venue/date: start over.
  useEffect(() => {
    setShift(null);
    dispatch({ type: 'reset' });
  }, [key]);

  useEffect(() => {
    if (sync.needsFetch && !sync.fetching) void refetch();
  }, [sync.needsFetch, sync.fetching, refetch]);

  // Realtime: one channel per device, filtered to this venue.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void getProductionSupabaseClient().then((client) => {
      if (cancelled) return;
      channel = client
        .channel(`tables-shift-${venueId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables_shift_revisions', filter: `venue_id=eq.${venueId}` }, (payload) => {
          const row = payload.new as { service_date?: string; revision?: number } | null;
          if (row?.service_date === date && typeof row.revision === 'number') dispatch({ type: 'revision', revision: row.revision });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnection(navigator.onLine === false ? 'offline' : 'live');
            dispatch({ type: 'reconnect' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnection(navigator.onLine === false ? 'offline' : 'polling');
          }
        });
    });
    return () => {
      cancelled = true;
      if (channel) void getProductionSupabaseClient().then((c) => c.removeChannel(channel!));
    };
  }, [venueId, date]);

  // Polling fallback while the channel is not live, plus a slow safety refresh.
  useEffect(() => {
    const every = connection === 'live' ? 60_000 : 30_000;
    const t = setInterval(() => { if (navigator.onLine !== false) dispatch({ type: 'reconnect' }); }, every);
    return () => clearInterval(t);
  }, [connection]);

  useEffect(() => {
    const offline = () => setConnection('offline');
    const online = () => { setConnection('polling'); dispatch({ type: 'reconnect' }); };
    const visible = () => { if (document.visibilityState === 'visible') dispatch({ type: 'reconnect' }); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  return { shift, error, connection, lastSync, refetch, revision: sync.shown };
}
