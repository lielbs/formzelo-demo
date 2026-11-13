/**
 * Formangle Tables data access: every call is a narrow SQL command or projection. The browser
 * never decides availability or state; it renders what the server returns.
 */
import { getProductionSupabaseClient } from '../../production/supabaseClient';
import { toTablesError } from '../domain/errors';
import type { AnalyticsResult } from '../domain/analytics';
import type { BrandKitLite, PublicPagesConfig } from '../domain/publicPages';
import type { CustomAnswer, Problem, Shift, VenueDetail, VenueDraft, VenueSummary, WaitlistEntry } from '../domain/types';

type Lang = 'he' | 'en';

export async function rpc<T>(fn: string, args: Record<string, unknown>, lang: Lang = 'he'): Promise<T> {
  let client;
  try {
    client = await getProductionSupabaseClient();
  } catch (e) {
    throw toTablesError(e, lang);
  }
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc(fn as never, args as never);
  } catch (e) {
    throw toTablesError(e, lang);
  }
  if (result.error) throw toTablesError(result.error, lang);
  return result.data as T;
}

export const newKey = () => crypto.randomUUID();

/**
 * Minutes kept free after each booking on a table (the published policy). Venue staff can read the
 * published version under RLS; 0 when it cannot be read, since the server checks again anyway.
 */
export async function venueBufferMinutes(venueId: string): Promise<number> {
  try {
    const client = await getProductionSupabaseClient();
    const venue = await client.from('tables_venues').select('current_version_id').eq('id', venueId).maybeSingle();
    const versionId = (venue.data as { current_version_id: string | null } | null)?.current_version_id;
    if (!versionId) return 0;
    const version = await client.from('tables_venue_versions').select('snapshot').eq('id', versionId).maybeSingle();
    const raw = (version.data as { snapshot?: { policy?: { bufferMinutes?: unknown } } } | null)?.snapshot?.policy?.bufferMinutes;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 240 ? n : 0;
  } catch {
    return 0;
  }
}

/** A stable anonymous browser token for public rate limits and idempotent replays. */
export function clientToken(): string {
  try {
    const existing = localStorage.getItem('fz_tables_client');
    if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
    const t = crypto.randomUUID();
    localStorage.setItem('fz_tables_client', t);
    return t;
  } catch {
    return crypto.randomUUID();
  }
}

// ---------- Owner / manager ----------
export const listVenues = (orgId: string) =>
  rpc<{ enabled: boolean; canCreate: boolean; venues: VenueSummary[] }>('tables_list_venues', { p_organization_id: orgId });
export const createVenue = (orgId: string, name: string, slug: string, timezone = 'Asia/Jerusalem') =>
  rpc<{ id: string; slug: string; lockVersion: number }>('tables_create_venue', { p_organization_id: orgId, p_name: name, p_slug: slug, p_timezone: timezone });
export const getVenue = (venueId: string) => rpc<VenueDetail>('tables_get_venue', { p_venue_id: venueId });
export const saveDraft = (venueId: string, draft: VenueDraft, lockVersion: number) =>
  rpc<{ lockVersion: number; savedAt: string; problems: Problem[] }>('tables_save_draft', { p_venue_id: venueId, p_draft: draft, p_expected_lock_version: lockVersion });
export const publishVenue = (venueId: string, lockVersion: number) =>
  rpc<{ versionId: string; versionNumber: number; status: string; lockVersion: number }>('tables_publish_venue', { p_venue_id: venueId, p_expected_lock_version: lockVersion });
export const setVenueStatus = (venueId: string, status: 'published' | 'paused') =>
  rpc<{ status: string }>('tables_set_venue_status', { p_venue_id: venueId, p_status: status });
/** Owner: removes the venue (no upcoming bookings or open waitlist allowed). `name` must match exactly. */
export const deleteVenue = (venueId: string, name: string) =>
  rpc<{ deleted: boolean }>('tables_delete_venue', { p_venue_id: venueId, p_confirm_name: name });
export const listStaff = (venueId: string) =>
  rpc<{ userId: string; email: string; orgRole: string; venueRole: string | null }[]>('tables_list_staff', { p_venue_id: venueId });
export const assignStaff = (venueId: string, userId: string, role: string | null) =>
  rpc<{ userId: string; email: string; orgRole: string; venueRole: string | null }[]>('tables_assign_staff', { p_venue_id: venueId, p_user_id: userId, p_role: role });
export const setException = (venueId: string, date: string, kind: 'closed' | 'manual_approval' | null, note: string | null) =>
  rpc<{ date: string; serviceKey: string | null; kind: string; note: string | null }[]>('tables_set_exception', { p_venue_id: venueId, p_date: date, p_kind: kind, p_note: note, p_service_key: null });
export const analytics = (venueId: string, from: string, to: string) =>
  rpc<AnalyticsResult>('tables_analytics', { p_venue_id: venueId, p_from: from, p_to: to });

// ---------- Host ----------
export const getShift = (venueId: string, date: string) => rpc<Shift>('tables_shift', { p_venue_id: venueId, p_service_date: date });
export const getWaitlist = (venueId: string, date: string) => rpc<WaitlistEntry[]>('tables_waitlist', { p_venue_id: venueId, p_service_date: date });
export type TransitionAction = 'arrive' | 'seat' | 'complete' | 'no_show' | 'cancel' | 'undo';
export const transition = (id: string, action: TransitionAction, lockVersion: number, reason?: string) =>
  rpc<{ id: string; status: string; lockVersion: number }>('tables_transition', { p_reservation_id: id, p_action: action, p_expected_lock_version: lockVersion, p_reason: reason ?? null });
export const decidePending = (id: string, decision: 'approve' | 'reject', lockVersion: number, reason?: string) =>
  rpc<{ status: string; lockVersion: number }>('tables_decide_pending', { p_reservation_id: id, p_decision: decision, p_expected_lock_version: lockVersion, p_reason: reason ?? null });
export const moveReservation = (id: string, tableIds: string[], lockVersion: number, reason?: string) =>
  rpc<{ id: string; lockVersion: number }>('tables_move', { p_reservation_id: id, p_table_ids: tableIds, p_expected_lock_version: lockVersion, p_reason: reason ?? null });
export const updateReservation = (id: string, input: Record<string, unknown>, lockVersion: number) =>
  rpc<{ id: string; lockVersion: number }>('tables_staff_update_reservation', { p_reservation_id: id, p_input: input, p_expected_lock_version: lockVersion });
export const staffCreate = (venueId: string, input: Record<string, unknown>, key: string) =>
  rpc<{ reservationId: string; reference: string; status: string; tableIds: string[] | null }>('tables_staff_create_reservation', { p_venue_id: venueId, p_input: input, p_idempotency_key: key });
export const staffAvailability = (venueId: string, date: string, party: number) =>
  rpc<{ key: string; name: string; slots: { time: string; ok: boolean; reason: string | null; tables: string[]; kind: string | null }[] }[]>(
    'tables_staff_availability', { p_venue_id: venueId, p_date: date, p_party: party, p_zone: null });
export const setTableState = (venueId: string, tableId: string, state: 'ready' | 'cleaning' | 'unavailable', reason: string | null, date: string) =>
  rpc<{ revision: number }>('tables_set_table_state', { p_venue_id: venueId, p_table_id: tableId, p_state: state, p_reason: reason, p_service_date: date });
export const addNote = (reservationId: string, body: string, visibility: 'host' | 'manager') =>
  rpc<{ id: string }>('tables_add_note', { p_reservation_id: reservationId, p_body: body, p_visibility: visibility });
export interface ReservationDetail {
  id: string; reference: string; status: string; lockVersion: number; guestName: string; guestPhone: string | null; guestEmail: string | null;
  requests: string | null; source: string; party: number; time: string; date: string;
  events: { type: string; from: string | null; to: string | null; actor: string; reason: string | null; at: string; metadata: Record<string, unknown> }[];
  notes: { id: string; body: string; visibility: 'host' | 'manager'; at: string; mine: boolean }[];
  history: { date: string; time: string; party: number; status: string }[] | null;
  visits: number; noShows: number;
  /** Answers to the page's additional questions (team only; null when none). */
  customAnswers?: CustomAnswer[] | null;
}
export const reservationDetail = (id: string) => rpc<ReservationDetail>('tables_reservation_detail', { p_reservation_id: id });
export const waitlistAdd = (venueId: string, input: Record<string, unknown>, key: string) =>
  rpc<{ id: string }>('tables_waitlist_add', { p_venue_id: venueId, p_input: input, p_idempotency_key: key });
export const waitlistOffer = (id: string, tableIds: string[] | null, lockVersion: number) =>
  rpc<{ status: string; offerExpiresAt: string }>('tables_waitlist_offer', { p_entry_id: id, p_table_ids: tableIds, p_expected_lock_version: lockVersion });
export const waitlistSeat = (id: string, tableIds: string[] | null, lockVersion: number) =>
  rpc<{ reservationId: string }>('tables_waitlist_seat', { p_entry_id: id, p_table_ids: tableIds, p_expected_lock_version: lockVersion });
/** A waitlist party was booked into a normal reservation (made first with staffCreate). */
export const waitlistBook = (id: string, reservationId: string, lockVersion: number) =>
  rpc<{ status: string; lockVersion: number }>('tables_waitlist_book', { p_entry_id: id, p_reservation_id: reservationId, p_expected_lock_version: lockVersion });
export const waitlistClose = (id: string, status: 'declined' | 'departed' | 'no_response' | 'cancelled' | 'waiting', lockVersion: number) =>
  rpc<{ status: string }>('tables_waitlist_close', { p_entry_id: id, p_status: status, p_expected_lock_version: lockVersion });

// ---------- Menus ----------
export interface MenuHero {
  imageAssetId?: string;
  title?: string;
  subtitle?: string;
  description?: string;
}
export interface MenuItem { name: string; description?: string; price?: string; dietary?: string[]; allergens?: string[]; imageAssetId?: string }
export interface MenuSection { title: string; imageAssetId?: string; items: MenuItem[] }
export interface MenuDoc { hero?: MenuHero; gallery?: string[]; sections: MenuSection[] }
export interface MenuRow { id: string; title: string; status: string; lockVersion: number; draft: MenuDoc; publishedVersion: number | null; hasUnpublishedChanges: boolean; problems: Problem[] }
export const listMenus = (venueId: string) => rpc<MenuRow[]>('tables_menu_list', { p_venue_id: venueId });
export const createMenu = (venueId: string, title: string) => rpc<{ id: string }>('tables_menu_create', { p_venue_id: venueId, p_title: title });
export const saveMenu = (id: string, title: string, doc: MenuDoc, lockVersion: number) =>
  rpc<{ lockVersion: number; problems: Problem[] }>('tables_menu_save', { p_menu_id: id, p_title: title, p_doc: doc, p_expected_lock_version: lockVersion });
export const publishMenu = (id: string, lockVersion: number) => rpc<{ versionNumber: number }>('tables_menu_publish', { p_menu_id: id, p_expected_lock_version: lockVersion });
export const archiveMenu = (id: string) => rpc<null>('tables_menu_archive', { p_menu_id: id });

// ---------- Public (anonymous) ----------
export interface PublicVenue {
  slug: string; name: string; timezone: string; paused: boolean; address: string | null; phone: string | null; venueType: string | null;
  intro: string | null; terms: string; showWhatsapp: boolean;
  policy: { minParty: number; maxParty: number; horizonDays: number; leadMinutes: number; cancelCutoffMinutes: number; modifyCutoffMinutes: number; allowGuestModify: boolean; zoneChoice: boolean; waitlistPublic: boolean };
  zones: { id: string; name: string }[];
  services: { key: string; name: string; weekdays: number[]; start: string; lastSeating: string }[];
  brand: { displayName: string | null; palette: Record<string, string> | null };
  serverNow: string;
  /** Organization that owns the venue images (public bucket folder). */
  assetOwner?: string;
  /** Published page design (absent = the standard pages). */
  pages?: PublicPagesConfig | null;
  brandKit?: BrandKitLite | null;
}
export interface PublicAvailability {
  date: string; state: 'open' | 'closed' | 'full' | 'paused' | 'out_of_range' | 'party_size';
  services: { key: string; name: string; slots: { time: string; approval: 'instant' | 'request' }[] }[];
}
export interface BookResult {
  result: 'confirmed' | 'pending' | 'unavailable'; reason?: string; reference?: string; token?: string;
  alternatives?: { serviceKey: string; time: string; approval: 'instant' | 'request' }[];
  reservation?: { date: string; time: string; party: number; status: string; startsAt: string; pendingExpiresAt: string | null };
}
export interface GuestReservation {
  reference: string; status: string; lockVersion: number; serviceKey: string; date: string; time: string; party: number; startsAt: string;
  pendingExpiresAt: string | null; guestName: string;
  venue: { name: string; slug: string; timezone: string; address: string | null; phone: string | null; showWhatsapp: boolean };
  terms: string; cancelUntil: string; modifyUntil: string; canCancel: boolean; canModify: boolean;
  policy: { minParty: number; maxParty: number; horizonDays: number };
  services: { key: string; name: string; weekdays: number[] }[];
  serverNow: string; open: boolean;
}
export const publicVenue = (slug: string, lang: Lang) => rpc<PublicVenue | null>('tables_public_venue', { p_slug: slug }, lang);
export const publicAvailability = (slug: string, date: string, party: number, zone: string | null, lang: Lang) =>
  rpc<PublicAvailability | null>('tables_public_availability', { p_slug: slug, p_date: date, p_party: party, p_zone: zone, p_client: clientToken() }, lang);
export const publicBook = (slug: string, input: Record<string, unknown>, key: string, lang: Lang) =>
  rpc<BookResult>('tables_public_book', { p_slug: slug, p_input: input, p_idempotency_key: key, p_client: clientToken() }, lang);
export const publicManage = (token: string, lang: Lang) => rpc<GuestReservation | null>('tables_public_manage', { p_token: token, p_client: clientToken() }, lang);
export const publicCancel = (token: string, lang: Lang) => rpc<GuestReservation>('tables_public_cancel', { p_token: token, p_client: clientToken() }, lang);
export const publicModify = (token: string, input: Record<string, unknown>, lockVersion: number, lang: Lang) =>
  rpc<{ result: 'modified' | 'unavailable'; reservation: GuestReservation; alternatives?: { time: string }[] }>('tables_public_modify',
    { p_token: token, p_input: input, p_expected_lock_version: lockVersion, p_client: clientToken() }, lang);
export const publicModifyOptions = (token: string, date: string, party: number, lang: Lang) =>
  rpc<PublicAvailability | null>('tables_public_modify_options', { p_token: token, p_date: date, p_party: party, p_client: clientToken() }, lang);
export const publicWaitlistJoin = (slug: string, input: Record<string, unknown>, key: string, lang: Lang) =>
  rpc<{ token: string; status: string }>('tables_public_waitlist_join', { p_slug: slug, p_input: input, p_idempotency_key: key, p_client: clientToken() }, lang);
export interface WaitlistStatus {
  status: string; party: number; joinedAt: string; offerExpiresAt: string | null; position: number | null;
  estimate: { min: number; max: number } | null; venue: { name: string; slug: string; timezone: string }; serverNow: string;
}
export const publicWaitlistStatus = (token: string, lang: Lang) => rpc<WaitlistStatus | null>('tables_public_waitlist_status', { p_token: token, p_client: clientToken() }, lang);
export const publicWaitlistLeave = (token: string, lang: Lang) => rpc<{ status: string }>('tables_public_waitlist_leave', { p_token: token, p_client: clientToken() }, lang);
export interface PublicMenus { venue: { name: string; slug: string; assetOwner: string }; brand: PublicVenue['brand']; menus: { id: string; title: string; doc: MenuDoc; version: number; publishedAt: string }[] }
export const publicMenus = (slug: string, lang: Lang) => rpc<PublicMenus | null>('tables_public_menus', { p_slug: slug }, lang);
