/** Formangle Tables — shared shapes of the venue draft and the server projections. */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type TableShape = 'round' | 'square' | 'rect' | 'bar';
export type ApprovalMode = 'auto' | 'manual' | 'conditional';
export type PendingMode = 'unallocated' | 'hold';
export type VenueRole = 'owner' | 'manager' | 'host' | 'viewer';

export interface ServiceDef {
  key: string;
  name: string;
  weekdays: Weekday[];
  /** Local "HH:MM" of the first seating. */
  start: string;
  /** Local "HH:MM" of the last seating; earlier than start means the service crosses midnight. */
  lastSeating: string;
  durationMinutes: number;
}

export interface ZoneDef { id: string; name: string; sort?: number }

export interface TableDef {
  id: string;
  label: string;
  zoneId: string;
  minCovers: number;
  maxCovers: number;
  shape: TableShape;
  /** Physical floor coordinates in floor units (never mirrored for RTL). */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  accessible?: boolean;
}

export interface CombinationDef { id: string; label: string; tableIds: string[]; minCovers: number; maxCovers: number; priority: number }

export interface RuleWhen {
  partyAtLeast?: number;
  partyAtMost?: number;
  weekdays?: Weekday[];
  fromTime?: string;
  untilTime?: string;
  zoneIds?: string[];
  usesCombination?: boolean;
}
export interface ApprovalRule { id: string; name?: string; enabled?: boolean; priority?: number; when: RuleWhen; then: 'require_manual' | 'auto' }

export interface Policy {
  slotMinutes: 15 | 30 | 60;
  leadMinutes: number;
  horizonDays: number;
  minParty: number;
  maxParty: number;
  bufferMinutes: number;
  approvalMode: ApprovalMode;
  pendingMode: PendingMode;
  pendingHoldMinutes: number;
  cancelCutoffMinutes: number;
  modifyCutoffMinutes: number;
  allowGuestModify: boolean;
  zoneChoice?: boolean;
  zonePreference?: 'soft' | 'hard';
  rules: ApprovalRule[];
  pacing?: { windowMinutes: 15 | 30 | 60; maxArrivals?: number; maxCovers?: number } | null;
  waitlist?: { publicEnabled: boolean; offerMinutes: number };
}

export interface VenueDraft {
  schema: 1;
  basics: { name: string; timezone: string; venueType?: string; locale?: 'he' | 'en'; address?: string; phone?: string; branchLabel?: string };
  services: ServiceDef[];
  zones: ZoneDef[];
  tables: TableDef[];
  combinations: CombinationDef[];
  policy: Policy;
  guest: { intro?: string; terms: string; showWhatsapp?: boolean };
  progress?: { step: SetupStep; visited?: SetupStep[] };
}

export type SetupStep = 'basics' | 'hours' | 'seating' | 'rules' | 'guest' | 'review';

export interface Problem { code: string; path: string }

export interface VenueSummary {
  id: string;
  slug: string;
  name: string;
  status: 'draft' | 'published' | 'paused' | 'archived';
  timezone: string;
  role: VenueRole;
  published: boolean;
  versionNumber: number | null;
}

export interface VenueDetail {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  status: VenueSummary['status'];
  timezone: string;
  role: VenueRole;
  lockVersion: number;
  draft: VenueDraft | null;
  problems: Problem[] | null;
  published: { versionId: string; versionNumber: number; publishedAt: string; snapshot: VenueDraft } | null;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
}

export type ReservationStatus =
  | 'pending_approval' | 'confirmed' | 'arrived' | 'seated' | 'completed' | 'cancelled' | 'rejected' | 'no_show' | 'expired';
export type ReservationSource = 'online' | 'phone' | 'walk_in' | 'staff' | 'waitlist';

export interface ShiftReservation {
  id: string;
  reference: string;
  serviceKey: string;
  time: string;
  startsAt: string;
  endsAt: string;
  party: number;
  status: ReservationStatus;
  source: ReservationSource;
  approval: 'auto' | 'manual' | 'staff';
  approvalRule: string | null;
  guestName: string;
  guestPhone: string | null;
  requests: string | null;
  lockVersion: number;
  pendingExpiresAt: string | null;
  arrivedAt: string | null;
  seatedAt: string | null;
  completedAt: string | null;
  overrideReason: string | null;
  tableIds: string[];
  notesCount: number;
  visits: number;
  noShows: number;
}

export interface ShiftTable {
  id: string;
  label: string;
  zoneId: string;
  shape: TableShape;
  minCovers: number;
  maxCovers: number;
  accessible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opState: 'cleaning' | 'unavailable' | null;
  opReason: string | null;
}

export interface WaitlistEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  party: number;
  status: 'waiting' | 'offered';
  source: 'staff' | 'public';
  priority: number;
  priorityReason: string | null;
  notes: string | null;
  joinedAt: string;
  offerExpiresAt: string | null;
  lockVersion: number;
  quotedMin: number | null;
  quotedMax: number | null;
  heldTableIds: string[];
  suggestion: { tableIds: string[]; label: string; kind: 'table' | 'combination' } | null;
  rank: number;
}

export interface Shift {
  venue: { id: string; name: string; slug: string; timezone: string; status: string };
  role: VenueRole;
  serviceDate: string;
  serverNow: string;
  revision: number;
  published: boolean;
  services: (Pick<ServiceDef, 'key' | 'name' | 'start' | 'lastSeating' | 'durationMinutes' | 'weekdays'>)[];
  closed: { serviceKey: string | null; kind: 'closed' | 'manual_approval'; note: string | null }[];
  zones: { id: string; name: string }[];
  tables: ShiftTable[];
  reservations: ShiftReservation[];
  waitlist: WaitlistEntry[];
}

export type TableLiveState = 'ready' | 'reserved_soon' | 'occupied' | 'cleaning' | 'unavailable';
