/** Venue draft defaults, the starter floor, and owner-facing problem messages. */
import { normalizePublicPages } from './publicPages';
import type { Problem, Policy, ServiceDef, TableDef, TableShape, VenueDraft, ZoneDef } from './types';

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export const DEFAULT_POLICY: Policy = {
  slotMinutes: 30,
  leadMinutes: 60,
  horizonDays: 30,
  minParty: 1,
  maxParty: 10,
  bufferMinutes: 15,
  approvalMode: 'auto',
  pendingMode: 'unallocated',
  pendingHoldMinutes: 15,
  cancelCutoffMinutes: 240,
  modifyCutoffMinutes: 240,
  allowGuestModify: true,
  zoneChoice: false,
  zonePreference: 'soft',
  rules: [],
  pacing: null,
  waitlist: { publicEnabled: false, offerMinutes: 10 },
};

export const DEFAULT_TERMS = 'אפשר לבטל או לשנות את ההזמנה דרך הקישור שתקבלו, עד המועד שמופיע בו. במקרה של איחור של יותר מ-15 דקות ייתכן שהשולחן יימסר לאורחים אחרים.';

export function defaultServices(): ServiceDef[] {
  return [
    { key: 'lunch', name: 'צהריים', weekdays: [0, 1, 2, 3, 4], start: '12:00', lastSeating: '15:00', durationMinutes: 90 },
    { key: 'dinner', name: 'ערב', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', lastSeating: '22:00', durationMinutes: 120 },
  ];
}

const SIZE: Record<TableShape, { w: number; h: number }> = {
  round: { w: 70, h: 70 }, square: { w: 70, h: 70 }, rect: { w: 120, h: 70 }, bar: { w: 50, h: 50 },
};

export function makeTable(zoneId: string, label: string, seats: number, x: number, y: number, shape?: TableShape): TableDef {
  const s: TableShape = shape ?? (seats <= 2 ? 'square' : seats <= 4 ? 'round' : 'rect');
  return { id: uuid(), label, zoneId, minCovers: seats <= 2 ? 1 : Math.max(1, seats - 2), maxCovers: seats, shape: s, x, y, ...SIZE[s], rotation: 0 };
}

/** A sensible first floor: two rooms, a mix of 2-, 4- and 6-seat tables in a tidy grid. */
export function starterLayout(tables2: number, tables4: number, tables6: number): { zones: ZoneDef[]; tables: TableDef[] } {
  const hall: ZoneDef = { id: uuid(), name: 'אולם', sort: 0 };
  const out: TableDef[] = [];
  let n = 1;
  let col = 0;
  let row = 0;
  const place = (seats: number) => {
    const t = makeTable(hall.id, String(n++), seats, 30 + col * 150, 30 + row * 130);
    out.push(t);
    col++;
    if (col === 5) { col = 0; row++; }
  };
  for (let i = 0; i < tables2; i++) place(2);
  for (let i = 0; i < tables4; i++) place(4);
  for (let i = 0; i < tables6; i++) place(6);
  return { zones: [hall], tables: out };
}

export function newDraft(name: string, timezone = 'Asia/Jerusalem'): VenueDraft {
  const { zones, tables } = starterLayout(4, 4, 2);
  return {
    schema: 1,
    basics: { name, timezone, venueType: 'restaurant', locale: 'he', address: '', phone: '' },
    services: defaultServices(),
    zones,
    tables,
    combinations: [],
    policy: { ...DEFAULT_POLICY },
    guest: { intro: '', terms: DEFAULT_TERMS, showWhatsapp: true },
    progress: { step: 'basics', visited: ['basics'] },
  };
}

/** Fills fields missing from older drafts so the editor always has a complete document. */
export function normalizeDraft(d: Partial<VenueDraft> & { basics?: VenueDraft['basics'] }, fallbackName: string): VenueDraft {
  const base = newDraft(d.basics?.name ?? fallbackName, d.basics?.timezone ?? 'Asia/Jerusalem');
  const fresh = !d.services && !d.tables;
  return {
    schema: 1,
    basics: { ...base.basics, ...(d.basics ?? {}) },
    services: d.services ?? base.services,
    zones: d.zones ?? base.zones,
    tables: d.tables ?? (fresh ? base.tables : []),
    combinations: d.combinations ?? [],
    policy: { ...DEFAULT_POLICY, ...(d.policy ?? {}) },
    guest: { ...base.guest, ...(d.guest ?? {}) },
    progress: d.progress ?? base.progress,
    // Public page design travels with the draft, so every editor that saves the draft keeps it.
    ...(d.publicPages ? { publicPages: normalizePublicPages(d.publicPages) } : {}),
  };
}

export const totalSeats = (tables: Pick<TableDef, 'maxCovers'>[]) => tables.reduce((s, t) => s + t.maxCovers, 0);

/** Next free numeric label. */
export function nextLabel(tables: Pick<TableDef, 'label'>[]): string {
  const used = new Set(tables.map((t) => t.label.trim()));
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

/** Owner-facing wording for server problem codes. No technical terms. */
export const PROBLEM_HE: Record<string, string> = {
  name_required: 'חסר שם למקום.',
  timezone_invalid: 'אזור הזמן לא תקין.',
  phone_invalid: 'מספר הטלפון לא נראה תקין.',
  service_required: 'צריך לפחות משמרת אחת (למשל "ערב").',
  too_many_services: 'אפשר עד 12 משמרות.',
  service_key_invalid: 'יש משמרת בלי מזהה תקין — מחקו אותה והוסיפו מחדש.',
  service_key_duplicate: 'יש שתי משמרות זהות — מחקו אחת מהן.',
  service_name_required: 'לכל משמרת צריך שם.',
  service_time_invalid: 'שעות המשמרת לא תקינות.',
  service_days_required: 'בחרו באילו ימים המשמרת פעילה.',
  service_duration_invalid: 'משך הישיבה צריך להיות בין 30 דקות ל-8 שעות.',
  zone_required: 'צריך לפחות אזור ישיבה אחד (למשל "אולם").',
  zone_invalid: 'יש אזור לא תקין — מחקו אותו והוסיפו מחדש.',
  zone_name_required: 'לכל אזור צריך שם.',
  table_required: 'צריך לפחות שולחן אחד.',
  too_many_tables: 'אפשר עד 250 שולחנות.',
  table_invalid: 'יש שולחן לא תקין — מחקו אותו והוסיפו מחדש.',
  table_label_required: 'לכל שולחן צריך מספר או שם.',
  table_label_duplicate: 'שני שולחנות עם אותו מספר — שנו אחד מהם.',
  table_zone_missing: 'יש שולחן שלא שייך לאף אזור.',
  table_capacity_invalid: 'מספר המקומות בשולחן לא תקין (מינימום לא יכול להיות גדול מהמקסימום).',
  table_shape_invalid: 'צורת שולחן לא תקינה.',
  table_geometry_invalid: 'שולחן נמצא מחוץ למפה — גררו אותו פנימה.',
  combination_invalid: 'צירוף שולחנות צריך שם ולפחות 2 שולחנות.',
  combination_table_missing: 'צירוף מכיל שולחן שכבר לא קיים.',
  combination_table_duplicate: 'צירוף מכיל את אותו שולחן פעמיים.',
  combination_capacity_invalid: 'מספר המקומות בצירוף גדול מסך המקומות בשולחנות שלו.',
  policy_number_invalid: 'אחד מכללי ההזמנה מחוץ לטווח המותר.',
  policy_party_invalid: 'גודל קבוצה מינימלי גדול מהמקסימלי.',
  policy_approval_invalid: 'בחרו איך מאשרים הזמנות.',
  policy_pending_invalid: 'בחרו מה קורה לבקשה שממתינה לאישור.',
  policy_rules_invalid: 'אפשר עד 20 כללי אישור.',
  policy_rule_invalid: 'יש כלל אישור לא שלם.',
  policy_pacing_invalid: 'חלון הקצב צריך להיות 15, 30 או 60 דקות.',
  terms_required: 'כתבו תנאי הזמנה קצרים שהאורחים יראו לפני האישור.',
  intro_too_long: 'טקסט הפתיחה ארוך מדי.',
  invalid: 'משהו בהגדרות לא תקין.',
};
export const problemText = (p: Problem) => PROBLEM_HE[p.code] ?? PROBLEM_HE.invalid!;

/** Which wizard step owns a problem path. */
export function stepOfProblem(p: Problem): 'basics' | 'hours' | 'seating' | 'rules' | 'guest' {
  if (p.path.startsWith('basics')) return 'basics';
  if (p.path.startsWith('services')) return 'hours';
  if (p.path.startsWith('zones') || p.path.startsWith('tables') || p.path.startsWith('combinations')) return 'seating';
  if (p.path.startsWith('guest')) return 'guest';
  return 'rules';
}
