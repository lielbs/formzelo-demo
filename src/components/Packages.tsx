/**
 * RockStack-managed package cards, shared by the pricing page and the landing
 * page. Every CTA opens a prepared email to RockStack sales — no checkout.
 */
import { Check, Mail } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { packageMailto, PACKAGES, PRICING_TERMS, type Package } from '../lib/plans';
import { cx } from './ui';

export function PackagePrice({ p, size = 'lg' }: { p: Package; size?: 'lg' | 'md' }) {
  if (p.monthly === null) {
    return (
      <div>
        <p className={cx('font-semibold tracking-tight text-midnight', size === 'lg' ? 'text-[28px] leading-tight' : 'text-2xl')}>הצעת מחיר מותאמת</p>
        <p className="mt-1 text-sm text-ink-muted">לאחר שיחת אפיון</p>
      </div>
    );
  }
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={cx('font-semibold tabular-nums tracking-tight text-midnight', size === 'lg' ? 'text-[34px] leading-none' : 'text-[28px] leading-none')}>{formatCurrency(p.monthly)}</span>
        <span className="text-sm text-ink-muted">לחודש + מע״מ</span>
      </p>
      <p className="mt-2 text-sm text-ink">
        <span className="text-ink-muted">+ דמי הקמה חד-פעמיים — לפי היקף התהליכים וצורכי העסק</span>
      </p>
    </div>
  );
}

export function PackageCards({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <ul className={cx('grid items-start gap-4 lg:grid-cols-3', className)}>
      {PACKAGES.map((p) => (
        <li
          key={p.key}
          aria-labelledby={`pkg-${p.key}${compact ? '-c' : ''}`}
          className={cx('relative rounded-2xl border bg-white p-5 sm:p-6', p.recommended ? 'border-orange-700 shadow-lift ring-1 ring-orange-700/20' : 'border-cloud-200 shadow-card')}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id={`pkg-${p.key}${compact ? '-c' : ''}`} className="text-lg font-semibold text-midnight">
              {p.name}
            </h3>
            {p.recommended && <span className="rounded-full bg-orange-700 px-2.5 py-0.5 text-xs font-semibold text-white">מומלץ לרוב העסקים</span>}
          </div>
          <p className="mt-1 text-sm leading-snug text-ink-muted">{p.audience}</p>
          <div className="mt-4 border-t border-cloud-200 pt-4">
            <PackagePrice p={p} size={compact ? 'md' : 'lg'} />
          </div>
          <p className="mt-4 inline-flex rounded-full bg-cloud px-3 py-1 text-xs font-medium text-ink">{p.workflows}</p>
          {!compact && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> {f}
                </li>
              ))}
            </ul>
          )}
          <a
            href={packageMailto(p)}
            className={cx(
              'mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2',
              p.recommended ? 'bg-orange-700 text-white hover:bg-orange-800' : 'border border-cloud-300 bg-white text-ink hover:bg-cloud',
            )}
          >
            <Mail className="h-4 w-4" aria-hidden /> {p.cta}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function PricingFinePrint({ className }: { className?: string }) {
  return (
    <ul className={cx('space-y-1 text-xs leading-relaxed text-ink-muted', className)}>
      <li>{PRICING_TERMS.indicative} {PRICING_TERMS.vat}</li>
      <li>{PRICING_TERMS.setup}</li>
      <li>{PRICING_TERMS.separate}</li>
      <li>{PRICING_TERMS.noSelfService}</li>
    </ul>
  );
}
