/**
 * Browser-side image preparation for the demo asset store. Images are decoded
 * and re-encoded locally on a canvas (which also strips metadata such as EXIF
 * location), downscaled, and compressed until they fit the per-kind limit.
 * Nothing is uploaded anywhere.
 */
import { ASSET_LIMITS, type Asset } from '../domain/theme';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export class ImagePrepError extends Error {}

function dataUrlBytes(url: string) {
  return Math.ceil((url.length - url.indexOf(',') - 1) * 0.75);
}

export async function prepareImage(file: File, kind: Asset['kind']): Promise<Pick<Asset, 'kind' | 'name' | 'mime' | 'dataUrl' | 'width' | 'height'>> {
  if (!ACCEPTED.includes(file.type)) throw new ImagePrepError('ניתן לבחור תמונת PNG, JPG או WebP בלבד.');
  if (file.size > ASSET_LIMITS.maxUploadBytes) throw new ImagePrepError('הקובץ גדול מדי (מעל 12MB).');
  const limit = ASSET_LIMITS[kind];
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePrepError('לא ניתן לקרוא את התמונה. נסו קובץ אחר.');
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImagePrepError('הדפדפן אינו תומך בעיבוד תמונות.');

  // Logos keep transparency (WebP, PNG fallback); covers use lossy WebP/JPEG.
  const formats: Asset['mime'][] = kind === 'logo' ? ['image/webp', 'image/png'] : ['image/webp', 'image/jpeg'];
  for (let edge: number = limit.maxEdge; edge >= 120; edge = Math.round(edge * 0.75)) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const mime of formats) {
      for (const q of mime === 'image/png' ? [1] : [0.82, 0.68, 0.55]) {
        const url = canvas.toDataURL(mime, q);
        // Browsers silently fall back to PNG for unsupported types; trust the actual prefix.
        const actual = url.slice(5, url.indexOf(';')) as Asset['mime'];
        if (!ACCEPTED.includes(actual)) continue;
        if (dataUrlBytes(url) <= limit.maxBytes) {
          bitmap.close();
          return { kind, name: file.name.slice(0, 120), mime: actual, dataUrl: url, width: canvas.width, height: canvas.height };
        }
      }
    }
  }
  bitmap.close();
  throw new ImagePrepError('לא הצלחנו לכווץ את התמונה לגודל המותר בדמו. נסו תמונה פשוטה יותר.');
}

/**
 * Candidate brand colors from a local image (e.g. the logo), using simple
 * colour quantization on a small canvas. Deterministic — no AI, no network.
 * Near-white / near-black / transparent pixels are ignored.
 */
export async function extractColors(dataUrl: string, count = 5): Promise<string[]> {
  const img = new Image();
  img.decoding = 'async';
  img.src = dataUrl;
  await img.decode();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 160) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 238 && min > 238) continue; // near white
    if (max < 22) continue; // near black
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    e.r += r;
    e.g += g;
    e.b += b;
    e.n++;
    buckets.set(key, e);
  }
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const picked: string[] = [];
  for (const e of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    const hex = `#${toHex(e.r / e.n)}${toHex(e.g / e.n)}${toHex(e.b / e.n)}`.toUpperCase();
    // Skip colours too close to one already picked.
    const near = picked.some((p) => {
      const d = [1, 3, 5].reduce((s, j) => s + Math.abs(parseInt(p.slice(j, j + 2), 16) - parseInt(hex.slice(j, j + 2), 16)), 0);
      return d < 60;
    });
    if (!near) picked.push(hex);
    if (picked.length >= count) break;
  }
  return picked;
}
