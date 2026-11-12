import { Loader2, X, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-orange-700 text-white hover:bg-orange-800 shadow-sm',
  dark: 'bg-midnight text-white hover:bg-midnight-700 shadow-sm',
  secondary: 'bg-white text-ink border border-cloud-300 hover:border-ink-soft hover:bg-cloud',
  ghost: 'text-ink-muted hover:text-ink hover:bg-cloud-200',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) =>
  cx(
    'inline-flex items-center justify-center font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out select-none whitespace-nowrap',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    extra,
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, icon: Icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({ variant, size, className, icon: Icon, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: LucideIcon }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-2xl border border-cloud-200 bg-white shadow-card', className)}>{children}</As>;
}

type Tone = 'neutral' | 'orange' | 'teal' | 'blue' | 'red' | 'amber' | 'dark';
const tones: Record<Tone, string> = {
  neutral: 'bg-cloud-200 text-ink-muted',
  orange: 'bg-orange-50 text-orange-700',
  teal: 'bg-teal-50 text-teal-600',
  blue: 'bg-sky-50 text-sky-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  dark: 'bg-midnight text-white',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="amber" className={className}>
      דמו
    </Badge>
  );
}

export const inputClass = (invalid?: boolean) =>
  cx(
    'fz-input w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-soft transition',
    invalid ? 'border-red-400' : 'border-cloud-300 hover:border-ink-soft',
  );

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx(inputClass(invalid), className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cx(inputClass(invalid), 'min-h-[96px] resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cx(inputClass(invalid), 'ui-select', className)} {...rest}>
      {children}
    </select>
  );
});

export function FieldLabel({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      {required && (
        <span className="ms-1 text-orange-700" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export function Spinner({ label = 'טוען…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-800">משהו השתבש</p>
      <p className="mt-1 text-sm text-red-700">{typeof error === 'string' ? error : error.message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          נסו שוב
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-cloud-300 bg-white px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Accessible modal/drawer: Esc closes, focus moves in and is restored on close. */
export function Modal({
  open,
  onClose,
  title,
  children,
  side = false,
  wide = false,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
  /** Wider centered dialog, e.g. the field library with its live preview. */
  wide?: boolean;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // The page behind a dialog stays put (no background scroll on touch screens).
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      // Keep Tab inside the dialog.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="סגירה" className="absolute inset-0 bg-midnight/40 backdrop-blur-[1px]" onClick={onClose} data-close />
      <div
        ref={panelRef}
        className={cx(
          'relative z-10 flex max-h-full flex-col bg-white shadow-lift animate-fade-up',
          side ? 'ms-auto h-full w-full max-w-xl' : cx('m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] rounded-2xl', wide ? 'max-w-4xl' : 'max-w-lg'),
        )}
      >
        <div className="flex items-center justify-between border-b border-cloud-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="סגירה" data-close>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-cloud-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: 'neutral' | 'orange' | 'teal' }) {
  const iconTone = { neutral: 'bg-cloud text-ink-muted', orange: 'bg-orange-50 text-orange-700', teal: 'bg-teal-50 text-teal' }[tone];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[13px] leading-snug text-ink-muted sm:text-sm">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink sm:text-2xl">{value}</p>
        </div>
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', iconTone)}>
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden />
        </span>
      </div>
      {/* Phones keep the number; the explanation shows from 640 px. */}
      {hint && <p className="mt-3 hidden text-xs text-ink-soft sm:block">{hint}</p>}
    </Card>
  );
}
