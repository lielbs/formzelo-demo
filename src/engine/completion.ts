/**
 * Completion (payment) rules — pure and deterministic, so a server can
 * recompute them. Price calculation lives in pricing.ts and is independent:
 * a workflow can show a price and still collect nothing.
 *
 * Nothing here moves money. Statuses ending in "_simulated" only record that
 * a clearly-labelled demo button was pressed.
 */
import type { Completion, CompletionMode, Payment, WorkflowConfig } from '../domain/schema';
import type { PriceResult } from './pricing';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Effective completion settings. Legacy configs (no `completion`) keep their original behaviour. */
export function completionOf(config: WorkflowConfig): Completion {
  if (config.completion) return config.completion;
  if (config.pricing.enabled && config.pricing.depositPercent > 0) {
    return { mode: 'deposit', depositPercent: config.pricing.depositPercent, depositTiming: 'after_approval' };
  }
  return { mode: config.pricing.enabled ? 'quote' : 'request' };
}

export const COMPLETION_LABELS: Record<CompletionMode, { title: string; description: string }> = {
  request: { title: 'בקשה בלבד', description: 'ללא תשלום וללא סכום. העסק מקבל את הבקשה ומטפל בה.' },
  quote: { title: 'הצעת מחיר', description: 'הלקוח רואה הערכה; העסק שולח הצעה סופית. לא נגבה כסף.' },
  fixed: { title: 'סכום קבוע', description: 'סכום קבוע לתשלום בסיום (בדמו: תשלום מדומה).' },
  calculated: { title: 'סכום מחושב', description: 'תשלום הסכום המחושב בסיום (בדמו: תשלום מדומה).' },
  deposit: { title: 'מקדמה', description: 'אחוז מהסכום, בשליחה או אחרי אישור העסק (בדמו: מדומה).' },
  pay_after_approval: { title: 'תשלום אחרי אישור', description: 'אין חיוב בשליחה; הסכום מתבקש רק אם העסק מאשר.' },
  external_link: { title: 'קישור תשלום חיצוני', description: 'אחרי השליחה הלקוח מועבר לעמוד התשלום של העסק עצמו.' },
};

/** Modes that never involve collecting money in the flow itself. */
export const NO_COLLECTION: CompletionMode[] = ['request', 'quote'];

export interface PaymentPlan {
  mode: CompletionMode;
  /** Amount the customer may pay (simulated) at submission. */
  dueNow: number;
  /** Amount requested only after the business approves. */
  dueAfterApproval: number;
  /** Whether the customer can choose between paying now and paying later. */
  choice: boolean;
  /** Short Hebrew line for the checkout panel. */
  headline: string;
}

export function depositAmount(total: number, percent = 20): number {
  return round2((total * percent) / 100);
}

export function paymentPlan(config: WorkflowConfig, price: Pick<PriceResult, 'total'>): PaymentPlan {
  const c = completionOf(config);
  const total = price.total;
  switch (c.mode) {
    case 'request':
      return { mode: c.mode, dueNow: 0, dueAfterApproval: 0, choice: false, headline: 'שליחת בקשה — ללא תשלום' };
    case 'quote':
      return { mode: c.mode, dueNow: 0, dueAfterApproval: 0, choice: false, headline: 'הערכת מחיר בלבד — העסק ישלח הצעה סופית' };
    case 'fixed': {
      const amt = round2(c.fixedAmount ?? total);
      return { mode: c.mode, dueNow: amt, dueAfterApproval: 0, choice: Boolean(c.allowPayLater), headline: 'תשלום בסיום (סימולציה)' };
    }
    case 'calculated':
      return { mode: c.mode, dueNow: total, dueAfterApproval: 0, choice: Boolean(c.allowPayLater), headline: 'תשלום הסכום המחושב (סימולציה)' };
    case 'deposit': {
      const amt = depositAmount(total, c.depositPercent ?? 20);
      return c.depositTiming === 'on_submit'
        ? { mode: c.mode, dueNow: amt, dueAfterApproval: 0, choice: false, headline: `מקדמה של ${c.depositPercent ?? 20}% בשליחה (סימולציה)` }
        : { mode: c.mode, dueNow: 0, dueAfterApproval: amt, choice: false, headline: `מקדמה של ${c.depositPercent ?? 20}% רק אחרי אישור העסק` };
    }
    case 'pay_after_approval':
      return { mode: c.mode, dueNow: 0, dueAfterApproval: total, choice: false, headline: 'אין חיוב עכשיו — התשלום יתבקש אחרי אישור' };
    case 'external_link':
      return { mode: c.mode, dueNow: 0, dueAfterApproval: 0, choice: false, headline: 'התשלום מתבצע בעמוד חיצוני של העסק' };
  }
}

/**
 * Payment state for a newly submitted run.
 * `payNow` is the customer's explicit (simulated) choice; it is ignored when nothing is due now.
 */
export function initialPayment(config: WorkflowConfig, price: PriceResult, payNow: boolean, at: string): Payment {
  const plan = paymentPlan(config, price);
  const c = completionOf(config);
  switch (plan.mode) {
    case 'request':
      return { status: 'none', amount: 0, kind: 'none', updatedAt: at };
    case 'quote':
      return { status: price.total > 0 ? 'quote' : 'none', amount: price.total, kind: 'estimate', updatedAt: at };
    case 'external_link':
      return { status: 'external_link', amount: price.total, kind: 'external', updatedAt: at };
    case 'fixed':
    case 'calculated':
      if (plan.dueNow <= 0) return { status: 'none', amount: 0, kind: 'full', updatedAt: at };
      return payNow || !plan.choice
        ? { status: payNow ? 'paid_simulated' : 'payment_requested', amount: plan.dueNow, kind: 'full', updatedAt: at }
        : { status: 'payment_requested', amount: plan.dueNow, kind: 'full', updatedAt: at };
    case 'deposit':
      if (c.depositTiming === 'on_submit' && plan.dueNow > 0) {
        return { status: payNow ? 'deposit_paid_simulated' : 'deposit_requested', amount: plan.dueNow, kind: 'deposit', updatedAt: at };
      }
      // Legacy shape kept: the deposit amount is known, requested only on approval.
      return { status: 'none', amount: plan.dueAfterApproval, kind: 'deposit', updatedAt: at };
    case 'pay_after_approval':
      return { status: 'none', amount: plan.dueAfterApproval, kind: 'full', updatedAt: at };
  }
}

/** Payment state after the business approves a run. */
export function paymentOnApproval(config: WorkflowConfig, payment: Payment, at: string): Payment {
  const c = completionOf(config);
  if (payment.status !== 'none' || payment.amount <= 0) return payment;
  if (c.mode === 'deposit') return { ...payment, status: 'deposit_requested', kind: 'deposit', updatedAt: at };
  if (c.mode === 'pay_after_approval') return { ...payment, status: 'payment_requested', kind: 'full', updatedAt: at };
  return payment;
}

/** Marks an outstanding (requested) payment as paid — simulation only. */
export function simulatePaid(payment: Payment, at: string): Payment | null {
  if (payment.status === 'deposit_requested') return { ...payment, status: 'deposit_paid_simulated', updatedAt: at };
  if (payment.status === 'payment_requested') return { ...payment, status: 'paid_simulated', updatedAt: at };
  return null;
}

/** True when money is (simulated as) outstanding — never true for request/quote runs. */
export const isPaymentOutstanding = (p: Payment) => p.status === 'deposit_requested' || p.status === 'payment_requested';

/** Allow only https URLs with no scripts/markup; returns null when unsafe. */
export function safeExternalUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
