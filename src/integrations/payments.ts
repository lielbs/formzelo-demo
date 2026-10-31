/**
 * Payment provider seam. The demo ships ONLY the simulated adapter; every
 * Israeli provider below is a catalog entry marked "not connected". No API
 * keys, terminal numbers or secrets exist anywhere in this codebase.
 *
 * A production adapter must run server-side: create a hosted checkout
 * (the customer types card data only on the provider's page), verify signed
 * webhooks, and record the provider transaction id. The client never sees
 * credentials and never marks a payment as paid by itself.
 */

export type ProviderId =
  | 'payplus'
  | 'cardcom'
  | 'tranzila'
  | 'grow'
  | 'pelecard'
  | 'hyp'
  | 'sumit'
  | 'icount'
  | 'morning'
  | 'payme'
  | 'zcredit'
  | 'icredit'
  | 'other';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Typical capabilities a production adapter would map to. Informational only. */
  capabilities: ('hosted_checkout' | 'payment_link' | 'tokenization' | 'invoices' | 'bit')[];
  status: 'not_connected';
}

export const PAYMENT_PROVIDERS: ProviderInfo[] = [
  { id: 'payplus', name: 'PayPlus', capabilities: ['hosted_checkout', 'payment_link', 'tokenization'], status: 'not_connected' },
  { id: 'cardcom', name: 'Cardcom', capabilities: ['hosted_checkout', 'payment_link', 'invoices'], status: 'not_connected' },
  { id: 'tranzila', name: 'Tranzila', capabilities: ['hosted_checkout', 'tokenization'], status: 'not_connected' },
  { id: 'grow', name: 'Grow (Meshulam)', capabilities: ['hosted_checkout', 'payment_link', 'bit'], status: 'not_connected' },
  { id: 'pelecard', name: 'Pelecard', capabilities: ['hosted_checkout', 'tokenization'], status: 'not_connected' },
  { id: 'hyp', name: 'HYP', capabilities: ['hosted_checkout', 'payment_link'], status: 'not_connected' },
  { id: 'sumit', name: 'SUMIT', capabilities: ['payment_link', 'invoices'], status: 'not_connected' },
  { id: 'icount', name: 'iCount', capabilities: ['payment_link', 'invoices'], status: 'not_connected' },
  { id: 'morning', name: 'Morning (Green Invoice)', capabilities: ['payment_link', 'invoices'], status: 'not_connected' },
  { id: 'payme', name: 'PayMe', capabilities: ['hosted_checkout', 'tokenization'], status: 'not_connected' },
  { id: 'zcredit', name: 'Z-Credit', capabilities: ['hosted_checkout', 'tokenization'], status: 'not_connected' },
  { id: 'icredit', name: 'iCredit', capabilities: ['hosted_checkout', 'payment_link'], status: 'not_connected' },
  { id: 'other', name: 'ספק אחר', capabilities: ['payment_link'], status: 'not_connected' },
];

export interface CheckoutRequest {
  orgId: string;
  runId: string;
  reference: string;
  /** Amount in agorot, recomputed server-side from the run's version — never trusted from the client. */
  amountAgorot: number;
  currency: 'ILS';
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  /** Hosted page on the provider's domain. */
  redirectUrl: string;
  providerSessionId: string;
}

export interface WebhookResult {
  runId: string;
  status: 'paid' | 'failed' | 'refunded';
  providerTransactionId: string;
}

export interface PaymentProviderAdapter {
  readonly id: ProviderId | 'simulated';
  /** True only for real, server-side integrations. */
  readonly live: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verify the provider's signature before trusting anything in the payload. */
  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<WebhookResult>;
}

/** The only adapter in the demo. It never contacts anyone and never moves money. */
export const simulatedPaymentAdapter: PaymentProviderAdapter = {
  id: 'simulated',
  live: false,
  async createCheckout(req) {
    return { redirectUrl: '', providerSessionId: `sim_${req.runId}` };
  },
  async verifyWebhook() {
    throw new Error('Simulated adapter has no webhooks — payments are only marked as simulated in the demo.');
  },
};

/** Demo resolver: always the simulation, whatever provider the owner prefers. */
export function adapterFor(_provider?: string): PaymentProviderAdapter {
  return simulatedPaymentAdapter;
}
