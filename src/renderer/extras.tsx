/**
 * The business's own touches on a design (theme.extras): announcement strip, opening sticker,
 * owner's note, promises and the confirmation sign-off. Everything is owner-written plain text
 * rendered as text nodes; the only image is an uploaded workspace asset resolved to a data URL.
 */
import { CalendarDays, Check, ChefHat, Clock, Heart, Leaf, Megaphone, Phone, ShieldCheck, Sparkles, Star, Truck, Wrench, type LucideIcon } from 'lucide-react';
import type { PROMISE_ICONS, ThemeExtras } from '../domain/theme';

export const PROMISE_ICON: Record<(typeof PROMISE_ICONS)[number], LucideIcon> = {
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

export function Ribbon({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <p className="fz-ribbon" role="note">
      <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

export function Promises({ items: all }: { items?: ThemeExtras['promises'] }) {
  const items = all?.filter((p) => p.text.trim());
  if (!items?.length) return null;
  return (
    <ul className="fz-promises" aria-label="ההבטחות של העסק">
      {items.map((p, i) => {
        const Icon = PROMISE_ICON[p.icon];
        return (
          <li key={i} className="fz-promise" style={{ ['--i' as string]: i }}>
            <span className="fz-promise-icon" aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
            {p.text}
          </li>
        );
      })}
    </ul>
  );
}

export function Welcome({ welcome, assets }: { welcome?: ThemeExtras['welcome']; assets: Record<string, string> }) {
  if (!welcome?.message.trim()) return null;
  const photo = welcome.photoAssetId ? assets[welcome.photoAssetId] : undefined;
  return (
    <figure className="fz-welcome" data-photo={photo ? 'true' : undefined}>
      {photo && (
        <span className="fz-welcome-avatar" aria-hidden>
          <img src={photo} alt="" />
        </span>
      )}
      <div className="min-w-0">
        <blockquote className="fz-welcome-msg">{welcome.message}</blockquote>
        <figcaption className="fz-welcome-who">
          {welcome.name.trim() && <span className="fz-welcome-name">{welcome.name}</span>}
          {welcome.role && <span className="fz-welcome-role">{welcome.role}</span>}
        </figcaption>
      </div>
    </figure>
  );
}

export function Signoff({ signoff }: { signoff?: ThemeExtras['signoff'] }) {
  if (!signoff || (!signoff.message.trim() && !signoff.name.trim())) return null;
  return (
    <figure className="fz-signoff">
      {signoff.message.trim() && <blockquote>{signoff.message}</blockquote>}
      {signoff.name.trim() && <figcaption className="fz-signature">{signoff.name}</figcaption>}
    </figure>
  );
}
