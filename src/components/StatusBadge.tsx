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

/**
 * Payment state, always labelled as a simulation. Request / no-payment runs show
 * nothing, so a submission never looks like an unpaid invoice.
 */
/** `runStatus`: a rejected or cancelled request never shows an open payment. */
export function PaymentBadge({ payment, runStatus }: { payment: Payment; runStatus?: RunStatus }) {
  const closed = runStatus === 'rejected' || runStatus === 'cancelled';
  if (closed && (payment.status === 'deposit_requested' || payment.status === 'payment_requested')) {
    return <Badge tone="neutral">ללא תשלום — {runStatus === 'rejected' ? 'נדחה' : 'בוטל'}</Badge>;
  }
  switch (payment.status) {
    case 'none':
      return null;
    case 'quote':
      return <Badge tone="neutral">הערכת מחיר {formatCurrency(payment.amount)}</Badge>;
    case 'external_link':
      return <Badge tone="blue">תשלום בקישור חיצוני</Badge>;
    case 'deposit_paid_simulated':
      return <Badge tone="teal">מקדמה שולמה (סימולציה)</Badge>;
    case 'paid_simulated':
      return <Badge tone="teal">שולם (סימולציה)</Badge>;
    case 'deposit_requested':
      return <Badge tone="amber">ממתין למקדמה {formatCurrency(payment.amount)} · סימולציה</Badge>;
    case 'payment_requested':
      return <Badge tone="amber">ממתין לתשלום {formatCurrency(payment.amount)} · סימולציה</Badge>;
  }
}
