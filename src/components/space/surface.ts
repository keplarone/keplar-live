import { SPACE_HOST } from "@/lib/site";

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
