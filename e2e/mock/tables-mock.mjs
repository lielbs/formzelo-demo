// A fictional Tables venue for looking at screens without any backend (UX audit 2026-11, 0.4).
// The app runs in production mode against http://127.0.0.1:54321 where nothing listens
// (`npm run dev:mock`); Playwright answers every call here. Nothing leaves the machine.
//
// Everything is invented: the venue "Indigo 8", a generated floor of 32 tables in 4 zones,
// 555 phone numbers, and the CC0 kitchen photos of public/showcase/urban. No customer data.
import { fileURLToPath } from 'node:url';

export const APP = process.env.APP ?? 'http://localhost:5198';
export const DATE = '2026-11-27'; // a Friday
export const NOW = new Date(`${DATE}T20:15:00+02:00`);
export const at = (hm, plus = 0) => { const d = new Date(`${DATE}T${hm}:00+02:00`); d.setMinutes(d.getMinutes() + plus); return d.toISOString(); };
export const ORG_ID = '3c5e7a10-0000-4000-8000-0000000000aa';
const USER_ID = '3c5e7a10-0000-4000-8000-0000000000bb';
export const uid = (n) => `3c5e7a10-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const VENUE_ID = uid(1);
export const SLUG = 'indigo-8';
export const LIVE = `/app/tables/${VENUE_ID}/live`;

const PHOTOS = fileURLToPath(new URL('../../public/showcase/urban/', import.meta.url));
const ASSETS = { ast_mockhero0000: 'view.jpg', ast_mockslate000: 'slate.jpg', ast_mocktable000: 'table.jpg', ast_mockterrace0: 'terrace.jpg', ast_mockgnocchi0: 'gnocchi.jpg', ast_mocklasagna0: 'lasagna.jpg' };

// ---------- Floor: 4 zones, 32 tables on a grid ----------
const ZONES = [{ id: 'z-in', name: 'פנים' }, { id: 'z-out', name: 'חוץ' }, { id: 'z-high', name: 'גבוהים' }, { id: 'z-bar', name: 'בר' }];
const TABLES = [];
const add = (label, zoneId, shape, min, max, x, y, w, h) => TABLES.push({ id: uid(100 + TABLES.length), label, zoneId, shape, minCovers: min, maxCovers: max, x, y, w, h, rotation: 0 });
for (let i = 0; i < 10; i++) add(String(110 + i * 10), 'z-in', i % 3 ? 'square' : 'rect', 2, i % 3 ? 4 : 6, 40 + (i % 5) * 140, 40 + Math.floor(i / 5) * 120, i % 3 ? 70 : 110, 70);
for (let i = 0; i < 10; i++) add(String(410 + i * 10), 'z-out', 'round', 2, 4, 40 + (i % 5) * 140, 320 + Math.floor(i / 5) * 120, 70, 70);
for (let i = 0; i < 4; i++) add(`ג${i + 1}`, 'z-high', 'rect', 2, 4, 800, 40 + i * 110, 80, 70);
for (let i = 0; i < 8; i++) add(`בר ${i + 1}`, 'z-bar', 'bar', 1, 1, 40 + i * 75, 600, 60, 60);
const tid = (label) => TABLES.find((t) => t.label === label).id;

export const DRAFT = {
  schema: 1,
  basics: { name: 'Indigo 8', timezone: 'Asia/Jerusalem', venueType: 'bar', locale: 'he', address: 'רחוב הנמל 8, תל אביב', phone: '+97235550808' },
  services: [{ key: 'night', name: 'ערב', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '19:00', lastSeating: '23:30', durationMinutes: 120 }],
  zones: ZONES.map((z, i) => ({ ...z, sort: i })),
  tables: TABLES,
  combinations: [],
  policy: { slotMinutes: 30, leadMinutes: 0, horizonDays: 30, minParty: 1, maxParty: 10, bufferMinutes: 10, approvalMode: 'conditional', pendingMode: 'unallocated', pendingHoldMinutes: 15,
    cancelCutoffMinutes: 60, modifyCutoffMinutes: 60, allowGuestModify: true, zoneChoice: false, zonePreference: 'soft',
    rules: [{ id: 'big', name: 'קבוצה של 8 ומעלה', enabled: true, priority: 1, when: { partyAtLeast: 8 }, then: 'require_manual' }], pacing: null, waitlist: { publicEnabled: true, offerMinutes: 10 } },
  guest: { intro: 'בר קוקטיילים · תקליטים עד מאוחר', terms: 'השולחן שמור לשעתיים. אפשר לבטל עד שעה לפני.', showWhatsapp: true },
  progress: { step: 'review', visited: ['basics', 'hours', 'seating', 'rules', 'guest', 'review'] },
};

const PAGES = {
  version: 1,
  theme: { preset: 'cocktail_bar', inheritBrand: false, showLogo: false, heroStyle: 'banner', palette: { accent: '#E0479E', background: '#17122B', surface: '#221A3D', text: '#F1ECFF' },
    typography: 'display', button: 'pill', card: 'elevated', radius: 'lg', background: 'gradient', pattern: 'diamonds', heroAssetId: 'ast_mockhero0000' },
  booking: { ownTheme: false, copy: { title: 'שומרים לכם מקום על הבר', description: 'בחרו ערב ונשמור לכם מקום.', submitLabel: 'שמרו לנו מקום' },
    fields: [{ key: 'name', kind: 'builtin', group: 'contact' }, { key: 'phone', kind: 'builtin', group: 'contact' }, { key: 'email', kind: 'builtin', group: 'contact', hidden: true },
      { key: 'q_celebrate01', kind: 'select', label: 'חוגגים משהו?', options: ['יום הולדת', 'דייט', 'ערב עם חברים'], group: 'extra' },
      { key: 'requests', kind: 'builtin', group: 'extra', label: 'הערה לבר' }] },
  waitlist: { ownTheme: false, copy: {}, fields: [{ key: 'name', kind: 'builtin', group: 'contact' }, { key: 'phone', kind: 'builtin', group: 'contact' }] },
};

// ---------- Tonight ----------
let n = 0;
const reservation = (o) => ({
  id: uid(500 + n), reference: `IN-${3100 + n++}`, serviceKey: 'night', time: o.time, startsAt: at(o.time), endsAt: at(o.time, 120), party: o.party, status: o.status, source: o.source ?? 'online',
  approval: o.status === 'pending_approval' ? 'manual' : 'auto', approvalRule: o.status === 'pending_approval' ? 'קבוצה של 8 ומעלה' : null, guestName: o.name, guestPhone: `050-555-${String(2100 + n * 7).padStart(4, '0')}`,
  requests: o.requests ?? null, lockVersion: 1, pendingExpiresAt: o.status === 'pending_approval' ? at('20:45') : null,
  arrivedAt: o.arrived ? at(o.arrived) : (o.seated ? at(o.seated, -2) : null), seatedAt: o.seated ? at(o.seated) : null, completedAt: o.completed ? at(o.completed) : null,
  overrideReason: null, tableIds: (o.tables ?? []).map(tid), notesCount: 0, visits: o.visits ?? 0, noShows: 0, customAnswers: null,
});
const RESERVATIONS = [
  { name: 'אלון ברק', party: 6, time: '19:00', status: 'completed', tables: ['110'], seated: '19:04', completed: '20:58' },
  { name: 'נוי כהן', party: 2, time: '19:30', status: 'seated', tables: ['בר 3', 'בר 4'], seated: '19:33', visits: 4 },
  { name: 'יובל ומאיה', party: 2, time: '19:30', status: 'seated', tables: ['120'], seated: '19:36' },
  { name: 'שחר לוי', party: 4, time: '19:45', status: 'seated', tables: ['130'], seated: '19:49', requests: 'יום הולדת 30' },
  { name: 'קבוצת טל', party: 6, time: '20:00', status: 'seated', tables: ['140'], seated: '20:06', source: 'phone', visits: 2 },
  { name: 'רוני אשכנזי', party: 4, time: '20:00', status: 'seated', tables: ['410'], seated: '20:03' },
  { name: 'תום גבאי', party: 3, time: '20:15', status: 'arrived', arrived: '20:09', visits: 1 },
  { name: 'אור ודנה', party: 2, time: '20:30', status: 'confirmed', tables: ['בר 6', 'בר 7'] },
  { name: 'גל שמעוני', party: 4, time: '20:45', status: 'confirmed', tables: ['420'] },
  { name: 'איתי רז', party: 2, time: '21:00', status: 'confirmed' },
  { name: 'קרן ואלעד', party: 8, time: '21:00', status: 'pending_approval' },
  { name: 'שירה מנסור', party: 4, time: '21:30', status: 'confirmed', requests: 'פינה שקטה' },
  { name: 'מאיה שטרן', party: 2, time: '22:30', status: 'confirmed' },
].map(reservation);
const WAITLIST = [
  { id: uid(900), guestName: 'ענבל ורון', guestPhone: '050-555-3401', party: 2, status: 'waiting', date: DATE, desiredTime: null, source: 'public', priority: 0, priorityReason: null, notes: null, joinedAt: at('19:58'), offerExpiresAt: null, lockVersion: 1, quotedMin: 10, quotedMax: 20, heldTableIds: [], suggestion: { tableIds: [tid('430')], label: '430', kind: 'table' }, rank: 1 },
  { id: uid(901), guestName: 'חבורת יוסי', guestPhone: '050-555-3402', party: 5, status: 'waiting', date: DATE, desiredTime: null, source: 'staff', priority: 0, priorityReason: null, notes: 'רוצים בחוץ', joinedAt: at('20:09'), offerExpiresAt: null, lockVersion: 1, quotedMin: 20, quotedMax: 30, heldTableIds: [], suggestion: null, rank: 2 },
];
const shift = (now) => ({
  venue: { id: VENUE_ID, name: 'Indigo 8', slug: SLUG, timezone: 'Asia/Jerusalem', status: 'published' }, role: 'manager', serviceDate: DATE, serverNow: now.toISOString(), revision: 42, published: true,
  services: DRAFT.services, closed: [], zones: ZONES, tables: TABLES.map((t) => ({ ...t, accessible: false, opState: null, opReason: null })), reservations: RESERVATIONS, waitlist: WAITLIST,
});

// ---------- Menus: a small photo menu and a large one (72 items) ----------
const big = Array.from({ length: 6 }, (_, s) => ({ title: ['קוקטיילים', 'יין', 'בירות', 'אוכל לבר', 'קינוחים', 'ללא אלכוהול'][s],
  items: Array.from({ length: 12 }, (_, i) => ({ name: `פריט ${s + 1}.${i + 1}`, description: 'תיאור קצר של המנה', price: String(38 + i * 3), dietary: i % 4 === 0 ? ['vegan'] : [], allergens: i % 5 === 0 ? ['gluten'] : [] })) }));
const SMALL = { hero: { title: 'מהמטבח הערב', subtitle: 'עד חצות', imageAssetId: 'ast_mockslate000' }, sections: [
  { title: 'מנות', items: [{ name: 'ניוקי ערמונים', description: 'חמאה חומה, מרווה', price: '68', imageAssetId: 'ast_mockgnocchi0' }, { name: 'לזניה של השף', description: 'ראגו שש שעות', price: '74', imageAssetId: 'ast_mocklasagna0' }] }] };
const MENU_ROWS = [
  { id: uid(701), title: 'מהמטבח', status: 'published', lockVersion: 3, publishedVersion: 5, hasUnpublishedChanges: false, problems: [], draft: SMALL },
  { id: uid(702), title: 'תפריט מלא (72 פריטים)', status: 'draft', lockVersion: 1, publishedVersion: null, hasUnpublishedChanges: true, problems: [], draft: { sections: big } },
];
const ANALYTICS_DAYS = Array.from({ length: 28 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 31 + i)); const r = 30 + ((i * 7) % 25);
  return { date: d.toISOString().slice(0, 10), reservations: r, coversBooked: r * 3, coversServed: r * 3 - 9, cancelled: 3, noShows: 2, completed: r - 6, seatMinutesUsed: 9000 + i * 100, seatMinutesAvailable: 20000 }; });

const publicVenue = (now) => ({ slug: SLUG, name: 'Indigo 8', timezone: 'Asia/Jerusalem', paused: false, address: DRAFT.basics.address, phone: DRAFT.basics.phone, venueType: 'bar', intro: DRAFT.guest.intro, terms: DRAFT.guest.terms, showWhatsapp: true,
  policy: { minParty: 1, maxParty: 10, horizonDays: 30, leadMinutes: 0, cancelCutoffMinutes: 60, modifyCutoffMinutes: 60, allowGuestModify: true, zoneChoice: false, waitlistPublic: true },
  zones: [], services: DRAFT.services, brand: { displayName: null, palette: { primary: '#E0479E' } }, serverNow: now.toISOString(), assetOwner: ORG_ID, brandKit: null, pages: PAGES });
const guestReservation = (now) => ({ reference: 'IN-4301', status: 'confirmed', lockVersion: 1, serviceKey: 'night', date: DATE, time: '21:30', party: 2, startsAt: at('21:30'), pendingExpiresAt: null, guestName: 'דנה',
  venue: { name: 'Indigo 8', slug: SLUG, timezone: 'Asia/Jerusalem', address: DRAFT.basics.address, phone: DRAFT.basics.phone, showWhatsapp: true }, terms: DRAFT.guest.terms, cancelUntil: at('20:30'), modifyUntil: at('20:30'),
  canCancel: true, canModify: true, policy: { minParty: 1, maxParty: 10, horizonDays: 30 }, services: [{ key: 'night', name: 'ערב', weekdays: [0, 1, 2, 3, 4, 5, 6] }], serverNow: now.toISOString(), open: true });

let lock = 7;
const answer = (fn, b, now) => ({
  my_access: () => [{ organization_id: ORG_ID, access: 'all' }],
  tables_list_venues: () => ({ enabled: true, canCreate: true, venues: [{ id: VENUE_ID, slug: SLUG, name: 'Indigo 8', status: 'published', timezone: 'Asia/Jerusalem', role: 'owner', published: true, versionNumber: 4 }] }),
  tables_get_venue: () => ({ id: VENUE_ID, organizationId: ORG_ID, slug: SLUG, name: 'Indigo 8', status: 'published', timezone: 'Asia/Jerusalem', role: 'owner', lockVersion: lock, draft: { ...DRAFT, publicPages: PAGES }, problems: [],
    published: { versionId: uid(60), versionNumber: 4, publishedAt: at('12:00'), snapshot: DRAFT }, hasUnpublishedChanges: false, updatedAt: at('12:00') }),
  tables_save_draft: () => ({ lockVersion: ++lock, savedAt: now.toISOString(), problems: [] }),
  tables_publish_venue: () => ({ versionId: uid(61), versionNumber: 5, status: 'published', lockVersion: ++lock }),
  tables_list_staff: () => [{ userId: uid(30), email: 'owner@indigo8.example', orgRole: 'owner', venueRole: null }, { userId: uid(31), email: 'host@indigo8.example', orgRole: 'staff', venueRole: 'host' }],
  tables_menu_list: () => MENU_ROWS,
  tables_menu_save: () => ({ lockVersion: ++lock, problems: [] }),
  tables_menu_publish: () => ({ versionNumber: 6 }),
  tables_analytics: () => ({ timezone: 'Asia/Jerusalem', from: b.p_from, to: b.p_to, days: ANALYTICS_DAYS, sources: { online: 520, phone: 140, walk_in: 90, waitlist: 30 }, approvals: { auto: 700, manual: 60 }, seated: { avgMinutes: 104, sample: 600 }, waitlist: { closed: 80, seated: 55, abandoned: 25 } }),
  tables_shift: () => shift(now),
  tables_waitlist: () => WAITLIST,
  tables_reservation_detail: () => { const r = RESERVATIONS.find((x) => x.id === b.p_reservation_id) ?? RESERVATIONS[0];
    return { ...r, guestEmail: null, date: DATE, events: [{ type: 'created', from: null, to: r.status, actor: 'אורח', reason: null, at: at('11:20'), metadata: {} }], notes: [], history: [] }; },
  tables_staff_availability: () => [{ key: 'night', name: 'ערב', slots: ['21:00', '21:30', '22:00', '22:30', '23:00'].map((time, i) => ({ time, ok: i !== 1, reason: i === 1 ? 'full' : null, tables: ['150'], kind: 'table' })) }],
  tables_reminder_list: () => ({ venue: { id: VENUE_ID, name: 'Indigo 8', slug: SLUG, timezone: 'Asia/Jerusalem' }, serviceDate: DATE, reservations: [] }),
  tables_public_venue: () => publicVenue(now),
  tables_public_availability: () => ({ date: b.p_date, state: 'open', services: [{ key: 'night', name: 'ערב', slots: ['21:00', '21:30', '22:00', '22:30', '23:00'].map((time) => ({ time, approval: 'instant' })) }] }),
  tables_public_book: () => ({ result: 'confirmed', reference: 'IN-4301', token: 'Tok' + 'x'.repeat(40), reservation: { date: DATE, time: b.p_input?.time ?? '21:30', party: Number(b.p_input?.party) || 2, status: 'confirmed', startsAt: at('21:30'), pendingExpiresAt: null } }),
  tables_public_manage: () => guestReservation(now),
  tables_public_menus: () => ({ venue: { name: 'Indigo 8', slug: SLUG, assetOwner: ORG_ID }, brand: { displayName: null, palette: { primary: '#E0479E' } }, menus: [{ id: uid(701), title: 'מהמטבח', version: 5, publishedAt: at('12:00'), doc: SMALL }] }),
  tables_public_waitlist_join: () => ({ token: 'W' + 'x'.repeat(40), status: 'waiting' }),
  tables_public_waitlist_status: () => ({ status: 'waiting', party: 2, joinedAt: at('20:01'), offerExpiresAt: null, position: 2, estimate: { min: 15, max: 25 }, venue: { name: 'Indigo 8', slug: SLUG, timezone: 'Asia/Jerusalem' }, serverNow: now.toISOString(), date: DATE, desiredTime: null, booking: null }),
  log_client_error: () => null,
  tables_guest_lookup: () => (String(b.p_phone ?? '').endsWith('2128') ? { name: 'נוי כהן', visits: 4, noShows: 0, lastVisit: '2026-11-13' } : null),
}[fn]);

// ---------- A fake local session (never verified by anything real) ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(NOW.getTime() / 1000) + 30 * 86400;
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'owner@indigo8.example', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: at('10:00') };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: user.email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600, session_id: 's1' })}.c2ln`;
const SESSION = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };

/** Answers every Supabase call of `page` with the fictional venue, and fixes the clock at Friday 20:15. */
export async function wire(page, { signedIn = true } = {}) {
  if (signedIn) await page.addInitScript(([s]) => { try { localStorage.setItem('sb-127-auth-token', s); } catch { /* private mode */ } }, [JSON.stringify(SESSION)]);
  const t0 = Date.now();
  const now = () => new Date(NOW.getTime() + (Date.now() - t0));
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    let body = {};
    try { body = route.request().postDataJSON() ?? {}; } catch { /* no body */ }
    if (p.includes('/storage/v1/object/public/brand-assets/')) { const file = ASSETS[p.split('/').pop()]; return file ? route.fulfill({ path: PHOTOS + file }) : route.fulfill({ status: 404, body: '' }); }
    if (p.startsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (p.startsWith('/auth/v1/')) return route.fulfill({ json: SESSION });
    if (p.endsWith('/organization_memberships')) return route.fulfill({ json: [{ organization_id: ORG_ID, role: 'owner', status: 'active' }] });
    if (p.endsWith('/organizations')) return route.fulfill({ json: [{ id: ORG_ID, name: 'Indigo 8', slug: SLUG, status: 'active' }] });
    const fn = p.split('/rpc/')[1];
    const handler = fn ? answer(fn, body, now()) : undefined;
    if (handler) return route.fulfill({ json: handler() });
    if (!fn && route.request().method() === 'GET' && !['tables_venues', 'tables_venue_versions', 'brand_configurations'].includes(p.split('/').pop())) return route.fulfill({ json: [] });
    return route.fulfill({ json: null });
  });
  // Realtime: accept the channel join, never push (the screens fall back to polling).
  await page.routeWebSocket(/127\.0\.0\.1:54321\/realtime/, (ws) => {
    ws.onMessage((raw) => {
      const text = String(raw); const arr = text.startsWith('[');
      const m = arr ? (([join_ref, ref, topic, event, payload]) => ({ join_ref, ref, topic, event, payload }))(JSON.parse(text)) : JSON.parse(text);
      const pc = m.event === 'phx_join' ? (m.payload?.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: 1000 + i })) : undefined;
      const out = [m.join_ref, m.ref, m.topic, 'phx_reply', { status: 'ok', response: pc ? { postgres_changes: pc } : {} }];
      ws.send(arr ? JSON.stringify(out) : JSON.stringify({ join_ref: out[0], ref: out[1], topic: out[2], event: out[3], payload: out[4] }));
    });
  });
  await page.clock.install({ time: NOW });
}
