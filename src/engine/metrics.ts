/**
 * Objective-aware workflow metrics. Each workflow is measured by what it is
 * for: a garage approval flow reports approved repairs, a booking flow reports
 * confirmed bookings, and only payment flows report (simulated) payments.
 * Nothing here is revenue — every amount is local demo data.
 */
import type { WorkflowConfig, WorkflowRun } from '../domain/schema';
import { completionOf, isPaymentOutstanding, NO_COLLECTION } from './completion';
import { DONE_STATUSES, PENDING_STATUSES } from './transitions';

export type Objective = 'booking' | 'approval' | 'quote' | 'payment' | 'registration' | 'request';

export interface WorkflowOutcome {
  objective: Objective;
  objectiveLabel: string;
  /** The headline count for this objective (e.g. confirmed bookings). */
  primary: { label: string; value: number };
  secondary: { label: string; value: string }[];
}

const PAID = ['paid_simulated', 'deposit_paid_simulated'];

export function objectiveOf(config: WorkflowConfig): Objective {
  if (config.booking?.enabled) return 'booking';
  if (config.steps.some((s) => s.fields.some((f) => f.type === 'decision'))) return 'approval';
  const mode = completionOf(config).mode;
  if (mode === 'quote') return 'quote';
  if (!NO_COLLECTION.includes(mode)) return 'payment';
  if (config.steps.some((s) => s.fields.some((f) => f.key === 'track'))) return 'registration';
  return 'request';
}

const ILS = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export function workflowOutcome(config: WorkflowConfig, runs: WorkflowRun[]): WorkflowOutcome {
  const submitted = runs.filter((r) => r.submittedAt);
  const pending = submitted.filter((r) => PENDING_STATUSES.includes(r.status)).length;
  const done = submitted.filter((r) => DONE_STATUSES.includes(r.status));
  const objective = objectiveOf(config);

  switch (objective) {
    case 'booking': {
      const cancelled = submitted.filter((r) => r.status === 'cancelled' || r.status === 'rejected').length;
      return {
        objective,
        objectiveLabel: 'הזמנות',
        primary: { label: 'הזמנות מאושרות', value: done.length },
        secondary: [
          { label: 'בקשות ממתינות', value: String(pending) },
          { label: 'בוטלו / נדחו', value: String(cancelled) },
        ],
      };
    }
    case 'approval': {
      const decisions = submitted.flatMap((r) => r.answers.filter((a) => a.value === 'approved' || a.value === 'declined'));
      const approved = decisions.filter((a) => a.value === 'approved').length;
      return {
        objective,
        objectiveLabel: 'אישורי לקוח',
        primary: { label: 'פריטים שהלקוחות אישרו', value: approved },
        secondary: [
          { label: 'שיעור אישור פריטים', value: decisions.length ? `${Math.round((approved / decisions.length) * 100)}%` : '—' },
          { label: 'תיקים שהוחזרו', value: String(submitted.length) },
        ],
      };
    }
    case 'quote':
      return {
        objective,
        objectiveLabel: 'בקשות להצעה',
        primary: { label: 'בקשות להצעת מחיר', value: submitted.length },
        secondary: [
          { label: 'ממתינות להצעה', value: String(pending) },
          { label: 'אושרו', value: String(done.length) },
        ],
      };
    case 'payment': {
      const paid = submitted.filter((r) => PAID.includes(r.payment.status));
      const outstanding = submitted.filter((r) => isPaymentOutstanding(r.payment) && r.status !== 'cancelled' && r.status !== 'rejected');
      return {
        objective,
        objectiveLabel: 'תשלומים (סימולציה)',
        primary: { label: 'סומנו כשולמו (סימולציה)', value: paid.length },
        secondary: [
          { label: 'סכום מדומה', value: ILS(paid.reduce((s, r) => s + r.payment.amount, 0)) },
          { label: 'ממתינים לתשלום', value: String(outstanding.length) },
        ],
      };
    }
    case 'registration':
      return {
        objective,
        objectiveLabel: 'הרשמות',
        primary: { label: 'נרשמו', value: submitted.length },
        secondary: [
          { label: 'אושרו', value: String(done.length) },
          { label: 'ממתינות', value: String(pending) },
        ],
      };
    default:
      return {
        objective,
        objectiveLabel: 'פניות',
        primary: { label: 'פניות שהתקבלו', value: submitted.length },
        secondary: [
          { label: 'ממתינות', value: String(pending) },
          { label: 'טופלו', value: String(done.length) },
        ],
      };
  }
}

/** Simulated money across a workspace, split so approvals are never shown as payments. */
export function simulatedMoney(runs: WorkflowRun[]) {
  const live = runs.filter((r) => r.submittedAt && r.status !== 'cancelled' && r.status !== 'rejected');
  return {
    paid: live.filter((r) => PAID.includes(r.payment.status)).reduce((s, r) => s + r.payment.amount, 0),
    outstanding: live.filter((r) => isPaymentOutstanding(r.payment)).reduce((s, r) => s + r.payment.amount, 0),
  };
}
