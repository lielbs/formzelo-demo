/** Pick, upload (downscaled locally) or delete a workspace image. Nothing leaves the browser. */
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Asset } from '../domain/theme';
import { isShowcaseId } from '../data/showcase';
import { useRepo } from '../data/store';
import { assetSrc } from '../lib/links';
import { ImagePrepError, prepareImage } from '../lib/images';
import { useToast } from './Toast';
import { Button, cx } from './ui';

export function ImagePicker({
  kind,
  label,
  hint,
  selected,
  assets,
  urls,
  orgId,
  onSelect,
}: {
  kind: Asset['kind'];
  label: string;
  hint: string;
  selected?: string;
  assets: Asset[];
  urls: Record<string, string>;
  orgId: string;
  onSelect: (id: string | undefined) => void;
}) {
  const { repo } = useRepo();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const mine = assets.filter((a) => a.kind === kind);
  const missing = selected && !urls[selected];

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareImage(file, kind);
      const asset = await repo.saveAsset(orgId, prepared);
      onSelect(asset.id);
      toast(`התמונה נשמרה מקומית (${Math.round(asset.bytes / 1024)}KB)`);
    } catch (e) {
      toast(e instanceof ImagePrepError || e instanceof Error ? e.message : 'שמירת התמונה נכשלה', 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-muted">{hint}</p>
      {missing && <p className="mt-1 text-xs text-amber-700">התמונה שנבחרה לא נמצאה בדפדפן זה — יוצג איור במקומה.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          aria-pressed={!selected}
          className={cx('flex h-14 w-14 items-center justify-center rounded-lg border text-[10px] text-ink-muted', !selected ? 'border-midnight ring-2 ring-midnight/20' : 'border-cloud-300')}
        >
          ללא
        </button>
        {mine.map((a) => (
          <span key={a.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(a.id)}
              aria-pressed={selected === a.id}
              aria-label={`בחירת ${a.name}`}
              className={cx('block h-14 w-14 overflow-hidden rounded-lg border bg-cloud', selected === a.id ? 'border-midnight ring-2 ring-midnight/20' : 'border-cloud-300')}
            >
              <img src={assetSrc(a.dataUrl)} alt="" className={cx('h-full w-full', kind === 'logo' ? 'object-contain p-1' : 'object-cover')} />
            </button>
            {selected !== a.id && !isShowcaseId(a.id) && (
              <button
                type="button"
                aria-label={`מחיקת ${a.name}`}
                className="absolute -left-1.5 -top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow ring-1 ring-cloud-300 group-hover:flex group-focus-within:flex"
                onClick={async () => {
                  try {
                    await repo.deleteAsset(orgId, a.id);
                    toast('התמונה נמחקה');
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'המחיקה נכשלה', 'error');
                  }
                }}
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
        <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>
          העלאה
        </Button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
    </div>
  );
}

