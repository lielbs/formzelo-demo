/**
 * Reading what an owner wrote, deterministically and locally (no model, no network):
 * spelling variants and English words folded into the Hebrew the engine knows, numbers written
 * as words, clock times in words ("שמונה בערב", "חצות"), and the facts owners put in a sentence —
 * priced items, how many people, deposits and delivery fees. Nothing here invents a value: every
 * extractor returns only what is in the text.
 */
import { normalizeHebrew } from './hebrew';

/* ---------- spelling, slang and English ---------- */

/** Common misspellings and full (plene) spellings → the spelling the vocabulary uses. */
const SPELLING: [RegExp, string][] = [
  [/מיספר(ה|ת|ות)/g, 'מספר$1'],
  [/קונדטור/g, 'קונדיטור'],
  [/קיטרינג/g, 'קייטרינג'],
  [/קייטריניג/g, 'קייטרינג'],
  [/פיזיוטרפ/g, 'פיזיותרפ'],
  [/פיזיותראפ/g, 'פיזיותרפ'],
  [/אינסטלאטור/g, 'אינסטלטור'],
  [/ציפרנ/g, 'ציפורנ'],
  [/ציפורנים/g, 'ציפורניים'],
  [/ווטרינר/g, 'וטרינר'],
  [/פלורסט/g, 'פלוריסט'],
  [/קוסמטיקאיט/g, 'קוסמטיקאית'],
  [/מניקוריסט/g, 'מניקור מניקוריסט'],
  [/פדיקוריסט/g, 'פדיקור'],
  [/רפלקסולוגי(?!ה)/g, 'רפלקסולוגיה'],
  [/שיפוצניק/g, 'שיפוצים'],
  [/הנהלת חשבונות|הנהח/g, 'הנהלת חשבונות'],
  [/רו"ח/g, 'רואה חשבון'],
  [/עו"ד/g, 'עורך דין'],
  [/נדל"ן|נדלן/g, 'נדלן'],
];

/** English words owners mix in → Hebrew vocabulary. */
const ENGLISH: [RegExp, string][] = [
  [/\bbarber ?shop\b|\bbarbershop\b|\bbarber\b/g, 'ברבר מספרה'],
  [/\bhair ?salon\b|\bsalon\b/g, 'מספרה'],
  [/\bnails?\b|\bmanicure\b/g, 'ציפורניים מניקור'],
  [/\bbeauty\b|\bcosmetics?\b/g, 'קוסמטיקה'],
  [/\bspa\b|\bmassage\b/g, 'ספא עיסוי'],
  [/\brestaurant\b|\bbistro\b/g, 'מסעדה'],
  [/\bcoffee ?shop\b|\bcafe\b|\bcoffee\b/g, 'בית קפה'],
  [/\bcatering\b/g, 'קייטרינג'],
  [/\bbakery\b|\bcakes?\b/g, 'עוגות'],
  [/\bflowers?\b|\bflorist\b/g, 'פרחים'],
  [/\bgarage\b|\bmechanic\b/g, 'מוסך'],
  [/\bpersonal ?trainer\b|\btrainer\b|\bfitness\b|\bgym\b/g, 'מאמן כושר'],
  [/\bcrossfit\b/g, 'קרוספיט'],
  [/\byoga\b/g, 'יוגה'],
  [/\bpilates\b/g, 'פילאטיס'],
  [/\btutoring\b|\btutor\b/g, 'שיעורים פרטיים'],
  [/\bphotographer\b|\bphotography\b/g, 'צלם'],
  [/\brsvp\b/g, 'אישור הגעה'],
  [/\bdj\b/g, 'דיגיי'],
  [/\bclinic\b|\bdoctor\b/g, 'קליניקה'],
  [/\bdentist\b|\bdental\b/g, 'שיניים'],
  [/\bcleaning\b|\bcleaner\b/g, 'ניקיון'],
  [/\bwebinar\b/g, 'וובינר'],
  [/\bmeetup\b/g, 'מיטאפ'],
  [/\bworkshop\b/g, 'סדנה'],
  [/\bcourse\b/g, 'קורס'],
  [/\bbooking\b|\bappointments?\b/g, 'קביעת תור'],
  [/\bcontact\b/g, 'צור קשר'],
  [/\bsurvey\b|\bfeedback\b/g, 'סקר'],
];

/** Normalized text for recognition: niqqud and punctuation removed, typos and English folded in. */
export function canonical(text: string): string {
  let t = text.toLowerCase();
  for (const [re, to] of ENGLISH) t = t.replace(re, ` ${to} `);
  t = t.replace(/[״"]/g, '"');
  for (const [re, to] of SPELLING) t = t.replace(re, to);
  return normalizeHebrew(t);
}

/* ---------- numbers written as words ---------- */

const UNITS: Record<string, number> = { שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10 };
const TENS: Record<string, number> = { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90 };
const HUNDREDS: Record<string, number> = { מאה: 100, מאתיים: 200, אלף: 1000, אלפיים: 2000 };
const ALL_WORDS: Record<string, number> = { ...UNITS, ...TENS, ...HUNDREDS };

/**
 * Number words → digits ("עשרים וחמש" → 25, "משמונה" → "מ-8", "מאה וחמישים" → 150).
 * One/two (אחד, שני…) stay words: they double as "Monday", "one request per customer" and similar.
 */
export function withDigits(text: string): string {
  const words = Object.keys(ALL_WORDS).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(^|[\\s,.;:(\\-–])([מבלו]?)(${words})((?:\\s+ו-?(?:${words}))*)(?:\\s+(עשר|עשרה))?(?=$|[\\s,.;:)\\-–])`, 'g');
  return text.replace(re, (all, lead: string, prefix: string, first: string, rest: string, teen: string | undefined, offset: number, whole: string) => {
    // "שש-בש" is a game, not six.
    if (first === 'שש' && /^-?בש/.test(whole.slice(offset + all.length))) return all;
    let n = ALL_WORDS[first]!;
    if (teen && n < 10) n += 10;
    for (const m of rest.matchAll(new RegExp(`ו-?(${words})`, 'g'))) n += ALL_WORDS[m[1]!]!;
    const p = prefix === 'ו' ? 'ו' : prefix ? `${prefix}-` : '';
    return `${lead}${p}${n}`;
  });
}

/* ---------- clock times in words ---------- */

/** "8 בערב" → 20:00, "1 בצהריים" → 13:00, "9 בבוקר" → 09:00, "חצות" → 24:00. Run after withDigits. */
export function withClock(text: string): string {
  const pad = (h: number, m?: string) => `${String(h).padStart(2, '0')}:${m ?? '00'}`;
  return text
    .replace(/(?:ב|ל|עד\s*)?חצות(?:\s*הלילה)?/g, (m) => (m.startsWith('עד') ? 'עד 24:00' : m.startsWith('ל') ? 'ל-24:00' : '24:00'))
    .replace(/(\d{1,2})(?::(\d{2}))?\s*(?:בערב|בלילה|אחה"צ|אחה״צ|אחהצ|אחר הצהריים|אחרי הצהריים)/g, (_m, h: string, mm?: string) => pad(Number(h) < 12 ? Number(h) + 12 : Number(h), mm))
    .replace(/(\d{1,2})(?::(\d{2}))?\s*בצהריים/g, (_m, h: string, mm?: string) => pad(Number(h) <= 6 ? Number(h) + 12 : Number(h), mm))
    .replace(/(\d{1,2})(?::(\d{2}))?\s*(?:בבוקר|לפנה"צ|לפנה״צ)/g, (_m, h: string, mm?: string) => pad(Number(h), mm));
}

/** Raw text prepared for the rule readers: niqqud gone, quotes unified, numbers and clock words as digits. */
export function prepareRaw(prompt: string): string {
  return withClock(withDigits(prompt.replace(/[֑-ׇ]/g, '').replace(/[״"]/g, '"').replace(/\s+/g, ' ').trim()));
}

/* ---------- priced items ---------- */

export type PriceUnit = 'person' | 'hour' | 'night' | 'month' | 'session' | 'unit';

export interface PricedItem {
  /** The item as the owner named it; empty when only an amount was written ("50, 100, 180 ש״ח"). */
  name: string;
  price: number;
  unit?: PriceUnit;
  /** Minutes written next to it ("תספורת 30 דק׳ 70 ש״ח"). */
  minutes?: number;
  /** An add-on ("בתוספת", "אפשרות להוסיף"), not a main choice. */
  addon?: boolean;
  /** The word before a colon that heads the list ("גדלים:", "מארזים:"). */
  heading?: string;
}

const CURRENCY = String.raw`(?:₪|ש"ח|ש״ח|שח|שקלים|שקל|ש׳׳ח|nis|ils)`;
const UNIT_WORDS: [RegExp, PriceUnit][] = [
  [/^(?:ל|ל-|לכל\s*)(?:אורח|סועד|מנה|משתתף|משתתפת|אדם|איש|ילד|ילדה|נפש|זוג)(?![א-ת])/, 'person'],
  [/^(?:ל|ל-|לכל\s*)שעה(?![א-ת])/, 'hour'],
  [/^(?:ל|ל-|לכל\s*)לילה(?![א-ת])/, 'night'],
  [/^(?:ל|ל-|לכל\s*)חודש(?![א-ת])/, 'month'],
  [/^(?:ל|ל-|לכל\s*)(?:שיעור|אימון|מפגש|טיפול|סשן|מחזור|הליכה)(?![א-ת])/, 'session'],
  [/^(?:ל|ל-|לכל\s*)(?:חולצה|יחידה|מגש|מארז|עוגה|זר|פריט|מוצר|ספל|תיק)(?![א-ת])/, 'unit'],
];
/** Words that make a number a limit or a measure, not a price. */
const NOT_PRICE_AFTER = /^(%|אחוז|דק|דקות|שעות|ימים|יום|שבוע|חודשים|אורחים|סועדים|משתתפים|משתתפות|איש|אנשים|ילדים|מנות|מקומות|ק"מ|קמ|מ"ר|מטר|קומ|חדרים|מושבים|שנים|שנה|תורים|לילות|יחידות|מכשירים|ספרים|מטפלים|עמדות|כיסאות|חדרי|תמונות|מפגשים|אימונים|שיעורים|מוזמנים|מחזורים|מועדים|מסלולים|קבוצות|זוגות|חולצות|ס"מ|ק"ג)/;
const NOT_PRICE_BEFORE = /(?:^|\s)(?:עד|מינימום|מקסימום|לפחות|בין|גילאי|גיל|מגיל|כל|קומה|מספר|תור|תורים|כיתה|כיתות|מ-|ל-)\s*$/;
const FILLER = /^(ו|גם|יש|יש לנו|אצלנו|מחירים?|מחירון|עם|כולל|בתוספת|תוספת של|אפשרות להוסיף|להוסיף|החל מ-?|רק|ב-?|של|ה|למשל|לדוגמה|כמו|אז|ואז)\s+/;
const NOT_ITEMS = /^(מקדמה|משלוח|דמי משלוח|מינימום|מינימום הזמנה|הנחה|קנס|ביטול|מע"מ|מעמ|תשלום|לשלם)/;
const ADDON_WORDS = /(תוספת|בתוספת|להוסיף|אפשרות להוסיף|אקסטרה|תוספות)/;

function cleanName(raw: string): string {
  let n = raw
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d{1,3}\s*(?:דקות|דק׳|דק'|דק)(?=\s|$)/g, ' ')
    .replace(/(?:^|\s)(?:שעה וחצי|חצי שעה|רבע שעה|שעתיים)(?=\s|$)/g, ' ')
    .replace(/.*(?:ואחר כך|אחר כך|ואחרי זה|ואז)\s*/, '')
    .replace(/.*(?:אפשרות להוסיף|אפשר להוסיף|להוסיף|בתוספת של|תוספת של)\s+/, '')
    .replace(/^.*\s(?:סכומים|סכום|מחירים)\s*$/, '')
    .replace(/[-–:]+\s*$/g, '')
    .replace(/^\s*[-–:]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 3; i++) n = n.replace(FILLER, '').trim();
  n = n
    .replace(/^ו-?(?=[א-ת]{2})/, '')
    .replace(/\s+(ב|ל|של|עם|על|ו|ה|ו-|ב-)$/, '')
    .replace(/\s+(?:של\s+)?(?:שעה|שעתיים)$/, '')
    .replace(/\s+(?:חינם|בחינם)$/, '')
    .replace(/\s+(?:בתוספת|תוספת|בעלות|עולה|עולים|במחיר)$/, '')
    .trim();
  return n;
}

/** Minutes written in a piece of text ("45 דקות", "שעה וחצי"), or undefined. */
export function minutesIn(seg: string): number | undefined {
  const m = seg.match(/(\d{1,3})\s*(?:דקות|דק['׳]?|דק)(?=\s|$|[,.])/);
  if (m) return Number(m[1]);
  if (/שעה וחצי/.test(seg)) return 90;
  if (/חצי שעה/.test(seg)) return 30;
  if (/רבע שעה/.test(seg)) return 15;
  if (/שעתיים/.test(seg)) return 120;
  if (/(^|\s)(של\s+)?שעה(?=\s|$|[,.])/.test(seg) && !/(לשעה|בשעה|שעה מראש|לפי שעה)/.test(seg)) return 60;
  return undefined;
}

const unitNoun = (after: string) => after.match(/^(?:ל|ל-|לכל\s*)([א-ת]{2,})/)?.[1];

/**
 * "זר קטן 120 ש״ח, זר בינוני 200, תפריט בשרי 220 ₪ לאורח" → named items with their prices.
 * A bare number counts as a price only when the description speaks of money somewhere and the
 * number closes its phrase (so "עד 8 משתתפים" or "45 דקות" are never prices).
 */
export function pricedItems(prompt: string): PricedItem[] {
  const t = withDigits(prompt.replace(/[֑-ׇ]/g, '').replace(/[״]/g, '"').replace(/\s+/g, ' '))
    .replace(/(\d),(\d{3})/g, '$1$2')
    // "(120/180/250 ש״ח)" → three amounts.
    .replace(new RegExp(String.raw`\(?((?:\d{2,6}\s*/\s*)+\d{2,6})\s*(${CURRENCY})\)?`, 'g'), (_m, list: string, cur: string) => list.split('/').map((n) => `${n.trim()} ${cur}`).join(', '));
  // Money is in play when a currency or price word appears, a number follows a length ("60 דק׳ 350"),
  // or two or more phrases end with a number ("זר קטן 120, זר גדול 200").
  const money =
    new RegExp(`${CURRENCY}|מחיר|עולה|תשלום|לשלם|דמי |בתוספת`, 'i').test(t) ||
    /דק['׳]?\s+\d{2,6}(?!\s*(?:דק|שעות))/.test(t) ||
    /[א-ת]{2,}\s+\d{2,6}\s+ו-?[א-ת]{2,}(?:\s+[א-ת]{2,}){0,2}\s+\d{2,6}/.test(t) ||
    /\d{2,6}\s*(?:ל|לכל\s*)(?:שעה|לילה|אדם|משתתף|סועד|אורח|שיעור|אימון|חודש|זוג|ילד|טיפול)(?![א-ת])/.test(t) ||
    t.split(/[,;\n]|\.(?!\d)/).filter((x) => /[א-ת׳'"]{2,}\s+\d{2,6}\s*$/.test(x.trim()) && !/(עד|מינימום|לפחות|גיל|גילאי)\s+\d+\s*$/.test(x.trim())).length >= 2;
  const out: PricedItem[] = [];
  let heading: string | undefined;
  const parts = t.split(/[,;\n]|\.(?!\d)|\s+או\s+|\s-\s|\s–\s/);
  for (const raw of parts) {
    let seg = raw;
    if (raw.includes(':') && !/\d:\d/.test(raw)) {
      heading = cleanName(raw.slice(0, raw.lastIndexOf(':'))).split(' ').pop();
      seg = raw.slice(raw.lastIndexOf(':') + 1);
    }
    if (/\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?/.test(seg) && !new RegExp(CURRENCY).test(seg)) continue; // hours, not prices
    if (/\d+\/\d+/.test(seg) && !new RegExp(CURRENCY).test(seg)) continue; // "24/7", dates
    const segAddon = ADDON_WORDS.test(seg);
    const re = new RegExp(String.raw`(?<![\d:./])(\d{1,6}(?:\.\d{1,2})?)(?![\d:/])\s*(${CURRENCY})?`, 'g');
    let from = 0;
    let prev: PricedItem | undefined;
    for (const m of seg.matchAll(re)) {
      const at = m.index ?? 0;
      const after = seg.slice(at + m[0].length).trim();
      const before = seg.slice(from, at);
      const marked = Boolean(m[2]) || /₪\s*$/.test(seg.slice(0, at));
      const value = Number(m[1]);
      if (!marked) {
        if (!money || NOT_PRICE_AFTER.test(after) || NOT_PRICE_BEFORE.test(before) || (/[-–]$/.test(before.trim()) && !/(?:^|\s)ו-$/.test(before.trim()))) continue;
        // A bare number must end its phrase (or be followed only by a per-unit word / the next item).
        const tail = after.replace(/^(?:ל|ל-|לכל\s*)[א-ת]+/, '').trim();
        if (tail && !/^ו-?\d|^ו[א-ת]/.test(tail) && !/^(ב|באמצע|בסופ|כולל)/.test(tail)) continue;
        if (/\d\s*$/.test(before)) continue;
      } else if (NOT_PRICE_BEFORE.test(before)) continue;
      if (value <= 0 || value > 200000) continue;
      let name = cleanName(before);
      // "750 ללילה באמצע שבוע ו-950 בסופ"ש": words between two prices describe the first one.
      if (prev && /ו-?\s*$/.test(before)) {
        const desc = cleanName(before.replace(/^\s*(?:(?:ל|ל-|לכל\s*)[א-ת]+)/, '').replace(/\s*ו-?\s*$/, ''));
        if (desc && !prev.name) prev.name = desc;
        name = '';
      }
      let unit = UNIT_WORDS.find(([u]) => u.test(after))?.[1];
      if (!name) {
        const rest = after.replace(/^(?:ל|ל-|לכל\s*)[א-ת]+\s*/, '').split(/\s+ו-?\d|[,.]/)[0] ?? '';
        name = /^(ב|באמצע|בסופ)/.test(rest) ? cleanName(rest) : '';
        // "45 ש״ח לחולצה", "180 ש״ח לשיעור": the unit names the item.
        if (!name && (unit === 'unit' || unit === 'session') && unitNoun(after)) name = unitNoun(after)!;
      }
      // "תשלום מלא בהרשמה 490" is an amount without an item name.
      if (/^(תשלום|לשלם)/.test(name)) name = '';
      if (NOT_ITEMS.test(name) || (NOT_ITEMS.test(before.trim()) && !/^(תשלום|לשלם)/.test(before.trim()))) {
        from = at + m[0].length;
        continue;
      }
      if (/^(סכומים|סכום|מחיר|מחירים|בסך|עלות|החל)$/.test(name)) name = '';
      if (name.split(' ').length > 6) name = name.split(' ').slice(-6).join(' ');
      unit ??= UNIT_WORDS.find(([u]) => u.test(name.split(' ').pop() ?? ''))?.[1];
      const item: PricedItem = {
        name,
        price: value,
        ...(unit ? { unit } : {}),
        ...(minutesIn(before) ? { minutes: minutesIn(before) } : {}),
        ...(segAddon || /^תוספת/.test(name) ? { addon: true } : {}),
        ...(heading ? { heading } : {}),
      };
      out.push(item);
      prev = item;
      from = at + m[0].length;
    }
  }
  // Same name twice: keep the first.
  // The same name with different lengths is two items ("עיסוי 45 דקות 220, עיסוי שעה וחצי 380").
  for (const x of out) {
    const twins = out.filter((y) => y.name && y.name === x.name);
    if (twins.length > 1 && twins.every((y) => y.minutes) && new Set(twins.map((y) => y.minutes)).size === twins.length) twins.forEach((y) => (y.name = `${y.name} ${y.minutes} דק׳`));
  }
  return out.filter((x, i) => !x.name || out.findIndex((y) => y.name === x.name) === i);
}

const LIST_HEADS = /^(מקצועות|שירותים|טיפולים|תחומים|אפשרויות|סוגים|טעמים|מנות|נושאים|חוגים)$/;

/** Choices listed without prices: "בחירת מנה: בשר, דג או צמחוני", "- פיזיקה, מתמטיקה, כימיה". */
export function namedList(prompt: string): { head?: string; items: string[] } {
  const t = withDigits(prompt.replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' '));
  // "בחירת מנה: …" needs its colon: "עם בחירת טעם, גודל ומשלוח" lists questions, not choices.
  const m = t.match(/(?:(?:בחירת|לבחור)\s+([א-ת]+)\s*:|([א-ת]+)\s*:|\s[-–]\s)\s*([^.;:]+)/);
  if (!m) return { items: [] };
  const head = m[1] ?? m[2];
  const items = m[3]!
    .split(/,|\s+או\s+|\s+ו-?(?=[א-ת]{2})/)
    .map((x) => x.trim().replace(/^ו-?/, '').replace(/\s+(?:בלבד|לבחירה)$/, '').trim())
    .filter((x) => x && !/\d/.test(x) && x.split(' ').length <= 3 && x.length >= 2)
    .filter((x) => !/^(עד|עם|בלי|ללא|כל|רק|צריך|רוצה|אפשר|תשלום|הרשמה|מקדמה)/.test(x));
  // A plain "X:" heads a list only when it reads like one.
  if (!m[1] && m[2] && !LIST_HEADS.test(m[2]) && items.length < 3) return { items: [] };
  // Only "בחירת X:" names the question; "לילדים:" or "מקצועות:" just introduce the list.
  return { head: m[1] && !LIST_HEADS.test(m[1]) ? head : undefined, items: [...new Set(items)].slice(0, 10) };
}

/* ---------- people, deposits, fees ---------- */

const PEOPLE = String.raw`(?:סועדים|סועד|אורחים|אורח|משתתפים|משתתפות|משתתף|איש|אנשים|ילדים|ילדות|מוזמנים|מנות|נפשות|רוכבים|רצים|מתאמנים|מתאמנות|תלמידים|זוגות)`;
/** Per slot / per group: "עד 40 סועדים בכל חצי שעה", "עד 10 ילדים בקבוצה", "עד 20 בסיור". */
const PER_PLACE = /^\s*(?:ב|ל)?(?:כל\s*)?(?:ה)?(חצי שעה|שעה|משמרת|סבב|מחזור|קבוצה|סיור|מועד|שיעור|אימון|סדנה|מסלול|קורס|חוג)/;

export interface PeopleRange {
  min?: number;
  max?: number;
  /** A limit on places per slot / group / session rather than on one booking. */
  perPlace?: number;
}

export function peopleRange(prompt: string): PeopleRange {
  const t = withDigits(prompt.replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' '));
  const r: PeopleRange = {};
  const between = t.match(new RegExp(String.raw`(?:בין\s*)?(\d{1,4})\s*(?:-|–|עד|ל-|ל)\s*(\d{1,4})\s*${PEOPLE}`)) ?? t.match(new RegExp(String.raw`בין\s*(\d{1,4})\s*(?:ל-?|עד)\s*(\d{1,4})\s*(?:${PEOPLE})?`));
  if (between && Number(between[2]) > Number(between[1]) && !/גילאי|גיל|בגילאי/.test(t.slice(Math.max(0, (between.index ?? 0) - 8), between.index))) {
    r.min = Number(between[1]);
    r.max = Number(between[2]);
  }
  for (const m of t.matchAll(new RegExp(String.raw`(?:עד|מקסימום|לא יותר מ-?)\s*(\d{1,4})\s*(${PEOPLE})?`, 'g'))) {
    const n = Number(m[1]);
    const rest = t.slice((m.index ?? 0) + m[0].length);
    if (!m[2] && !PER_PLACE.test(rest)) continue;
    if (/^\s*(ביום|ליום|בשבוע|לשבוע|תורים|בקשות|הזמנות|שעות|ימים|דקות)/.test(rest)) continue;
    if (PER_PLACE.test(rest)) r.perPlace ??= n;
    else if (r.max === undefined) r.max = n;
  }
  const min = t.match(new RegExp(String.raw`(?:מינימום|לפחות|מינ׳)\s*(\d{1,4})\s*(${PEOPLE}|חולצות|יחידות|שעות|לילות)?`));
  if (min && r.min === undefined && (min[2] ? !/שעות|לילות/.test(min[2]) : true) && !/מראש/.test(t.slice((min.index ?? 0) + min[0].length, (min.index ?? 0) + min[0].length + 8))) r.min = Number(min[1]);
  return r;
}

/** "מינימום 3 שעות" / "מינימום 2 לילות" — a smallest quantity of time. */
export function minimumQuantity(prompt: string): { n: number; unit: 'hours' | 'nights' | 'items' } | undefined {
  const t = withDigits(prompt);
  const m = t.match(/(?:מינימום|לפחות)\s*(\d{1,3})\s*(שעות|לילות|חולצות|יחידות|פריטים|מגשים)/);
  if (!m || /מראש/.test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8))) return undefined;
  return { n: Number(m[1]), unit: m[2] === 'שעות' ? 'hours' : m[2] === 'לילות' ? 'nights' : 'items' };
}

export interface DepositInfo {
  percent?: number;
  /** A fixed amount ("מקדמה 300 ש״ח"), which forms express only as a percentage. */
  amount?: number;
  perPerson?: boolean;
}

export function depositInfo(prompt: string): DepositInfo | undefined {
  const t = withDigits(prompt.replace(/[״]/g, '"'));
  if (!/מקדמ/.test(t)) return undefined;
  const pct = t.match(/מקדמ\S*\s*(?:של\s*)?(\d{1,3})\s*(?:%|אחוז)/) ?? t.match(/(\d{1,3})\s*(?:%|אחוז)\s*(?:מקדמה|כמקדמה)/);
  if (pct && Number(pct[1]) >= 1 && Number(pct[1]) <= 100) return { percent: Number(pct[1]) };
  const amount = t.match(new RegExp(String.raw`מקדמ\S*\s*(?:של\s*)?(\d{1,6})\s*${CURRENCY}?(\s*(?:ל|לכל\s*)(?:סועד|אורח|משתתף|אדם|איש))?`));
  if (amount) return { amount: Number(amount[1]), perPerson: Boolean(amount[2]) };
  return {};
}

export interface DeliveryInfo {
  fee?: number;
  free?: boolean;
  /** "משלוח חינם מעל 300" */
  freeAbove?: number;
}

export function deliveryInfo(prompt: string): DeliveryInfo | undefined {
  const t = withDigits(prompt.replace(/[״]/g, '"'));
  if (!/משלוח|משלוחים/.test(t)) return undefined;
  const freeAbove = t.match(/משלוח\s*(?:חינם|חינמי|ללא עלות)\s*(?:בהזמנה\s*)?(?:מעל|החל מ-?)\s*(\d{1,6})/);
  if (freeAbove) return { free: true, freeAbove: Number(freeAbove[1]) };
  if (/משלוח\s*(?:חינם|חינמי|ללא עלות|בחינם)/.test(t)) return { free: true };
  const fee = t.match(new RegExp(String.raw`משלוח\S*\s*(?:של\s*|ב-?|בעלות\s*(?:של\s*)?)?(\d{1,4})\s*${CURRENCY}?`));
  return fee ? { fee: Number(fee[1]) } : {};
}

/** "מינימום הזמנה 80" */
export function minimumOrder(prompt: string): number | undefined {
  const m = withDigits(prompt).match(/מינימום\s*(?:הזמנה|להזמנה)\s*(?:של\s*|מ-?)?(\d{1,6})/);
  return m ? Number(m[1]) : undefined;
}

/** "סגור בראשון", "שישי ושבת סגור", "חוץ משבת" → closed weekdays. */
export const DAY_INDEX: Record<string, number> = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };
