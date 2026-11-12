/**
 * Clickjacking guard. The site is static (GitHub Pages), so it cannot send `frame-ancestors` or
 * `X-Frame-Options`. Instead, screens that act with someone's authority refuse to run inside
 * another site's frame. Customer forms and booking pages stay embeddable (owners embed them),
 * and same-origin frames (the page-design preview) are allowed.
 */
const PROTECTED: RegExp[] = [
  /^\/app(\/|$)/,
  /^\/operator(\/|$)/,
  /^\/invite(\/|$)/,
  /^\/reset(\/|$)/,
  /^\/track(\/|$)/,
  /^\/t\/(r|w)(\/|$)/,
];

/** `path` is the route path without the deploy base (e.g. `/app/tables`). */
export function isFrameProtectedPath(path: string): boolean {
  return PROTECTED.some((re) => re.test(path));
}

/** True when this window is framed by a page on another origin (or one we cannot inspect). */
interface FrameView { self: unknown; top: { location: { origin: string } } | null; location: { origin: string } }

export function framedByOtherOrigin(win: FrameView): boolean {
  if (!win.top || win.top === win.self) return false;
  try {
    return win.top.location.origin !== win.location.origin;
  } catch {
    return true;
  }
}

export function routePath(pathname: string, basePath: string): string {
  return basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
}
