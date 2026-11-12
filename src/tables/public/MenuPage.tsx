import { useEffect, useMemo, useState } from 'react';
import { PageLoader } from '../../components/ui';
import { Link, useParams } from 'react-router-dom';
import { publicMenus, publicVenue, type MenuDoc, type PublicMenus, type PublicVenue } from '../data/client';
import { tx, type Lang } from './i18n';
import { lookFor, publicAssetUrl } from './look';
import { accentButton, PublicShell, useDocumentLanguage, useLang } from './PublicShell';

export const DIETARY: Record<Lang, Record<string, string>> = {
  he: { vegan: 'טבעוני', vegetarian: 'צמחוני', gluten_free: 'ללא גלוטן', spicy: 'חריף', kosher: 'כשר', dairy_free: 'ללא חלב', contains_alcohol: 'מכיל אלכוהול' },
  en: { vegan: 'Vegan', vegetarian: 'Vegetarian', gluten_free: 'Gluten-free', spicy: 'Spicy', kosher: 'Kosher', dairy_free: 'Dairy-free', contains_alcohol: 'Contains alcohol' },
};
export const ALLERGENS: Record<Lang, Record<string, string>> = {
  he: { gluten: 'גלוטן', dairy: 'חלב', egg: 'ביצים', peanut: 'בוטנים', tree_nut: 'אגוזים', soy: 'סויה', fish: 'דגים', shellfish: 'פירות ים', sesame: 'שומשום', mustard: 'חרדל', celery: 'סלרי', sulphites: 'סולפיטים' },
  en: { gluten: 'Gluten', dairy: 'Dairy', egg: 'Egg', peanut: 'Peanut', tree_nut: 'Tree nuts', soy: 'Soy', fish: 'Fish', shellfish: 'Shellfish', sesame: 'Sesame', mustard: 'Mustard', celery: 'Celery', sulphites: 'Sulphites' },
};

export function MenuPage() {
  const { slug = '' } = useParams();
  const lang = useLang();
  const s = tx(lang);
  const [data, setData] = useState<PublicMenus | null | undefined>(undefined);
  const [venue, setVenue] = useState<PublicVenue | null>(null);
  useDocumentLanguage(lang, data ? `${data.venue.name} · ${s.menuTitle}` : s.menuTitle);
  useEffect(() => { publicMenus(slug, lang).then(setData).catch(() => setData(null)); }, [slug, lang]);
  // The menu wears the venue's published booking-page design (if any); a failure keeps the standard look.
  useEffect(() => { publicVenue(slug, lang).then(setVenue).catch(() => setVenue(null)); }, [slug, lang]);
  const design = useMemo(() => {
    const d = venue ? lookFor(venue, 'booking') : null;
    return d ? { ...d, heroUrl: '' } : null;
  }, [venue]);
  if (data === undefined) return <PageLoader label={s.loading} />;
  if (data === null) return <PublicShell lang={lang} venue={null}><h1 className="text-xl font-semibold">{s.notFound}</h1><p className="mt-2 text-ink-muted">{s.notFoundBody}</p></PublicShell>;
  const owner = data.venue.assetOwner;
  const single = data.menus.length === 1;
  return (
    <PublicShell lang={lang} venue={{ name: data.venue.name, brand: data.brand }} compact design={design}>
      {!(single && data.menus[0]!.doc.hero) && (
        <>
          <h1 className="text-2xl font-semibold">{s.menuTitle}</h1>
          <p className="mt-1 text-sm text-ink-muted">{s.menuNote}</p>
        </>
      )}
      {data.menus.length === 0 && <p className="mt-6 text-ink-muted">{s.noMenus}</p>}
      {data.menus.map((m) => (
        <section key={m.id} aria-labelledby={`menu-${m.id}`} className="mt-6 first:mt-0">
          <MenuHeroBlock id={`menu-${m.id}`} title={m.title} hero={m.doc.hero} owner={owner} asPageTitle={single} note={single ? s.menuNote : undefined} />
          {m.doc.gallery?.length ? <Gallery ids={m.doc.gallery} owner={owner} lang={lang} /> : null}
          {m.doc.sections.length > 2 && (
            <nav aria-label={lang === 'he' ? 'קטגוריות בתפריט' : 'Menu sections'} className="pp-menu-nav sticky top-0 z-10 -mx-5 mt-5 px-5 py-2 sm:-mx-7 sm:px-7">
              <ul className="pp-scroll flex gap-2 overflow-x-auto">
                {m.doc.sections.map((sec, i) => (
                  <li key={i} className="shrink-0">
                    <a href={`#sec-${m.id}-${i}`} className="pp-chip inline-flex min-h-[38px] items-center rounded-full px-4 text-sm font-semibold">{sec.title}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {m.doc.sections.map((sec, i) => {
            const img = publicAssetUrl(owner, sec.imageAssetId);
            return (
              <div key={i} id={`sec-${m.id}-${i}`} className="mt-8 scroll-mt-16">
                {img ? (
                  <div className="relative overflow-hidden rounded-2xl bg-cloud-200">
                    <img src={img} alt="" loading="lazy" decoding="async" width={1200} height={514} className="aspect-[21/9] w-full object-cover" />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <h3 className="absolute inset-x-0 bottom-0 p-4 text-xl font-semibold text-white">{sec.title}</h3>
                  </div>
                ) : (
                  <h3 className="pp-menu-section flex items-baseline gap-3">
                    <span className="text-[22px] leading-tight">{sec.title}</span>
                    <span aria-hidden className="h-px flex-1 translate-y-[-4px] bg-[var(--fz-accent)] opacity-25" />
                    <span className="text-xs font-medium tabular-nums text-ink-muted">{sec.items.length}</span>
                  </h3>
                )}
                <ul className="pp-menu-list mt-2">
                  {sec.items.map((it, j) => {
                    const dish = publicAssetUrl(owner, it.imageAssetId);
                    return (
                      <li key={j} className="pp-menu-item flex gap-4 py-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className="text-[16px] font-semibold leading-snug">{it.name}</p>
                            {it.price && <span aria-hidden className="pp-menu-leader min-w-[12px] flex-1 translate-y-[-3px]" />}
                            {it.price && <bdi dir="ltr" className="shrink-0 text-[16px] font-semibold tabular-nums">{priceText(it.price)}</bdi>}
                          </div>
                          {it.description && <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">{it.description}</p>}
                          {(it.dietary?.length || it.allergens?.length) ? (
                            <p className="mt-1 flex flex-wrap gap-1 text-xs">
                              {it.dietary?.map((d) => <span key={d} className="pp-tag rounded-full px-2 py-0.5 font-medium">{DIETARY[lang][d] ?? d}</span>)}
                              {it.allergens?.length ? <span className="text-ink-muted">{lang === 'he' ? 'אלרגנים: ' : 'Allergens: '}{it.allergens.map((a) => ALLERGENS[lang][a] ?? a).join(', ')}</span> : null}
                            </p>
                          ) : null}
                        </div>
                        {dish && (
                          <img src={dish} alt="" loading="lazy" decoding="async" width={96} height={96} className="h-24 w-24 shrink-0 rounded-[18px] bg-cloud-200 object-cover shadow-sm" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
      <Link to={`/t/${data.venue.slug}${lang === 'en' ? '?lang=en' : ''}`} className={`${accentButton} mt-8`}>{s.book}</Link>
    </PublicShell>
  );
}

/** "46" → "₪46"; text with its own currency or words stays as typed. */
export function priceText(price: string): string {
  const p = price.trim();
  return /^\d+(?:[.,]\d{1,2})?$/.test(p) ? `₪${p}` : p;
}

function MenuHeroBlock({ id, title, hero, owner, asPageTitle, note }: { id: string; title: string; hero: MenuDoc['hero']; owner: string; asPageTitle: boolean; note?: string }) {
  const Heading = asPageTitle && hero ? 'h1' : 'h2';
  if (!hero) return <h2 id={id} className={asPageTitle ? 'sr-only' : 'text-xl font-semibold'}>{title}</h2>;
  const img = publicAssetUrl(owner, hero.imageAssetId);
  const heading = hero.title || title;
  if (img) {
    return (
      <div className="relative -mx-4 overflow-hidden bg-cloud-200 sm:mx-0 sm:rounded-2xl">
        <div className="relative">
          <img src={img} alt="" decoding="async" fetchPriority="high" width={1200} height={750} className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <Heading id={id} className="text-3xl font-semibold leading-tight">{heading}</Heading>
            {hero.subtitle && <p className="mt-1 text-base text-white/90">{hero.subtitle}</p>}
          </div>
        </div>
        {(hero.description || note) && (
          <div className="bg-white px-5 py-3 text-sm text-ink-muted">
            {hero.description && <p className="whitespace-pre-line">{hero.description}</p>}
            {note && <p className="mt-1 text-xs">{note}</p>}
          </div>
        )}
      </div>
    );
  }
  // No photo: a calm typographic opening in the venue accent.
  return (
    <div className="pp-card rounded-2xl border border-cloud-200 bg-white p-5" style={{ backgroundImage: 'linear-gradient(135deg, color-mix(in srgb, var(--fz-accent) 12%, transparent), transparent 60%)' }}>
      <Heading id={id} className="text-3xl font-semibold leading-tight">{heading}</Heading>
      {hero.subtitle && <p className="mt-1 text-base font-medium text-[var(--fz-accent)]">{hero.subtitle}</p>}
      {hero.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{hero.description}</p>}
      {note && <p className="mt-2 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

function Gallery({ ids, owner, lang }: { ids: string[]; owner: string; lang: Lang }) {
  const s = tx(lang);
  const urls = ids.map((id) => publicAssetUrl(owner, id)).filter(Boolean);
  if (!urls.length) return null;
  return (
    <section aria-label={s.galleryTitle} className="mt-5">
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2" tabIndex={0} aria-label={s.galleryTitle}>
        {urls.map((u, i) => (
          <li key={u} className="w-[78%] shrink-0 snap-center sm:w-[46%]">
            <img src={u} alt={s.photoOf(i + 1, urls.length)} loading="lazy" decoding="async" width={800} height={600}
              className="aspect-[4/3] w-full rounded-2xl bg-cloud-200 object-cover" />
          </li>
        ))}
      </ul>
    </section>
  );
}
