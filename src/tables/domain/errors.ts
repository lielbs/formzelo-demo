/** Maps server `tables:<code>` errors and SQLSTATEs to calm, human messages. */

export class TablesError extends Error {
  constructor(readonly code: string, message: string, readonly sqlState?: string, readonly detail?: unknown) {
    super(message);
    this.name = 'TablesError';
  }
  get isConflict() { return this.sqlState === '40001'; }
  get isDenied() { return this.sqlState === '42501'; }
  get isNetwork() { return this.code === 'network'; }
}

const HE: Record<string, string> = {
  network: 'אין חיבור לשרת. שום דבר לא נשמר — בדקו את החיבור ונסו שוב.',
  stale: 'מישהו אחר בצוות עדכן את ההזמנה הזו הרגע. הצגנו את המצב העדכני — בדקו ונסו שוב אם צריך.',
  denied: 'אין לכם הרשאה לפעולה הזו.',
  rate_limited: 'נעשו יותר מדי ניסיונות בזמן קצר. המתינו כמה דקות ונסו שוב.',
  no_table: 'אין שולחן פנוי שמתאים לגודל הקבוצה בשעה הזו.',
  table_conflict: 'השולחן כבר תפוס בשעה הזו. בחרו שולחן אחר.',
  table_occupied: 'השולחן עדיין תפוס על ידי האורחים הקודמים. סיימו קודם את הביקור הקודם או בחרו שולחן אחר.',
  table_too_small: 'השולחן קטן מדי לקבוצה. בחרו שולחן גדול יותר או הוסיפו סיבה כדי להושיב בכל זאת.',
  table_unknown: 'השולחן לא קיים יותר במפה.',
  needs_table: 'קודם צריך לשבץ שולחן.',
  invalid_transition: 'הפעולה לא מתאימה למצב הנוכחי של ההזמנה. המסך עודכן.',
  too_early: 'מוקדם מדי לפעולה הזו.',
  not_pending: 'ההזמנה כבר לא ממתינה לאישור.',
  pacing_full: 'הגעתם לתקרת ההגעות לחלון הזמן הזה.',
  closed: 'המקום סגור בשעה הזו.',
  too_soon: 'השעה קרובה מדי או כבר עברה.',
  too_far: 'התאריך רחוק מדי.',
  invalid_time: 'השעה לא קיימת בלוח ההזמנות.',
  party_size: 'גודל הקבוצה מחוץ לטווח שהמקום מקבל.',
  phone_invalid: 'מספר הטלפון לא נראה תקין. אפשר לכתוב 050-1234567 או מספר בינלאומי עם +.',
  email_invalid: 'כתובת האימייל לא נראית תקינה.',
  name_required: 'חסר שם.',
  terms_required: 'צריך לאשר את התנאים.',
  idempotency_conflict: 'הבקשה כבר נשלחה בפרטים אחרים. רעננו את הדף ונסו שוב.',
  override_requires_manager: 'רק מנהל/ת יכול/ה לחרוג מהכללים.',
  cutoff_passed: 'המועד האחרון לשינוי או ביטול עבר. אפשר להתקשר למקום.',
  link_unavailable: 'הקישור אינו זמין.',
  requires_approval: 'השינוי הזה דורש אישור של המקום — התקשרו אליהם.',
  not_modifiable: 'אי אפשר לשנות את ההזמנה במצבה הנוכחי.',
  already_waiting: 'המספר הזה כבר נמצא ברשימת ההמתנה.',
  waitlist_full: 'רשימת ההמתנה מלאה כרגע.',
  priority_reason_required: 'כדי לתת עדיפות צריך לכתוב סיבה.',
  menu_problems: 'יש בתפריט פריטים שצריך לתקן לפני פרסום.',
  menu_limit: 'אפשר עד 10 תפריטים למקום.',
  unavailable: 'ההזמנה כרגע לא זמינה במקום הזה.',
  not_published: 'צריך לפרסם את המקום לפני שמקבלים הזמנות.',
  public_pages_invalid: 'הגדרות העיצוב של דפי ההזמנה לא תקינות (למשל תמונה שהוסרה מהספרייה). תקנו ונסו שוב.',
  answers_invalid: 'אחת התשובות לשאלות הנוספות לא תקינה. רעננו את הדף ונסו שוב.',
  answer_required: 'צריך לענות על כל השאלות המסומנות בכוכבית.',
  invalid: 'חלק מהפרטים לא תקינים.',
  unknown: 'הפעולה לא הושלמה. נסו שוב בעוד רגע.',
};

const EN: Record<string, string> = {
  network: 'No connection. Nothing was saved — check your connection and try again.',
  rate_limited: 'Too many attempts in a short time. Please wait a few minutes.',
  no_table: 'No table is free for your party at that time.',
  table_conflict: 'That time was just taken. Please choose another.',
  closed: 'The venue is closed at that time.',
  too_soon: 'That time is too soon or has passed.',
  too_far: 'That date is too far ahead.',
  party_size: 'That party size is outside what the venue accepts.',
  phone_invalid: 'That phone number does not look right. Use an international number with +.',
  email_invalid: 'That email address does not look right.',
  name_required: 'Please enter your name.',
  terms_required: 'Please accept the booking terms.',
  cutoff_passed: 'The change deadline has passed. Please call the venue.',
  link_unavailable: 'This link is not available.',
  requires_approval: 'This change needs the venue’s approval — please call them.',
  unavailable: 'Online booking is currently unavailable here.',
  already_waiting: 'This number is already on the waitlist.',
  idempotency_conflict: 'This request was already sent with different details. Refresh and try again.',
  stale: 'This booking changed in the meantime. We refreshed it — please check and try again.',
  answers_invalid: 'One of the answers is not valid. Refresh the page and try again.',
  answer_required: 'Please answer every question marked with a star.',
  invalid: 'Some details are not valid.',
  unknown: 'Something went wrong. Please try again shortly.',
};

export function messageFor(code: string, lang: 'he' | 'en' = 'he'): string {
  return (lang === 'en' ? EN[code] : HE[code]) ?? (lang === 'en' ? EN.unknown! : HE.unknown!);
}

/** Converts a PostgREST/supabase-js error into a TablesError. Never exposes raw SQL text. */
export function toTablesError(err: unknown, lang: 'he' | 'en' = 'he'): TablesError {
  if (err instanceof TablesError) return err;
  const e = (err ?? {}) as { code?: string; message?: string; details?: string; name?: string };
  const msg = e.message ?? '';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg) || e.name === 'TypeError') {
    return new TablesError('network', messageFor('network', lang));
  }
  const m = /tables:([a-z_]+)/.exec(msg);
  let code = m?.[1] ?? (e.code === '42501' ? 'denied' : e.code === '40001' ? 'stale' : e.code === '54000' ? 'rate_limited' : 'unknown');
  if (code === 'denied' && /Tables access denied|permission denied/i.test(msg)) code = 'denied';
  let detail: unknown;
  try { detail = e.details ? JSON.parse(e.details) : undefined; } catch { detail = undefined; }
  return new TablesError(code, messageFor(code, lang), e.code, detail);
}
