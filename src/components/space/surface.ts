import { BUSINESS_HOST, DOCS_HOST, SPACE_HOST } from "@/lib/site";

/**
 * Space Studio is its own site: space.keplar.one, and the /space-studio routes on keplar.one.
 * Those pages keep the original star field. They do not use the shared cloud sky, its weather lookup, or the liquid-glass lens.
 */
export function isSpaceStudioSurface(host: string, pathname: string): boolean {
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (name === SPACE_HOST) return true;
  return pathname === "/space-studio" || pathname.startsWith("/space-studio/");
}

/**
 * Set on window before hydration, and only for the space host. space.keplar.one rewrites "/" to "/space-studio",
 * so the server render sees "/space-studio" while the browser's first render sees "/". A DOM write here would
 * itself mismatch hydration. The flag lets both renders skip the sky; route changes on keplar.one use the path.
 */
export const SPACE_HOST_FLAG = "__KEPLAR_SPACE";

export const SPACE_SKY_SCRIPT = `(function(){if(location.hostname==="${SPACE_HOST}")window.${SPACE_HOST_FLAG}=1})();`;

export function spaceHostFlag(): boolean {
  if (typeof window === "undefined") return false;
  return (window as Window & { [SPACE_HOST_FLAG]?: number })[SPACE_HOST_FLAG] === 1;
}

/** True when this render should leave the shared cloud sky unmounted. */
export function hideSharedSky(pathname: string, hostFlag = spaceHostFlag()): boolean {
  return hostFlag || isSpaceStudioSurface("", pathname);
}

const bare = (pathname: string) => pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** The chat home and /app. Marketing pages, including the moved landing at /overview, are not. */
export function isChatSurface(pathname: string): boolean {
  const p = bare(pathname);
  return p === "/" || p === "/app" || p.startsWith("/app/");
}

/** Hosts that serve a different site at "/". The chat sky rule must not follow them. */
export function isProductHost(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  return name !== SPACE_HOST && name !== BUSINESS_HOST && name !== DOCS_HOST;
}

/**
 * Hide the cloud sky on the chat before paint. Space, Business and Docs hosts rewrite "/" to their own
 * pages, so they are skipped. The attribute is on <html> (suppressHydrationWarning); client navigations
 * update it from SpaceSkyExempt.
 */
export const APP_SURFACE_SCRIPT = `(function(){var h=location.hostname;if(h==="${SPACE_HOST}"||h==="${BUSINESS_HOST}"||h==="${DOCS_HOST}")return;var p=location.pathname.replace(/\\/+$/,"")||"/";if(p==="/"||p==="/app"||p.indexOf("/app/")===0)document.documentElement.setAttribute("data-app-surface","")})();`;
