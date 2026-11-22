/**
 * Browser error reports for the production app (UX audit 2026-11, C1). Sends the error text, a
 * shortened stack, the page path (never the query or fragment: manage and status links carry
 * their token there), the build and a coarse browser class. Nothing about the person: no name,
 * phone, email or form content. The server masks again whatever arrives.
 *
 * Never throws, never reports its own failures, at most 10 reports per page load, and the same
 * message only once. Demo mode keeps everything in the browser and reports nothing.
 */
import { runtimeConfiguration } from '../production/runtime';

export type ErrorKind = 'error' | 'rejection' | 'render';
export interface ErrorReport { kind: ErrorKind; route: string; message: string; stack?: string; build?: string; browser?: string }

const MAX_PER_PAGE = 10;
const seen = new Set<string>();
let sent = 0;

/** Removes anything personal a message could carry (also done on the server). */
export function scrub(text: string, max: number): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '<email>')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '<number>')
    .replace(/[A-Za-z0-9_-]{24,}/g, '<token>')
    .slice(0, max);
}

/** The page path only: no query, no fragment. */
export function routeOf(href: string): string {
  try {
    return scrub(new URL(href).pathname, 200);
  } catch {
    return scrub(href.split(/[?#]/)[0] ?? '', 200);
  }
}

/** The build, from the hashed entry script name (e.g. "index-DGhDXxpu"). */
export function buildOf(doc: Pick<Document, 'querySelector'> = document): string | undefined {
  const src = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src;
  return src?.split('/').pop()?.replace(/\.js$/, '').slice(0, 60);
}

/** A coarse browser class, never the full user agent. */
export function browserOf(ua: string): string {
  const name = /Edg\//.test(ua) ? 'edge' : /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox\//.test(ua) ? 'firefox'
    : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  return `${name} ${/Mobi|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop'}`;
}

/** Builds a report from anything thrown; null when there is nothing worth sending. */
export function toReport(kind: ErrorKind, error: unknown, href: string, ua: string, build?: string): ErrorReport | null {
  const e = error as { message?: unknown; stack?: unknown; name?: unknown } | null;
  const raw = typeof error === 'string' ? error : typeof e?.message === 'string' ? `${typeof e.name === 'string' ? `${e.name}: ` : ''}${e.message}` : '';
  const message = scrub(raw.trim(), 300);
  if (!message) return null;
  // Errors from browser extensions and cross-origin scripts carry no useful information.
  if (message === 'Script error.' || /chrome-extension:|moz-extension:/.test(String(e?.stack ?? ''))) return null;
  return {
    kind, route: routeOf(href), message,
    stack: typeof e?.stack === 'string' ? scrub(e.stack, 2000) : undefined,
    build, browser: browserOf(ua),
  };
}

/** Sends one report (fire and forget). */
export function reportError(kind: ErrorKind, error: unknown): void {
  if (runtimeConfiguration.mode !== 'production' || sent >= MAX_PER_PAGE) return;
  let report: ErrorReport | null = null;
  try {
    report = toReport(kind, error, window.location.href, navigator.userAgent, buildOf());
  } catch {
    return;
  }
  if (!report || seen.has(report.message)) return;
  seen.add(report.message);
  sent++;
  void (async () => {
    try {
      const [{ getProductionSupabaseClient }, { clientToken }] = await Promise.all([import('../production/supabaseClient'), import('../tables/data/client')]);
      const client = await getProductionSupabaseClient();
      await client.rpc('log_client_error', { p_report: { ...report }, p_client: clientToken() });
    } catch {
      // Reporting must never cause another error.
    }
  })();
}

/** Listens for uncaught errors and rejected promises (once per page). */
export function installErrorReporting(target: Pick<Window, 'addEventListener'> = window): void {
  if (runtimeConfiguration.mode !== 'production') return;
  target.addEventListener('error', (e: Event) => { const ev = e as ErrorEvent; reportError('error', ev.error ?? ev.message); });
  target.addEventListener('unhandledrejection', (e: Event) => reportError('rejection', (e as PromiseRejectionEvent).reason));
}
