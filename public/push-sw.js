/*
 * Formangle booking reminders (Web Push). This worker only shows reminders: it has no fetch
 * handler, so it never caches or serves the site.
 *
 * The push itself is empty. When it arrives, the worker asks the server for the guest's own
 * bookings with the manage links this device saved (the same call as the manage page) and shows
 * the current details, so a changed time or a cancellation is never announced wrongly.
 */
const DB = 'formangle-push';
const STORE = 'bookings';
const SOON_MS = 4 * 60 * 60 * 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'token' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function all() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function remove(token) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(token);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function fresh(entry) {
  try {
    const res = await fetch(`${entry.api}/rest/v1/rpc/tables_public_manage`, {
      method: 'POST',
      headers: { apikey: entry.key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ p_token: entry.token, p_client: entry.client }),
    });
    if (!res.ok) return null;
    const r = await res.json();
    if (!r || !r.venue) return { gone: true };
    return { venue: r.venue.name, time: r.time, party: r.party, reference: r.reference, startsAt: r.startsAt, status: r.status, open: r.open };
  } catch {
    return null;
  }
}

function words(lang, b) {
  if (lang === 'en') return { title: `Reminder: table at ${b.venue}`, body: `Today at ${b.time} · ${b.party} ${b.party === 1 ? 'guest' : 'guests'} · Code ${b.reference}` };
  return { title: `תזכורת: שולחן ב${b.venue}`, body: `היום בשעה ${b.time} · ${b.party === 1 ? 'סועד אחד' : `${b.party} סועדים`} · קוד ${b.reference}` };
}

async function remind() {
  const now = Date.now();
  const entries = await all().catch(() => []);
  const shown = [];
  for (const e of entries) {
    if (Date.parse(e.startsAt) < now - 24 * 60 * 60 * 1000) { await remove(e.token); continue; }
    const f = await fresh(e);
    if (f && f.gone) { await remove(e.token); continue; }
    // Offline: fall back to what was saved with the booking.
    const b = f || { venue: e.venue, time: e.time, party: e.party, reference: e.reference, startsAt: e.startsAt, status: 'confirmed', open: true };
    if (!b.open || b.status !== 'confirmed') continue;
    const start = Date.parse(b.startsAt);
    if (!(start > now - 30 * 60 * 1000 && start <= now + SOON_MS)) continue;
    const w = words(e.lang, b);
    shown.push(self.registration.showNotification(w.title, {
      body: w.body, tag: `booking-${b.reference}`, lang: e.lang === 'en' ? 'en' : 'he', dir: e.lang === 'en' ? 'ltr' : 'rtl',
      icon: e.icon, badge: e.icon, data: { url: e.url },
    }));
  }
  // A push must always show something; this only happens if the booking could not be matched.
  if (!shown.length) {
    const e = entries[entries.length - 1];
    shown.push(self.registration.showNotification(e && e.lang === 'en' ? 'Booking reminder' : 'תזכורת להזמנה שלך', {
      body: e && e.lang === 'en' ? 'Tap to see your booking.' : 'הקישו כדי לראות את ההזמנה.', tag: 'booking-reminder', data: { url: e ? e.url : '/live/' },
    }));
  }
  await Promise.all(shown);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => event.waitUntil(remind()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/live/';
  // Only our own pages.
  const target = new URL(url, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(target.href));
});
