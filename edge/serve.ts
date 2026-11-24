/**
 * Shared handler of the guest-link Pages Functions: serve the production app's index (as the static
 * site would) with the business's own title, description and image in the preview tags.
 * Any failure — unknown link, slow or failing API — serves the page unchanged: the link always works.
 */
import { formPreview, PUBLISHABLE_KEY, rpcFor, SUPABASE_URL, targetOf, venuePreview, type Preview } from './preview';

interface Ctx {
  request: Request;
  env: { ASSETS: { fetch: (input: Request | string | URL) => Promise<Response> } };
  waitUntil: (p: Promise<unknown>) => void;
}

// Workers runtime globals (typed loosely so this file does not need the Workers type package).
declare const HTMLRewriter: new () => {
  on(selector: string, handlers: { element?: (el: El) => void }): InstanceType<typeof HTMLRewriter>;
  transform(r: Response): Response;
};
declare const caches: { default: { match(k: Request): Promise<Response | undefined>; put(k: Request, r: Response): Promise<void> } };
interface El { setAttribute(n: string, v: string): void; setInnerContent(c: string): void; remove(): void; append(c: string, o?: { html: boolean }): void }

/** The headers _headers gives the static pages (Pages does not apply _headers to Function responses). */
const PAGE_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=0, must-revalidate, no-transform',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // Must match scripts/build-cloudflare.mjs: a browser keeps the last value it saw.
  'strict-transport-security': 'max-age=31536000',
};

async function lookup(ctx: Ctx, key: string, fn: string, body: Record<string, string>): Promise<unknown> {
  const cacheKey = new Request(`https://preview-cache.internal/${key}`);
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return await hit.json();
  } catch { /* no cache: fetch */ }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Five minutes: a renamed venue or new cover shows up in previews soon, the API is not hit per view.
    try { ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(data), { headers: { 'cache-control': 'public, max-age=300', 'content-type': 'application/json' } }))); } catch { /* best effort */ }
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function rewrite(shell: Response, p: Preview): Response {
  const set = (content: string) => ({ element: (el: El) => el.setAttribute('content', content) });
  let r = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(p.title) })
    .on('meta[name="description"]', set(p.description || p.title))
    .on('meta[property="og:title"]', set(p.title))
    .on('meta[property="og:description"]', set(p.description || p.title))
    .on('meta[property="og:url"]', set(p.url))
    .on('meta[property="og:locale"]', set(p.locale));
  if (p.image) {
    // The owner's photo has its own size: drop the 1200×630 hints of the default image.
    r = r.on('meta[property="og:image"]', set(p.image))
      .on('meta[property="og:image:width"]', { element: (el) => el.remove() })
      .on('meta[property="og:image:height"]', { element: (el) => el.remove() });
  }
  const out = r.transform(shell);
  const headers = new Headers(out.headers);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) headers.set(k, v);
  return new Response(out.body, { status: 200, headers });
}

export async function servePreview(ctx: Ctx): Promise<Response> {
  const url = new URL(ctx.request.url);
  const shellRes = await ctx.env.ASSETS.fetch(new URL('/live/', url));
  const plain = () => {
    const headers = new Headers(shellRes.headers);
    for (const [k, v] of Object.entries(PAGE_HEADERS)) headers.set(k, v);
    return new Response(shellRes.body, { status: shellRes.status, headers });
  };
  try {
    const target = targetOf(url.pathname);
    if (!target || !shellRes.ok) return plain();
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'he';
    const canonical = `${url.origin}${url.pathname}${lang === 'en' ? '?lang=en' : ''}`;
    const { fn, body } = rpcFor(target);
    const data = await lookup(ctx, `${target.kind}/${target.slug}`, fn, body);
    const preview = target.kind === 'venue'
      ? venuePreview(data as Record<string, unknown> | null, target.page, canonical, lang)
      : formPreview(data as Record<string, unknown> | null, canonical);
    return preview ? rewrite(shellRes, preview) : plain();
  } catch {
    // Never let a preview problem break the guest page.
    return plain();
  }
}
