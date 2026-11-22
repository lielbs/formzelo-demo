/**
 * "Remember me on this device" for guest pages (UX audit A7.5): name, phone and email only, on the
 * guest's own device (localStorage), only when they tick the box, and removed when they untick it.
 * Never sent anywhere by itself.
 */
const KEY = 'fz_guest_details';
export interface RememberedGuest { name?: string; phone?: string; email?: string }

export function loadGuest(): RememberedGuest | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as RememberedGuest;
    const clean = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);
    const out = { name: clean(v.name, 120), phone: clean(v.phone, 24), email: clean(v.email, 254) };
    return out.name || out.phone ? out : null;
  } catch {
    return null;
  }
}

export function saveGuest(g: RememberedGuest | null): void {
  try {
    if (!g || (!g.name && !g.phone)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ name: g.name, phone: g.phone, email: g.email }));
  } catch { /* storage unavailable: nothing to remember */ }
}
