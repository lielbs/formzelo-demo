/**
 * The menu editor (UX audit 2026-11, A9): one compact row per dish, editing in a side drawer,
 * search, move (arrows; drag on a computer), duplicate, "sold out today", paste a whole menu, and
 * drafts that save themselves. A 300-dish menu stays a few screens long instead of forty.
 */
import { ArrowDown, ArrowUp, ChevronDown, ClipboardPaste, Copy, Eye, GripVertical, Image as ImageIcon, Images, Pencil, Plus, Rocket, Search, Smartphone, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { confirmAction } from '../../components/Confirm';
import { ImagePicker } from '../../components/ImagePicker';
import { SaveStatus } from '../../components/SaveStatus';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, ErrorState, FieldLabel, Input, Modal, Spinner, Textarea } from '../../components/ui';
import { useRepoQuery } from '../../data/store';
import { useDraftAutosave } from '../../lib/useDraftAutosave';
import { archiveMenu, publishMenu, saveMenu, setSoldOut, type MenuDoc, type MenuHero, type MenuItem, type MenuRow } from '../data/client';
import type { TablesError } from '../domain/errors';
import { duplicateItem, duplicateSection, ensureIds, moveItem, moveSection, newItemId, parseMenuText, searchItems } from '../domain/menuEdit';
import { ALLERGENS, DIETARY, MenuDocView } from '../public/MenuPage';
import { publicAssetUrl } from '../public/look';
import { Hint } from '../ui';
import { GalleryEditor, ImageSlot } from './MenuImages';

export const MENU_PROBLEM_HE: Record<string, string> = {
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

/** Drops an empty image reference so stored documents stay minimal. */
function withImage<T extends { imageAssetId?: string }>(v: T): T {
  if (!v.imageAssetId) { const { imageAssetId: _drop, ...rest } = v; void _drop; return rest as T; }
  return v;
}

type Pos = { s: number; i: number };

export function MenuEditor({ menu, orgId, soldOut, onSoldOut, onSaved }: {
  menu: MenuRow; orgId: string; soldOut: string[]; onSoldOut: (ids: string[]) => void; onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const media = useRepoQuery(async (repo) => {
    const assets = await repo.listAssets(orgId);
    return { assets, urls: await repo.getAssetUrls(orgId, assets.map((a) => a.id)) };
  }, [orgId]);
  const [doc, setDoc] = useState<MenuDoc>(() => ensureIds(menu.draft));
  const [title, setTitle] = useState(menu.title);
  const lock = useRef(menu.lockVersion);
  const [problems, setProblems] = useState(menu.problems);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Pos | null>(null);
  const [pasting, setPasting] = useState(false);
  const [drag, setDrag] = useState<Pos | null>(null);

  // Drafts save themselves; publishing stays a deliberate step.
  const autosave = useDraftAutosave<{ title: string; doc: MenuDoc }>(async (v) => {
    const r = await saveMenu(menu.id, v.title, v.doc, lock.current);
    lock.current = r.lockVersion;
    setProblems(r.problems);
  }, { isConflict: (e) => (e as TablesError).isConflict });
  const { queue, flush } = autosave;
  // Older menus get item ids in memory; they are saved with the first real edit (opening the editor
  // never changes the draft by itself). Sold-out marks need the id in the published menu.
  const savedIds = useMemo(() => new Set(menu.draft.sections.flatMap((s) => s.items.map((it) => it.id).filter(Boolean))), [menu.draft]);
  const needsIds = menu.status === 'published' && menu.draft.sections.some((s) => s.items.some((it) => !it.id));

  const edit = (d: MenuDoc, t = title) => { setDoc(d); queue({ title: t, doc: d }); };
  const setSections = (sections: MenuDoc['sections']) => edit({ ...doc, sections });
  const setItem = (p: Pos, patch: Partial<MenuItem>) =>
    setSections(doc.sections.map((s, i) => (i !== p.s ? s : { ...s, items: s.items.map((it, j) => (j === p.i ? withImage({ ...it, ...patch }) : it)) })));
  const removeItem = (p: Pos) => setSections(doc.sections.map((s, i) => (i === p.s ? { ...s, items: s.items.filter((_, j) => j !== p.i) } : s)));
  const setHero = (p: Partial<MenuHero>) => {
    const hero: MenuHero = { ...(doc.hero ?? {}), ...p };
    for (const k of Object.keys(hero) as (keyof MenuHero)[]) if (!hero[k]) delete hero[k];
    const next: MenuDoc = { ...doc, hero };
    if (!Object.keys(hero).length) delete next.hero;
    edit(next);
  };
  const setGallery = (gallery: string[]) => { const next: MenuDoc = { ...doc, gallery }; if (!gallery.length) delete next.gallery; edit(next); };

  const matches = useMemo(() => searchItems(doc, query), [doc, query]);
  const searching = query.trim() !== '';
  const shown = (p: Pos) => !searching || matches.some((m) => m.s === p.s && m.i === p.i);
  const items = doc.sections.reduce((n, s) => n + s.items.length, 0);
  const sold = new Set(soldOut);
  const published = menu.status === 'published';

  async function toggleSoldOut(it: MenuItem) {
    if (!it.id) return;
    try { onSoldOut(await setSoldOut(menu.id, it.id, !sold.has(it.id))); toast(sold.has(it.id) ? `${it.name} חזרה לתפריט` : `${it.name}: אזל היום — האורחים רואים את זה עכשיו`, 'success'); }
    catch (e) { toast((e as TablesError).message, 'error'); }
  }

  async function publish() {
    setPublishing(true);
    try {
      await flush();
      if (autosave.state === 'error' || autosave.state === 'conflict') return;
      await publishMenu(menu.id, lock.current);
      toast('התפריט פורסם', 'success');
      await onSaved();
    } catch (e) { toast((e as TablesError).message, 'error'); } finally { setPublishing(false); }
  }

  const img = (id?: string) => (id ? media.data?.urls[id] || publicAssetUrl(orgId, id) : '');
  const preview = <MenuPreview title={title} doc={doc} id={menu.id} img={img} soldOut={soldOut} />;
  const editingItem = editing ? doc.sections[editing.s]?.items[editing.i] : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="grid min-w-0 gap-4 pb-24">
        <Button variant="secondary" icon={Eye} className="lg:hidden" onClick={() => setPreviewOpen(true)}>תצוגה מקדימה כמו אורח</Button>
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[14rem] flex-1">
            <FieldLabel htmlFor="menu-title">שם התפריט</FieldLabel>
            <Input id="menu-title" value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value, doc }); }} />
          </div>
          <Badge tone={published ? 'teal' : 'neutral'}>{published ? `פורסם (גרסה ${menu.publishedVersion})` : 'טיוטה'}</Badge>
          {menu.hasUnpublishedChanges && published && <Badge tone="amber">יש שינויים שלא פורסמו</Badge>}
        </Card>

        {/* Opening and gallery: set once, so they fold away once the menu has dishes. */}
        <details className="fz-card rounded-2xl border border-cloud-200 bg-white" open={doc.sections.length === 0}>
          <summary className="flex min-h-[52px] cursor-pointer items-center gap-2 px-4 font-semibold">
            <ImageIcon className="h-5 w-5 text-orange-700" aria-hidden />פתיחת התפריט וגלריה
            <span className="ms-auto text-sm font-normal text-ink-muted">{doc.hero?.imageAssetId ? 'עם תמונה' : 'בלי תמונה'} · {doc.gallery?.length ?? 0} בגלריה</span>
          </summary>
          <div className="grid gap-4 border-t border-cloud-200 p-4">
            <p className="text-sm text-ink-muted">תמונה גדולה וכותרת בראש התפריט. הכול רשות — בלי תמונה התפריט מוצג בעיצוב טיפוגרפי נקי.</p>
            {media.error ? <ErrorState error={media.error} /> : !media.data ? <Spinner label="טוען תמונות…" /> : (
              <ImagePicker kind="cover" label="תמונת פתיחה" hint="תמונה רחבה של המקום או מנת הדגל. נחתכת אוטומטית למסגרת רחבה."
                selected={doc.hero?.imageAssetId} assets={media.data.assets} urls={media.data.urls} orgId={orgId} onSelect={(id) => setHero({ imageAssetId: id })} />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><FieldLabel htmlFor="hero-title">כותרת</FieldLabel><Input id="hero-title" value={doc.hero?.title ?? ''} maxLength={80} placeholder={title} onChange={(e) => setHero({ title: e.target.value })} /></div>
              <div><FieldLabel htmlFor="hero-sub">כותרת משנה</FieldLabel><Input id="hero-sub" value={doc.hero?.subtitle ?? ''} maxLength={120} placeholder="למשל: מטבח עונתי מהשוק" onChange={(e) => setHero({ subtitle: e.target.value })} /></div>
            </div>
            <div><FieldLabel htmlFor="hero-desc">תיאור</FieldLabel><Textarea id="hero-desc" rows={3} value={doc.hero?.description ?? ''} maxLength={600} onChange={(e) => setHero({ description: e.target.value })} /></div>
            <h3 className="flex items-center gap-2 font-semibold"><Images className="h-5 w-5 text-orange-700" aria-hidden />גלריה</h3>
            {media.data && <GalleryEditor value={doc.gallery ?? []} media={media.data} orgId={orgId} onChange={setGallery} />}
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <label htmlFor="menu-search" className="sr-only">חיפוש מנה</label>
            <Input id="menu-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`חיפוש בין ${items} מנות`} className="ps-9" />
          </div>
          <Button variant="secondary" icon={ClipboardPaste} onClick={() => setPasting(true)} className="h-11">הדבקת תפריט</Button>
        </div>
        {needsIds && <Hint>כדי לסמן מנות כ״אזלו היום״, פרסמו את התפריט פעם אחת אחרי העדכון הזה.</Hint>}
        {searching && <p role="status" className="text-sm text-ink-muted">{matches.length ? `${matches.length} מנות נמצאו` : 'לא נמצאה מנה'}</p>}

        {doc.sections.map((sec, si) => {
          const visible = sec.items.map((it, ii) => ({ it, ii })).filter(({ ii }) => shown({ s: si, i: ii }));
          if (searching && !visible.length) return null;
          return (
            <Card key={sec.id ?? si} as="section" className="grid gap-2 p-3 sm:p-4" aria-label={`קטגוריה: ${sec.title || 'בלי שם'}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor={`sec-${si}`} className="sr-only">שם הקטגוריה</label>
                <Input id={`sec-${si}`} value={sec.title} maxLength={80} onChange={(e) => setSections(doc.sections.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)))}
                  className="min-w-[10rem] flex-1 font-semibold" placeholder="שם הקטגוריה" />
                <IconBtn label="הזזת הקטגוריה למעלה" icon={ArrowUp} disabled={si === 0} onClick={() => edit(moveSection(doc, si, -1))} />
                <IconBtn label="הזזת הקטגוריה למטה" icon={ArrowDown} disabled={si === doc.sections.length - 1} onClick={() => edit(moveSection(doc, si, 1))} />
                <IconBtn label="שכפול הקטגוריה" icon={Copy} onClick={() => edit(duplicateSection(doc, si))} />
                <IconBtn label="מחיקת הקטגוריה" icon={Trash2} danger onClick={async () => {
                  if (!sec.items.length || await confirmAction({ title: `למחוק את "${sec.title}"?`, message: `${sec.items.length} מנות יימחקו איתה.`, confirmLabel: 'מחיקה', destructive: true }))
                    setSections(doc.sections.filter((_, i) => i !== si));
                }} />
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer py-1 text-ink-muted">תמונה לקטגוריה{sec.imageAssetId ? ' · יש' : ''}</summary>
                <div className="pt-2"><ImageSlot label="תמונה לקטגוריה" wide value={sec.imageAssetId} media={media.data} orgId={orgId}
                  onChange={(id) => setSections(doc.sections.map((s, i) => (i === si ? withImage({ ...s, imageAssetId: id }) : s)))} /></div>
              </details>
              <ul className="grid gap-1.5" onDragOver={(e) => drag && e.preventDefault()}>
                {visible.map(({ it, ii }) => {
                  const out = !!it.id && sold.has(it.id);
                  const tags = (it.dietary?.length ?? 0) + (it.allergens?.length ?? 0);
                  return (
                    <li key={it.id ?? ii} draggable={!searching} onDragStart={() => setDrag({ s: si, i: ii })} onDragEnd={() => setDrag(null)}
                      onDrop={() => { if (drag) edit(moveItem(doc, drag, { s: si, i: ii })); setDrag(null); }}
                      className={cx('flex items-center gap-2 rounded-xl border border-cloud-200 bg-white px-2 py-1.5', drag?.s === si && drag.i === ii && 'opacity-50')}>
                      <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-ink-soft sm:block" aria-hidden />
                      <button type="button" onClick={() => setEditing({ s: si, i: ii })} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange rounded-lg"
>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cloud">
                          {it.imageAssetId && media.data?.urls[it.imageAssetId] ? <img src={media.data.urls[it.imageAssetId]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="h-4 w-4 text-ink-soft" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cx('block truncate font-medium', !it.name && 'text-red-700', out && 'line-through text-ink-muted')}><span className="sr-only">עריכת </span>{it.name || 'מנה בלי שם'}</span>
                          <span className="block truncate text-xs text-ink-muted">{[it.description, tags ? `${tags} סימונים` : ''].filter(Boolean).join(' · ') || 'בלי תיאור'}</span>
                        </span>
                        <span dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums">{it.price || '—'}</span>
                        <Pencil className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                      </button>
                      {published && it.id && savedIds.has(it.id) && (
                        <button type="button" onClick={() => void toggleSoldOut(it)} aria-pressed={out}
                          className={cx('h-9 shrink-0 rounded-full border px-2.5 text-xs font-semibold', out ? 'border-red-300 bg-red-50 text-red-800' : 'border-cloud-300 text-ink-muted hover:bg-cloud')}
                          title="מסמן לאורחים שהמנה אזלה היום. מתאפס מחר, בלי לפרסם מחדש">{out ? 'אזל היום' : 'אזל?'}</button>
                      )}
                      <span className="hidden shrink-0 sm:flex">
                        <IconBtn label={`הזזת ${it.name} למעלה`} icon={ArrowUp} disabled={ii === 0} onClick={() => edit(moveItem(doc, { s: si, i: ii }, { s: si, i: ii - 1 }))} />
                        <IconBtn label={`הזזת ${it.name} למטה`} icon={ArrowDown} disabled={ii === sec.items.length - 1} onClick={() => edit(moveItem(doc, { s: si, i: ii }, { s: si, i: ii + 1 }))} />
                        <IconBtn label={`שכפול ${it.name}`} icon={Copy} onClick={() => edit(duplicateItem(doc, si, ii))} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!searching && (
                <div><Button size="sm" variant="secondary" icon={Plus} className="h-10" onClick={() => {
                  setSections(doc.sections.map((s, i) => (i === si ? { ...s, items: [...s.items, { id: newItemId(), name: '', price: '' }] } : s)));
                  setEditing({ s: si, i: sec.items.length });
                }}>מנה חדשה</Button></div>
              )}
            </Card>
          );
        })}
        {!searching && <div><Button variant="secondary" icon={Plus} onClick={() => setSections([...doc.sections, { id: newItemId(), title: 'קטגוריה חדשה', items: [] }])}>קטגוריה חדשה</Button></div>}
        {problems.length > 0 && autosave.state !== 'saving' && (
          <Hint tone="warn">לפני פרסום צריך לתקן: {[...new Set(problems.map((p) => MENU_PROBLEM_HE[p.code] ?? MENU_PROBLEM_HE.invalid!))].join(' ')}</Hint>
        )}
        {autosave.state === 'conflict' && (
          <Hint tone="warn">מישהו אחר שינה את התפריט במקביל. <button type="button" className="font-semibold underline" onClick={() => { autosave.discard(); void onSaved(); }}>טעינת הגרסה העדכנית</button></Hint>
        )}
        <div className="sticky bottom-[calc(var(--fz-tabbar,0px)+0.75rem)] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-cloud-200 bg-white/95 p-3 shadow-card backdrop-blur">
          <SaveStatus state={autosave.state} at={autosave.savedAt} conflictText="מישהו אחר שינה את התפריט" />
          <Button icon={Rocket} loading={publishing} onClick={() => void publish()} className="ms-auto h-11">פרסום התפריט</Button>
          <Button variant="ghost" icon={Trash2} onClick={async () => {
            if (await confirmAction({ title: `למחוק את "${title || menu.title}"?`, message: 'התפריט יירד מדפי ההזמנה מיד ולא יופיע יותר ברשימה.', confirmLabel: 'מחיקה', destructive: true, action: () => archiveMenu(menu.id).then(() => undefined) })) {
              toast('התפריט נמחק', 'success');
              await onSaved();
            }
          }} className="h-11 text-red-700 hover:bg-red-50 hover:text-red-800" aria-label="מחיקת התפריט" />
        </div>
      </div>
      <aside className="hidden lg:sticky lg:top-6 lg:block" aria-label="תצוגה מקדימה">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-muted"><Smartphone className="h-4 w-4" aria-hidden />כך זה ייראה לאורחים</p>
        <div className="fz-phone-frame">{preview}</div>
      </aside>
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#FAF9F7] lg:hidden" role="dialog" aria-modal="true" aria-label="תצוגה מקדימה של התפריט">
          <div className="fz-topbar flex items-center justify-between px-4 py-2.5">
            <span className="font-semibold">תצוגה מקדימה</span>
            <Button variant="ghost" icon={X} aria-label="סגירה" onClick={() => setPreviewOpen(false)} className="h-11 w-11 rounded-full px-0" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{preview}</div>
        </div>
      )}
      {editing && editingItem && (
        <ItemDrawer item={editingItem} pos={editing} doc={doc} media={media.data} orgId={orgId}
          onChange={(patch) => setItem(editing, patch)}
          onMove={(s) => { const to = { s, i: doc.sections[s]!.items.length }; edit(moveItem(doc, editing, to)); setEditing(to); }}
          onDuplicate={() => { edit(duplicateItem(doc, editing.s, editing.i)); setEditing({ s: editing.s, i: editing.i + 1 }); }}
          onDelete={() => { removeItem(editing); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}
      {pasting && <PasteMenu onClose={() => setPasting(false)} onAdd={(sections) => { setSections([...doc.sections, ...sections]); setPasting(false); toast(`נוספו ${sections.reduce((n, s) => n + s.items.length, 0)} מנות`, 'success'); }} />}
    </div>
  );
}

function IconBtn({ label, icon: Icon, onClick, disabled, danger }: { label: string; icon: typeof Plus; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-30', danger ? 'text-red-700' : 'text-ink-muted')}>
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Everything about one dish, in a side drawer (a full sheet on a phone). */
function ItemDrawer({ item, pos, doc, media, orgId, onChange, onMove, onDuplicate, onDelete, onClose }: {
  item: MenuItem; pos: Pos; doc: MenuDoc; media: Parameters<typeof ImageSlot>[0]['media']; orgId: string;
  onChange: (patch: Partial<MenuItem>) => void; onMove: (section: number) => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void;
}) {
  const id = `item-${item.id ?? `${pos.s}-${pos.i}`}`;
  const toggle = (key: 'dietary' | 'allergens', k: string) => {
    const list = item[key] ?? [];
    onChange({ [key]: list.includes(k) ? list.filter((x) => x !== k) : [...list, k] });
  };
  const chip = (on: boolean) => cx('min-h-[40px] rounded-full border px-3 text-sm', on ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white');
  return (
    <Modal open side onClose={onClose} title={item.name || 'מנה חדשה'}
      footer={<div className="flex flex-wrap gap-2">
        <Button onClick={onClose} className="h-11">סיום</Button>
        <Button variant="secondary" icon={Copy} onClick={onDuplicate} className="h-11">שכפול</Button>
        <Button variant="ghost" icon={Trash2} onClick={onDelete} className="ms-auto h-11 text-red-700">מחיקה</Button>
      </div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div><FieldLabel htmlFor={`${id}-n`} required>שם המנה</FieldLabel><Input id={`${id}-n`} autoFocus value={item.name} maxLength={100} onChange={(e) => onChange({ name: e.target.value })} /></div>
          <div><FieldLabel htmlFor={`${id}-p`}>מחיר לתצוגה</FieldLabel><Input id={`${id}-p`} dir="ltr" value={item.price ?? ''} maxLength={24} placeholder="48" onChange={(e) => onChange({ price: e.target.value })} /></div>
        </div>
        <div><FieldLabel htmlFor={`${id}-d`}>תיאור (רשות)</FieldLabel><Textarea id={`${id}-d`} rows={2} value={item.description ?? ''} maxLength={400} onChange={(e) => onChange({ description: e.target.value })} /></div>
        <ImageSlot label="תמונה למנה" value={item.imageAssetId} media={media} orgId={orgId} onChange={(img) => onChange({ imageAssetId: img })} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">סימונים</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(DIETARY.he).map(([k, l]) => <button key={k} type="button" aria-pressed={!!item.dietary?.includes(k)} onClick={() => toggle('dietary', k)} className={chip(!!item.dietary?.includes(k))}>{l}</button>)}
          </div>
        </fieldset>
        <details open={!!item.allergens?.length}>
          <summary className="flex min-h-[40px] cursor-pointer items-center gap-1 text-sm font-medium"><ChevronDown className="h-4 w-4" aria-hidden />אלרגנים{item.allergens?.length ? ` (${item.allergens.length})` : ''}</summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(ALLERGENS.he).map(([k, l]) => <button key={k} type="button" aria-pressed={!!item.allergens?.includes(k)} onClick={() => toggle('allergens', k)} className={chip(!!item.allergens?.includes(k))}>{l}</button>)}
          </div>
        </details>
        {doc.sections.length > 1 && (
          <div>
            <FieldLabel htmlFor={`${id}-sec`}>קטגוריה</FieldLabel>
            <select id={`${id}-sec`} value={pos.s} onChange={(e) => onMove(Number(e.target.value))} className="ui-select h-11 w-full rounded-xl border border-cloud-300 bg-white px-3">
              {doc.sections.map((s, i) => <option key={s.id ?? i} value={i}>{s.title || `קטגוריה ${i + 1}`}</option>)}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** "Paste your menu": text from anywhere (a PDF, a document, WhatsApp) becomes categories and dishes. */
function PasteMenu({ onClose, onAdd }: { onClose: () => void; onAdd: (sections: MenuDoc['sections']) => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseMenuText(text), [text]);
  const dishes = parsed.reduce((n, s) => n + s.items.length, 0);
  return (
    <Modal open onClose={onClose} title="הדבקת תפריט"
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} className="h-11">ביטול</Button>
        <Button disabled={!dishes} onClick={() => onAdd(parsed.map((s) => ({ ...s, id: newItemId(), items: s.items.map((it) => ({ ...it, id: newItemId() })) })))} className="h-11">
          {dishes ? `הוספת ${parsed.length === 1 ? 'קטגוריה אחת' : `${parsed.length} קטגוריות`} ו־${dishes} מנות` : 'הוספה'}
        </Button>
      </div>}>
      <div className="grid gap-3">
        <p className="text-sm text-ink-muted">הדביקו את התפריט כמו שהוא. שורה עם מחיר בסוף היא מנה, שורה בלי מחיר היא שם קטגוריה, ושורה שמתחילה ב־"-" אחרי מנה היא התיאור שלה.</p>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'קוקטיילים\nספריץ אשכוליות 54\n- אפרול, פרוסקו, סודה\nOld Fashioned 62'} aria-label="טקסט התפריט" />
        {dishes > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-cloud-200 p-3 text-sm">
            {parsed.map((s, i) => (
              <div key={i} className="mb-2">
                <p className="font-semibold">{s.title}</p>
                <ul className="ms-3">{s.items.map((it, j) => <li key={j} className="flex justify-between gap-3"><span className="truncate">{it.name}{it.description ? <span className="text-ink-muted"> · {it.description}</span> : null}</span><span dir="ltr" className="tabular-nums">{it.price}</span></li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The draft exactly as the guest menu page renders it (same component), updated as you type. */
function MenuPreview({ title, doc, id, img, soldOut }: { title: string; doc: MenuDoc; id: string; img: (id?: string) => string; soldOut: string[] }) {
  return (
    <div className="fz-guest fz-page min-h-full bg-[#FAF9F7] text-ink" dir="rtl" lang="he">
      <div className="pp-hero pp-hero-band relative isolate overflow-hidden px-4 pb-14 pt-6">
        <p className="pp-venue-name text-2xl leading-tight">{title || 'תפריט'}</p>
        <p className="mt-1 text-xs text-white/75">תצוגה מקדימה · טיוטה</p>
      </div>
      <div className="relative z-10 -mt-10 px-3 pb-8">
        <div className="pp-sheet rounded-[24px] p-5">
          {doc.sections.length === 0 && !doc.hero ? <p className="text-sm text-ink-muted">הוסיפו קטגוריה ומנות — הן יופיעו כאן.</p>
            : <MenuDocView m={{ id: `pv-${id}`, title: title || 'תפריט', doc, soldOut }} lang="he" img={img} asPageTitle={false} />}
        </div>
      </div>
    </div>
  );
}
