/**
 * Whether a public link takes new requests right now, and how many it already took.
 *
 * Like booking availability, counts come from requests stored in THIS browser: a demo
 * aid, not a guarantee across devices. Production would count on the server, inside the
 * same transaction that stores the request.
 */
import type { Intake, WorkflowRun } from '../domain/schema';
import { HOLDS_CAPACITY } from './booking';

export type ClosedReason = 'paused' | 'not_yet' | 'ended' | 'holiday' | 'total' | 'day' | 'week';

export interface IntakeCounts {
  total: number;
  today: number;
  week: number;
}

export interface IntakeState {
  open: boolean;
  reason?: ClosedReason;
  /** Customer-facing sentence: why it is closed and when it opens again. */
  message?: string;
  counts: IntakeCounts;
}

/** Local calendar day, YYYY-MM-DD. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Sunday that starts the (Israeli) week of `d`. */
const weekStart = (d: Date) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return dayKey(s);
};

export const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};

/** A request counts while it holds a place: rejected and cancelled ones free it. */
const counting = (runs: WorkflowRun[]) => runs.filter((r) => r.submittedAt && HOLDS_CAPACITY.includes(r.status));

export function intakeCounts(runs: WorkflowRun[], now = new Date()): IntakeCounts {
  const today = dayKey(now);
  const week = weekStart(now);
  const held = counting(runs);
  return {
    total: held.length,
    today: held.filter((r) => dayKey(new Date(r.submittedAt!)) === today).length,
    week: held.filter((r) => weekStart(new Date(r.submittedAt!)) === week).length,
  };
}

/** True when any rule is set, so the studio can show a badge. */
export const hasIntakeRules = (i?: Intake) => Boolean(i && (i.paused || i.opensOn || i.closesOn || i.closedDates?.length || i.maxTotal || i.maxPerDay || i.maxPerWeek || i.onePerContact));

export function intakeState(intake: Intake | undefined, runs: WorkflowRun[], now = new Date()): IntakeState {
  const counts = intakeCounts(runs, now);
  if (!intake) return { open: true, counts };
  const today = dayKey(now);
  const closed = (reason: ClosedReason, message: string): IntakeState => ({ open: false, reason, message, counts });
  if (intake.paused) return closed('paused', 'הטופס סגור כרגע לבקשות חדשות.');
  if (intake.opensOn && today < intake.opensOn) return closed('not_yet', `ההרשמה נפתחת ב-${formatDay(intake.opensOn)}.`);
  if (intake.closesOn && today > intake.closesOn) return closed('ended', 'ההרשמה הסתיימה.');
  if (intake.closedDates?.includes(today)) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    do next.setDate(next.getDate() + 1);
    while (intake.closedDates.includes(dayKey(next)));
    return closed('holiday', `אנחנו סגורים היום. אפשר לשלוח בקשה החל מ-${formatDay(dayKey(next))}.`);
  }
  if (intake.maxTotal && counts.total >= intake.maxTotal) return closed('total', 'כל המקומות נתפסו.');
  if (intake.maxPerDay && counts.today >= intake.maxPerDay) return closed('day', 'התקבלו כל הבקשות להיום. אפשר לחזור מחר.');
  if (intake.maxPerWeek && counts.week >= intake.maxPerWeek) return closed('week', 'התקבלו כל הבקשות לשבוע הזה. אפשר לחזור ביום ראשון.');
  return { open: true, counts };
}

/** Same person, written differently: "054-555 0100" = "+972545550100"; emails ignore case. */
export function contactKey(contact: string | undefined): string | null {
  const c = (contact ?? '').trim().toLowerCase();
  if (!c) return null;
  if (c.includes('@')) return c;
  const digits = c.replace(/\D/g, '').replace(/^972/, '0');
  return digits.length >= 7 ? digits : null;
}

/** Another request from the same phone / email that still holds a place. */
export function hasOpenRequestFrom(contact: string | undefined, runs: WorkflowRun[], excludeRunId?: string): boolean {
  const key = contactKey(contact);
  if (!key) return false;
  return counting(runs).some((r) => r.id !== excludeRunId && contactKey(r.customerContact) === key);
}
