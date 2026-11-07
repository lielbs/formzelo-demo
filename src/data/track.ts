/**
 * The customer's own request page ("track"), the same shape in the demo and in production.
 * It holds only what the customer may see: no internal notes, staff names or other requests.
 */
import type { ActionStatus, CustomerAction, RunAnswer, RunStatus } from '../domain/schema';
import type { PresenceLink, WorkflowTheme } from '../domain/theme';
import type { QuoteContent, QuoteStatus, QuoteTotals } from '../engine/quote';

export interface TrackedQuote {
  id: string;
  revision: number;
  status: QuoteStatus;
  content: QuoteContent;
  /** Server totals of the default offer. */
  totals: QuoteTotals;
  sentAt?: string;
  validUntil?: string;
  decidedAt?: string;
  decision?: { decision: 'approved' | 'declined' | 'changes_requested'; selections: Record<string, number>; comment?: string; total: number };
}

export interface TrackedAction extends Pick<CustomerAction, 'id' | 'kind' | 'title' | 'description' | 'amount' | 'note' | 'options' | 'response' | 'expiresAt' | 'createdAt'> {
  status: ActionStatus;
}

export interface TrackView {
  /** Opaque reference that authorises this page: a secret token in production. */
  access: string;
  business: { name: string; description?: string; links: PresenceLink[] };
  workflow: { slug: string; title: string; design: WorkflowTheme; booking: boolean };
  request: {
    id: string;
    reference: string;
    status: RunStatus;
    createdAt: string;
    answers: RunAnswer[];
    priceLines: { label: string; amount: number }[];
    total: number;
    cancellable: boolean;
  };
  /** Oldest first. `message` is the business's words to the customer, when it wrote any. */
  timeline: { type: string; message?: string; at: string }[];
  actions: TrackedAction[];
  /** Newest revision first. */
  quotes: TrackedQuote[];
}

export interface QuoteDecisionInput {
  decision: 'approved' | 'declined' | 'changes_requested';
  selections: Record<string, number>;
  comment?: string;
  /** Idempotency key: a retry of the same decision returns the stored one. */
  key: string;
}

/** Address of the customer page. The secret stays in the fragment, which browsers never send. */
export const trackPath = (access: string, justSent = false) => `/track${justSent ? '?sent=1' : ''}#${access}`;
