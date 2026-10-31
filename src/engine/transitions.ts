import type { RunStatus } from '../domain/schema';

/** Explicit run state machine. Any transition not listed is rejected. */
export const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  awaiting_customer: ['submitted', 'cancelled'],
  submitted: ['in_review', 'approved', 'rejected', 'changes_requested', 'cancelled'],
  in_review: ['approved', 'rejected', 'changes_requested', 'cancelled'],
  changes_requested: ['submitted', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: ['in_review'],
  completed: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus,
  ) {
    super(`Invalid run transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export const canTransition = (from: RunStatus, to: RunStatus) => TRANSITIONS[from].includes(to);

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Transitions only the customer performs (via the public link). */
const CUSTOMER_ONLY: RunStatus[] = ['submitted'];

/** Owner-facing actions for the current status, in display order. */
export function ownerActions(from: RunStatus): { to: RunStatus; label: string; tone: 'primary' | 'neutral' | 'danger' }[] {
  const labels: Partial<Record<RunStatus, { label: string; tone: 'primary' | 'neutral' | 'danger' }>> = {
    in_review: { label: from === 'rejected' ? 'פתיחה מחדש' : 'סימון בטיפול', tone: 'neutral' },
    approved: { label: 'אישור', tone: 'primary' },
    changes_requested: { label: 'בקשת שינויים', tone: 'neutral' },
    rejected: { label: 'דחייה', tone: 'danger' },
    completed: { label: 'סימון כהושלם', tone: 'primary' },
    cancelled: { label: 'ביטול', tone: 'danger' },
  };
  return TRANSITIONS[from]
    .filter((to) => !CUSTOMER_ONLY.includes(to))
    .map((to) => ({ to, ...labels[to]! }));
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  awaiting_customer: 'ממתין ללקוח',
  submitted: 'חדש',
  in_review: 'בטיפול',
  changes_requested: 'נדרשים שינויים',
  approved: 'אושר',
  rejected: 'נדחה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

/** Statuses that count as "waiting for the owner". */
export const PENDING_STATUSES: RunStatus[] = ['submitted', 'in_review'];
export const DONE_STATUSES: RunStatus[] = ['approved', 'completed'];
