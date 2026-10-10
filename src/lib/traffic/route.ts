/** Pure (no server imports): which page paths are counted, shared by the visit counter and the browser presence beacon. */
const SKIP_FIRST = new Set(["api", "_next", "admin", "s", "r", "dev", "mcp", "share", "verify-email", "reset-password", "secure-account", "two-factor", "forgot-password", ".well-known", "fx", "embed" /* framed widget on other sites */]);

/** The one coarse route to store for a page path ("/pricing"), or null for paths that are never counted. */
export function routeOf(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.length > 300) return null;
  if (/\.[a-z0-9]{1,6}$/i.test(pathname)) return null; // files: robots.txt, sitemap.xml, images, llms.txt
  const first = (pathname.split("/")[1] ?? "").toLowerCase();
  if (SKIP_FIRST.has(first)) return null;
  return first ? `/${first.slice(0, 40)}` : "/";
}

