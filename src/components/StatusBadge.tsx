import type { Payment, RunStatus } from '../domain/schema';
import { STATUS_LABELS } from '../engine/transitions';
import { formatCurrency } from '../lib/format';
import { Badge } from './ui';

const TONES: Record<RunStatus, Parameters<typeof Badge>[0]['tone']> = {
  awaiting_customer: 'neutral',
  submitted: 'orange',
  in_review: 'blue',
  changes_requested: 'amber',
  approved: 'teal',
  rejected: 'red',
  completed: 'dark',
  cancelled: 'neutral',
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function PaymentBadge({ payment }: { payment: Payment }) {
  if (payment.status === 'none') return null;
  return payment.status === 'deposit_paid_simulated' ? (
    <Badge tone="teal">מקדמה שולמה (סימולציה)</Badge>
  ) : (
    <Badge tone="amber">ממתין למקדמה {formatCurrency(payment.amount)}</Badge>
  );
}
