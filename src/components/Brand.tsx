import { Link } from 'react-router-dom';
import { cx } from './ui';

/** Lowercase wordmark: "form" + accented "zelo", endorsed by RockStack. */
export function Logo({ dark = false, endorsement = true, className, to = '/' }: { dark?: boolean; endorsement?: boolean; className?: string; to?: string }) {
  return (
    <Link to={to} className={cx('group inline-flex items-baseline gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', className)} dir="ltr" aria-label="formzelo by RockStack — דף הבית">
      <span className={cx('text-[22px] font-semibold leading-none tracking-tight', dark ? 'text-white' : 'text-midnight')}>
        form<span className="text-orange">zelo</span>
      </span>
      {endorsement && <span className={cx('text-[11px] font-medium leading-none', dark ? 'text-white/50' : 'text-ink-soft')}>by RockStack</span>}
    </Link>
  );
}

/** Honest label shown wherever generation happens. */
export function LocalGenerationNotice({ className }: { className?: string }) {
  return (
    <p className={cx('inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      יצירת דמו מקומית — ללא חיבור ל-AI
    </p>
  );
}
