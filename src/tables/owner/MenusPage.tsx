import { BookOpen, ExternalLink, Image as ImageIcon, Images, Plus, Rocket, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { confirmAction } from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import { ImagePicker } from '../../components/ImagePicker';
import { Badge, Button, Card, EmptyState, ErrorState, FieldLabel, Input, Spinner, Textarea } from '../../components/ui';
import { useRepoQuery } from '../../data/store';
import { archiveMenu, createMenu, getVenue, listMenus, publishMenu, saveMenu, type MenuDoc, type MenuHero, type MenuItem, type MenuRow } from '../data/client';
import type { TablesError } from '../domain/errors';
import { ALLERGENS, DIETARY } from '../public/MenuPage';
import { Hint, useLoad } from '../ui';
import { GalleryEditor, ImageSlot } from './MenuImages';
import { bookingUrl } from './VenueOverview';

const MENU_PROBLEM_HE: Record<string, string> = {
  menu_section_required: 'צריך לפחות קטגוריה אחת.',
  menu_section_title: 'לכל קטגוריה צריך שם.',
  menu_item_invalid: 'לכל מנה צריך שם (ותיאור ומחיר באורך סביר).',
  menu_items_invalid: 'יש קטגוריה לא תקינה.',
  menu_tag_invalid: 'יש סימון לא מוכר באחת המנות.',
  menu_too_large: 'התפריט גדול מדי (עד 30 קטגוריות ו-300 מנות).',
  menu_image_missing: 'אחת התמונות הוסרה מספריית התמונות — החליפו או הסירו אותה.',
  menu_hero_invalid: 'כותרת הפתיחה של התפריט ארוכה מדי.',
  menu_gallery_invalid: 'הגלריה לא תקינה (עד 12 תמונות שונות).',
  invalid: 'משהו בתפריט לא תקין.',
};

export function MenusPage() {
  const { venueId = '' } = useParams();
  const toast = useToast();
  const venue = useLoad(() => getVenue(venueId), [venueId]);
  const menus = useLoad(() => listMenus(venueId), [venueId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  if (venue.error || menus.error) return <ErrorState error={(venue.error ?? menus.error)!} onRetry={() => { void venue.reload(); void menus.reload(); }} />;
  if (!venue.data || !menus.data) return <Spinner />;
  const current = menus.data.find((m) => m.id === selected) ?? menus.data[0] ?? null;
  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/app/tables/${venueId}`} className="text-sm text-ink-muted hover:text-ink">← {venue.data.name}</Link>
      <div className="mb-5 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">תפריטים</h1>
          <p className="text-sm text-ink-muted">תפריט לעיון בלבד — אורחים לא מזמינים ולא משלמים דרכו.</p>
        </div>
        {venue.data.published && (
          <a href={`${bookingUrl(venue.data.slug)}/menu`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-orange-800 hover:underline">
            <ExternalLink className="h-4 w-4" aria-hidden /> צפייה כמו אורח
          </a>
        )}
      </div>
      {menus.data.length === 0 ? (
        <EmptyState icon={BookOpen} title="עוד אין תפריט">
          צרו תפריט: קטגוריות, מנות, מחיר לתצוגה, סימון טבעוני/ללא גלוטן ואלרגנים — ואם תרצו גם תמונות.
        </EmptyState>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="בחירת תפריט">
          {menus.data.map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === current?.id} onClick={() => setSelected(m.id)}
              className={`h-11 rounded-xl border px-4 text-sm font-medium ${m.id === current?.id ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white'}`}>
              {m.title} {m.status === 'published' ? '· פורסם' : '· טיוטה'}
            </button>
          ))}
        </div>
      )}
      <form className="mb-6 mt-4 flex flex-wrap items-end gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        try { const r = await createMenu(venueId, title.trim()); setTitle(''); await menus.reload(); setSelected(r.id); } catch (err) { toast((err as TablesError).message, 'error'); }
      }}>
        <div className="min-w-[14rem] flex-1 sm:max-w-xs">
          <FieldLabel htmlFor="new-menu">תפריט חדש</FieldLabel>
          <Input id="new-menu" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: תפריט ערב" />
        </div>
        <Button type="submit" variant="secondary" icon={Plus} className="h-11" disabled={!title.trim()}>יצירה</Button>
      </form>
      {current && <MenuEditor key={current.id} menu={current} orgId={venue.data.organizationId} onSaved={menus.reload} />}
    </div>
  );
}

function MenuEditor({ menu, orgId, onSaved }: { menu: MenuRow; orgId: string; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const media = useRepoQuery(async (repo) => {
    const assets = await repo.listAssets(orgId);
    return { assets, urls: await repo.getAssetUrls(orgId, assets.map((a) => a.id)) };
  }, [orgId]);
  const [doc, setDoc] = useState<MenuDoc>(menu.draft);
  const [title, setTitle] = useState(menu.title);
  const [lock, setLock] = useState(menu.lockVersion);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState(menu.problems);
  useEffect(() => { setDoc(menu.draft); setTitle(menu.title); setLock(menu.lockVersion); setProblems(menu.problems); setDirty(false); }, [menu]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const edit = (d: MenuDoc) => { setDoc(d); setDirty(true); };
  const setSections = (sections: MenuDoc['sections']) => edit({ ...doc, sections });
  const setItem = (si: number, ii: number, p: Partial<MenuItem>) =>
    setSections(doc.sections.map((s, i) => (i !== si ? s : { ...s, items: s.items.map((it, j) => (j === ii ? withImage({ ...it, ...p }) : it)) })));
  const setHero = (p: Partial<MenuHero>) => {
    const hero: MenuHero = { ...(doc.hero ?? {}), ...p };
    for (const k of Object.keys(hero) as (keyof MenuHero)[]) if (!hero[k]) delete hero[k];
    const next: MenuDoc = { ...doc, hero };
    if (!Object.keys(hero).length) delete next.hero;
    edit(next);
  };
  const setGallery = (gallery: string[]) => { const next: MenuDoc = { ...doc, gallery }; if (!gallery.length) delete next.gallery; edit(next); };

  async function save(): Promise<number | null> {
    setBusy('save');
    try {
      const r = await saveMenu(menu.id, title, doc, lock);
      setLock(r.lockVersion);
      setProblems(r.problems);
      setDirty(false);
      return r.lockVersion;
    } catch (e) {
      const te = e as TablesError;
      toast(te.isConflict ? 'מישהו אחר שינה את התפריט. רעננו את הדף.' : te.message, 'error');
      return null;
    } finally { setBusy(null); }
  }

  return (
    <div className="grid gap-4 pb-24">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[14rem] flex-1">
          <FieldLabel htmlFor="menu-title">שם התפריט</FieldLabel>
          <Input id="menu-title" value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        </div>
        <Badge tone={menu.status === 'published' ? 'teal' : 'neutral'}>{menu.status === 'published' ? `פורסם (גרסה ${menu.publishedVersion})` : 'טיוטה'}</Badge>
        {menu.hasUnpublishedChanges && menu.status === 'published' && <Badge tone="amber">יש שינויים שלא פורסמו</Badge>}
      </Card>

      <Card as="section" className="grid gap-4 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><ImageIcon className="h-5 w-5 text-orange-700" aria-hidden />פתיחת התפריט</h2>
        <p className="-mt-2 text-sm text-ink-muted">תמונה גדולה וכותרת בראש התפריט. הכול רשות — בלי תמונה התפריט מוצג בעיצוב טיפוגרפי נקי.</p>
        {media.error ? <ErrorState error={media.error} /> : !media.data ? <Spinner label="טוען תמונות…" /> : (
          <ImagePicker kind="cover" label="תמונת פתיחה" hint="תמונה רחבה של המקום או מנת הדגל. נחתכת אוטומטית למסגרת רחבה."
            selected={doc.hero?.imageAssetId} assets={media.data.assets} urls={media.data.urls} orgId={orgId}
            onSelect={(id) => setHero({ imageAssetId: id })} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><FieldLabel htmlFor="hero-title">כותרת</FieldLabel><Input id="hero-title" value={doc.hero?.title ?? ''} maxLength={80} placeholder={title} onChange={(e) => setHero({ title: e.target.value })} /></div>
          <div><FieldLabel htmlFor="hero-sub">כותרת משנה</FieldLabel><Input id="hero-sub" value={doc.hero?.subtitle ?? ''} maxLength={120} placeholder="למשל: מטבח עונתי מהשוק" onChange={(e) => setHero({ subtitle: e.target.value })} /></div>
        </div>
        <div><FieldLabel htmlFor="hero-desc">תיאור</FieldLabel><Textarea id="hero-desc" rows={3} value={doc.hero?.description ?? ''} maxLength={600} onChange={(e) => setHero({ description: e.target.value })} /></div>
      </Card>

      <Card as="section" className="grid gap-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Images className="h-5 w-5 text-orange-700" aria-hidden />גלריה</h2>
        <p className="-mt-1 text-sm text-ink-muted">תמונות של המקום והמנות, בסדר שתבחרו. מוצגות כרצועה שאפשר לגלול.</p>
        {media.data && <GalleryEditor value={doc.gallery ?? []} media={media.data} orgId={orgId} onChange={setGallery} />}
      </Card>

      {doc.sections.map((sec, si) => (
        <Card key={si} as="section" className="grid gap-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <FieldLabel htmlFor={`sec-${si}`}>שם הקטגוריה</FieldLabel>
              <Input id={`sec-${si}`} value={sec.title} maxLength={80} onChange={(e) => setSections(doc.sections.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)))} />
            </div>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setSections(doc.sections.filter((_, i) => i !== si))} className="h-10">מחיקת הקטגוריה</Button>
          </div>
          <ImageSlot label="תמונה לקטגוריה" wide value={sec.imageAssetId} media={media.data} orgId={orgId}
            onChange={(id) => setSections(doc.sections.map((s, i) => (i === si ? withImage({ ...s, imageAssetId: id }) : s)))} />
          {sec.items.map((it, ii) => {
            const id = `it-${si}-${ii}`;
            return (
              <div key={ii} className="grid gap-2 rounded-xl border border-cloud-200 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                  <div><FieldLabel htmlFor={`${id}-n`}>שם המנה</FieldLabel><Input id={`${id}-n`} value={it.name} maxLength={100} onChange={(e) => setItem(si, ii, { name: e.target.value })} /></div>
                  <div><FieldLabel htmlFor={`${id}-p`}>מחיר לתצוגה</FieldLabel><Input id={`${id}-p`} dir="ltr" value={it.price ?? ''} maxLength={24} placeholder="₪48" onChange={(e) => setItem(si, ii, { price: e.target.value })} /></div>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={`מחיקת ${it.name || 'המנה'}`} onClick={() => setSections(doc.sections.map((s, i) => (i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s)))} className="h-11" />
                </div>
                <div><FieldLabel htmlFor={`${id}-d`}>תיאור (רשות)</FieldLabel><Input id={`${id}-d`} value={it.description ?? ''} maxLength={400} onChange={(e) => setItem(si, ii, { description: e.target.value })} /></div>
                <ImageSlot label="תמונה למנה" value={it.imageAssetId} media={media.data} orgId={orgId} onChange={(img) => setItem(si, ii, { imageAssetId: img })} />
                <fieldset>
                  <legend className="mb-1 text-xs font-medium text-ink-muted">סימונים</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(DIETARY.he).map(([k, l]) => (
                      <label key={k} className="flex min-h-[32px] items-center gap-1.5 text-sm">
                        <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={!!it.dietary?.includes(k)} onChange={(e) => setItem(si, ii, { dietary: e.target.checked ? [...(it.dietary ?? []), k] : (it.dietary ?? []).filter((x) => x !== k) })} />{l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-1 text-xs font-medium text-ink-muted">אלרגנים</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(ALLERGENS.he).map(([k, l]) => (
                      <label key={k} className="flex min-h-[32px] items-center gap-1.5 text-sm">
                        <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-700" checked={!!it.allergens?.includes(k)} onChange={(e) => setItem(si, ii, { allergens: e.target.checked ? [...(it.allergens ?? []), k] : (it.allergens ?? []).filter((x) => x !== k) })} />{l}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            );
          })}
          <div><Button size="sm" variant="secondary" icon={Plus} onClick={() => setSections(doc.sections.map((s, i) => (i === si ? { ...s, items: [...s.items, { name: '', price: '' }] } : s)))} className="h-10">מנה חדשה</Button></div>
        </Card>
      ))}
      <div><Button variant="secondary" icon={Plus} onClick={() => setSections([...doc.sections, { title: 'קטגוריה חדשה', items: [] }])}>קטגוריה חדשה</Button></div>
      {problems.length > 0 && !dirty && (
        <Hint tone="warn">
          לפני פרסום צריך לתקן: {[...new Set(problems.map((p) => MENU_PROBLEM_HE[p.code] ?? MENU_PROBLEM_HE.invalid!))].join(' ')}
        </Hint>
      )}
      <div className="sticky bottom-[calc(var(--fz-tabbar,0px)+0.75rem)] z-10 flex flex-wrap gap-2 rounded-2xl border border-cloud-200 bg-white/95 p-3 shadow-card backdrop-blur">
        <Button icon={Save} variant="secondary" loading={busy === 'save'} disabled={!dirty} onClick={async () => { if (await save() != null) { toast('הטיוטה נשמרה', 'success'); await onSaved(); } }} className="h-11">{dirty ? 'שמירת טיוטה' : 'נשמר'}</Button>
        <Button icon={Rocket} loading={busy === 'publish'} onClick={async () => {
          const lv = dirty ? await save() : lock;
          if (lv == null) return;
          setBusy('publish');
          try { await publishMenu(menu.id, lv); toast('התפריט פורסם', 'success'); await onSaved(); } catch (e) { toast((e as TablesError).message, 'error'); } finally { setBusy(null); }
        }} className="h-11">פרסום התפריט</Button>
        <Button variant="ghost" icon={Trash2} onClick={async () => {
          if (await confirmAction({ title: `למחוק את "${title || menu.title}"?`, message: 'התפריט יירד מדפי ההזמנה מיד ולא יופיע יותר ברשימה.', confirmLabel: 'מחיקה', destructive: true, action: () => archiveMenu(menu.id).then(() => undefined) })) {
            toast('התפריט נמחק', 'success');
            await onSaved();
          }
        }} className="h-11 ms-auto text-red-700 hover:bg-red-50 hover:text-red-800">מחיקה</Button>
      </div>
    </div>
  );
}

/** Drops an empty image reference so stored documents stay minimal. */
function withImage<T extends { imageAssetId?: string }>(v: T): T {
  if (!v.imageAssetId) { const { imageAssetId: _drop, ...rest } = v; void _drop; return rest as T; }
  return v;
}
