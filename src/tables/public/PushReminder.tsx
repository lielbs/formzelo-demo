/**
 * "Notify me before I arrive": a Web Push reminder about three hours before the booking.
 * Free (the browser's own push service). Shown only where the browser can receive pushes (Android,
 * desktop); an iPhone browser tab cannot, and there the calendar file's reminders do the job.
 * The device keeps its own manage link (IndexedDB) for the worker; the server keeps only the
 * browser's push address, deleted a day after the booking.
 */
import { BellOff, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { runtimeConfiguration } from '../../production/runtime';
import { clientToken, rpc } from '../data/client';
import type { TablesError } from '../domain/errors';
import { tx, type Lang } from './i18n';

export interface PushBooking { token: string; venue: string; time: string; party: number; reference: string; startsAt: string; url: string }

const DB = 'formangle-push';
const STORE = 'bookings';
const base = () => import.meta.env.BASE_URL || '/';

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'token' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && 'indexedDB' in window;

/** base64url → bytes (the push service key). */
export function keyBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register(`${base()}push-sw.js`, { scope: base() });
}

type State = 'hidden' | 'off' | 'on' | 'denied' | 'busy';

export function PushReminder({ booking, lang, className }: { booking: PushBooking; lang: Lang; className: string }) {
  const s = tx(lang);
  const [state, setState] = useState<State>('hidden');
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soon = Date.parse(booking.startsAt) - Date.now() < 25 * 60 * 1000;

  useEffect(() => {
    let alive = true;
    if (runtimeConfiguration.mode !== 'production' || soon) return;
    if (!pushSupported()) return;
    rpc<string | null>('tables_push_public_key', {}).then(async (k) => {
      if (!alive || !k) return;
      setKey(k);
      if (Notification.permission === 'denied') { setState('denied'); return; }
      const saved = await idb('readonly', (st) => st.get(booking.token)).catch(() => undefined);
      const reg = await navigator.serviceWorker.getRegistration(base()).catch(() => undefined);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      if (alive) setState(saved && sub && Notification.permission === 'granted' ? 'on' : 'off');
    }).catch(() => { /* reminders unavailable: the calendar buttons still work */ });
    return () => { alive = false; };
  }, [booking.token, soon]);

  async function enable() {
    const config = runtimeConfiguration;
    if (!key || config.mode !== 'production') return;
    setError(null);
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const serverKey = keyBytes(key);
      let sub = await reg.pushManager.getSubscription();
      // Subscribed earlier with another server key: start over with the current one.
      const old = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (sub && (!old || old.length !== serverKey.length || old.some((b, i) => b !== serverKey[i]))) { await sub.unsubscribe(); sub = null; }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey as BufferSource });
      await rpc('tables_public_push_subscribe', { p_token: booking.token, p_client: clientToken(), p_endpoint: sub.endpoint }, lang);
      await idb('readwrite', (st) => st.put({
        ...booking, lang, client: clientToken(), api: config.supabaseUrl, key: config.publishableKey,
        icon: `${base()}favicon.svg`,
      }));
      setState('on');
    } catch (e) {
      setError((e as TablesError).message || s.pushFailed);
      setState('off');
    }
  }

  async function disable() {
    setError(null);
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration(base());
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await rpc('tables_public_push_unsubscribe', { p_token: booking.token, p_client: clientToken(), p_endpoint: sub.endpoint }, lang);
      await idb('readwrite', (st) => st.delete(booking.token));
      const left = await idb('readonly', (st) => st.count());
      if (sub && !left) await sub.unsubscribe();
      setState('off');
    } catch (e) {
      setError((e as TablesError).message || s.pushFailed);
      setState('on');
    }
  }

  if (state === 'hidden') return null;
  return (
    <div className="grid gap-1.5">
      {state === 'denied' ? (
        <p className="text-xs text-ink-muted">{s.pushDenied}</p>
      ) : (
        <button type="button" className={className} disabled={state === 'busy'} aria-pressed={state === 'on'}
          onClick={() => void (state === 'on' ? disable() : enable())}>
          {state === 'on' ? <BellOff className="h-4 w-4" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
          {state === 'on' ? s.pushOff : s.pushOn}
        </button>
      )}
      {state === 'on' && <p role="status" className="text-xs text-ink-muted">{s.pushOnNote}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
