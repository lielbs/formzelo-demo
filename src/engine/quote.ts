/**
 * Interactive quotes — the document a business sends after an inquiry, and the exact total the
 * customer sees while choosing extras. Pure rules: the server (private.quote_totals) applies the
 * same calculation and is the authority; this one is the live preview.
 */
import { z } from 'zod';

export const VAT_RATE_IL = 18;

export const QuoteItemSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  label: z.string().trim().min(1, 'כתבו שם לפריט').max(120, 'עד 120 תווים'),
  description: z.string().max(500, 'עד 500 תווים').optional(),
  unitPrice: z.number({ message: 'מחיר לא תקין' }).min(0, 'מחיר לא תקין').max(1_000_000, 'מחיר גבוה מדי')
    .refine((n) => Math.round(n * 100) === n * 100, 'עד שתי ספרות אחרי הנקודה'),
  quantity: z.number().int('כמות שלמה').min(1, 'לפחות 1').max(999, 'עד 999'),
  /** The customer may leave it out (or add it, when not included by default). */
  optional: z.boolean(),
  /** For optional items: selected when the customer first opens the quote. */
  included: z.boolean(),
  /** The customer may change the quantity, up to maxQuantity. */
  adjustable: z.boolean(),
  maxQuantity: z.number().int().min(1).max(999).optional(),
}).refine((i) => i.maxQuantity === undefined || i.maxQuantity >= i.quantity, { path: ['maxQuantity'], message: 'המקסימום קטן מהכמות' });
export type QuoteItem = z.infer<typeof QuoteItemSchema>;

export const QuoteAdjustmentSchema = z.object({
  label: z.string().trim().min(1, 'כתבו תיאור').max(80),
  kind: z.enum(['discount', 'fee']),
  mode: z.enum(['amount', 'percent']),
  value: z.number().min(0),
}).refine((a) => (a.mode === 'percent' ? a.value <= 100 : a.value <= 1_000_000), { path: ['value'], message: 'ערך לא תקין' });
export type QuoteAdjustment = z.infer<typeof QuoteAdjustmentSchema>;

export const QuoteContentSchema = z.object({
  title: z.string().trim().min(1, 'כתבו כותרת להצעה').max(120),
  intro: z.string().max(2000).optional(),
  items: z.array(QuoteItemSchema).min(1, 'הוסיפו לפחות פריט אחד').max(50)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'פריטים כפולים'),
  adjustments: z.array(QuoteAdjustmentSchema).max(10).default([]),
  /** included: prices include VAT · excluded: VAT is added · exempt: no VAT (עוסק פטור). */
  vat: z.object({ mode: z.enum(['included', 'excluded', 'exempt']), rate: z.number().min(0).max(50) }),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  terms: z.string().max(2000).optional(),
});
export type QuoteContent = z.infer<typeof QuoteContentSchema>;

/** itemId → quantity, for optional or adjustable items. Missing = the default offer. */
export type QuoteSelections = Record<string, number>;

export interface QuoteTotals {
  lines: { itemId: string; label: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  adjustments: { label: string; amount: number }[];
  net: number;
  vat: number;
  total: number;
}

export class QuoteSelectionError extends Error {
  constructor() {
    super('selection_invalid');
    this.name = 'QuoteSelectionError';
  }
}

/** PostgreSQL round(numeric, 2): half away from zero, on exact decimals. */
export const round2 = (n: number) => {
  const scaled = Math.round(Math.abs(n) * 100 + 1e-9) / 100;
  return n < 0 ? -scaled : scaled;
};

export const defaultQuantity = (item: QuoteItem) => (item.optional && !item.included ? 0 : item.quantity);

/** Mirrors private.quote_totals() exactly, including its validation of selections. */
export function quoteTotals(content: QuoteContent, selections: QuoteSelections = {}): QuoteTotals {
  for (const id of Object.keys(selections)) {
    const item = content.items.find((i) => i.id === id);
    if (!item || !(item.optional || item.adjustable)) throw new QuoteSelectionError();
  }
  const lines: QuoteTotals['lines'] = [];
  let subtotal = 0;
  for (const item of content.items) {
    let qty = defaultQuantity(item);
    if (Object.prototype.hasOwnProperty.call(selections, item.id)) {
      qty = selections[item.id]!;
      if (!Number.isInteger(qty) || qty < 0) throw new QuoteSelectionError();
      const max = item.maxQuantity ?? item.quantity;
      if (!item.adjustable) {
        if (qty !== 0 && qty !== item.quantity) throw new QuoteSelectionError();
      } else if (qty > max || (qty === 0 && !item.optional)) throw new QuoteSelectionError();
    }
    if (qty > 0) {
      const amount = round2(item.unitPrice * qty);
      subtotal += amount;
      lines.push({ itemId: item.id, label: item.label, quantity: qty, unitPrice: item.unitPrice, amount });
    }
  }
  subtotal = round2(subtotal);
  let net = subtotal;
  const adjustments: QuoteTotals['adjustments'] = [];
  for (const adj of content.adjustments ?? []) {
    let amount = adj.mode === 'percent' ? round2((subtotal * adj.value) / 100) : round2(adj.value);
    if (adj.kind === 'discount') amount = -Math.min(amount, net);
    net = round2(net + amount);
    adjustments.push({ label: adj.label, amount });
  }
  const rate = content.vat.rate;
  let vat = 0;
  let total = net;
  if (content.vat.mode === 'excluded') {
    vat = round2((net * rate) / 100);
    total = net + vat;
  } else if (content.vat.mode === 'included') {
    vat = round2(net - net / (1 + rate / 100));
  }
  return { lines, subtotal, adjustments, net, vat, total: round2(total) };
}

export const QUOTE_STATUS_LABELS = {
  draft: 'טיוטה',
  sent: 'נשלחה ללקוח',
  approved: 'אושרה',
  declined: 'נדחתה',
  changes_requested: 'הלקוח ביקש שינויים',
  superseded: 'הוחלפה בגרסה חדשה',
  withdrawn: 'בוטלה',
  expired: 'פג תוקף',
} as const;
export type QuoteStatus = keyof typeof QUOTE_STATUS_LABELS;

export const VAT_MODE_LABELS: Record<QuoteContent['vat']['mode'], string> = {
  included: 'המחירים כוללים מע״מ',
  excluded: 'המחירים לפני מע״מ',
  exempt: 'עוסק פטור — ללא מע״מ',
};

let seq = 0;
export const newQuoteItemId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankItem(label = ''): QuoteItem {
  return { id: newQuoteItemId(), label, unitPrice: 0, quantity: 1, optional: false, included: true, adjustable: false };
}

/** A starting quote built from what the customer asked for: their priced answers become items. */
export function quoteFromRequest(title: string, priceLines: { label: string; amount: number }[]): QuoteContent {
  const items = priceLines.filter((l) => l.amount > 0).map((l) => ({ ...blankItem(l.label.slice(0, 120)), unitPrice: round2(l.amount) }));
  return {
    title: title.slice(0, 120) || 'הצעת מחיר',
    items: items.length ? items : [blankItem('')],
    adjustments: [],
    vat: { mode: 'included', rate: VAT_RATE_IL },
  };
}
