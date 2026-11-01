/**
 * Business Engagement Kit on the customer side. One component for every
 * workflow and slot (header / footer / completion). Links are re-validated by
 * engine/presence before they get here; text is rendered as text, never HTML.
 */
import { CalendarDays, Facebook, Globe, Instagram, Link2, Linkedin, Mail, MapPin, MessageCircle, Music2, Phone, ShoppingBag, Star, Youtube, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement, type SVGProps } from 'react';
import type { PresenceSettings, WorkflowTheme } from '../domain/theme';
import { linksForWorkflow, presenceOf, reviewLink, showsIn, type PresenceSlot, type ResolvedLink } from '../engine/presence';

type Glyph = (p: SVGProps<SVGSVGElement>) => ReactElement;

// Simple local monochrome glyphs for services lucide doesn't ship. currentColor, 24×24 grid.
const TikTok: Glyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
    <path d="M14 3c.6 2.6 2.4 4.2 5 4.5" />
  </svg>
);
const WhatsApp: Glyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
    <path d="M9.2 8.6c.3 2.8 3.4 5.9 6.2 6.2l1-1.4-1.8-1-1 .8a5 5 0 0 1-2.8-2.8l.8-1-1-1.8z" />
  </svg>
);
const Waze: Glyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 15.5A7.5 7.5 0 1 1 19.5 13c0 2.6-2 4.5-4.5 4.5H10a3 3 0 0 1-3-2" />
    <circle cx="8.5" cy="19.5" r="1.5" />
    <circle cx="15.5" cy="19.5" r="1.5" />
    <path d="M10 12.5c.9 1 3.1 1 4 0" />
  </svg>
);
const Google: Glyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}>
    <path d="M19.5 12H12.5M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
  </svg>
);

const PLATFORM_ICON: Record<ResolvedLink['platform'], LucideIcon | Glyph> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: TikTok,
  whatsapp: WhatsApp,
  waze: Waze,
  google_maps: MapPin,
  google_review: Google,
  website: Globe,
  youtube: Youtube,
  linkedin: Linkedin,
  phone: Phone,
  email: Mail,
  custom: Link2,
};
const CUSTOM_ICON: Record<NonNullable<ResolvedLink['icon']>, LucideIcon> = {
  link: Link2,
  globe: Globe,
  calendar: CalendarDays,
  bag: ShoppingBag,
  star: Star,
  phone: Phone,
  mail: Mail,
  pin: MapPin,
  chat: MessageCircle,
  music: Music2,
};

export function PresenceIcon({ link, className = 'h-4 w-4' }: { link: { platform: ResolvedLink['platform']; icon?: ResolvedLink['icon'] }; className?: string }) {
  const Icon = link.platform === 'custom' && link.icon ? CUSTOM_ICON[link.icon] : PLATFORM_ICON[link.platform];
  return <Icon className={className} aria-hidden />;
}

function LinkItem({ link, style, interactive , onSample }: { link: ResolvedLink; style: PresenceSettings['style']; interactive: boolean ; onSample?: (label: string) => void }) {
  const body = (
    <>
      <span className="fz-presence-icon">
        <PresenceIcon link={link} />
      </span>
      {style !== 'icons' && (
        <span className="fz-presence-text">
          <span className="fz-presence-label">{link.label}</span>
          {style === 'cards' && <span className="fz-presence-sub">{link.description ?? link.display}</span>}
        </span>
      )}
    </>
  );
  const name = style === 'icons' ? link.label : undefined;
  // Editor previews never navigate.
  if (!interactive) {
    return (
      <span className="fz-presence-item" data-inert aria-label={name} title={link.display} role={name ? 'img' : undefined}>
        {body}
      </span>
    );
  }
  // A demo business's links look like the real thing; a tap explains instead of navigating.
  if (link.sample) {
    return (
      <button type="button" className="fz-presence-item" aria-label={name} onClick={() => onSample?.(link.label)}>
        {body}
      </button>
    );
  }
  return (
    <a
      className="fz-presence-item"
      href={link.href}
      aria-label={name}
      title={style === 'icons' ? link.label : undefined}
      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {body}
      {link.external && <span className="fz-sr"> (נפתח בחלון חדש)</span>}
    </a>
  );
}

/** Links for one slot of a workflow, or nothing. */
/** Short note shown after tapping a demo business's link (it never navigates). */
function useSampleNote() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!label) return;
    const t = setTimeout(() => setLabel(null), 3200);
    return () => clearTimeout(t);
  }, [label]);
  const note = label ? (
    <p className="fz-presence-note" role="status">
      זה עסק לדוגמה בדמו. אצל עסק אמיתי הכפתור פותח את {label}.
    </p>
  ) : null;
  return [note, setLabel] as const;
}

export function DigitalPresence({ theme, slot, interactive = true, title }: { theme: WorkflowTheme; slot: PresenceSlot; interactive?: boolean; title?: string }) {
  const [note, onSample] = useSampleNote();
  const settings = presenceOf(theme.presence);
  if (!showsIn(settings.placement, slot)) return null;
  const links = linksForWorkflow(theme.presence?.links ?? [], settings);
  if (!links.length) return null;
  // Completion screens read best as cards or labelled pills; icon-only rows are for headers / footers.
  const style = slot === 'completion' && settings.style === 'icons' ? 'icon_label' : settings.style;
  return (
    <nav className="fz-presence" data-slot={slot} data-style={style} aria-label={title ?? 'קישורים של העסק'}>
      {title && <h2 className="fz-presence-title">{title}</h2>}
      <ul>
        {links.map((l) => (
          <li key={l.id}>
            <LinkItem link={l} style={style} interactive={interactive} onSample={onSample} />
          </li>
        ))}
      </ul>
      {note}
    </nav>
  );
}

/** Neutral review request. The caller decides eligibility (engine/presence shouldAskForReview). */
export function ReviewRequest({ theme, interactive = true }: { theme: WorkflowTheme; interactive?: boolean }) {
  const [note, onSample] = useSampleNote();
  const link = reviewLink(theme.presence?.links ?? []);
  if (!link) return null;
  const inert = !interactive;
  const inner = (
    <>
      <Star className="h-4 w-4" aria-hidden /> שתפו את החוויה שלכם בגוגל
    </>
  );
  return (
    <section className="fz-review-cta" aria-label="ביקורת בגוגל">
      <p className="fz-muted text-sm">אם תרצו, אפשר לספר לאחרים איך היה — כל ביקורת, בכל דירוג.</p>
      {inert ? (
        <span className="fz-btn fz-btn-ghost mt-2" data-inert>
          {inner}
        </span>
      ) : link.sample ? (
        <button type="button" className="fz-btn fz-btn-ghost mt-2" onClick={() => onSample('דף הביקורות בגוגל')}>
          {inner}
        </button>
      ) : (
        <a className="fz-btn fz-btn-ghost mt-2" href={link.href} target="_blank" rel="noopener noreferrer">
          {inner}
          <span className="fz-sr"> (נפתח בחלון חדש)</span>
        </a>
      )}
      {note}
    </section>
  );
}
