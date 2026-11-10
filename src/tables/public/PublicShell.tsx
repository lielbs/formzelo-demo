/** Guest page chrome: venue identity, brand accent (contrast-repaired), language and direction. */
import { Globe, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cx } from '../../components/ui';
import { ensureContrast, readableOn } from '../../theme/color';
import { displayPhone, normalizePhone, whatsappHref } from '../domain/phone';
import type { ResolvedLook } from '../domain/publicPages';
import { ThemeButton } from '../theme';
import { Ltr } from '../ui';
import { t, type Lang } from './i18n';

export function useLang(): Lang {
  const [params] = useSearchParams();
  return params.get('lang') === 'en' ? 'en' : 'he';
}

/** Applies document language/direction for the page and restores it on leave. */
export function useDocumentLanguage(lang: Lang, title?: string) {
  useEffect(() => {
    const html = document.documentElement;
    const prev = { lang: html.lang, dir: html.dir, title: document.title };
    html.lang = lang;
    html.dir = lang === 'en' ? 'ltr' : 'rtl';
    if (title) document.title = title;
    // Capability links stay out of the Referer header of anything this page loads.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => { html.lang = prev.lang; html.dir = prev.dir; document.title = prev.title; meta.remove(); };
  }, [lang, title]);
}

/** Venue accent repaired for contrast on both the light and the dark page background. */
export function brandStyle(palette: Record<string, string> | null | undefined): CSSProperties {
  const raw = palette?.primary && /^#[0-9a-f]{6}$/i.test(palette.primary) ? palette.primary : '#BF4F28';
  const light = ensureContrast(raw, '#FFFFFF', 4.5);
  const dark = ensureContrast(raw, '#0F141B', 4.5);
  return {
    ['--fz-accent-l' as string]: light, ['--fz-on-accent-l' as string]: readableOn(light),
    ['--fz-accent-d' as string]: dark, ['--fz-on-accent-d' as string]: readableOn(dark),
  };
}

/** A published page design applied to the shell (see domain/publicPages). */
export interface ShellDesign { look: ResolvedLook; logoUrl: string; heroUrl: string }

export function PublicShell({ lang, venue, children, compact, design }: {
  lang: Lang;
  venue: { name: string; address?: string | null; phone?: string | null; showWhatsapp?: boolean; brand?: { displayName: string | null; palette: Record<string, string> | null } } | null;
  children: ReactNode;
  compact?: boolean;
  design?: ShellDesign | null;
}) {
  const style = useMemo(() => ({ ...brandStyle(venue?.brand?.palette), ...(design?.look.vars ?? {}) }) as CSSProperties, [venue?.brand?.palette, design]);
  const location = useLocation();
  const [params] = useSearchParams();
  const other = new URLSearchParams(params);
  if (lang === 'en') other.delete('lang'); else other.set('lang', 'en');
  const phone = venue?.phone ? normalizePhone(venue.phone) : null;
  return (
    <div dir={lang === 'en' ? 'ltr' : 'rtl'} lang={lang} style={style} {...(design?.look.attrs ?? {})}
      className={cx('fz-guest fz-page min-h-screen bg-[#FAF9F7] text-ink', design && 'fz-pp')}>
      <a href="#guest-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">{t(lang, 'skip')}</a>
      <header className="border-b border-cloud-200 bg-white">
        <div className="mx-auto flex max-w-xl items-start justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {design?.logoUrl && (
              <img src={design.logoUrl} alt="" width={48} height={48} decoding="async"
                className="pp-logo h-12 w-12 shrink-0 rounded-[var(--pp-r)] bg-[var(--pp-surface)] object-contain p-1 ring-1 ring-[var(--pp-line)]" />
            )}
          <div className="min-w-0">
            {venue?.brand?.displayName && venue.brand.displayName !== venue.name && <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{venue.brand.displayName}</p>}
            <p className={compact ? 'text-lg font-semibold' : 'text-xl font-semibold sm:text-2xl'}>{venue?.name ?? ''}</p>
            {!compact && (venue?.address || phone) && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                {venue?.address && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 shrink-0" aria-hidden />{venue.address}</span>}
                {phone && (
                  <a href={`tel:${phone}`} className="inline-flex min-h-[24px] items-center gap-1 underline-offset-2 hover:underline">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden /><Ltr>{displayPhone(phone)}</Ltr>
                  </a>
                )}
                {phone && venue?.showWhatsapp && (
                  <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[24px] items-center gap-1 underline-offset-2 hover:underline">
                    <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <ThemeButton lang={lang} />
          <Link to={`${location.pathname}${other.toString() ? `?${other}` : ''}${location.hash}`} lang={lang === 'en' ? 'he' : 'en'}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-cloud-300 px-2.5 text-sm text-ink-muted hover:text-ink">
            <Globe className="h-4 w-4" aria-hidden /> {lang === 'en' ? 'עברית' : 'English'}
          </Link>
          </div>
        </div>
      </header>
      {design?.heroUrl && design.look.heroStyle === 'banner' && (
        <div className="mx-auto max-w-xl sm:px-4 sm:pt-4">
          <img src={design.heroUrl} alt="" width={1200} height={675} decoding="async" fetchPriority="high"
            className="pp-hero aspect-[16/9] w-full bg-[var(--pp-skeleton)] object-cover sm:rounded-[var(--pp-r-lg)] sm:aspect-[2/1]" />
        </div>
      )}
      <main id="guest-main" className="mx-auto max-w-xl px-4 pb-16 pt-5">
        {design?.heroUrl && design.look.heroStyle === 'inline' && (
          <img src={design.heroUrl} alt="" width={1200} height={675} decoding="async"
            className="pp-hero mb-5 aspect-[16/9] w-full rounded-[var(--pp-r-lg)] bg-[var(--pp-skeleton)] object-cover" />
        )}
        {children}
      </main>
      <footer className="mx-auto max-w-xl px-4 pb-8 text-center text-xs text-ink-muted">{t(lang, 'poweredBy')}</footer>
    </div>
  );
}

/** Primary guest action in the venue accent colour. */
export const accentButton = 'pp-btn inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold bg-[var(--fz-accent)] text-[var(--fz-on-accent)] hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--fz-accent)]';
