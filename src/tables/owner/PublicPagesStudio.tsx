/**
 * Owner studio for the public booking and waitlist pages: preset, Brand Kit inheritance, logo and
 * photo, colours, typography, buttons and cards, wording, field order and groups, and optional
 * additional questions — with a live phone / tablet / desktop preview.
 *
 * Changes are saved into the venue draft (optimistic lock) and reach guests only through the
 * existing explicit publish. The server re-validates the configuration; operational rules
 * (availability, capacity, waitlist eligibility, rate limits) are not editable here.
 */
import {
  ArrowDown, ArrowUp, Check, ExternalLink, Eye, EyeOff, ListPlus, Monitor, Palette, Plus, Rocket, Save, Smartphone, Tablet, Trash2, Type,
  Image as ImageIcon, LayoutList,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImagePicker } from '../../components/ImagePicker';
import { useToast } from '../../components/Toast';
import { Badge, Button, cx, ErrorState, FieldLabel, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useRepoQuery } from '../../data/store';
import { TYPOGRAPHY } from '../../theme/tokens';
import { contrastRatio } from '../../theme/color';
import { getVenue, publicVenue, publishVenue, saveDraft } from '../data/client';
import { normalizeDraft, problemText } from '../domain/draft';
import type { TablesError } from '../domain/errors';
import {
  defaultPublicPages, LIMITS, MANDATORY_FIELDS, newQuestionKey, normalizePublicPages, PAGE_BACKGROUNDS, PAGE_BUTTONS, PAGE_CARDS, PAGE_PATTERNS,
  PAGE_PRESETS, PAGES_PROBLEM_HE, presetTheme, PRESETS, publicPagesProblems, type BrandKitLite, type PageField, type PageKind, type PageTheme,
  type PublicPagesConfig, type QuestionKind,
} from '../domain/publicPages';
import type { VenueDetail, VenueDraft } from '../domain/types';
import { fieldText } from '../public/GuestFields';
import type { Lang } from '../public/i18n';
import type { PreviewPayload } from '../public/PagePreview';
import { Hint, Segmented, useLoad } from '../ui';
import { bookingUrl } from './VenueOverview';

const DEVICES = { phone: { w: 390, h: 780, icon: Smartphone, label: 'טלפון' }, tablet: { w: 768, h: 1000, icon: Tablet, label: 'טאבלט' }, desktop: { w: 1280, h: 860, icon: Monitor, label: 'מחשב' } } as const;
type Device = keyof typeof DEVICES;

const BUTTON_HE: Record<PageTheme['button'], string> = { pill: 'עגול', solid: 'מלא', sharp: 'חד' };
const CARD_HE: Record<PageTheme['card'], string> = { soft: 'רך', outlined: 'מתאר', elevated: 'מורם', flat: 'שטוח' };
const RADIUS_HE: Record<PageTheme['radius'], string> = { none: 'ישר', sm: 'קטן', md: 'בינוני', lg: 'גדול', xl: 'מעוגל' };
const BG_HE: Record<PageTheme['background'], string> = { plain: 'חלק', tint: 'גוון', gradient: 'מעבר צבע', pattern: 'טקסטורה' };
const PATTERN_HE: Record<PageTheme['pattern'], string> = { dots: 'נקודות', grid: 'רשת', waves: 'גלים', stripes: 'פסים', diamonds: 'מעוינים' };
const KIND_HE: Record<QuestionKind, string> = { text: 'תשובה קצרה', textarea: 'תשובה ארוכה', select: 'בחירה מרשימה', checkbox: 'תיבת סימון' };
const COLOR_HE: Record<keyof PageTheme['palette'], string> = { accent: 'צבע מוביל (כפתורים)', background: 'רקע הדף', surface: 'כרטיסים ושדות', text: 'טקסט' };

const stable = (v: unknown) => JSON.stringify(v ?? null);

export function PublicPagesStudio() {
  const { venueId = '' } = useParams();
  const venue = useLoad(() => getVenue(venueId), [venueId]);
  if (venue.error) return <ErrorState error={venue.error} onRetry={() => void venue.reload()} />;
  if (!venue.data) return <Spinner />;
  if (!venue.data.draft || (venue.data.role !== 'owner' && venue.data.role !== 'manager')) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link to={`/app/tables/${venueId}`} className="text-sm text-ink-muted hover:text-ink">← {venue.data.name}</Link>
        <Hint tone="warn">רק בעלים או מנהל/ת של המקום יכולים לעצב את דפי ההזמנה.</Hint>
      </div>
    );
  }
  return <Studio key={venue.data.id} venue={venue.data} reload={venue.reload} />;
}

function Studio({ venue, reload }: { venue: VenueDetail; reload: () => Promise<void> }) {
  const toast = useToast();
  const navigate = useNavigate();
  const orgId = venue.organizationId;
  const media = useRepoQuery(async (repo) => {
    const [assets, full] = await Promise.all([repo.listAssets(orgId), repo.getBrandKit(orgId).catch(() => null)]);
    // The preview must inherit exactly what guests inherit. A Brand Kit that the strict editor
    // schema cannot read (e.g. an older, partial one) still has public basics: use those.
    let kit: (BrandKitLite & { displayName?: string | null }) | null = full;
    if (!kit && venue.published) {
      const pub = await publicVenue(venue.slug, 'he').catch(() => null);
      kit = pub?.brandKit ? { ...pub.brandKit, displayName: pub.brand.displayName } : null;
    }
    return { assets, kit, urls: await repo.getAssetUrls(orgId, assets.map((a) => a.id)) };
  }, [orgId, venue.published, venue.slug]);
  const baseDraft = useMemo(() => normalizeDraft(venue.draft!, venue.name), [venue.draft, venue.name]);
  const [pages, setPages] = useState<PublicPagesConfig | null>(() => (baseDraft.publicPages ? normalizePublicPages(baseDraft.publicPages) : null));
  const [saved, setSaved] = useState<string>(() => stable(baseDraft.publicPages ? normalizePublicPages(baseDraft.publicPages) : null));
  const [lock, setLock] = useState(venue.lockVersion);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [kind, setKind] = useState<PageKind>('booking');
  const [device, setDevice] = useState<Device>('phone');
  const [previewLang, setPreviewLang] = useState<Lang>('he');
  const [showPreview, setShowPreview] = useState(false);
  const dirty = stable(pages) !== saved;

  const published = venue.published?.snapshot ?? null;
  const publishedPages = published?.publicPages ? normalizePublicPages(published.publicPages) : null;
  const unpublished = !dirty && stable(pages) !== stable(publishedPages);
  // Other draft edits (hours, tables, rules) that a publish from here would also release.
  const otherChanges = useMemo(() => {
    if (!published) return false;
    const strip = (d: object) => stable({ ...d, publicPages: undefined, progress: undefined, venueId: undefined, slug: undefined });
    return strip(venue.draft ?? {}) !== strip(published);
  }, [venue.draft, published]);

  // Leaving with unsaved changes: browser close/reload and in-app back links ask first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const leave = (to: string) => { if (!dirty || window.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?')) navigate(to); };

  const assetIds = useMemo(() => new Set((media.data?.assets ?? []).map((a) => a.id)), [media.data]);
  const problems = useMemo(() => (pages && media.data ? publicPagesProblems(pages, assetIds) : []), [pages, media.data, assetIds]);

  const update = (fn: (p: PublicPagesConfig) => void) => setPages((cur) => { if (!cur) return cur; const next = structuredClone(cur); fn(next); return next; });
  const page = pages?.[kind] ?? null;
  const ownTheme = !!page?.ownTheme;
  const theme: PageTheme | null = pages ? (ownTheme && page?.theme ? page.theme : pages.theme) : null;
  const setTheme = (fn: (t: PageTheme) => void) => update((p) => { const t = p[kind].ownTheme && p[kind].theme ? p[kind].theme! : p.theme; fn(t); });

  async function save(): Promise<number | null> {
    if (problems.length) { toast(PAGES_PROBLEM_HE[problems[0]!.code] ?? 'יש הגדרה לא תקינה.', 'error'); return null; }
    setBusy('save');
    try {
      const next: VenueDraft = { ...baseDraft };
      if (pages) next.publicPages = pages; else delete next.publicPages;
      const r = await saveDraft(venue.id, next, lock);
      setLock(r.lockVersion);
      setSaved(stable(pages));
      return r.lockVersion;
    } catch (e) {
      const te = e as TablesError;
      toast(te.isConflict ? 'מישהו אחר בצוות שינה את הגדרות המקום בינתיים. רעננו את הדף כדי לראות את הגרסה העדכנית.' : te.message, 'error');
      return null;
    } finally { setBusy(null); }
  }

  async function publish() {
    const lv = dirty ? await save() : lock;
    if (lv == null) return;
    if (venue.problems?.length) {
      toast(`אי אפשר לפרסם עדיין: ${problemText(venue.problems[0]!)} (בהגדרות המקום)`, 'error');
      return;
    }
    setBusy('publish');
    try {
      const r = await publishVenue(venue.id, lv);
      setLock(r.lockVersion);
      toast('דפי ההזמנה פורסמו — האורחים רואים את העיצוב החדש', 'success');
      await reload();
    } catch (e) {
      const te = e as TablesError;
      toast(te.isConflict ? 'מישהו אחר בצוות שינה את הגדרות המקום בינתיים. רעננו את הדף.' : te.message, 'error');
    } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-7xl pb-6">
      <button type="button" onClick={() => leave(`/app/tables/${venue.id}`)} className="min-h-[44px] text-sm text-ink-muted hover:text-ink">← {venue.name}</button>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">עיצוב דפי ההזמנה</h1>
          <p className="text-sm text-ink-muted">איך האורחים רואים את דף הזמנת השולחן ואת רשימת ההמתנה. זמינות, קיבולת והרשאות נשארים בידי המערכת.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge tone="amber">לא נשמר</Badge> : unpublished ? <Badge tone="amber">נשמר כטיוטה · לא פורסם</Badge> : <Badge tone="teal">מעודכן באתר</Badge>}
          {venue.published && (
            <a href={kind === 'booking' ? bookingUrl(venue.slug) : `${bookingUrl(venue.slug)}/waitlist`} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-orange-800 hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden /> הדף החי
            </a>
          )}
        </div>
      </div>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cloud-200 bg-white p-4 shadow-card">
        <div className="min-w-0">
          <p className="font-semibold">עיצוב מותאם אישית</p>
          <p className="text-sm text-ink-muted">{pages ? 'הדפים מעוצבים לפי ההגדרות כאן.' : 'כבוי — האורחים רואים את הדפים הרגילים של Formangle בצבע המותג.'}</p>
        </div>
        <Switch label="עיצוב מותאם אישית" checked={!!pages} onChange={(on) => setPages(on ? (publishedPages ?? normalizePublicPages(defaultPublicPages())) : null)} />
      </section>

      {pages && theme && page && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="grid min-w-0 content-start gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented label="איזה דף עורכים" value={kind} onChange={setKind}
                options={[{ value: 'booking', label: 'הזמנת שולחן' }, { value: 'waitlist', label: 'רשימת המתנה' }]} />
              <Button size="sm" variant="secondary" icon={Eye} className="h-11 lg:hidden" onClick={() => setShowPreview(true)}>תצוגה מקדימה</Button>
            </div>

            <Panel icon={Palette} title="סגנון" open>
              <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-cloud px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">עיצוב נפרד לדף {kind === 'booking' ? 'ההזמנה' : 'רשימת ההמתנה'}</span>
                  <span className="block text-xs text-ink-muted">כבוי = אותו עיצוב לשני הדפים.</span>
                </span>
                <Switch label={`עיצוב נפרד לדף ${kind === 'booking' ? 'ההזמנה' : 'רשימת ההמתנה'}`} checked={ownTheme}
                  onChange={(on) => update((p) => { p[kind].ownTheme = on; if (on && !p[kind].theme) p[kind].theme = structuredClone(p.theme); if (!on) delete p[kind].theme; })} />
              </label>
              <div role="radiogroup" aria-label="סגנון מוכן" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PAGE_PRESETS.map((id) => {
                  const pr = PRESETS[id];
                  const on = theme.preset === id;
                  return (
                    <button key={id} type="button" role="radio" aria-checked={on}
                      onClick={() => setTheme((t) => Object.assign(t, presetTheme(id, t)))}
                      className={cx('group overflow-hidden rounded-xl border text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                        on ? 'border-midnight ring-2 ring-midnight/20' : 'border-cloud-300 hover:border-ink-soft')}>
                      <span aria-hidden className="flex h-14 items-end gap-1 p-2" style={{ background: pr.theme.palette.background }}>
                        <span className="h-6 flex-1 rounded" style={{ background: pr.theme.palette.surface, border: `1px solid ${pr.theme.palette.text}22` }} />
                        <span className="h-6 w-8 rounded-full" style={{ background: pr.theme.palette.accent }} />
                      </span>
                      <span className="block px-2.5 py-2">
                        <span className="flex items-center gap-1 text-sm font-semibold">{on && <Check className="h-4 w-4" aria-hidden />}{pr.label}</span>
                        <span className="block text-xs text-ink-muted">{pr.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel icon={ImageIcon} title="מותג ותמונות" open>
              <label className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">לרשת מערכת המותג</span>
                  <span className="block text-xs text-ink-muted">צבע מוביל, גופן, צורת כפתור, לוגו ותמונת כיסוי מתוך <Link className="underline" to="/app/brand">ערכת המותג</Link>.</span>
                </span>
                <Switch label="לרשת מערכת המותג" checked={theme.inheritBrand} onChange={(on) => setTheme((t) => { t.inheritBrand = on; })} />
              </label>
              <label className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
                <span className="font-medium">הצגת לוגו בכותרת</span>
                <Switch label="הצגת לוגו בכותרת" checked={theme.showLogo} onChange={(on) => setTheme((t) => { t.showLogo = on; })} />
              </label>
              {media.error ? <ErrorState error={media.error} /> : !media.data ? <Spinner label="טוען תמונות…" /> : (
                <div className="grid gap-4">
                  {theme.showLogo && (
                    <ImagePicker kind="logo" label="לוגו" hint={theme.inheritBrand ? 'ריק = הלוגו מערכת המותג.' : 'רקע שקוף נראה הכי טוב.'} selected={theme.logoAssetId}
                      assets={media.data.assets} urls={media.data.urls} orgId={orgId} onSelect={(id) => setTheme((t) => { if (id) t.logoAssetId = id; else delete t.logoAssetId; })} />
                  )}
                  <ImagePicker kind="cover" label="תמונה בראש הדף (רשות)" hint={theme.inheritBrand ? 'ריק = תמונת הכיסוי מערכת המותג, אם יש.' : 'תמונה רחבה של המקום או המנות. בלי תמונה הדף נשאר נקי.'}
                    selected={theme.heroAssetId} assets={media.data.assets} urls={media.data.urls} orgId={orgId}
                    onSelect={(id) => setTheme((t) => { if (id) t.heroAssetId = id; else delete t.heroAssetId; })} />
                  <div>
                    <p className="mb-1.5 text-sm font-medium">מיקום התמונה</p>
                    <Segmented label="מיקום התמונה" value={theme.heroStyle} onChange={(v) => setTheme((t) => { t.heroStyle = v; })}
                      options={[{ value: 'banner', label: 'רצועה רחבה' }, { value: 'inline', label: 'כרטיס בתוכן' }]} />
                  </div>
                </div>
              )}
            </Panel>

            <Panel icon={Type} title="צבעים, גופן וצורה">
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(COLOR_HE) as (keyof PageTheme['palette'])[]).map((k) => {
                  const locked = theme.inheritBrand && (k === 'accent' || !!media.data?.kit?.palette?.background);
                  return (
                    <div key={k}>
                      <FieldLabel htmlFor={`pp-color-${k}`}>{COLOR_HE[k]}</FieldLabel>
                      <div className="flex items-center gap-2">
                        <input id={`pp-color-${k}`} type="color" value={theme.palette[k]} disabled={locked}
                          onChange={(e) => setTheme((t) => { t.palette[k] = e.target.value.toUpperCase(); })}
                          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-cloud-300 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50" />
                        <span dir="ltr" className="font-mono text-xs text-ink-muted">{locked ? 'מהמותג' : theme.palette[k]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {contrastRatio(theme.palette.text, theme.palette.surface) < 4.5 && (
                <Hint tone="warn">הטקסט חלש על רקע הכרטיסים. נשפר את הניגודיות אוטומטית כדי שהדף יישאר קריא.</Hint>
              )}
              <div>
                <FieldLabel htmlFor="pp-type">גופן</FieldLabel>
                <Select id="pp-type" value={theme.typography} disabled={theme.inheritBrand && !!media.data?.kit?.typography}
                  onChange={(e) => setTheme((t) => { t.typography = e.target.value as PageTheme['typography']; })}>
                  {Object.entries(TYPOGRAPHY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>
              <Choice label="כפתורים" value={theme.button} options={PAGE_BUTTONS.map((v) => ({ value: v, label: BUTTON_HE[v] }))} onChange={(v) => setTheme((t) => { t.button = v; })} />
              <Choice label="כרטיסים" value={theme.card} options={PAGE_CARDS.map((v) => ({ value: v, label: CARD_HE[v] }))} onChange={(v) => setTheme((t) => { t.card = v; })} />
              <Choice label="פינות" value={theme.radius} options={(['none', 'sm', 'md', 'lg', 'xl'] as const).map((v) => ({ value: v, label: RADIUS_HE[v] }))} onChange={(v) => setTheme((t) => { t.radius = v; })} />
              <Choice label="רקע" value={theme.background} options={PAGE_BACKGROUNDS.map((v) => ({ value: v, label: BG_HE[v] }))} onChange={(v) => setTheme((t) => { t.background = v; })} />
              {theme.background === 'pattern' && (
                <Choice label="טקסטורה" value={theme.pattern} options={PAGE_PATTERNS.map((v) => ({ value: v, label: PATTERN_HE[v] }))} onChange={(v) => setTheme((t) => { t.pattern = v; })} />
              )}
            </Panel>

            <Panel icon={LayoutList} title={`טקסטים · ${kind === 'booking' ? 'הזמנת שולחן' : 'רשימת המתנה'}`}>
              <TextField id="pp-title" label="כותרת" max={LIMITS.title} value={page.copy.title} placeholder={kind === 'booking' ? 'הזמנת שולחן' : 'רשימת המתנה'}
                onChange={(v) => update((p) => { setOpt(p[kind].copy, 'title', v); })} />
              <TextField id="pp-desc" label="תיאור קצר" max={LIMITS.description} multiline value={page.copy.description}
                placeholder={kind === 'booking' ? 'ריק = טקסט הפתיחה מהגדרות המקום' : 'הצטרפו לרשימה ונחכה לכם…'} onChange={(v) => update((p) => { setOpt(p[kind].copy, 'description', v); })} />
              <TextField id="pp-submit" label="טקסט כפתור השליחה" max={LIMITS.submitLabel} value={page.copy.submitLabel}
                hint={kind === 'booking' ? 'כשההזמנה דורשת אישור, הכפתור תמיד יגיד "שליחת בקשה".' : undefined}
                placeholder={kind === 'booking' ? 'אישור ההזמנה' : 'הצטרפות לרשימה'} onChange={(v) => update((p) => { setOpt(p[kind].copy, 'submitLabel', v); })} />
              <TextField id="pp-success" label={kind === 'booking' ? 'הודעה אחרי ההזמנה' : 'הודעה בדף הסטטוס'} max={LIMITS.successNote} multiline value={page.copy.successNote}
                placeholder="למשל: החניה ברחוב הסמוך חינם אחרי 19:00" onChange={(v) => update((p) => { setOpt(p[kind].copy, 'successNote', v); })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="pp-g1" label="כותרת קבוצת הפרטים" max={LIMITS.groupTitle} value={page.copy.groupTitles?.contact} placeholder="למשל: איך ניצור קשר"
                  onChange={(v) => update((p) => { const g = { ...(p[kind].copy.groupTitles ?? {}) }; setOpt(g, 'contact', v); p[kind].copy.groupTitles = g; if (!g.contact && !g.extra) delete p[kind].copy.groupTitles; })} />
                <TextField id="pp-g2" label="כותרת קבוצת התוספות" max={LIMITS.groupTitle} value={page.copy.groupTitles?.extra} placeholder="למשל: עוד משהו שכדאי שנדע"
                  onChange={(v) => update((p) => { const g = { ...(p[kind].copy.groupTitles ?? {}) }; setOpt(g, 'extra', v); p[kind].copy.groupTitles = g; if (!g.contact && !g.extra) delete p[kind].copy.groupTitles; })} />
              </div>
            </Panel>

            <Panel icon={ListPlus} title="שדות ושאלות">
              <p className="text-sm text-ink-muted">שם וטלפון הם חובה תמיד. אפשר לשנות כותרת, סדר וקבוצה, להסתיר שדות רשות ולהוסיף עד 6 שאלות.</p>
              <FieldsEditor kind={kind} fields={page.fields} onChange={(fields) => update((p) => { p[kind].fields = fields; })} />
            </Panel>

            {problems.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <ul className="list-inside list-disc">{[...new Set(problems.map((p) => PAGES_PROBLEM_HE[p.code] ?? p.code))].map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </div>

          <PreviewPanel open={showPreview} onClose={() => setShowPreview(false)} device={device} setDevice={setDevice} lang={previewLang} setLang={setPreviewLang}
            payload={{
              type: 'fz-pp-preview', kind, lang: previewLang, pages, assetOwner: orgId,
              brandKit: media.data?.kit ?? null,
              venue: {
                name: baseDraft.basics.name, address: baseDraft.basics.address, phone: baseDraft.basics.phone, showWhatsapp: baseDraft.guest.showWhatsapp,
                intro: baseDraft.guest.intro, terms: baseDraft.guest.terms, minParty: baseDraft.policy.minParty, maxParty: baseDraft.policy.maxParty,
                brand: { displayName: media.data?.kit?.displayName ?? null, palette: (media.data?.kit?.palette as Record<string, string> | null | undefined) ?? null },
              },
            }} />
        </div>
      )}

      <div className="sticky bottom-3 z-30 mt-5 rounded-2xl border border-cloud-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lift backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Save} variant="secondary" loading={busy === 'save'} disabled={!dirty || busy != null} className="h-11"
            onClick={async () => { if (await save() != null) toast('הטיוטה נשמרה. האורחים עדיין רואים את הגרסה שפורסמה.', 'success'); }}>
            {dirty ? 'שמירת טיוטה' : 'נשמר'}
          </Button>
          <Button icon={Rocket} loading={busy === 'publish'} disabled={busy != null || (!dirty && !unpublished)} className="h-11" onClick={() => void publish()}>פרסום</Button>
          <p className="min-w-0 flex-1 text-xs text-ink-muted" aria-live="polite">
            {dirty ? 'יש שינויים שלא נשמרו.' : unpublished ? 'הטיוטה שמורה. פרסום יעדכן את מה שהאורחים רואים.' : 'מה שמוצג כאן הוא מה שהאורחים רואים.'}
            {otherChanges && (dirty || unpublished) && ' שימו לב: בטיוטה יש גם שינויים אחרים (שעות/שולחנות/כללים) שיפורסמו יחד.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function setOpt<T extends object>(obj: T, key: keyof T, v: string) {
  if (v.trim()) (obj as Record<string, unknown>)[key as string] = v; else delete (obj as Record<string, unknown>)[key as string];
}

function Panel({ icon: Icon, title, open, children }: { icon: typeof Palette; title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-cloud-200 bg-white shadow-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
        <Icon className="h-5 w-5 text-orange-700" aria-hidden />
        <span className="flex-1">{title}</span>
        <span aria-hidden className="text-ink-muted transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="grid gap-4 border-t border-cloud-200 p-4">{children}</div>
    </details>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2',
        checked ? 'border-teal-700 bg-teal-700' : 'border-cloud-300 bg-cloud-200')}>
      <span aria-hidden className={cx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', checked ? 'start-7' : 'start-1')} />
    </button>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <Segmented label={label} value={value} onChange={onChange} options={options} />
    </div>
  );
}

function TextField({ id, label, value, onChange, max, multiline, placeholder, hint }: {
  id: string; label: string; value?: string; onChange: (v: string) => void; max: number; multiline?: boolean; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline
        ? <Textarea id={id} value={value ?? ''} maxLength={max} rows={3} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <Input id={id} value={value ?? ''} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
      <p className="mt-1 flex justify-between gap-2 text-xs text-ink-muted"><span>{hint}</span><span className="tabular-nums" dir="ltr">{(value ?? '').length}/{max}</span></p>
    </div>
  );
}

function FieldsEditor({ kind, fields, onChange }: { kind: PageKind; fields: PageField[]; onChange: (f: PageField[]) => void }) {
  const questions = fields.filter((f) => f.kind !== 'builtin').length;
  const set = (i: number, patch: Partial<PageField>) => onChange(fields.map((f, j) => (j === i ? clean({ ...f, ...patch }) : f)));
  const move = (i: number, d: -1 | 1) => { const next = [...fields]; const [f] = next.splice(i, 1); next.splice(i + d, 0, f!); onChange(next); };
  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {fields.map((f, i) => {
          const mandatory = (MANDATORY_FIELDS as readonly string[]).includes(f.key);
          const std = fieldText({ ...f, label: undefined, hint: undefined }, 'he');
          const id = `pf-${f.key}`;
          return (
            <li key={f.key} className={cx('grid gap-3 rounded-xl border p-3', f.hidden ? 'border-dashed border-cloud-300 bg-cloud/60' : 'border-cloud-200 bg-white')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {f.kind === 'builtin' ? std.label : f.label || 'שאלה חדשה'}
                  <span className="ms-2 text-xs font-normal text-ink-muted">{f.kind === 'builtin' ? (mandatory ? 'חובה' : 'שדה רגיל') : KIND_HE[f.kind as QuestionKind]}</span>
                </span>
                <Button size="sm" variant="ghost" icon={ArrowUp} aria-label={`הזזת ${f.label || std.label} למעלה`} disabled={i === 0} onClick={() => move(i, -1)} className="h-10 w-10" />
                <Button size="sm" variant="ghost" icon={ArrowDown} aria-label={`הזזת ${f.label || std.label} למטה`} disabled={i === fields.length - 1} onClick={() => move(i, 1)} className="h-10 w-10" />
                {!mandatory && (
                  <Button size="sm" variant="ghost" icon={f.hidden ? Eye : EyeOff} aria-pressed={!!f.hidden} onClick={() => set(i, { hidden: !f.hidden })} className="h-10">
                    {f.hidden ? 'הצגה' : 'הסתרה'}
                  </Button>
                )}
                {f.kind !== 'builtin' && (
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={`מחיקת השאלה ${f.label}`} onClick={() => onChange(fields.filter((_, j) => j !== i))} className="h-10 w-10" />
                )}
              </div>
              {!f.hidden && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={`${id}-l`}>{f.kind === 'builtin' ? 'כותרת (ריק = רגילה)' : 'ניסוח השאלה'}</FieldLabel>
                    <Input id={`${id}-l`} value={f.label ?? ''} maxLength={LIMITS.label} placeholder={f.kind === 'builtin' ? std.label : 'למשל: יש אלרגיות שכדאי שנדע?'}
                      onChange={(e) => set(i, { label: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${id}-h`}>טקסט עזרה (רשות)</FieldLabel>
                    <Input id={`${id}-h`} value={f.hint ?? ''} maxLength={LIMITS.hint} placeholder={std.hint ?? ''} onChange={(e) => set(i, { hint: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${id}-g`}>קבוצה</FieldLabel>
                    <Select id={`${id}-g`} value={f.group} onChange={(e) => set(i, { group: e.target.value as PageField['group'] })}>
                      <option value="contact">פרטי קשר</option>
                      <option value="extra">תוספות</option>
                    </Select>
                  </div>
                  {f.kind !== 'builtin' && (
                    <>
                      <div>
                        <FieldLabel htmlFor={`${id}-k`}>סוג תשובה</FieldLabel>
                        <Select id={`${id}-k`} value={f.kind} onChange={(e) => {
                          const k = e.target.value as QuestionKind;
                          set(i, { kind: k, options: k === 'select' ? (f.options?.length ? f.options : ['אפשרות 1', 'אפשרות 2']) : undefined });
                        }}>
                          {(Object.keys(KIND_HE) as QuestionKind[]).map((k) => <option key={k} value={k}>{KIND_HE[k]}</option>)}
                        </Select>
                      </div>
                      <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
                        <input type="checkbox" checked={!!f.required} onChange={(e) => set(i, { required: e.target.checked })} className="h-6 w-6 shrink-0 accent-orange-700" />
                        {f.kind === 'checkbox' ? 'חובה לסמן' : 'חובה לענות'}
                      </label>
                      {f.kind === 'select' && <OptionsEditor id={`${id}-o`} options={f.options ?? []} onChange={(options) => set(i, { options })} />}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={Plus} className="h-11" disabled={questions >= LIMITS.questions}
          onClick={() => onChange([...fields, { key: newQuestionKey(), kind: 'text', label: '', required: false, group: 'extra' }])}>
          שאלה נוספת
        </Button>
        <span className="text-xs text-ink-muted">{questions}/{LIMITS.questions} שאלות · {kind === 'booking' ? 'התשובות יופיעו לצוות בפרטי ההזמנה.' : 'התשובות יופיעו לצוות ברשימת ההמתנה.'}</span>
      </div>
    </div>
  );
}

/** Drops empty optional text so the stored config stays minimal (and the server never sees ""). */
function clean(f: PageField): PageField {
  const out: PageField = { ...f };
  if (!out.label?.trim() && out.kind === 'builtin') delete out.label;
  if (!out.hint?.trim()) delete out.hint;
  if (!out.hidden) delete out.hidden;
  if (out.kind === 'builtin') { delete out.required; delete out.options; }
  if (out.kind !== 'select') delete out.options;
  return out;
}

function OptionsEditor({ id, options, onChange }: { id: string; options: string[]; onChange: (o: string[]) => void }) {
  const [text, setText] = useState(options.join('\n'));
  const last = useRef(options.join('\n'));
  useEffect(() => { const joined = options.join('\n'); if (joined !== last.current) { last.current = joined; setText(joined); } }, [options]);
  return (
    <div className="sm:col-span-2">
      <FieldLabel htmlFor={id}>אפשרויות (אחת בכל שורה, עד 8)</FieldLabel>
      <Textarea id={id} rows={4} value={text} onChange={(e) => {
        setText(e.target.value);
        const next = [...new Set(e.target.value.split('\n').map((l) => l.trim().slice(0, LIMITS.option)).filter(Boolean))].slice(0, LIMITS.options);
        last.current = next.join('\n');
        onChange(next);
      }} />
    </div>
  );
}

function PreviewPanel({ open, onClose, device, setDevice, lang, setLang, payload }: {
  open: boolean; onClose: () => void; device: Device; setDevice: (d: Device) => void; lang: Lang; setLang: (l: Lang) => void; payload: PreviewPayload;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const post = useCallback(() => frame.current?.contentWindow?.postMessage(payload, window.location.origin), [payload]);
  useEffect(() => { post(); }, [post]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && (e.data as { type?: string })?.type === 'fz-pp-ready') post();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const d = DEVICES[device];
  const scale = Math.min(1, width / d.w);
  return (
    <aside aria-label="תצוגה מקדימה"
      className={cx('min-w-0 lg:sticky lg:top-4 lg:block lg:self-start',
        open ? 'fixed inset-0 z-40 overflow-y-auto bg-cloud p-3 pb-24 lg:static lg:z-auto lg:bg-transparent lg:p-0' : 'hidden')}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label="גודל מסך" value={device} onChange={setDevice}
          options={(Object.keys(DEVICES) as Device[]).map((k) => ({ value: k, label: DEVICES[k].label, icon: DEVICES[k].icon }))} />
        <Segmented label="שפת התצוגה" value={lang} onChange={setLang} options={[{ value: 'he', label: 'עברית' }, { value: 'en', label: 'English' }]} />
        <Button size="sm" variant="secondary" onClick={onClose} className="ms-auto h-11 lg:hidden">סגירה</Button>
      </div>
      <div ref={box} className="w-full">
        <div dir="ltr" className="relative mx-auto overflow-hidden rounded-[22px] border border-cloud-300 bg-white shadow-lift" style={{ width: d.w * scale, height: d.h * scale }}>
          <iframe ref={frame} title="תצוגה מקדימה של דף האורחים" src="/t-preview" onLoad={post}
            style={{ position: 'absolute', top: 0, left: 0, width: d.w, height: d.h, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }} />
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">תצוגה של הטיוטה. האורחים רואים רק מה שפורסם.</p>
    </aside>
  );
}
