/**
 * Server rule codes (raised by submit_public_workflow with the field key in HINT) turned into
 * the same Hebrew sentences the browser engine shows, next to the same field.
 */
import { DomainRuleError, ValidationFailedError } from '../data/repository';

const FIELD_MESSAGES: Record<string, string> = {
  required: 'שדה חובה',
  invalid_value: 'ערך לא תקין',
  invalid_number: 'יש להזין מספר',
  invalid_email: 'כתובת אימייל לא תקינה',
  invalid_phone: 'מספר טלפון לא תקין (לדוגמה 050-1234567)',
  invalid_time: 'השעה אינה ברשימת השעות האפשריות',
  invalid_date: 'יש לבחור תאריך',
  date_too_early: 'התאריך מוקדם מדי',
  date_too_late: 'התאריך מאוחר מדי',
  invalid_option: 'יש לבחור אפשרות',
  too_many_options: 'נבחרו יותר מדי אפשרויות',
  number_out_of_range: 'המספר מחוץ לטווח המותר',
  text_too_long: 'הטקסט ארוך מדי',
  option_full: 'האפשרות הזו מלאה. בחרו אפשרות אחרת.',
  consent_required: 'יש לאשר כדי לשלוח',
  booking_past: 'התאריך כבר עבר. בחרו תאריך מהיום והלאה.',
  booking_closed_date: 'העסק סגור בתאריך הזה. בחרו תאריך אחר.',
  booking_too_far: 'התאריך רחוק מדי. בחרו תאריך קרוב יותר.',
  booking_notice: 'המועד קרוב מדי. בחרו מועד מאוחר יותר.',
  booking_day_full: 'היום הזה מלא. בחרו תאריך אחר.',
  booking_closed_weekday: 'אין קבלת הזמנות ביום הזה. בחרו יום אחר.',
  booking_slot_unavailable: 'השעה שנבחרה אינה זמינה להזמנה',
  booking_slot_full: 'המועד הזה נתפס הרגע. בחרו שעה אחרת.',
};

const FORM_MESSAGES: Record<string, string> = {
  intake_paused: 'הטופס סגור כרגע לבקשות חדשות.',
  intake_not_yet: 'הטופס עוד לא נפתח לבקשות.',
  intake_ended: 'ההרשמה הסתיימה.',
  intake_holiday: 'אנחנו סגורים היום. אפשר לשלוח בקשה ביום פעילות אחר.',
  intake_total: 'כל המקומות נתפסו.',
  intake_day: 'התקבלו כל הבקשות להיום. אפשר לחזור מחר.',
  intake_week: 'התקבלו כל הבקשות לשבוע הזה. אפשר לחזור ביום ראשון.',
  open_request_exists: 'כבר התקבלה מכם בקשה פתוחה. נחזור אליכם עליה — אין צורך לשלוח שוב.',
};

export interface ServerError {
  code?: string;
  message?: string;
  hint?: string | null;
}

/** Throws the matching domain error when `error` is a known rule; returns otherwise. */
export function throwRuleError(error: ServerError, closedMessage?: string): void {
  if (error.code === '54000') throw new DomainRuleError('נשלחו הרבה בקשות בזמן קצר. נסו שוב בעוד כמה דקות.');
  if (error.code === 'P0002') throw new DomainRuleError('הטופס אינו זמין יותר.');
  if (error.code !== 'P0001' || !error.message) return;
  const field = FIELD_MESSAGES[error.message];
  if (field) throw new ValidationFailedError({ [error.hint || '__form']: field });
  const form = FORM_MESSAGES[error.message];
  if (form) throw new DomainRuleError(error.message.startsWith('intake_') && closedMessage ? closedMessage : form);
}
