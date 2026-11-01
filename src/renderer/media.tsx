/**
 * The business's own images inside a design: the photo of the place (hero.coverAssetId) in one of
 * five placements, the photo gallery (dishes, haircuts, work) and the logo style. Images are
 * workspace assets resolved to data URLs; the frame, colour treatment and placement come from
 * theme.media. In the studio, an empty slot shows where the image will sit.
 */
import { ImagePlus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { MediaSettings, WorkflowTheme } from '../domain/theme';

export type ResolvedMedia = Required<Omit<MediaSettings, 'gallery' | 'galleryTitle'>> & Pick<MediaSettings, 'gallery' | 'galleryTitle'>;

/** theme.media with the defaults each design implies (arches get an arch frame, magazines a mosaic…). */
export function resolveMedia(theme: WorkflowTheme): ResolvedMedia {
  const m = theme.media ?? {};
  const flow = theme.flow ?? 'card';
  const frame = theme.decoration === 'arches' ? 'arch' : ['organic', 'botanical'].includes(theme.decoration) ? 'organic' : theme.decoration === 'celebration' || theme.decoration === 'expressive' ? 'circle' : 'rounded';
  const galleryStyle = flow === 'editorial' ? 'mosaic' : flow === 'playful' ? 'polaroid' : flow === 'focus' ? 'stack' : 'strip';
  return {
    coverStyle: m.coverStyle ?? 'backdrop',
    frame: m.frame ?? frame,
    tone: m.tone ?? 'natural',
    galleryStyle: m.galleryStyle ?? galleryStyle,
    galleryPlacement: m.galleryPlacement ?? 'intro',
    logoStyle: m.logoStyle ?? 'plain',
    gallery: m.gallery,
    galleryTitle: m.galleryTitle,
  };
}

export function Photo({ src, tone, shape, className, empty, style }: { src?: string; tone: ResolvedMedia['tone']; shape?: ResolvedMedia['frame']; className?: string; empty?: string; style?: CSSProperties }) {
  if (!src && !empty) return null;
  return (
    <figure className={`fz-photo ${src ? '' : 'fz-photo-empty'} ${className ?? ''}`} data-tone={tone} data-shape={shape} style={style}>
      {src ? (
        <>
          <img src={src} alt="" loading="lazy" />
          <span className="fz-photo-tint" aria-hidden />
        </>
      ) : (
        <span className="fz-photo-hint">
          <ImagePlus className="h-5 w-5" aria-hidden />
          {empty}
        </span>
      )}
    </figure>
  );
}

/** The business's photos, where the owner placed them. Rendered only at the matching slot. */
export function BusinessGallery({ theme, assets, slot, studio }: { theme: WorkflowTheme; assets: Record<string, string>; slot: ResolvedMedia['galleryPlacement']; studio?: boolean }) {
  const m = resolveMedia(theme);
  if (m.galleryPlacement !== slot) return null;
  const urls = (m.gallery ?? []).map((id) => assets[id]).filter((u): u is string => Boolean(u));
  // In the studio an empty gallery shows three frames, so the owner sees the composition.
  const items = urls.length ? urls : studio && m.gallery ? [undefined, undefined, undefined] : [];
  if (!items.length) return null;
  return (
    <section className="fz-gallery-biz" data-style={m.galleryStyle} aria-label={m.galleryTitle || 'תמונות מהעסק'}>
      {m.galleryTitle?.trim() && <h3 className="fz-gallery-title">{m.galleryTitle}</h3>}
      <ul data-count={items.length}>
        {items.map((u, i) => (
          <li key={i} style={{ ['--i' as string]: i }}>
            <Photo src={u} tone={m.tone} empty={u ? undefined : 'תמונה מהעסק'} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ambience behind the whole page (cover style "page"). */
export function PagePhoto({ theme, assets }: { theme: WorkflowTheme; assets: Record<string, string> }) {
  const m = resolveMedia(theme);
  const src = theme.hero.coverAssetId ? assets[theme.hero.coverAssetId] : undefined;
  if (m.coverStyle !== 'page' || !src) return null;
  return (
    <div className="fz-page-photo" data-tone={m.tone} aria-hidden>
      <img src={src} alt="" />
      <span className="fz-photo-tint" />
    </div>
  );
}
