/**
 * Scores one generated workflow against what a business owner wrote. Every expectation is a fact the
 * owner stated (or the kind of business they are), never a detail of how the engine builds the form,
 * so the same checks measure any version of the generator.
 */
import type { CompletionMode, WorkflowConfig, WorkflowField } from '../../domain/schema';
import type { ThemePresetId } from '../../domain/theme';
import type { GenerationResult } from '../../engine/generator';

export type Industry =
  | 'restaurant' | 'restaurant_event' | 'cafe' | 'catering' | 'bakery' | 'florist' | 'garage'
  | 'hair_salon' | 'nails' | 'cosmetics' | 'spa' | 'clinic' | 'dental' | 'physio' | 'nutrition' | 'vet'
  | 'trainer' | 'yoga' | 'tutor' | 'course' | 'kids_class' | 'camp' | 'workshop' | 'conference' | 'contest'
  | 'photographer' | 'event_venue' | 'wedding' | 'kids_party' | 'rsvp' | 'event_services'
  | 'cleaning' | 'contractor' | 'technician' | 'moving' | 'garden'
  | 'shop' | 'print' | 'volunteer' | 'donation' | 'survey'
  | 'accountant' | 'lawyer' | 'office' | 'consultant' | 'real_estate'
  | 'pet_care' | 'pet_grooming' | 'cabin' | 'tour' | 'lead';

/** Wider groups, used to give an engine without an explicit business type fair credit. */
export const FAMILY: Record<Industry, string> = {
  restaurant: 'food', cafe: 'food', restaurant_event: 'food_events', catering: 'food_events', bakery: 'bakery', florist: 'florist', garage: 'garage',
  hair_salon: 'beauty', nails: 'beauty', cosmetics: 'beauty', spa: 'beauty',
  clinic: 'health', dental: 'health', physio: 'health', nutrition: 'health', vet: 'pets',
  trainer: 'fitness', yoga: 'fitness',
  tutor: 'education', course: 'education', kids_class: 'kids', camp: 'kids', workshop: 'workshop', conference: 'conference', contest: 'contest',
  photographer: 'events', event_venue: 'events', wedding: 'events', kids_party: 'kids', rsvp: 'events', event_services: 'events',
  cleaning: 'home', contractor: 'home', technician: 'home', moving: 'home', garden: 'home',
  shop: 'retail', print: 'retail', volunteer: 'community', donation: 'community', survey: 'survey',
  accountant: 'professional', lawyer: 'professional', office: 'professional', consultant: 'professional', real_estate: 'professional',
  pet_care: 'pets', pet_grooming: 'pets', cabin: 'travel', tour: 'travel', lead: 'lead',
};

/** Designs that suit each kind of business. */
export const INDUSTRY_PRESETS: Record<Industry, ThemePresetId[]> = {
  restaurant: ['hospitality_premium', 'cafe_bistro'],
  restaurant_event: ['hospitality_premium', 'celebration_party'],
  cafe: ['cafe_bistro', 'hospitality_premium', 'bakery_sweet'],
  catering: ['cafe_bistro', 'hospitality_premium'],
  bakery: ['bakery_sweet', 'cafe_bistro'],
  florist: ['floral_boutique', 'wedding_elegance'],
  garage: ['automotive_precision'],
  hair_salon: ['beauty_glam', 'floral_boutique'],
  nails: ['beauty_glam', 'floral_boutique'],
  cosmetics: ['beauty_glam', 'spa_serenity', 'floral_boutique', 'wedding_elegance'],
  spa: ['spa_serenity'],
  clinic: ['medical_care', 'spa_serenity'],
  dental: ['medical_care'],
  physio: ['medical_care', 'fitness_energy'],
  nutrition: ['medical_care', 'spa_serenity', 'eco_nature'],
  vet: ['pets_friendly', 'medical_care'],
  trainer: ['fitness_energy'],
  yoga: ['eco_nature', 'spa_serenity', 'fitness_energy'],
  tutor: ['academy_learn'],
  course: ['academy_learn', 'creative_studio', 'tech_startup'],
  kids_class: ['kids_play', 'fitness_energy', 'creative_studio'],
  camp: ['kids_play'],
  workshop: ['creative_studio', 'bakery_sweet', 'academy_learn'],
  conference: ['tech_startup', 'corporate_modern'],
  contest: ['creative_studio', 'fitness_energy', 'community_warm'],
  photographer: ['creative_studio'],
  event_venue: ['hospitality_premium', 'wedding_elegance', 'celebration_party', 'luxury_noir'],
  wedding: ['wedding_elegance'],
  kids_party: ['kids_play', 'celebration_party'],
  rsvp: ['celebration_party', 'wedding_elegance'],
  event_services: ['celebration_party', 'nightlife_neon', 'creative_studio'],
  cleaning: ['modern_minimal', 'home_services'],
  contractor: ['home_services'],
  technician: ['home_services'],
  moving: ['home_services'],
  garden: ['eco_nature', 'home_services'],
  shop: ['luxury_noir', 'creative_studio', 'modern_minimal', 'floral_boutique'],
  print: ['creative_studio'],
  volunteer: ['community_warm'],
  donation: ['community_warm'],
  survey: ['modern_minimal', 'community_warm'],
  accountant: ['corporate_modern', 'finance_clarity'],
  lawyer: ['legal_trust'],
  office: ['corporate_modern', 'tech_startup', 'finance_clarity'],
  consultant: ['finance_clarity', 'corporate_modern'],
  real_estate: ['luxury_noir', 'corporate_modern'],
  pet_care: ['pets_friendly'],
  pet_grooming: ['pets_friendly'],
  cabin: ['travel_coastal', 'eco_nature'],
  tour: ['travel_coastal', 'eco_nature'],
  lead: ['modern_minimal', 'corporate_modern'],
};

export type Cap = 'date' | 'time' | 'guests' | 'address' | 'file' | 'email' | 'phone' | 'name' | 'service' | 'parent' | 'age' | 'greeting';

export interface CorpusCase {
  id: string;
  text: string;
  industry: Industry;
  /** Kinds of question the form must ask. */
  has?: Cap[];
  /** Words that must appear in some question's label. */
  labels?: string[];
  /** Choices the owner named. */
  options?: string[];
  /** Choice (or add-on) → its price, as written. */
  prices?: [string, number][];
  /** Prices that must appear somewhere in the form. */
  priceValues?: number[];
  completion?: CompletionMode;
  deposit?: number;
  approval?: boolean;
  /** Open weekdays, 0 = Sunday. */
  days?: number[];
  /** Opening and closing time of the first open day. */
  hours?: [string, string];
  /** Service → minutes; '*' = the default length. */
  durations?: [string, number][];
  staff?: number;
  notice?: number;
  ahead?: number;
  perDay?: number;
  capacity?: number;
  /** Min / max of the "how many" question. */
  guests?: [number | null, number | null];
  /** A smallest quantity. */
  minNumber?: number;
  fee?: [string, number];
  /** "MM-DD" of the closing date. */
  closes?: string;
  /** Owner-only review notes that must be there. */
  notes?: string[];
}

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

/** Comparable text: punctuation dropped and final letters folded, so "חיסון" is found in "החיסונים". */
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const norm = (s: string) => s.replace(/[״"'׳`]/g, '').replace(/[־–-]/g, ' ').replace(/[ךםןףץ]/g, (c) => FINALS[c]!).replace(/\s+/g, ' ').trim().toLowerCase();
const fieldsOf = (c: WorkflowConfig): WorkflowField[] => [...c.caseFields, ...c.steps.flatMap((s) => s.fields)];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const CHOICE = ['radio', 'select', 'multiselect'];
const COUNT_LABEL = /סועד|אורח|משתתפ|אנשים|איש|ילדים|מוזמנ|מגיע|כמות|כמה|נפשות|חולצות|יחידות|מנות/;

/** Business type the result claims, or one inferred from its template and design for an older engine. */
export function industryOf(r: GenerationResult): string {
  const explicit = (r as GenerationResult & { industry?: string }).industry;
  if (explicit) return explicit;
  const p = r.theme.presetId;
  switch (r.templateKey) {
    case 'flower_order': return 'florist';
    case 'garage_repairs': return 'garage';
    case 'restaurant_event': return 'restaurant_event';
    case 'document_collection': return 'office';
    case 'quote_request': return 'contractor';
    case 'table_booking':
      if (r.templateLabel !== 'קביעת תור') return 'restaurant';
      return ({ floral_boutique: 'hair_salon', beauty_glam: 'hair_salon', spa_serenity: 'spa', medical_care: 'clinic', fitness_energy: 'trainer', academy_learn: 'tutor', automotive_precision: 'garage', pets_friendly: 'pet_grooming', eco_nature: 'yoga', corporate_modern: 'office', finance_clarity: 'consultant', legal_trust: 'lawyer' } as Record<string, string>)[p] ?? 'lead';
    default:
      if (r.intent.purpose === 'survey') return 'survey';
      if (!r.composed) return 'lead';
      return ({ creative_studio: 'workshop', kids_play: 'kids_class', academy_learn: 'course', tech_startup: 'conference', community_warm: 'volunteer', fitness_energy: 'trainer', eco_nature: 'yoga', bakery_sweet: 'workshop' } as Record<string, string>)[p] ?? 'lead';
  }
}

function hasCap(c: WorkflowConfig, cap: Cap): boolean {
  const fs = fieldsOf(c);
  switch (cap) {
    case 'date': return fs.some((f) => f.type === 'date');
    case 'time': return fs.some((f) => f.type === 'time') || Boolean(c.booking?.timeKey);
    case 'guests': return fs.some((f) => f.type === 'number' && COUNT_LABEL.test(f.label));
    case 'address': return fs.some((f) => /כתובת/.test(f.label));
    case 'file': return fs.some((f) => f.type === 'file');
    case 'email': return fs.some((f) => f.type === 'email');
    case 'phone': return fs.some((f) => f.role === 'customer_phone');
    case 'name': return fs.some((f) => f.role === 'customer_name');
    case 'service': return fs.some((f) => CHOICE.includes(f.type) && /שירות|טיפול|שיעור|אימון|פגישה|בדיקה|סוג/.test(f.label));
    case 'parent': return c.steps.some((s) => /הורה/.test(s.title));
    case 'age': return fs.some((f) => /גיל/.test(f.label));
    case 'greeting': return fs.some((f) => /ברכה|הקדשה/.test(f.label));
  }
}

function allPrices(c: WorkflowConfig): number[] {
  const out: number[] = [];
  for (const f of fieldsOf(c)) {
    if (f.price !== undefined) out.push(f.price);
    for (const o of f.options ?? []) if (o.price !== undefined) out.push(o.price);
  }
  for (const fee of c.pricing.fees) out.push(fee.amount);
  return out.filter((p) => p > 0);
}

function priceOf(c: WorkflowConfig, name: string): number[] {
  const n = norm(name);
  const out: number[] = [];
  for (const f of fieldsOf(c)) {
    if (f.price !== undefined && norm(f.label).includes(n)) out.push(f.price);
    for (const o of f.options ?? []) if (o.price !== undefined && norm(o.label).includes(n)) out.push(o.price);
  }
  for (const fee of c.pricing.fees) if (norm(fee.label).includes(n)) out.push(fee.amount);
  return out;
}

/** Every number the owner wrote, as digits or as a few common words. */
function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)) out.add(Number(m[0]));
  const words: Record<string, number> = { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, מאה: 100, מאתיים: 200 };
  for (const [w, v] of Object.entries(words)) if (text.includes(w)) out.add(v);
  return out;
}

export function scoreCase(c: CorpusCase, r: GenerationResult): Check[] {
  const cfg = r.config;
  const fs = fieldsOf(cfg);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail: ok ? undefined : detail });

  const got = industryOf(r);
  add('industry', FAMILY[got as Industry] === FAMILY[c.industry], `${got} ≠ ${c.industry}`);
  add('design', INDUSTRY_PRESETS[c.industry].includes(r.theme.presetId), r.theme.presetId);

  for (const cap of c.has ?? []) add(`has:${cap}`, hasCap(cfg, cap));
  for (const l of c.labels ?? []) add(`label:${l}`, fs.some((f) => norm(f.label).includes(norm(l)) || (f.options ?? []).some((o) => norm(o.label).includes(norm(l)))) || cfg.steps.some((s) => norm(s.title).includes(norm(l))));
  const optionLabels = fs.filter((f) => CHOICE.includes(f.type) || f.type === 'time').flatMap((f) => (f.options ?? []).map((o) => norm(o.label)));
  for (const o of c.options ?? []) add(`option:${o}`, optionLabels.some((l) => l.includes(norm(o))), optionLabels.join(' | '));
  for (const [name, p] of c.prices ?? []) add(`price:${name}=${p}`, priceOf(cfg, name).includes(p), `${priceOf(cfg, name).join(',')}`);
  for (const p of c.priceValues ?? []) add(`priceValue:${p}`, allPrices(cfg).includes(p), allPrices(cfg).join(','));
  if (c.completion) add(`completion:${c.completion}`, cfg.completion?.mode === c.completion, cfg.completion?.mode);
  if (c.deposit !== undefined) add(`deposit:${c.deposit}`, cfg.completion?.mode === 'deposit' && cfg.completion.depositPercent === c.deposit, `${cfg.completion?.mode} ${cfg.completion?.depositPercent}`);
  if (c.approval !== undefined) add(`approval:${c.approval}`, r.intent.approval === c.approval);

  const b = cfg.booking;
  if (c.days) add('days', JSON.stringify([...(b?.openWeekdays ?? [])].sort()) === JSON.stringify(c.days), JSON.stringify(b?.openWeekdays));
  if (c.hours) {
    let ok = false;
    let detail = 'no booking';
    if (b?.schedule) {
      const day = b.schedule.days.find((d) => d.length);
      const from = day?.map((x) => x.from).sort()[0];
      const to = day?.map((x) => x.to).sort().pop();
      ok = from === c.hours[0] && to === c.hours[1];
      detail = `${from}-${to}`;
    } else if (b?.slots.length) {
      const first = b.slots[0]!;
      const last = b.slots[b.slots.length - 1]!;
      const end = c.hours[1] === '24:00' ? 1440 : toMin(c.hours[1]);
      ok = first === c.hours[0] && toMin(last) < end && end - toMin(last) <= 90;
      detail = `${first}…${last}`;
    }
    add('hours', ok, detail);
  }
  for (const [name, m] of c.durations ?? []) {
    const s = b?.schedule;
    const svc = fs.find((f) => f.key === s?.serviceKey);
    const opt = svc?.options?.find((o) => norm(o.label).includes(norm(name)));
    const val = name === '*' ? (s?.durations && Object.values(s.durations).every((v) => v === m) ? m : s?.duration) : opt ? s?.durations?.[opt.value] : undefined;
    add(`duration:${name}=${m}`, val === m, String(val));
  }
  if (c.staff !== undefined) add(`staff:${c.staff}`, b?.capacityPerSlot === c.staff, String(b?.capacityPerSlot));
  const date = fs.find((f) => f.type === 'date');
  if (c.notice !== undefined) add(`notice:${c.notice}`, b?.minNoticeHours === c.notice || (!b && date?.min !== undefined && date.min * 24 >= c.notice && (date.min - 1) * 24 < c.notice), `${b?.minNoticeHours ?? date?.min}`);
  if (c.ahead !== undefined) add(`ahead:${c.ahead}`, b?.maxDaysAhead === c.ahead || (!b?.maxDaysAhead && date?.max === c.ahead), `${b?.maxDaysAhead ?? date?.max}`);
  if (c.perDay !== undefined) add(`perDay:${c.perDay}`, b?.maxPerDay === c.perDay || r.intake?.maxPerDay === c.perDay);
  if (c.capacity !== undefined) {
    const caps = [...fs.flatMap((f) => (f.options ?? []).map((o) => o.capacity)), b?.capacityPerSlot, r.intake?.maxTotal, ...fs.filter((f) => f.type === 'number').map((f) => f.max)];
    add(`capacity:${c.capacity}`, caps.includes(c.capacity), caps.filter(Boolean).join(','));
  }
  if (c.guests) {
    const g = fs.find((f) => f.type === 'number' && COUNT_LABEL.test(f.label));
    const [min, max] = c.guests;
    add(`guests:${min ?? ''}-${max ?? ''}`, Boolean(g) && (min === null || g!.min === min) && (max === null || g!.max === max), g ? `${g.min}-${g.max}` : 'none');
  }
  if (c.minNumber !== undefined) add(`min:${c.minNumber}`, fs.some((f) => f.type === 'number' && f.min === c.minNumber));
  if (c.fee) add(`fee:${c.fee[0]}=${c.fee[1]}`, cfg.pricing.fees.some((f) => norm(f.label).includes(norm(c.fee![0])) && f.amount === c.fee![1]), cfg.pricing.fees.map((f) => `${f.label}=${f.amount}`).join(','));
  if (c.closes) add('closes', Boolean(r.intake?.closesOn?.endsWith(c.closes)), r.intake?.closesOn);
  for (const n of c.notes ?? []) add(`note:${n}`, new RegExp(n).test(r.reviewNotes.join(' ')), r.reviewNotes.join(' | '));

  // Quality every finished form needs, whatever was asked.
  const title = cfg.title;
  add('q:title', title.length <= 34 && !/(רוצה|צריך|צריכה|תיצור|תבנה|(^|\s)אני(\s|$)|אנחנו|…)/.test(title), title);
  if (c.industry !== 'survey') add('q:contact', fs.some((f) => f.role === 'customer_name') && fs.some((f) => f.role === 'customer_phone' && f.required));
  add('q:choices', fs.filter((f) => f.type === 'radio' || f.type === 'select').every((f) => (f.options?.length ?? 0) >= 2 && new Set(f.options!.map((o) => o.label)).size === f.options!.length));
  add('q:steps', cfg.steps.length <= 5 && cfg.steps.every((s) => s.fields.length <= 9 && s.fields.some((f) => !['info', 'highlights', 'heading', 'divider'].includes(f.type))));
  const written = numbersIn(c.text);
  const invented = allPrices(cfg).filter((p) => !written.has(p));
  add('q:honest-prices', !invented.length || /לדוגמה/.test(r.reviewNotes.join(' ')), `invented ${invented.join(',')}`);
  return checks;
}
