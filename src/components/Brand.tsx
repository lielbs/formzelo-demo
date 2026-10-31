import { useId } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './ui';

export const PRODUCT_NAME = 'Formangle';
export const PRODUCT_LOCKUP = 'Formangle by RockStack';

/**
 * Formangle mark: an "F" whose arms are cut at the same angle, plus an orange
 * wedge — a form field seen from a different angle. Same geometry as
 * public/favicon.svg and public/brand/*.svg.
 */
export function BrandMark({ size = 28, className, title, onDark = false }: { size?: number; className?: string; title?: string; onDark?: boolean }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cx('shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-labelledby={title ? id : undefined}>
      {title && <title id={id}>{title}</title>}
      {/* On dark surfaces the tile lifts to a lighter slate so the mark keeps its silhouette. */}
      <rect width="64" height="64" rx="15" fill={onDark ? '#2A3442' : '#18212D'} />
      <path d="M17 14h31l-6 9H26v7h13l-5.5 8H26v12h-9z" fill="#fff" />
      <path d="M50 50H34l16-16z" fill="#E96B3D" />
    </svg>
  );
}

/** Wordmark: "Form" + orange "angle". Canonical spelling is exactly "Formangle". */
export function Wordmark({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cx('text-[21px] font-semibold leading-none tracking-[-0.02em]', dark ? 'text-white' : 'text-midnight', className)} aria-hidden>
      Form<span className="text-orange">angle</span>
    </span>
  );
}

/**
 * Product lockup. `variant="compact"` shows only the mark (tight spaces);
 * `endorsement` adds the "by RockStack" parent-company line.
 */
export function Logo({
  dark = false,
  endorsement = true,
  variant = 'full',
  stacked = false,
  className,
  to = '/',
}: {
  dark?: boolean;
  endorsement?: boolean;
  variant?: 'full' | 'compact';
  /** "by RockStack" under the wordmark — for narrow spaces such as the app sidebar. */
  stacked?: boolean;
  className?: string;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className={cx('group inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', className)}
      dir="ltr"
      aria-label={`${PRODUCT_LOCKUP} — דף הבית`}
    >
      <BrandMark size={variant === 'compact' ? 30 : 26} onDark={dark} />
      {variant === 'full' && (
        <span className={stacked ? 'inline-flex flex-col items-start gap-1' : 'inline-flex items-baseline gap-1.5'}>
          <Wordmark dark={dark} />
          {endorsement && <span className={cx('whitespace-nowrap text-[11px] font-medium leading-none', dark ? 'text-white/50' : 'text-ink-soft')}>by RockStack</span>}
        </span>
      )}
    </Link>
  );
}

/** Honest label shown wherever generation happens. */
export function LocalGenerationNotice({ className }: { className?: string }) {
  return (
    <p className={cx('inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      יצירה מקומית מתבניות — בתוך הדפדפן
    </p>
  );
}
