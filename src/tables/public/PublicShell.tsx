/**
 * Guest page chrome. Every venue page opens with the business's own header — cover photo or a
 * brand-colour band, logo (or monogram), name in the brand typeface, a line about the place and
 * today's booking hours — and the page content sits on a sheet over it. Colours are contrast-
 * repaired (domain/publicPages) for light and dark display; language and direction are applied here.
 */
import { Clock, Globe, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cx } from '../../components/ui';
import { ensureContrast, readableOn } from '../../theme/color';
import { displayPhone, normalizePhone, whatsappHref } from '../domain/phone';
import type { ResolvedLook } from '../domain/publicPages';
import { ThemeButton } from '../theme';
import { Ltr } from '../ui';
import { t, tx, type Lang } from './i18n';
import { hoursOn, mapsHref, weekdayOf, type VenueService } from './VenueInfo';

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

/** A page design applied to the shell (see look.ts). */
export interface ShellDesign { look: ResolvedLook; logoUrl: string; heroUrl: string }

export interface ShellVenue {
  name: string;
  address?: string | null;
  phone?: string | null;
  showWhatsapp?: boolean;
  intro?: string | null;
  timezone?: string;
  services?: VenueService[];
  /** Venue-local date of today (for today's booking hours). */
  today?: string;
  brand?: { displayName: string | null; palette: Record<string, string> | null };
}

const monogram = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] ?? '').join('').toUpperCase() || '·';

export function PublicShell({ lang, venue, children, compact, design, aside, sheet = true }: {
  lang: Lang;
  venue: ShellVenue | null;
  children: ReactNode;
  /** Smaller header for secondary pages (menu, manage, status). */
  compact?: boolean;
  design?: ShellDesign | null;
  /** Side column on wide screens (below the content on phones). */
  aside?: ReactNode;
  /** Wrap the content in the raised sheet (off for pages that lay out their own cards). */
  sheet?: boolean;
}) {
  const s = tx(lang);
  const style = useMemo(() => ({ ...brandStyle(venue?.brand?.palette), ...(design?.look.vars ?? {}) }) as CSSProperties, [venue?.brand?.palette, design]);
  const location = useLocation();
  const [params] = useSearchParams();
  const other = new URLSearchParams(params);
  if (lang === 'en') other.delete('lang'); else other.set('lang', 'en');
  const phone = venue?.phone ? normalizePhone(venue.phone) : null;
  const todayHours = venue?.today && venue.services ? hoursOn(venue.services, weekdayOf(venue.today)) : undefined;
  const photo = design?.heroUrl || '';
  const eyebrow = venue?.brand?.displayName && venue.brand.displayName !== venue.name ? venue.brand.displayName : '';

  return (
    <div dir={lang === 'en' ? 'ltr' : 'rtl'} lang={lang} style={style} {...(design?.look.attrs ?? {})}
      className={cx('fz-guest fz-page min-h-screen bg-[#FAF9F7] text-ink', design && 'fz-pp')}>
      <a href="#guest-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">{t(lang, 'skip')}</a>

      <header className={cx('pp-hero relative isolate overflow-hidden', photo ? 'pp-hero-photo' : 'pp-hero-band')}>
        {photo && (
          <>
            <img src={photo} alt="" width={1600} height={900} decoding="async" fetchPriority="high"
              className="pp-hero-img absolute inset-0 -z-20 h-full w-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
          </>
        )}
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-end gap-2 pt-3">
            <ThemeButton lang={lang} className="pp-glass" />
            <Link to={`${location.pathname}${other.toString() ? `?${other}` : ''}${location.hash}`} lang={lang === 'en' ? 'he' : 'en'}
              className="pp-glass inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm">
              <Globe className="h-4 w-4" aria-hidden /> {lang === 'en' ? 'עברית' : 'English'}
            </Link>
          </div>
          {venue && (
            <div className={cx('flex flex-col gap-4', compact ? 'pb-16 pt-3 sm:pb-20' : 'pb-20 pt-6 sm:pb-24 sm:pt-10 lg:pb-28')}>
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                {design?.logoUrl ? (
                  <img src={design.logoUrl} alt="" width={80} height={80} decoding="async"
                    className={cx('pp-logo shrink-0 rounded-[var(--pp-r-lg)] bg-white object-contain p-1.5 shadow-lg ring-1 ring-black/5', compact ? 'h-12 w-12' : 'h-16 w-16 sm:h-20 sm:w-20')} />
                ) : (
                  <span aria-hidden className={cx('pp-monogram flex shrink-0 items-center justify-center rounded-[var(--pp-r-lg)]', compact ? 'h-12 w-12 text-lg' : 'h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl')}>
                    {monogram(venue.name)}
                  </span>
                )}
                <div className="min-w-0">
                  {eyebrow && <p className="pp-eyebrow truncate text-xs font-semibold uppercase tracking-[0.14em]">{eyebrow}</p>}
                  <p className={cx('pp-display pp-venue-name break-words leading-[1.05]', compact ? 'text-2xl sm:text-3xl' : 'text-[2rem] sm:text-5xl')}>{venue.name}</p>
                </div>
              </div>
              {!compact && venue.intro && <p className="pp-hero-text max-w-2xl whitespace-pre-line text-base sm:text-lg">{venue.intro}</p>}
              {!compact && (todayHours !== undefined || venue.address || phone) && (
                <ul className="flex flex-wrap gap-2 text-sm">
                  {todayHours !== undefined && (
                    <li className="pp-glass inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3">
                      <Clock className="h-4 w-4" aria-hidden />{todayHours ? <span>{s.openToday('')}<Ltr>{todayHours}</Ltr></span> : s.closedToday}
                    </li>
                  )}
                  {venue.address && (
                    <li><a href={mapsHref(venue.address)} target="_blank" rel="noopener noreferrer" className="pp-glass inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3">
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="max-w-[16rem] truncate">{venue.address}</span>
                    </a></li>
                  )}
                  {phone && (
                    <li><a href={`tel:${phone}`} className="pp-glass inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3">
                      <Phone className="h-4 w-4" aria-hidden /><Ltr>{displayPhone(phone)}</Ltr>
                    </a></li>
                  )}
                  {phone && venue.showWhatsapp && (
                    <li><a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" className="pp-glass inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3">
                      <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
                    </a></li>
                  )}
                </ul>
              )}
            </div>
          )}
          {!venue && <div className="h-24" />}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        <div className={cx(!!aside && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start lg:gap-8')}>
          <main id="guest-main" className={cx('relative z-10 -mt-12 min-w-0 sm:-mt-14', !aside && 'mx-auto max-w-2xl')}>
            {sheet ? <div className="pp-sheet rounded-[var(--pp-r-lg,24px)] p-5 sm:p-7">{children}</div> : children}
          </main>
          {aside && <aside className="mt-6 min-w-0 lg:sticky lg:top-6 lg:mt-6">{aside}</aside>}
        </div>
      </div>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-ink-muted">{t(lang, 'poweredBy')}</footer>
    </div>
  );
}

/** Primary guest action in the venue accent colour. */
export const accentButton = 'pp-btn inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold bg-[var(--fz-accent)] text-[var(--fz-on-accent)] shadow-sm transition hover:brightness-[1.06] active:scale-[0.99] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--fz-accent)]';

/** Secondary guest action (outlined, accent text). */
export const softButton = 'pp-soft-btn inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold';
