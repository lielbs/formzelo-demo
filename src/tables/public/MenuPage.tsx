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
          {m.doc.sections.map((sec, i) => {
            const img = publicAssetUrl(owner, sec.imageAssetId);
            return (
              <div key={i} className="mt-6">
                {img ? (
                  <div className="relative overflow-hidden rounded-2xl bg-cloud-200">
                    <img src={img} alt="" loading="lazy" decoding="async" width={1200} height={514} className="aspect-[21/9] w-full object-cover" />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <h3 className="absolute inset-x-0 bottom-0 p-4 text-xl font-semibold text-white">{sec.title}</h3>
                  </div>
                ) : (
                  <h3 className="flex items-center gap-3 text-lg font-semibold">
                    <span>{sec.title}</span>
                    <span aria-hidden className="h-px flex-1 bg-[var(--fz-accent)] opacity-30" />
                  </h3>
                )}
                <ul className="mt-3 grid gap-3">
                  {sec.items.map((it, j) => {
                    const dish = publicAssetUrl(owner, it.imageAssetId);
                    return (
                      <li key={j} className="pp-card flex gap-3 rounded-2xl border border-cloud-200 bg-white p-3">
                        {dish && (
                          <img src={dish} alt="" loading="lazy" decoding="async" width={88} height={88} className="h-[88px] w-[88px] shrink-0 rounded-xl bg-cloud-200 object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="font-medium">{it.name}</p>
                            {it.price && <bdi dir="ltr" className="shrink-0 font-semibold tabular-nums">{it.price}</bdi>}
                          </div>
                          {it.description && <p className="text-sm text-ink-muted">{it.description}</p>}
                          {(it.dietary?.length || it.allergens?.length) ? (
                            <p className="mt-1 flex flex-wrap gap-1 text-xs">
                              {it.dietary?.map((d) => <span key={d} className="rounded-full border border-teal-200 bg-teal-50 px-2 text-teal-900">{DIETARY[lang][d] ?? d}</span>)}
                              {it.allergens?.length ? <span className="text-ink-muted">{lang === 'he' ? 'אלרגנים: ' : 'Allergens: '}{it.allergens.map((a) => ALLERGENS[lang][a] ?? a).join(', ')}</span> : null}
                            </p>
                          ) : null}
                        </div>
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
