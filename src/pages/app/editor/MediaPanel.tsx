/**
 * Design tab: how the business's own photos and logo sit in the design (theme.media).
 * Each placement is drawn as a small diagram so the owner picks a composition, not a word.
 */
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ImagePicker } from '../../../components/ImagePicker';
import { Button, cx, FieldLabel, Input } from '../../../components/ui';
import { COVER_STYLES, FRAME_SHAPES, GALLERY_PLACEMENTS, GALLERY_STYLES, LOGO_STYLES, PHOTO_TONES, type Asset, type MediaSettings, type WorkflowTheme } from '../../../domain/theme';
import { resolveMedia } from '../../../renderer/media';
import { Segmented } from './DesignPanel';

const COVER_INFO: Record<(typeof COVER_STYLES)[number], { label: string; diagram: ReactNode }> = {
  backdrop: { label: 'רקע לפתיח', diagram: <><rect x="2" y="2" width="56" height="26" rx="3" className="ph" /><rect x="30" y="9" width="22" height="4" rx="2" className="tx" /><rect x="36" y="16" width="16" height="3" rx="1.5" className="tx" /></> },
  panel: { label: 'חצי מהפתיח', diagram: <><rect x="2" y="2" width="56" height="26" rx="3" className="bg" /><rect x="2" y="2" width="24" height="26" rx="3" className="ph" /><rect x="32" y="9" width="20" height="4" rx="2" className="tx" /><rect x="36" y="16" width="16" height="3" rx="1.5" className="tx" /></> },
  frame: { label: 'תמונה במסגרת', diagram: <><rect x="2" y="2" width="56" height="26" rx="3" className="bg" /><path d="M8 25V12a7 7 0 0 1 14 0v13z" className="ph" /><rect x="30" y="9" width="22" height="4" rx="2" className="tx" /><rect x="36" y="16" width="16" height="3" rx="1.5" className="tx" /></> },
  band: { label: 'רצועה רחבה', diagram: <><rect x="2" y="2" width="56" height="26" rx="3" className="bg" /><rect x="26" y="5" width="26" height="4" rx="2" className="tx" /><rect x="7" y="13" width="46" height="11" rx="2" className="ph" /></> },
  page: { label: 'אווירה לכל העמוד', diagram: <><rect x="2" y="2" width="56" height="26" rx="3" className="ph" opacity=".45" /><rect x="10" y="11" width="40" height="15" rx="2" className="card" /></> },
};

const L = {
  frame: { rounded: 'מעוגלת', arch: 'קשת', circle: 'עיגול', organic: 'אורגנית' },
  tone: { natural: 'טבעי', brand: 'בצבעי המותג', mono: 'שחור־לבן', warm: 'חמים', soft: 'רך ובהיר' },
  galleryStyle: { strip: 'שורה', mosaic: 'פסיפס', polaroid: 'פולרואיד', stack: 'ערימה' },
  galleryPlacement: { hero: 'בפתיח', intro: 'בתחילת הטופס', completion: 'במסך הסיום' },
  logoStyle: { plain: 'רגיל', badge: 'תגית', seal: 'חותם במרכז', wordmark: 'לוגו גדול' },
} as const;

export function MediaEditor({
  design,
  set,
  orgId,
  assets,
  assetUrls,
}: {
  design: WorkflowTheme;
  set: (fn: (d: WorkflowTheme) => void) => void;
  orgId: string;
  assets: Asset[];
  assetUrls: Record<string, string>;
}) {
  const m = resolveMedia(design);
  const edit = (fn: (v: MediaSettings) => void) =>
    set((d) => {
      const v = d.media ?? {};
      fn(v);
      d.media = v;
    });
  const gallery = design.media?.gallery ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">איך תמונת העסק יושבת בעיצוב</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="מיקום תמונת העסק">
          {COVER_STYLES.map((c) => {
            const active = m.coverStyle === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => edit((v) => void (v.coverStyle = c))}
                className={cx('rounded-xl border p-2 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', active ? 'border-midnight bg-cloud ring-2 ring-midnight/10' : 'border-cloud-300 bg-white hover:bg-cloud/60')}
              >
                <svg viewBox="0 0 60 30" className="fz-diagram block h-auto w-full" aria-hidden>
                  {COVER_INFO[c].diagram}
                </svg>
                <span className="mt-1.5 block text-xs font-semibold text-ink">{COVER_INFO[c].label}</span>
              </button>
            );
          })}
        </div>
        {!design.hero.coverAssetId && <p className="mt-1.5 text-xs text-ink-muted">העלו תמונה של העסק למעלה. עד אז, בסטודיו מוצג מקום שמור במיקום שבחרתם.</p>}
      </div>
      {m.coverStyle === 'frame' && <Segmented label="צורת המסגרת" value={m.frame} options={FRAME_SHAPES} labels={L.frame} onChange={(f) => edit((v) => void (v.frame = f))} />}
      <Segmented label="גוון התמונות" value={m.tone} options={PHOTO_TONES} labels={L.tone} onChange={(t) => edit((v) => void (v.tone = t))} />
      <p className="-mt-2 text-xs text-ink-muted">״בצבעי המותג״ צובע כל תמונה בצבעי העיצוב, כך שגם צילום מהטלפון מרגיש חלק מהעמוד. תמונות של מוצרים בכרטיסי הבחירה נשארות טבעיות.</p>
      <Segmented label="סגנון הלוגו" value={m.logoStyle} options={LOGO_STYLES} labels={L.logoStyle} onChange={(s) => edit((v) => void (v.logoStyle = s))} />

      <div className="space-y-3 rounded-xl border border-cloud-200 p-3">
        <div>
          <p className="text-sm font-medium text-ink">תמונות מהעסק (עד 6)</p>
          <p className="text-xs text-ink-muted">המקום, המנות, התספורות, העבודות — מה שמראה ללקוח את העסק. השתמשו רק בתמונות שבבעלותכם.</p>
        </div>
        {gallery.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {gallery.map((id, i) => (
              <li key={id} className="relative">
                {assetUrls[id] ? <img src={assetUrls[id]} alt={`תמונה ${i + 1}`} className="h-16 w-16 rounded-lg object-cover ring-1 ring-cloud-300" /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-cloud text-[10px] text-ink-muted">חסרה</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`הסרת תמונה ${i + 1}`}
                  className="!absolute -end-2 -top-2 !h-7 !w-7 !rounded-full !bg-white !p-0 shadow"
                  onClick={() =>
                    edit((v) => {
                      v.gallery = (v.gallery ?? []).filter((x) => x !== id);
                      if (!v.gallery.length) delete v.gallery;
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {gallery.length < 6 && (
          <ImagePicker
            kind="image"
            label="הוספת תמונה"
            hint="מוקטנת ל-900px ונשמרת בדפדפן בלבד."
            selected={undefined}
            assets={assets}
            urls={assetUrls}
            orgId={orgId}
            onSelect={(id) => id && edit((v) => void (v.gallery = [...new Set([...(v.gallery ?? []), id])].slice(0, 6)))}
          />
        )}
        {gallery.length > 0 && (
          <>
            <div>
              <FieldLabel htmlFor="md-g-title">כותרת (רשות)</FieldLabel>
              <Input id="md-g-title" maxLength={40} placeholder="לדוגמה: מהמטבח שלנו · עבודות אחרונות" value={design.media?.galleryTitle ?? ''} onChange={(e) => edit((v) => void (v.galleryTitle = e.target.value || undefined))} />
            </div>
            <Segmented label="סידור" value={m.galleryStyle} options={GALLERY_STYLES} labels={L.galleryStyle} onChange={(s) => edit((v) => void (v.galleryStyle = s))} />
            <Segmented label="איפה להציג" value={m.galleryPlacement} options={GALLERY_PLACEMENTS} labels={L.galleryPlacement} onChange={(p) => edit((v) => void (v.galleryPlacement = p))} />
          </>
        )}
      </div>
    </div>
  );
}
