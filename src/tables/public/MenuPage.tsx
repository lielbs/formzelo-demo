import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { runtimeConfiguration } from '../../production/runtime';
import { publicMenus, type PublicMenus } from '../data/client';
import { tx, type Lang } from './i18n';
import { accentButton, PublicShell, useDocumentLanguage, useLang } from './PublicShell';

/** Public URL of an immutable brand image (same bucket and path as the Brand Kit). */
const assetUrl = (orgId: string, id: string) =>
  runtimeConfiguration.mode === 'production' ? `${runtimeConfiguration.supabaseUrl}/storage/v1/object/public/brand-assets/${orgId}/${id}` : '';

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
  useDocumentLanguage(lang, data ? `${data.venue.name} · ${s.menuTitle}` : s.menuTitle);
  useEffect(() => { publicMenus(slug, lang).then(setData).catch(() => setData(null)); }, [slug, lang]);
  if (data === undefined) return <PublicShell lang={lang} venue={null}><div aria-hidden className="h-60 animate-pulse rounded-2xl bg-cloud-200" /></PublicShell>;
  if (data === null) return <PublicShell lang={lang} venue={null}><h1 className="text-xl font-semibold">{s.notFound}</h1><p className="mt-2 text-ink-muted">{s.notFoundBody}</p></PublicShell>;
  return (
    <PublicShell lang={lang} venue={{ name: data.venue.name, brand: data.brand }} compact>
      <h1 className="text-2xl font-semibold">{s.menuTitle}</h1>
      <p className="mt-1 text-sm text-ink-muted">{s.menuNote}</p>
      {data.menus.length === 0 && <p className="mt-6 text-ink-muted">{s.noMenus}</p>}
      {data.menus.map((m) => (
        <section key={m.id} aria-labelledby={`menu-${m.id}`} className="mt-6">
          {data.menus.length > 1 && <h2 id={`menu-${m.id}`} className="text-xl font-semibold">{m.title}</h2>}
          {data.menus.length === 1 && <h2 id={`menu-${m.id}`} className="sr-only">{m.title}</h2>}
          {m.doc.sections.map((sec, i) => (
            <div key={i} className="mt-4">
              <h3 className="border-b border-cloud-300 pb-1 text-lg font-semibold">{sec.title}</h3>
              <ul className="mt-2 grid gap-3">
                {sec.items.map((it, j) => (
                  <li key={j} className="flex gap-3">
                    {it.imageAssetId && (
                      <img src={assetUrl(data.venue.assetOwner, it.imageAssetId)} alt="" loading="lazy" decoding="async" width={72} height={72} className="h-[72px] w-[72px] shrink-0 rounded-lg object-cover" />
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
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <Link to={`/t/${data.venue.slug}${lang === 'en' ? '?lang=en' : ''}`} className={`${accentButton} mt-8`}>{s.book}</Link>
    </PublicShell>
  );
}
