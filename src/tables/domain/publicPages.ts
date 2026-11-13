/**
 * Formangle Tables — the look and wording of the public booking and waitlist pages.
 *
 * `VenueDraft.publicPages` is plain, bounded data. It is edited in the draft, frozen into the
 * venue version by the existing explicit publish, and only the published copy reaches guests.
 * The vocabulary (typography, buttons, cards, radius, textures) is the Design Studio's, so a
 * venue page and a Formangle form read as one brand. The server re-validates everything
 * (private.tables_public_pages_problems) and owns availability, capacity, waitlist eligibility
 * and rate limits — nothing here can change what a guest is allowed to book.
 */
import {
  BUTTON_VARIANTS, CARD_VARIANTS, PATTERNS, RADII, TYPOGRAPHY_PRESETS,
  type WorkflowTheme,
} from '../../domain/theme';
import { contrastRatio, ensureContrast, luminance, mix, readableOn } from '../../theme/color';
import { patternImage, TYPOGRAPHY } from '../../theme/tokens';

export const PAGE_PRESETS = ['fine_dining', 'cafe', 'casual', 'cocktail_bar', 'minimal'] as const;
export type PagePreset = (typeof PAGE_PRESETS)[number];
export const PAGE_BACKGROUNDS = ['plain', 'tint', 'gradient', 'pattern'] as const;
export const PAGE_HERO_STYLES = ['banner', 'inline'] as const;
/** Textures from the Design Studio library that suit a booking page (no confetti). */
export const PAGE_PATTERNS = PATTERNS.filter((p) => p !== 'none' && p !== 'confetti') as Exclude<(typeof PATTERNS)[number], 'none' | 'confetti'>[];
export const PAGE_CARDS = CARD_VARIANTS.filter((c) => c !== 'bold') as Exclude<(typeof CARD_VARIANTS)[number], 'bold'>[];
export const PAGE_BUTTONS = BUTTON_VARIANTS.filter((b) => b !== 'brutal') as Exclude<(typeof BUTTON_VARIANTS)[number], 'brutal'>[];

export type Typography = (typeof TYPOGRAPHY_PRESETS)[number];
export type PageButton = (typeof PAGE_BUTTONS)[number];
export type PageCard = (typeof PAGE_CARDS)[number];
export type PageRadius = (typeof RADII)[number];
export type PagePattern = (typeof PAGE_PATTERNS)[number];

export interface PageTheme {
  preset: PagePreset;
  /** Take the accent colour, typography, button shape, logo and cover from the workspace Brand Kit. */
  inheritBrand: boolean;
  palette: { accent: string; background: string; surface: string; text: string };
  typography: Typography;
  button: PageButton;
  card: PageCard;
  radius: PageRadius;
  background: (typeof PAGE_BACKGROUNDS)[number];
  pattern: PagePattern;
  showLogo: boolean;
  /** Overrides the Brand Kit logo (organization asset id). */
  logoAssetId?: string;
  /** Optional photo at the top of the page (organization asset id). */
  heroAssetId?: string;
  heroStyle: (typeof PAGE_HERO_STYLES)[number];
}

export const BOOKING_BUILTINS = ['name', 'phone', 'email', 'requests'] as const;
export const WAITLIST_BUILTINS = ['name', 'phone', 'notes'] as const;
/** Fields that operations depend on: they can be renamed and moved, never hidden or removed. */
export const MANDATORY_FIELDS = ['name', 'phone'] as const;
export const QUESTION_KINDS = ['text', 'textarea', 'select', 'checkbox'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type FieldGroup = 'contact' | 'extra';

export interface PageField {
  /** A built-in key (name, phone, …) or `q_<id>` for an additional question. */
  key: string;
  kind: 'builtin' | QuestionKind;
  label?: string;
  hint?: string;
  hidden?: boolean;
  /** Additional questions only. */
  required?: boolean;
  /** `select` questions only. */
  options?: string[];
  group: FieldGroup;
}

export interface PageCopy {
  title?: string;
  description?: string;
  submitLabel?: string;
  /** Extra line on the confirmation (booking) or status (waitlist) page. */
  successNote?: string;
  groupTitles?: { contact?: string; extra?: string };
}

export interface PageConfig {
  /** Use this page's own theme instead of the shared one. */
  ownTheme: boolean;
  theme?: PageTheme;
  copy: PageCopy;
  fields: PageField[];
}

export interface PublicPagesConfig {
  version: 1;
  theme: PageTheme;
  booking: PageConfig;
  waitlist: PageConfig;
}

export type PageKind = 'booking' | 'waitlist';

export const LIMITS = {
  title: 80, description: 600, submitLabel: 40, successNote: 300, groupTitle: 60,
  label: 80, hint: 200, option: 60, options: 8, questions: 6, fields: 14,
  answerText: 300, answerTextarea: 1000,
} as const;

export const QUESTION_KEY_RE = /^q_[a-z0-9]{6,24}$/;
export const ASSET_RE = /^ast_[a-z0-9]{8,40}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ---------- presets ----------

type PresetTheme = Omit<PageTheme, 'preset' | 'inheritBrand' | 'showLogo' | 'logoAssetId' | 'heroAssetId' | 'heroStyle'>;

export const PRESETS: Record<PagePreset, { label: string; description: string; theme: PresetTheme }> = {
  fine_dining: {
    label: 'מסעדת שף', description: 'כהה, סריף אלגנטי ונגיעות זהב',
    theme: { palette: { accent: '#C9A45C', background: '#14110F', surface: '#1E1A17', text: '#F3EDE4' }, typography: 'editorial', button: 'sharp', card: 'outlined', radius: 'sm', background: 'plain', pattern: 'grid' },
  },
  cafe: {
    label: 'בית קפה', description: 'שמנת חמימה, פינות רכות ונקודות עדינות',
    theme: { palette: { accent: '#9C5B32', background: '#F6EFE6', surface: '#FFFDF9', text: '#3B2A20' }, typography: 'friendly', button: 'pill', card: 'soft', radius: 'lg', background: 'pattern', pattern: 'dots' },
  },
  casual: {
    label: 'קז׳ואל', description: 'בהיר, שמח וישיר',
    theme: { palette: { accent: '#D9482B', background: '#FFF8F0', surface: '#FFFFFF', text: '#1F2933' }, typography: 'neutral', button: 'solid', card: 'elevated', radius: 'md', background: 'tint', pattern: 'waves' },
  },
  cocktail_bar: {
    label: 'בר קוקטיילים', description: 'לילה עמוק עם זוהר ניאון',
    theme: { palette: { accent: '#E0479E', background: '#17122B', surface: '#221A3D', text: '#F1ECFF' }, typography: 'display', button: 'pill', card: 'elevated', radius: 'lg', background: 'gradient', pattern: 'diamonds' },
  },
  minimal: {
    label: 'מינימלי', description: 'לבן, נקי ומדויק',
    theme: { palette: { accent: '#111418', background: '#FFFFFF', surface: '#FFFFFF', text: '#111418' }, typography: 'clean', button: 'solid', card: 'outlined', radius: 'sm', background: 'plain', pattern: 'grid' },
  },
};

export function presetTheme(preset: PagePreset, keep?: Partial<PageTheme>): PageTheme {
  return {
    preset,
    inheritBrand: keep?.inheritBrand ?? false,
    showLogo: keep?.showLogo ?? true,
    heroStyle: keep?.heroStyle ?? 'banner',
    ...(keep?.logoAssetId ? { logoAssetId: keep.logoAssetId } : {}),
    ...(keep?.heroAssetId ? { heroAssetId: keep.heroAssetId } : {}),
    ...structuredClone(PRESETS[preset].theme),
  };
}

export function defaultFields(kind: PageKind): PageField[] {
  return kind === 'booking'
    ? [
        { key: 'name', kind: 'builtin', group: 'contact' },
        { key: 'phone', kind: 'builtin', group: 'contact' },
        { key: 'email', kind: 'builtin', group: 'contact' },
        { key: 'requests', kind: 'builtin', group: 'extra' },
      ]
    : [
        { key: 'name', kind: 'builtin', group: 'contact' },
        { key: 'phone', kind: 'builtin', group: 'contact' },
        { key: 'notes', kind: 'builtin', group: 'extra', hidden: true },
      ];
}

export function defaultPublicPages(): PublicPagesConfig {
  return {
    version: 1,
    theme: { ...presetTheme('casual'), inheritBrand: true },
    booking: { ownTheme: false, copy: {}, fields: defaultFields('booking') },
    waitlist: { ownTheme: false, copy: {}, fields: defaultFields('waitlist') },
  };
}

/** The starting look for a venue type (used until the venue publishes its own design). */
export function presetForVenueType(venueType: string | null | undefined): PagePreset {
  // Restaurants without a design of their own start calm (white and graphite); a Brand Kit colour still wins.
  return venueType === 'cafe' ? 'cafe' : venueType === 'bar' ? 'cocktail_bar' : venueType === 'event_hall' ? 'fine_dining' : 'minimal';
}

/**
 * The pages a venue shows before it publishes a design: the standard fields and wording, with the
 * look taken from the workspace Brand Kit (logo, cover, colour, typography, button) on top of the
 * preset of its venue type — so even an untouched venue page carries the business's identity.
 */
export function brandedDefaults(venueType: string | null | undefined): PublicPagesConfig {
  const pages = defaultPublicPages();
  pages.theme = { ...presetTheme(presetForVenueType(venueType)), inheritBrand: true };
  return pages;
}

export const newQuestionKey = () =>
  `q_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')}`;

// ---------- normalization (old / partial / hostile input → a complete, valid config) ----------

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX_RE.test(v) ? v.toUpperCase() : fallback);
const asset = (v: unknown) => (typeof v === 'string' && ASSET_RE.test(v) ? v : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function normalizeTheme(raw: unknown, fallback: PageTheme = defaultPublicPages().theme): PageTheme {
  const r = obj(raw);
  const preset = oneOf(r.preset, PAGE_PRESETS, fallback.preset);
  const base = PRESETS[preset].theme;
  const p = obj(r.palette);
  const out: PageTheme = {
    preset,
    inheritBrand: typeof r.inheritBrand === 'boolean' ? r.inheritBrand : fallback.inheritBrand,
    palette: {
      accent: hex(p.accent, base.palette.accent),
      background: hex(p.background, base.palette.background),
      surface: hex(p.surface, base.palette.surface),
      text: hex(p.text, base.palette.text),
    },
    typography: oneOf(r.typography, TYPOGRAPHY_PRESETS, base.typography),
    button: oneOf(r.button, PAGE_BUTTONS, base.button),
    card: oneOf(r.card, PAGE_CARDS, base.card),
    radius: oneOf(r.radius, RADII, base.radius),
    background: oneOf(r.background, PAGE_BACKGROUNDS, base.background),
    pattern: oneOf(r.pattern, PAGE_PATTERNS, base.pattern),
    showLogo: typeof r.showLogo === 'boolean' ? r.showLogo : true,
    heroStyle: oneOf(r.heroStyle, PAGE_HERO_STYLES, 'banner'),
  };
  const logo = asset(r.logoAssetId);
  const hero = asset(r.heroAssetId);
  if (logo) out.logoAssetId = logo;
  if (hero) out.heroAssetId = hero;
  return out;
}

function normalizeFields(raw: unknown, kind: PageKind): PageField[] {
  const builtins: readonly string[] = kind === 'booking' ? BOOKING_BUILTINS : WAITLIST_BUILTINS;
  const seen = new Set<string>();
  const out: PageField[] = [];
  let questions = 0;
  for (const item of Array.isArray(raw) ? raw : []) {
    const f = obj(item);
    const key = typeof f.key === 'string' ? f.key : '';
    if (seen.has(key)) continue;
    const group: FieldGroup = f.group === 'extra' ? 'extra' : 'contact';
    const label = str(f.label, LIMITS.label);
    const hint = str(f.hint, LIMITS.hint);
    if (builtins.includes(key)) {
      const field: PageField = { key, kind: 'builtin', group };
      if (label) field.label = label;
      if (hint) field.hint = hint;
      if (f.hidden === true && !(MANDATORY_FIELDS as readonly string[]).includes(key)) field.hidden = true;
      out.push(field);
    } else if (QUESTION_KEY_RE.test(key) && questions < LIMITS.questions) {
      const qk = oneOf(f.kind, QUESTION_KINDS, 'text');
      const field: PageField = { key, kind: qk, group, label: label ?? 'שאלה', required: f.required === true };
      if (hint) field.hint = hint;
      if (f.hidden === true) field.hidden = true;
      if (qk === 'select') {
        const opts = [...new Set((Array.isArray(f.options) ? f.options : []).map((o) => (typeof o === 'string' ? o.trim().slice(0, LIMITS.option) : '')).filter(Boolean))].slice(0, LIMITS.options);
        field.options = opts.length ? opts : ['כן', 'לא'];
      }
      out.push(field);
      questions++;
    } else continue;
    seen.add(key);
  }
  // Every built-in is always present (mandatory ones visible); missing ones keep their default place.
  for (const d of defaultFields(kind)) if (!seen.has(d.key)) out.push(d);
  return out.slice(0, LIMITS.fields);
}

function normalizeCopy(raw: unknown): PageCopy {
  const r = obj(raw);
  const g = obj(r.groupTitles);
  const copy: PageCopy = {};
  const title = str(r.title, LIMITS.title);
  const description = str(r.description, LIMITS.description);
  const submitLabel = str(r.submitLabel, LIMITS.submitLabel);
  const successNote = str(r.successNote, LIMITS.successNote);
  if (title) copy.title = title;
  if (description) copy.description = description;
  if (submitLabel) copy.submitLabel = submitLabel;
  if (successNote) copy.successNote = successNote;
  const contact = str(g.contact, LIMITS.groupTitle);
  const extra = str(g.extra, LIMITS.groupTitle);
  if (contact || extra) copy.groupTitles = { ...(contact ? { contact } : {}), ...(extra ? { extra } : {}) };
  return copy;
}

function normalizePage(raw: unknown, kind: PageKind, shared: PageTheme): PageConfig {
  const r = obj(raw);
  const ownTheme = r.ownTheme === true;
  const page: PageConfig = { ownTheme, copy: normalizeCopy(r.copy), fields: normalizeFields(r.fields, kind) };
  if (ownTheme) page.theme = normalizeTheme(r.theme, shared);
  return page;
}

export function normalizePublicPages(raw: unknown): PublicPagesConfig {
  const r = obj(raw);
  const theme = normalizeTheme(r.theme);
  return { version: 1, theme, booking: normalizePage(r.booking, 'booking', theme), waitlist: normalizePage(r.waitlist, 'waitlist', theme) };
}

// ---------- validation (mirror of private.tables_public_pages_problems; the server is authoritative) ----------

export interface PageProblem { code: string; path: string }

function themeProblems(t: unknown, path: string, assetIds?: ReadonlySet<string>): PageProblem[] {
  const out: PageProblem[] = [];
  const r = obj(t);
  const p = obj(r.palette);
  if (!PAGE_PRESETS.includes(r.preset as PagePreset)) out.push({ code: 'pages_theme_invalid', path: `${path}.preset` });
  for (const k of ['accent', 'background', 'surface', 'text']) if (typeof p[k] !== 'string' || !HEX_RE.test(p[k] as string)) out.push({ code: 'pages_color_invalid', path: `${path}.palette.${k}` });
  if (!TYPOGRAPHY_PRESETS.includes(r.typography as Typography)) out.push({ code: 'pages_theme_invalid', path: `${path}.typography` });
  if (!PAGE_BUTTONS.includes(r.button as PageButton)) out.push({ code: 'pages_theme_invalid', path: `${path}.button` });
  if (!PAGE_CARDS.includes(r.card as PageCard)) out.push({ code: 'pages_theme_invalid', path: `${path}.card` });
  if (!RADII.includes(r.radius as PageRadius)) out.push({ code: 'pages_theme_invalid', path: `${path}.radius` });
  if (!PAGE_BACKGROUNDS.includes(r.background as PageTheme['background'])) out.push({ code: 'pages_theme_invalid', path: `${path}.background` });
  if (!PAGE_PATTERNS.includes(r.pattern as PagePattern)) out.push({ code: 'pages_theme_invalid', path: `${path}.pattern` });
  if (!PAGE_HERO_STYLES.includes(r.heroStyle as PageTheme['heroStyle'])) out.push({ code: 'pages_theme_invalid', path: `${path}.heroStyle` });
  if (typeof r.inheritBrand !== 'boolean' || typeof r.showLogo !== 'boolean') out.push({ code: 'pages_theme_invalid', path });
  for (const k of ['logoAssetId', 'heroAssetId'] as const) {
    if (r[k] === undefined) continue;
    if (typeof r[k] !== 'string' || !ASSET_RE.test(r[k] as string)) out.push({ code: 'pages_image_invalid', path: `${path}.${k}` });
    else if (assetIds && !assetIds.has(r[k] as string)) out.push({ code: 'pages_image_missing', path: `${path}.${k}` });
  }
  return out;
}

/** Problems of a stored config; `assetIds` (the organization's live images) enables the ownership check. */
export function publicPagesProblems(raw: unknown, assetIds?: ReadonlySet<string>): PageProblem[] {
  const r = obj(raw);
  const out: PageProblem[] = [];
  if (r.version !== 1) out.push({ code: 'pages_invalid', path: 'publicPages' });
  out.push(...themeProblems(r.theme, 'publicPages.theme', assetIds));
  for (const kind of ['booking', 'waitlist'] as const) {
    const page = obj(r[kind]);
    const path = `publicPages.${kind}`;
    if (page.ownTheme === true) out.push(...themeProblems(page.theme, `${path}.theme`, assetIds));
    const copy = obj(page.copy);
    const lim: Record<string, number> = { title: LIMITS.title, description: LIMITS.description, submitLabel: LIMITS.submitLabel, successNote: LIMITS.successNote };
    for (const [k, max] of Object.entries(lim)) if (copy[k] !== undefined && (typeof copy[k] !== 'string' || (copy[k] as string).length > max)) out.push({ code: 'pages_text_too_long', path: `${path}.copy.${k}` });
    const fields = Array.isArray(page.fields) ? page.fields : null;
    if (!fields || fields.length > LIMITS.fields) { out.push({ code: 'pages_fields_invalid', path: `${path}.fields` }); continue; }
    const builtins: readonly string[] = kind === 'booking' ? BOOKING_BUILTINS : WAITLIST_BUILTINS;
    const keys = new Set<string>();
    let questions = 0;
    fields.forEach((item, i) => {
      const f = obj(item);
      const key = String(f.key ?? '');
      const fp = `${path}.fields.${i}`;
      if (keys.has(key)) out.push({ code: 'pages_field_duplicate', path: fp });
      keys.add(key);
      if (f.group !== 'contact' && f.group !== 'extra') out.push({ code: 'pages_fields_invalid', path: fp });
      if (f.label !== undefined && (typeof f.label !== 'string' || f.label.length > LIMITS.label)) out.push({ code: 'pages_text_too_long', path: fp });
      if (f.hint !== undefined && (typeof f.hint !== 'string' || f.hint.length > LIMITS.hint)) out.push({ code: 'pages_text_too_long', path: fp });
      if (builtins.includes(key)) {
        if (f.kind !== 'builtin') out.push({ code: 'pages_fields_invalid', path: fp });
        if (f.hidden === true && (MANDATORY_FIELDS as readonly string[]).includes(key)) out.push({ code: 'pages_mandatory_field', path: fp });
      } else if (QUESTION_KEY_RE.test(key)) {
        questions++;
        if (!QUESTION_KINDS.includes(f.kind as QuestionKind)) out.push({ code: 'pages_question_invalid', path: fp });
        if (typeof f.label !== 'string' || !f.label.trim()) out.push({ code: 'pages_question_label', path: fp });
        if (f.kind === 'select') {
          const o = f.options;
          if (!Array.isArray(o) || o.length < 1 || o.length > LIMITS.options || o.some((x) => typeof x !== 'string' || !x.trim() || x.length > LIMITS.option) || new Set(o).size !== o.length) {
            out.push({ code: 'pages_question_options', path: fp });
          }
        }
      } else out.push({ code: 'pages_fields_invalid', path: fp });
    });
    if (questions > LIMITS.questions) out.push({ code: 'pages_too_many_questions', path: `${path}.fields` });
    for (const m of MANDATORY_FIELDS) if (!keys.has(m)) out.push({ code: 'pages_mandatory_field', path: `${path}.fields` });
  }
  return out;
}

export const PAGES_PROBLEM_HE: Record<string, string> = {
  pages_invalid: 'הגדרות העיצוב לא תקינות. טענו את הדף מחדש.',
  pages_theme_invalid: 'אחת מהגדרות העיצוב לא תקינה.',
  pages_color_invalid: 'אחד הצבעים לא תקין.',
  pages_image_invalid: 'אחת התמונות לא תקינה.',
  pages_image_missing: 'אחת התמונות כבר לא קיימת בספריית התמונות. בחרו תמונה אחרת או הסירו אותה.',
  pages_text_too_long: 'אחד הטקסטים ארוך מדי.',
  pages_fields_invalid: 'רשימת השדות לא תקינה.',
  pages_field_duplicate: 'אותו שדה מופיע פעמיים.',
  pages_mandatory_field: 'שם וטלפון הם שדות חובה — אפשר לשנות להם כותרת ומיקום, לא להסתיר.',
  pages_question_invalid: 'לשאלה נוספת יש סוג לא תקין.',
  pages_question_label: 'לכל שאלה נוספת צריך ניסוח.',
  pages_question_options: 'לשאלת בחירה צריך בין 1 ל-8 אפשרויות שונות.',
  pages_too_many_questions: 'אפשר עד 6 שאלות נוספות בכל דף.',
};

// ---------- what a page shows ----------

/** Additional questions a guest answers (visible ones, in display order). */
export const visibleQuestions = (page: PageConfig) => page.fields.filter((f) => f.kind !== 'builtin' && !f.hidden);

export function pageTheme(pages: PublicPagesConfig, kind: PageKind): PageTheme {
  const page = pages[kind];
  return page.ownTheme && page.theme ? page.theme : pages.theme;
}

/** Guest answers → the shape the server validates. Empty answers are omitted. */
export function answersPayload(page: PageConfig, values: Record<string, string | boolean>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const q of visibleQuestions(page)) {
    const v = values[q.key];
    if (q.kind === 'checkbox') { if (v === true) out[q.key] = true; }
    else if (typeof v === 'string' && v.trim()) out[q.key] = v.trim().slice(0, q.kind === 'textarea' ? LIMITS.answerTextarea : LIMITS.answerText);
  }
  return out;
}

/** Client-side mirror of the required-answer rule (the server rejects the same cases). */
export function missingAnswers(page: PageConfig, values: Record<string, string | boolean>): string[] {
  return visibleQuestions(page).filter((q) => q.required && (q.kind === 'checkbox' ? values[q.key] !== true : !(typeof values[q.key] === 'string' && (values[q.key] as string).trim()))).map((q) => q.key);
}

// ---------- the look: palette → CSS custom properties (light and dark display) ----------

export interface BrandKitLite {
  logoAssetId?: string | null;
  coverAssetId?: string | null;
  typography?: string | null;
  button?: string | null;
  palette?: { primary?: string; secondary?: string; accent?: string; background?: string } | null;
}

export interface ResolvedLook {
  vars: Record<string, string>;
  attrs: Record<string, string>;
  logoAssetId?: string;
  heroAssetId?: string;
  heroStyle: PageTheme['heroStyle'];
  showLogo: boolean;
  /** The palette is dark by design (shown the same in light and dark display). */
  darkNative: boolean;
}

/** Brand Kit inheritance, resolved at display time (like the Tables accent colour always was). */
export function inheritBrand(theme: PageTheme, kit: BrandKitLite | null | undefined): PageTheme {
  if (!theme.inheritBrand || !kit) return theme;
  const next = structuredClone(theme);
  const primary = kit.palette?.primary;
  if (primary && HEX_RE.test(primary)) next.palette.accent = primary.toUpperCase();
  const bg = kit.palette?.background;
  if (bg && HEX_RE.test(bg)) {
    next.palette.background = bg.toUpperCase();
    const dark = luminance(bg) < 0.18;
    next.palette.surface = dark ? mix(bg, '#FFFFFF', 0.07) : mix(bg, '#FFFFFF', 0.75);
    next.palette.text = dark ? '#F1F3F5' : '#14181D';
  }
  if (kit.typography && (TYPOGRAPHY_PRESETS as readonly string[]).includes(kit.typography)) next.typography = kit.typography as Typography;
  if (kit.button && (PAGE_BUTTONS as readonly string[]).includes(kit.button)) next.button = kit.button as PageButton;
  if (!next.logoAssetId && kit.logoAssetId && ASSET_RE.test(kit.logoAssetId)) next.logoAssetId = kit.logoAssetId;
  if (!next.heroAssetId && kit.coverAssetId && ASSET_RE.test(kit.coverAssetId)) next.heroAssetId = kit.coverAssetId;
  return next;
}

const RADIUS_PX: Record<PageRadius, [number, number]> = { none: [0, 0], sm: [6, 8], md: [12, 16], lg: [18, 24], xl: [24, 30] };

function paletteVars(bg: string, surface: string, text: string, accent: string, t: PageTheme, prefix = ''): Record<string, string> {
  const ink = contrastRatio(text, surface) >= 4.5 ? text : readableOn(surface);
  const acc = ensureContrast(accent, surface, 3);
  const accInk = ensureContrast(accent, surface, 4.5);
  const page = t.background === 'tint' ? mix(bg, accent, 0.07) : bg;
  const pageImage = t.background === 'gradient'
    ? `radial-gradient(120% 60% at 50% 0%, ${mix(bg, accent, 0.28)} 0%, ${bg} 70%)`
    : t.background === 'tint'
      ? `linear-gradient(180deg, ${mix(bg, accent, 0.16)} 0, ${page} 320px)`
      : t.background === 'pattern'
        ? patternImage({ extras: { pattern: t.pattern }, palette: { background: bg, text: ink, primary: accent, accent } } as unknown as WorkflowTheme) ?? 'none'
        : 'none';
  return {
    [`${prefix}--pp-page`]: page,
    [`${prefix}--pp-page-image`]: pageImage,
    [`${prefix}--pp-surface`]: surface,
    [`${prefix}--pp-surface-alt`]: mix(surface, ink, 0.05),
    [`${prefix}--pp-input`]: luminance(surface) < 0.2 ? mix(surface, '#000000', 0.18) : mix(surface, '#FFFFFF', 0.6),
    [`${prefix}--pp-text`]: ink,
    [`${prefix}--pp-muted`]: ensureContrast(mix(ink, surface, 0.38), surface, 4.5),
    [`${prefix}--pp-line`]: mix(surface, ink, 0.12),
    [`${prefix}--pp-line-strong`]: mix(surface, ink, 0.3),
    [`${prefix}--pp-skeleton`]: mix(surface, ink, 0.09),
    [`${prefix}--pp-accent`]: acc,
    [`${prefix}--pp-accent-ink`]: accInk,
    [`${prefix}--pp-on-accent`]: readableOn(acc),
    [`${prefix}--pp-accent-soft`]: mix(surface, accent, 0.12),
  };
}

export function resolveLook(themeIn: PageTheme, kit?: BrandKitLite | null): ResolvedLook {
  const t = inheritBrand(themeIn, kit);
  const { accent, background, surface, text } = t.palette;
  const darkNative = luminance(background) < 0.18;
  const light = paletteVars(background, surface, text, accent, t);
  // Dark display of a light design: deep neutral surfaces tinted by the accent; accent kept readable.
  const dbg = mix('#0F141B', accent, 0.05);
  const dsurf = mix('#171E27', accent, 0.05);
  const dark = darkNative ? light : paletteVars(dbg, dsurf, '#E8EDF2', accent, t);
  const font = TYPOGRAPHY[t.typography];
  const [r, rl] = RADIUS_PX[t.radius];
  // The brand band behind the venue header when there is no cover photo: the accent deepened
  // until white text reads at 4.5:1, with a darker second stop. The same in light and dark display.
  const heroBg = ensureContrast(darkNative ? mix(accent, background, 0.55) : accent, '#FFFFFF', 4.5);
  const vars: Record<string, string> = {
    '--pp-hero-bg': heroBg,
    '--pp-hero-bg-2': mix(heroBg, '#000000', 0.38),
    '--pp-hero-glow': mix(heroBg, '#FFFFFF', 0.22),
    '--pp-display-scale': String(font.scale),
    ...Object.fromEntries(Object.entries(light).map(([k, v]) => [k.replace('--pp-', '--pp-l-'), v])),
    ...Object.fromEntries(Object.entries(dark).map(([k, v]) => [k.replace('--pp-', '--pp-d-'), v])),
    '--pp-font-display': font.display,
    '--pp-font-body': font.body,
    '--pp-display-weight': String(font.weight),
    '--pp-r': `${r}px`,
    '--pp-r-lg': `${rl}px`,
    '--pp-r-btn': t.button === 'pill' ? '999px' : t.button === 'sharp' ? '2px' : `${Math.max(r, 6)}px`,
  };
  return {
    vars,
    attrs: { 'data-pp-card': t.card, 'data-pp-button': t.button, 'data-pp-bg': t.background, 'data-pp-tone': darkNative ? 'dark' : 'light' },
    logoAssetId: t.showLogo ? t.logoAssetId : undefined,
    heroAssetId: t.heroAssetId,
    heroStyle: t.heroStyle,
    showLogo: t.showLogo,
    darkNative,
  };
}

/** Every organization image a config references (for previews and pre-publish checks). */
export function referencedAssets(pages: PublicPagesConfig): string[] {
  const ids = new Set<string>();
  for (const t of [pages.theme, pages.booking.theme, pages.waitlist.theme]) {
    if (t?.logoAssetId) ids.add(t.logoAssetId);
    if (t?.heroAssetId) ids.add(t.heroAssetId);
  }
  return [...ids];
}
