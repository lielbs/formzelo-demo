/**
 * The app can be served from a sub-path (e.g. GitHub Pages: /<repo>/).
 * Vite exposes it as import.meta.env.BASE_URL ("/" locally). Every absolute
 * in-app href that bypasses React Router must go through appHref().
 */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');

/** "/f/x" -> "/<base>/f/x" (no-op when served from the domain root). */
export const appHref = (path: string) => `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;

/** Image source of an asset: uploads are data URLs; demo showcase files are site-relative paths. */
export const assetSrc = (dataUrl: string) => (dataUrl.startsWith('data:') ? dataUrl : appHref(`/${dataUrl}`));

export const publicBaseUrl = () => `${window.location.origin}${BASE_PATH}`;
export const publicFlowUrl = (slug: string, runId?: string) => `${publicBaseUrl()}/f/${slug}${runId ? `?r=${runId}` : ''}`;

/** Public repository of this demo. Its historical name (formzelo-demo) is kept so the GitHub Pages URL never breaks. */
export const REPO_URL = 'https://github.com/lielbs/formzelo-demo';
/**
 * RockStack sales contact (the company selling Formangle) — NOT a business's own
 * Brand Kit email. VITE_CONTACT_EMAIL (build time) may override it with another valid address.
 */
export const DEFAULT_CONTACT_EMAIL = 'contact@rockstackds.com';
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

export function resolveSalesEmail(override?: string): string {
  const v = override?.trim();
  return v && EMAIL_RE.test(v) ? v : DEFAULT_CONTACT_EMAIL;
}

export const CONTACT_EMAIL = resolveSalesEmail(import.meta.env.VITE_CONTACT_EMAIL as string | undefined);

export function salesMailto(subject: string, body: string, email = CONTACT_EMAIL): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
