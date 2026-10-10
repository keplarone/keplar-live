/**
 * Per-site class namespace. The design system's base primitives are written once with a `k-` prefix; serving every site with
 * the same class names is one of the tells of generated sites. At render time the prefix is swapped for a three-letter prefix
 * derived from the site id (HTML class attributes and CSS class selectors only), so each site ships its own class vocabulary.
 * Stored files keep the canonical `k-` names (the generator, linter and editor all speak that), and the swap is exact and reversible.
 */
import { hash32 } from "./variation";

const ALPHA = "abcdefghjkmnpqrstuvwxyz";

/** Three letters, never starting with "k" (so it cannot be mistaken for the canonical prefix) and never equal to the 2-letter project prefixes. */
export function sitePrefix(siteId: string): string {
  let p = "";
  for (let i = 0; p.length < 3; i++) {
    const c = ALPHA[hash32(`ns:${siteId}:${i}`) % ALPHA.length];
    if (p.length === 0 && c === "k") continue;
    p += c;
  }
  return p;
}

export function nsHtml(html: string, prefix: string): string {
  return html.replace(/(\bclass\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre: string, q: string, dq: string | undefined, sq: string | undefined) => {
    const val = dq ?? sq ?? "";
    const next = val.replace(/(^|\s)k-(?=[a-z0-9_])/gi, `$1${prefix}-`);
    if (next === val) return m;
    return `${pre}${q[0]}${next}${q[0]}`;
  });
}

export function nsCss(css: string, prefix: string): string {
  return css.replace(/\.k-(?=[a-z0-9_])/gi, `.${prefix}-`);
}

/** Reverse (used by tests and by anything that reads served markup back into canonical form). */
export function unNsHtml(html: string, prefix: string): string {
  return html.replace(/(\bclass\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre: string, q: string, dq: string | undefined, sq: string | undefined) => {
    const val = dq ?? sq ?? "";
    const next = val.replace(new RegExp(`(^|\\s)${prefix}-(?=[a-z0-9_])`, "gi"), "$1k-");
    return next === val ? m : `${pre}${q[0]}${next}${q[0]}`;
  });
}
