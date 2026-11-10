/**
 * Menu images: one compact upload / replace / remove control (sections and dishes) and the
 * gallery editor (add from the library or upload, replace, remove, reorder). Images are the
 * organization's brand assets — the same library, bucket and limits as the Brand Kit.
 */
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ImagePicker } from '../../components/ImagePicker';
import { useToast } from '../../components/Toast';
import { Button, cx } from '../../components/ui';
import type { Asset } from '../../domain/theme';
import { useRepo } from '../../data/store';
import { ImagePrepError, prepareImage } from '../../lib/images';
import { assetSrc } from '../../lib/links';

export const MENU_GALLERY_MAX = 12;

export interface MediaLibrary { assets: Asset[]; urls: Record<string, string> }

function useUpload(orgId: string) {
  const { repo } = useRepo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined, onDone: (id: string) => void) => {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareImage(file, 'image');
      const asset = await repo.saveAsset(orgId, prepared);
      onDone(asset.id);
    } catch (e) {
      toast(e instanceof ImagePrepError || e instanceof Error ? e.message : 'העלאת התמונה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, upload };
}

/** Upload, replace or remove one image (section or dish). */
export function ImageSlot({ label, value, media, orgId, onChange, wide }: {
  label: string; value?: string; media: MediaLibrary | undefined; orgId: string; onChange: (id: string | undefined) => void; wide?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, upload } = useUpload(orgId);
  const url = value ? media?.urls[value] : undefined;
  const missing = !!value && !!media && !url;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx('flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cloud-300 bg-cloud', wide ? 'h-16 w-28' : 'h-16 w-16')}>
        {url ? <img src={assetSrc(url)} alt="" width={wide ? 112 : 64} height={64} className="h-full w-full object-cover" />
          : <ImagePlus className="h-5 w-5 text-ink-soft" aria-hidden />}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Button size="sm" variant="secondary" icon={value ? RefreshCw : ImagePlus} loading={busy} onClick={() => input.current?.click()} className="h-10"
          aria-label={value ? `החלפת ${label}` : `הוספת ${label}`}>
          {value ? 'החלפה' : label}
        </Button>
        {value && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(undefined)} className="h-10" aria-label={`הסרת ${label}`}>הסרה</Button>}
        {missing && <span className="text-xs text-amber-700">התמונה הוסרה מהספרייה — החליפו או הסירו.</span>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { void upload(e.target.files?.[0], (id) => onChange(id)); e.target.value = ''; }} />
    </div>
  );
}

/** Ordered gallery: add (library or upload), replace, remove and move earlier / later. */
export function GalleryEditor({ value, media, orgId, onChange }: { value: string[]; media: MediaLibrary; orgId: string; onChange: (ids: string[]) => void }) {
  const [replace, setReplace] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id!);
    onChange(next);
  };
  const full = value.length >= MENU_GALLERY_MAX;
  return (
    <div className="grid gap-3">
      {value.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="תמונות הגלריה לפי הסדר">
          {value.map((id, i) => {
            const url = media.urls[id];
            return (
              <li key={id} className={cx('overflow-hidden rounded-xl border bg-white', replace === i ? 'border-midnight ring-2 ring-midnight/20' : 'border-cloud-200')}>
                <div className="relative aspect-[4/3] bg-cloud">
                  {url ? <img src={assetSrc(url)} alt="" width={240} height={180} loading="lazy" className="h-full w-full object-cover" />
                    : <span className="flex h-full items-center justify-center p-2 text-center text-xs text-amber-700">התמונה הוסרה מהספרייה</span>}
                  <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2 text-xs font-semibold text-white tabular-nums">{i + 1}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 p-1.5">
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={ArrowRight} aria-label={`הזזת תמונה ${i + 1} מוקדם יותר`} disabled={i === 0} onClick={() => move(i, i - 1)} className="h-10 w-10" />
                    <Button size="sm" variant="ghost" icon={ArrowLeft} aria-label={`הזזת תמונה ${i + 1} מאוחר יותר`} disabled={i === value.length - 1} onClick={() => move(i, i + 1)} className="h-10 w-10" />
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={RefreshCw} aria-label={`החלפת תמונה ${i + 1}`} aria-pressed={replace === i} onClick={() => setReplace(replace === i ? null : i)} className="h-10 w-10" />
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label={`הסרת תמונה ${i + 1} מהגלריה`} onClick={() => { onChange(value.filter((_, j) => j !== i)); setReplace(null); }} className="h-10 w-10" />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {(!full || replace != null) && (
        <ImagePicker kind="image"
          label={replace != null ? `החלפת תמונה ${replace + 1}` : 'הוספת תמונה לגלריה'}
          hint={replace != null ? 'בחרו תמונה מהספרייה או העלו חדשה במקומה.' : `בחרו מהספרייה או העלו. עד ${MENU_GALLERY_MAX} תמונות.`}
          selected={undefined} assets={media.assets} urls={media.urls} orgId={orgId}
          onSelect={(id) => {
            if (!id) { setReplace(null); return; }
            if (replace != null) { onChange(value.map((x, j) => (j === replace ? id : x)).filter((x, j, a) => a.indexOf(x) === j)); setReplace(null); }
            else if (!value.includes(id)) onChange([...value, id]);
          }} />
      )}
      {full && replace == null && <p className="text-xs text-ink-muted">הגלריה מלאה ({MENU_GALLERY_MAX} תמונות). הסירו תמונה כדי להוסיף אחרת.</p>}
    </div>
  );
}
