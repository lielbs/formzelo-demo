/**
 * Distribution of a published workflow: link, WhatsApp, QR (PNG / SVG) and website snippets,
 * with an honest note on where the link opens in this local demo (lib/share.ts → linkReach).
 */
import { Code2, Copy, Download, Eye, Globe, Info, MessageCircle, QrCode } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buttonSnippet, downloadName, iframeSnippet, qrPixels, qrSvg, REACH_COPY, shareMessage, whatsappShareUrl, type LinkReach } from '../lib/share';
import { copyText, useToast } from './Toast';
import { Button, cx, FieldLabel } from './ui';

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadPng(url: string, name: string) {
  const { width, height, data } = qrPixels(url, 16);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(data, width, height), 0, 0);
  canvas.toBlob((b) => b && save(b, `${name}.png`), 'image/png');
}

export function SharePanel({
  url,
  slug,
  business,
  title,
  color,
  reach,
  caseMode,
  onCopied,
}: {
  url: string;
  slug: string;
  business: string;
  title: string;
  color: string;
  reach: LinkReach;
  /** Case workflows are opened per customer from a request, so the bare link is not shared. */
  caseMode?: boolean;
  onCopied?: () => void;
}) {
  const toast = useToast();
  const [snippet, setSnippet] = useState<'button' | 'iframe'>('button');
  const svg = useMemo(() => qrSvg(url, { size: 176 }), [url]);
  const code = snippet === 'button' ? buttonSnippet(url, 'להזמנה ופרטים', color) : iframeSnippet(url, `${title} · ${business}`);
  const note = REACH_COPY[reach];
  const name = downloadName(slug);

  const copy = async (text: string, done: string) => {
    const ok = await copyText(text);
    toast(ok ? done : 'סמנו והעתיקו ידנית', ok ? 'success' : 'error');
    if (ok) onCopied?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel htmlFor={`share-${slug}`}>{caseMode ? 'כתובת התהליך (כל לקוח מקבל קישור אישי)' : 'הקישור ללקוחות'}</FieldLabel>
        <div className="flex gap-2">
          <input id={`share-${slug}`} readOnly dir="ltr" value={url} onFocus={(e) => e.target.select()} className="fz-input min-w-0 flex-1 rounded-xl border border-cloud-300 bg-cloud px-3 py-2 text-sm" />
          <Button variant="secondary" icon={Copy} onClick={() => copy(url, 'הקישור הועתק')}>
            העתקה
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-medium text-white hover:bg-midnight-700">
          <Eye className="h-4 w-4" aria-hidden /> פתיחת התהליך
        </a>
        {!caseMode && (
          <a
            href={whatsappShareUrl(shareMessage(business, title, url))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-4 text-sm font-medium text-ink hover:bg-cloud"
          >
            <MessageCircle className="h-4 w-4 text-[#128C7E]" aria-hidden /> שיתוף בוואטסאפ
          </a>
        )}
      </div>

      <div className={cx('flex gap-2 rounded-xl p-3 text-xs leading-relaxed', reach === 'this_browser' ? 'bg-amber-50 text-amber-900' : 'bg-teal-50 text-teal-600')} role="note">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <span className="block font-semibold">{note.title}</span>
          {note.body}
        </p>
      </div>

      {caseMode ? (
        <p className="rounded-xl bg-cloud p-3 text-xs leading-relaxed text-ink-muted">בתהליך מבוסס תיקים פותחים תיק לכל לקוח מתוך תיבת הבקשות, ושולחים לו את הקישור האישי שנוצר. לכן אין כאן QR או קוד הטמעה כלליים.</p>
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-xl border border-cloud-200 p-4 sm:flex-row sm:items-center" aria-label="קוד QR">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`קוד QR לכתובת ${url}`} width={136} height={136} className="mx-auto shrink-0 rounded-lg ring-1 ring-cloud-200 sm:mx-0" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <QrCode className="h-4 w-4" aria-hidden /> קוד QR לדלפק, לשלט או לחשבונית
              </p>
              <p className="mt-1 text-xs text-ink-muted">נוצר במחשב שלכם, בלי שירות חיצוני. סורק בטלפון פותח בדיוק את הקישור שלמעלה.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadPng(url, name)}>
                  PNG להדפסה
                </Button>
                <Button size="sm" variant="ghost" icon={Download} onClick={() => save(new Blob([qrSvg(url, { size: 1024 })], { type: 'image/svg+xml' }), `${name}.svg`)}>
                  SVG לעיצוב
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-cloud-200 p-4" aria-label="הטמעה באתר">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Globe className="h-4 w-4" aria-hidden /> הוספה לאתר של העסק
            </p>
            <div className="mt-2 inline-flex rounded-lg bg-cloud p-0.5 text-xs" role="radiogroup" aria-label="סוג קוד">
              {(
                [
                  ['button', 'כפתור קישור'],
                  ['iframe', 'הטמעה בעמוד'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={snippet === k} onClick={() => setSnippet(k)} className={cx('rounded-md px-3 py-1.5 font-medium', snippet === k ? 'bg-white shadow-sm' : 'text-ink-muted')}>
                  {label}
                </button>
              ))}
            </div>
            <pre dir="ltr" className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-midnight p-3 text-[11px] leading-relaxed text-cloud-200">
              <code>{code}</code>
            </pre>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" icon={Code2} onClick={() => copy(code, 'הקוד הועתק')}>
                העתקת הקוד
              </Button>
              <p className="text-xs text-ink-muted">
                {snippet === 'button' ? 'מתאים לכל בונה אתרים שמקבל HTML. נפתח בלשונית חדשה.' : 'התהליך מוצג בתוך העמוד. הדפדפן שומר את מה שהמבקר ממלא בנפרד לכל אתר.'}
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
