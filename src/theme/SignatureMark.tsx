/**
 * The design family's signature in miniature, for thumbnails (gallery, templates, landing):
 * the same type-and-geometry language the forms use, so a card never promises artwork the
 * form does not have. Must sit inside a ThemeScope (reads the --fz-* tokens). Decorative only.
 */
import type { WorkflowTheme } from '../domain/theme';
import { HeroArt } from './art';
import { SIGNATURES } from './presets';

export function SignatureMark({ theme, letter, className = '' }: { theme: WorkflowTheme; letter: string; className?: string }) {
  if (theme.illustrations) return <HeroArt decoration={theme.decoration} className={`absolute inset-y-0 left-0 h-full w-[58%] opacity-90 ${className}`} />;
  if (theme.decoration === 'none') return null;
  const flow = theme.flow ?? SIGNATURES[theme.presetId].flow;
  const initial = [...letter.trim()][0] ?? '';
  const base = `pointer-events-none absolute inset-0 overflow-hidden ${className}`;
  switch (flow) {
    case 'editorial':
      return (
        <span aria-hidden className={base}>
          <span className="fz-display absolute -bottom-[0.28em] left-[-0.04em] text-[150px] leading-none" style={{ color: 'var(--fz-primary)', opacity: 0.16 }}>
            {initial}
          </span>
        </span>
      );
    case 'playful':
      return (
        <span aria-hidden className={base}>
          <span
            className="fz-display absolute -bottom-[0.28em] left-[-0.06em] text-[160px] font-extrabold leading-none"
            style={{ color: 'transparent', WebkitTextStroke: '2px color-mix(in srgb, var(--fz-hero-text) 55%, transparent)' }}
          >
            {initial}
          </span>
        </span>
      );
    case 'focus':
      return (
        <span
          aria-hidden
          className={base}
          style={{
            backgroundImage:
              'radial-gradient(90% 80% at 50% -10%, color-mix(in srgb, var(--fz-primary) 40%, transparent), transparent 62%), radial-gradient(60% 60% at 0% 110%, color-mix(in srgb, var(--fz-accent) 22%, transparent), transparent 70%)',
          }}
        />
      );
    case 'console':
      return (
        <span
          aria-hidden
          className={base}
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in srgb, var(--fz-hero-text) 9%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--fz-hero-text) 9%, transparent) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <span className="absolute left-2.5 top-2.5 h-3.5 w-3.5 border-l-2 border-t-2" style={{ borderColor: 'var(--fz-accent)' }} />
          <span className="absolute bottom-2.5 right-2.5 h-3.5 w-3.5 border-b-2 border-r-2" style={{ borderColor: 'var(--fz-accent)' }} />
        </span>
      );
    default:
      return (
        <span aria-hidden className={base}>
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: 'var(--fz-primary)' }} />
        </span>
      );
  }
}
