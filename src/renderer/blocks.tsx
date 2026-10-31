/**
 * Presentation blocks (no answers). All user text is rendered as React text
 * nodes — never as HTML — and images come only from local illustrations or
 * workspace assets resolved to data URLs.
 */
import {
  CalendarDays,
  Check,
  ChefHat,
  Clock,
  Heart,
  Leaf,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { HighlightItem, WorkflowConfig, WorkflowField } from '../domain/schema';
import type { SlotAvailability } from '../engine/booking';
import type { PriceResult } from '../engine/pricing';
import { formatCurrency } from '../lib/format';
import { hasArt, OptionArt } from '../theme/art';

const ICONS: Record<NonNullable<HighlightItem['icon']>, LucideIcon> = {
  sparkles: Sparkles,
  truck: Truck,
  leaf: Leaf,
  shield: ShieldCheck,
  clock: Clock,
  heart: Heart,
  star: Star,
  check: Check,
  wrench: Wrench,
  chef: ChefHat,
  calendar: CalendarDays,
  phone: Phone,
};

const paragraphs = (text?: string) => (text ?? '').split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);

/** A local illustration key or an uploaded asset, with an honest caption for illustrations. */
export function Media({ refId, assets, className, alt }: { refId: string; assets: Record<string, string>; className?: string; alt?: string }) {
  if (refId.startsWith('ast_')) {
    const url = assets[refId];
    return url ? <img src={url} alt={alt ?? ''} className={className} loading="lazy" /> : <span className={`fz-media-missing ${className ?? ''}`}>התמונה אינה זמינה בדפדפן זה</span>;
  }
  if (!hasArt(refId)) return null;
  return (
    <span className={`fz-media-art ${className ?? ''}`}>
      <OptionArt name={refId} />
      <span className="fz-art-caption">איור להמחשה</span>
    </span>
  );
}

export function DisplayBlock({
  field,
  assets = {},
  price,
  config,
}: {
  field: WorkflowField;
  assets?: Record<string, string>;
  price?: PriceResult;
  config?: WorkflowConfig;
}) {
  switch (field.type) {
    case 'heading':
      return (
        <section className="fz-field fz-block-heading">
          <h3 className="fz-display">{field.label}</h3>
          {paragraphs(field.content ?? field.helpText).map((p, i) => (
            <p key={i} className="fz-muted">
              {p}
            </p>
          ))}
        </section>
      );
    case 'image': {
      const ref = field.media?.[0];
      if (!ref) return null;
      return (
        <figure className="fz-field fz-block-image">
          <Media refId={ref} assets={assets} alt={field.label} className="fz-block-image-media" />
          {(field.helpText || field.label) && <figcaption className="fz-help">{field.helpText ?? field.label}</figcaption>}
        </figure>
      );
    }
    case 'gallery':
      return (
        <section className="fz-field" aria-label={field.label}>
          {field.label && <p className="fz-label">{field.label}</p>}
          <div className="fz-gallery">
            {(field.media ?? []).map((m, i) => (
              <Media key={`${m}-${i}`} refId={m} assets={assets} alt={`${field.label} ${i + 1}`} className="fz-gallery-item" />
            ))}
          </div>
          {field.helpText && <p className="fz-help">{field.helpText}</p>}
        </section>
      );
    case 'divider':
      return (
        <div className="fz-field fz-block-divider" role="separator" aria-label={field.helpText || undefined}>
          {field.helpText && <span>{field.helpText}</span>}
        </div>
      );
    case 'highlights':
      return (
        <ul className="fz-field fz-highlights" aria-label={field.label}>
          {(field.items ?? []).map((it) => {
            const Icon = it.icon ? ICONS[it.icon] : Sparkles;
            return (
              <li key={it.id}>
                <span className="fz-highlight-icon" aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="fz-highlight-title">{it.title}</span>
                  {it.text && <span className="fz-highlight-text">{it.text}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      );
    case 'price_breakdown':
      if (!config?.pricing.enabled || !price) return null;
      return (
        <section className="fz-field fz-panel p-4" aria-label={field.label}>
          <p className="fz-label">{field.label}</p>
          {price.lines.length ? (
            <ul className="fz-lines">
              {price.lines.map((l, i) => (
                <li key={i}>
                  <span>{l.label}</span>
                  <span className="fz-num">{formatCurrency(l.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fz-help">הבחירות שלכם יופיעו כאן.</p>
          )}
          <div className="fz-divider my-3" />
          <div className="fz-total">
            <span className="text-sm font-semibold">{config.pricing.totalLabel}</span>
            <span className="fz-total-amount">{formatCurrency(price.total)}</span>
          </div>
        </section>
      );
    case 'terms':
      return (
        <section className="fz-field" aria-label={field.label}>
          <p className="fz-label">{field.label}</p>
          {/* Focusable so keyboard users can scroll long terms. */}
          <div className="fz-terms" tabIndex={0}>
            {paragraphs(field.content ?? field.helpText).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      );
    default:
      return null;
  }
}

/** Slot chips for a time field, with local availability hints. */
export function slotHint(slot: SlotAvailability | undefined): { label: string; disabled: boolean } | null {
  if (!slot) return null;
  if (slot.state === 'full') return { label: 'מלא', disabled: true };
  if (slot.state === 'limited') return { label: 'מקומות אחרונים', disabled: false };
  return null;
}
