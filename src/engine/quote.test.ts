import { describe, expect, it } from 'vitest';
import { QuoteContentSchema, QuoteSelectionError, quoteFromRequest, quoteTotals, type QuoteContent } from './quote';

const base: QuoteContent = {
  title: 'זר כלה',
  items: [
    { id: 'main', label: 'זר', unitPrice: 300, quantity: 1, optional: false, included: true, adjustable: false },
    { id: 'vase', label: 'אגרטל', unitPrice: 45.5, quantity: 1, optional: true, included: false, adjustable: true, maxQuantity: 3 },
  ],
  adjustments: [{ label: 'הנחת חג', kind: 'discount', mode: 'percent', value: 10 }],
  vat: { mode: 'excluded', rate: 18 },
};

describe('interactive quote totals', () => {
  it('prices the default offer: discount first, VAT on the net', () => {
    expect(quoteTotals(base)).toMatchObject({ subtotal: 300, net: 270, vat: 48.6, total: 318.6 });
  });
  it('recalculates when the customer adds extras', () => {
    expect(quoteTotals(base, { vase: 2 }).total).toBe(415.24);
  });
  it('refuses selections the business did not offer', () => {
    expect(() => quoteTotals(base, { vase: 4 })).toThrow(QuoteSelectionError);
    expect(() => quoteTotals(base, { main: 0 })).toThrow(QuoteSelectionError);
    expect(() => quoteTotals(base, { other: 1 })).toThrow(QuoteSelectionError);
  });
  it('shows the VAT inside prices that include it, and none for an exempt business', () => {
    expect(quoteTotals({ ...base, adjustments: [], vat: { mode: 'included', rate: 18 } })).toMatchObject({ total: 300, vat: 45.76 });
    expect(quoteTotals({ ...base, adjustments: [], vat: { mode: 'exempt', rate: 0 } })).toMatchObject({ total: 300, vat: 0 });
  });
  it('never lets a discount push the total below zero', () => {
    expect(quoteTotals({ ...base, adjustments: [{ label: 'x', kind: 'discount', mode: 'amount', value: 1000 }], vat: { mode: 'exempt', rate: 0 } }).total).toBe(0);
  });
  it('starts a quote from the priced answers of the request', () => {
    const q = quoteFromRequest('הצעה לאירוע', [{ label: 'תפריט × 20', amount: 2400 }, { label: 'חינם', amount: 0 }]);
    expect(q.items).toHaveLength(1);
    expect(QuoteContentSchema.safeParse(q).success).toBe(true);
  });
});
