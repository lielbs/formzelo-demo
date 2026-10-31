/**
 * The app can be served from a sub-path (e.g. GitHub Pages: /<repo>/).
 * Vite exposes it as import.meta.env.BASE_URL ("/" locally). Every absolute
 * in-app href that bypasses React Router must go through appHref().
 */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');

/** "/f/x" -> "/<base>/f/x" (no-op when served from the domain root). */
export const appHref = (path: string) => `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;

export const publicBaseUrl = () => `${window.location.origin}${BASE_PATH}`;
export const publicFlowUrl = (slug: string, runId?: string) => `${publicBaseUrl()}/f/${slug}${runId ? `?r=${runId}` : ''}`;

/** Public repository of this demo (issues double as a zero-cost, clearly public contact form). */
export const REPO_URL = 'https://github.com/lielbs/formzelo-demo';
/** Public sales contact for the interest button. VITE_CONTACT_EMAIL (build time) overrides it. */
export const DEFAULT_CONTACT_EMAIL = 'contact@rockstackds.com';
export const CONTACT_EMAIL: string | undefined = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || DEFAULT_CONTACT_EMAIL;
