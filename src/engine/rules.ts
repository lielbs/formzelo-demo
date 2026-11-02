/**
 * Operating rules read from the owner's own words: days, hours, slot length, daily or weekly
 * limits, notice, how far ahead and a closing date. Deterministic patterns, not a model.
 * Works on the raw text (digits, ":" and "." matter here), niqqud removed.
 */
const DAY_LETTERS = 'אבגדהוש';
const DAY_WORDS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const NUMBER_WORDS: Record<string, number> = { אחד: 1, אחת: 1, שניים: 2, שתיים: 2, שתי: 2, שני: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30 };

export interface PromptRules {
  weekdays?: number[];
  /** Offered start times, HH:MM. */
  slots?: string[];
  perDay?: number;
  perWeek?: number;
  noticeHours?: number;
  daysAhead?: number;
  /** YYYY-MM-DD. */
  closesOn?: string;
  onePerContact?: boolean;
  /** What was understood, in the owner's language. */
  understood: string[];
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const num = (t: string) => (/^\d+$/.test(t) ? Number(t) : (NUMBER_WORDS[t] ?? NaN));
const LETTER_LABEL = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

function weekdays(t: string): number[] | undefined {
  let days: number[] | undefined;
  const letters = t.match(/(?:ימים|בימים)\s+([אבגדהו])['׳]?\s*(?:-|–|עד)\s*([אבגדהו])['׳]?/) ?? t.match(/(?:^|\s)([אבגדהו])['׳]\s*(?:-|–)\s*([אבגדהו])['׳]/);
  const words = t.match(/(ראשון|שני|שלישי|רביעי|חמישי)\s*(?:-|–|עד)\s*(שני|שלישי|רביעי|חמישי|שישי|שבת)/);
  if (letters) days = range(DAY_LETTERS.indexOf(letters[1]!), DAY_LETTERS.indexOf(letters[2]!));
  else if (words) days = range(DAY_WORDS.indexOf(words[1]!), DAY_WORDS.indexOf(words[2]!));
  else if (/(כל יום|כל ימות השבוע|7 ימים בשבוע)/.test(t)) days = range(0, 6);
  if (!days?.length) days = undefined;
  if (days && /(כולל|וגם|גם ב)\s*(יום\s*)?שישי/.test(t) && !days.includes(5)) days = [...days, 5];
  if (days && /(כולל|וגם|גם ב)\s*שבת/.test(t) && !days.includes(6)) days = [...days, 6];
  if (days && /(חוץ מ|בלי |לא ב)\s*(יום\s*)?שישי/.test(t)) days = days.filter((d) => d !== 5);
  return days?.sort((a, b) => a - b);
}

function slots(t: string): string[] | undefined {
  const m =
    t.match(/(?:בין|משעה|מ-|מה-|בשעות|שעות|פתוח)\s*(\d{1,2})(?::(\d{2}))?\s*(?:-|–|עד|ל-|ל)\s*(\d{1,2})(?::(\d{2}))?/) ??
    t.match(/(\d{1,2}):(\d{2})\s*(?:-|–|עד)\s*(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const from = Number(m[1]) * 60 + Number(m[2] ?? 0);
  const to = Number(m[3]) * 60 + Number(m[4] ?? 0);
  if (!(from >= 5 * 60 && to <= 24 * 60 && to > from)) return undefined;
  let step = 60;
  const minutes = t.match(/(\d{2,3})\s*דק/);
  if (/שעה וחצי/.test(t)) step = 90;
  else if (/חצי שעה/.test(t)) step = 30;
  else if (/רבע שעה/.test(t)) step = 15;
  else if (minutes && Number(minutes[1]) >= 15 && Number(minutes[1]) <= 240) step = Number(minutes[1]);
  const out: string[] = [];
  for (let at = from; at + step <= to && out.length < 48; at += step) out.push(hhmm(at));
  return out.length ? out : undefined;
}

function perPeriod(t: string, period: 'ביום|ליום|כל יום|ביממה' | 'בשבוע|לשבוע|כל שבוע'): number | undefined {
  const m = t.match(new RegExp(`(?:עד|מקסימום|לא יותר מ-?|רק)\\s*(\\d{1,4}|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')})\\s*(?:[א-ת"״׳']+\\s*){0,2}(?:${period})`));
  const n = m ? num(m[1]!) : NaN;
  return n >= 1 && n <= 10000 ? n : undefined;
}

function notice(t: string): number | undefined {
  const hours = t.match(/(\d{1,3})\s*שעות?\s*(?:לפחות\s*)?(?:מראש|לפני)/);
  if (hours && Number(hours[1]) >= 1 && Number(hours[1]) <= 720) return Number(hours[1]);
  if (/יומיים\s*(?:לפחות\s*)?(?:מראש|לפני)/.test(t) && !/עד יומיים/.test(t)) return 48;
  if (/(?:^|\s)ו?(?:לפחות\s*)?יום\s*(?:אחד\s*)?(?:לפחות\s*)?מראש/.test(t) && !/עד יום/.test(t)) return 24;
  if (/(?:לפחות\s*)?שעה\s*מראש/.test(t)) return 1;
  return undefined;
}

function ahead(t: string): number | undefined {
  const days = t.match(/עד\s*(\d{1,3})\s*ימים?\s*(?:קדימה|מראש)/);
  if (days && Number(days[1]) >= 1) return Math.min(730, Number(days[1]));
  if (/עד\s*שבועיים\s*(?:קדימה|מראש)/.test(t)) return 14;
  if (/עד\s*שבוע\s*(?:קדימה|מראש)/.test(t)) return 7;
  if (/עד\s*חודשיים\s*(?:קדימה|מראש)/.test(t)) return 60;
  if (/עד\s*חודש\s*(?:קדימה|מראש)/.test(t)) return 30;
  return undefined;
}

function closing(t: string, now: Date): string | undefined {
  const m = t.match(/(?:עד|נסגר|נסגרת|תיסגר|נגמרת|מסתיימת|אחרון)\s*(?:ב-?|ה-?|לתאריך\s*)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined;
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear();
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!m[3] && iso(y) < today) y += 1;
  return iso(y);
}

export function readRules(prompt: string, now = new Date()): PromptRules {
  const t = prompt.replace(/[֑-ׇ]/g, '').replace(/[״"]/g, '"').replace(/\s+/g, ' ').trim();
  const r: PromptRules = { understood: [] };
  r.weekdays = weekdays(t);
  if (r.weekdays) r.understood.push(`ימי פעילות: ${r.weekdays.map((d) => LETTER_LABEL[d]).join(' ')}`);
  r.slots = slots(t);
  if (r.slots) r.understood.push(`שעות: ${r.slots[0]}–${r.slots[r.slots.length - 1]} (${r.slots.length} מועדים ביום)`);
  r.perDay = perPeriod(t, 'ביום|ליום|כל יום|ביממה');
  if (r.perDay) r.understood.push(`עד ${r.perDay} ביום`);
  r.perWeek = perPeriod(t, 'בשבוע|לשבוע|כל שבוע');
  if (r.perWeek) r.understood.push(`עד ${r.perWeek} בשבוע`);
  r.noticeHours = notice(t);
  if (r.noticeHours) r.understood.push(`לפחות ${r.noticeHours} שעות מראש`);
  r.daysAhead = ahead(t);
  if (r.daysAhead) r.understood.push(`עד ${r.daysAhead} ימים קדימה`);
  r.closesOn = closing(t, now);
  if (r.closesOn) r.understood.push(`נסגר אחרי ${r.closesOn.split('-').reverse().join('.')}`);
  r.onePerContact = /(פעם אחת|בקשה אחת|הרשמה אחת|תור אחד)\s*(?:בלבד\s*)?(?:לכל|ל)\s*(?:אדם|לקוח|טלפון|משתתף|משפחה)|(בלי|למנוע|ללא)\s*כפילויות/.test(t) || undefined;
  if (r.onePerContact) r.understood.push('בקשה פתוחה אחת לכל לקוח');
  return r;
}
