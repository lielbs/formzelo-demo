/**
 * Sharing a published workflow: QR codes (generated locally, no network), a WhatsApp share
 * link (the public wa.me "click to chat" URL — not the Business API), and website snippets.
 * Everything is pure so it can be unit-tested; the UI only wires these to buttons.
 */
import qrcode from 'qrcode-generator';

/** Where a shared link actually opens in this local demo. */
export type LinkReach =
  /** A seeded demo workflow: every browser seeds the same flow, so the link works anywhere. */
  | 'everywhere'
  /** A demo workflow republished here: other browsers open the original demo version. */
  | 'original_elsewhere'
  /** Created or published only in this browser's storage: other devices cannot open it. */
  | 'this_browser';

/**
 * `seededPublic`: slugs the demo seeds as published in every browser (data/seed DEMO_SLUGS).
 * A demo draft published here, or any workspace's own workflow, exists only in this browser.
 */
export function linkReach(workflow: { isDemo: boolean; slug: string }, publishedVersion: number | undefined, seededPublic: readonly string[]): LinkReach {
  if (!workflow.isDemo || !seededPublic.includes(workflow.slug)) return 'this_browser';
  return (publishedVersion ?? 1) <= 1 ? 'everywhere' : 'original_elsewhere';
}

export const REACH_COPY: Record<LinkReach, { title: string; body: string }> = {
  everywhere: {
    title: 'קישור דמו — נפתח בכל מכשיר',
    body: 'זה תהליך דמו שמגיע עם האתר, ולכן הקישור נפתח מכל טלפון ומחשב. בקשות שנשלחות נשמרות בדפדפן של מי ששלח.',
  },
  original_elsewhere: {
    title: 'קישור דמו — במכשירים אחרים תופיע גרסת הדמו המקורית',
    body: 'פרסמתם כאן גרסה חדשה. בדפדפן הזה הקישור מציג אותה; בכל מכשיר אחר הוא יציג את גרסת הדמו המקורית.',
  },
  this_browser: {
    title: 'תצוגה מקומית — נפתח רק בדפדפן הזה',
    body: 'התהליך נשמר בדפדפן הזה בלבד, ולכן הקישור לא ייפתח בטלפון של לקוח. בגרסה עם שרת משותף אותו קישור יעבוד מכל מקום.',
  },
};

/** Only http(s) URLs are ever shared, encoded or embedded. */
export function isShareableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !/[\s<>"'`]/.test(url);
  } catch {
    return false;
  }
}

function assertShareable(url: string) {
  if (!isShareableUrl(url)) throw new Error('כתובת לא תקינה לשיתוף');
}

// ---------- QR ----------

/** QR modules for a URL (error correction M, smallest version that fits). */
export function qrMatrix(url: string): boolean[][] {
  assertShareable(url);
  // The library's default byte mode is Latin-1; URLs are ASCII once percent-encoded.
  const qr = qrcode(0, 'M');
  let ascii = url;
  try {
    ascii = encodeURI(decodeURI(url));
  } catch {
    /* already encoded oddly; keep as is */
  }
  qr.addData(ascii);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** A crisp, self-contained SVG (one path, quiet zone of 4 modules as the standard requires). */
export function qrSvg(url: string, { size = 512, dark = '#0F1B2D', light = '#FFFFFF' } = {}): string {
  const m = qrMatrix(url);
  const quiet = 4;
  const total = m.length + quiet * 2;
  let d = '';
  m.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }),
  );
  const safe = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#000000');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${safe(light)}"/><path d="${d}" fill="${safe(dark)}"/></svg>`;
}

/** RGBA pixels of the QR (used for the PNG download and to verify decoding in tests). */
export function qrPixels(url: string, scale = 8): { width: number; height: number; data: Uint8ClampedArray } {
  const m = qrMatrix(url);
  const quiet = 4;
  const n = (m.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < n; y++) {
    const r = Math.floor(y / scale) - quiet;
    for (let x = 0; x < n; x++) {
      const c = Math.floor(x / scale) - quiet;
      if (m[r]?.[c]) {
        const i = (y * n + x) * 4;
        data[i] = 15;
        data[i + 1] = 27;
        data[i + 2] = 45;
      }
    }
  }
  return { width: n, height: n, data };
}

// ---------- WhatsApp ----------

export function shareMessage(business: string, title: string, url: string): string {
  return `${business}: ${title}\nאפשר למלא כאן 👇\n${url}`;
}

/** Opens WhatsApp with a prepared message; the sender chooses the recipient. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------- Website snippets ----------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#E96B3D');

/** A plain link styled as a button — works on any website builder that accepts HTML. */
export function buttonSnippet(url: string, label: string, color: string): string {
  assertShareable(url);
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:12px;background:${hex(color)};color:#fff;font:600 16px system-ui,sans-serif;text-decoration:none">${escapeHtml(label)}</a>`;
}

/** The workflow embedded in a page. Data stays in the visitor's browser (see REACH_COPY). */
export function iframeSnippet(url: string, title: string): string {
  assertShareable(url);
  return `<iframe src="${escapeHtml(url)}" title="${escapeHtml(title)}" style="width:100%;max-width:720px;height:820px;border:0;border-radius:16px" loading="lazy"></iframe>`;
}

/** File-system-safe base name for downloads. */
export const downloadName = (slug: string) => `formangle-${slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'qr'}`;
