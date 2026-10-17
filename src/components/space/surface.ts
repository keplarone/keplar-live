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
 * Runs from the root layout before first paint. Marks the document when the visitor is already on Space Studio
 * so the shared sky node stays hidden even if this document was served for "/".
 */
export const SPACE_SKY_SCRIPT = `(function(){var h=location.hostname,p=location.pathname;if(h==="${SPACE_HOST}"||p==="/space-studio"||p.indexOf("/space-studio/")===0){document.documentElement.setAttribute("data-space-studio","");var s=document.createElement("style");s.textContent="html[data-space-studio] [data-site-sky]{display:none!important}";document.head.appendChild(s);}})();`;
