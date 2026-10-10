/**
 * Sitemap entries for the localized pages. Only indexable (stable) locales are listed, each URL with alternates for every
 * indexable locale plus x-default, as Google asks (each language version lists all of them, itself included).
 * Size: pages × indexable locales URLs (8 × 25 today, ~200); at 130 indexable locales it would be ~1,000 URLs, still far
 * under the 50,000-URL / 50 MB limit of one sitemap file, so no sitemap index is needed for this set.
 */
import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { INDEXABLE } from "./locales";
import { INDEXABLE_PATHS, hreflangFor, localizedPath } from "./routing";

const absolute = (path: string) => (path === "/" ? site.url : `${site.url}${path}`);
const languagesFor = (path: string) => Object.fromEntries(Object.entries(hreflangFor(path)).map(([k, v]) => [k, absolute(v)]));

/** Alternates for an English sitemap entry, or null when the page has no localized versions. */
export function localizedSitemapAlternates(path: string): Record<string, string> | null {
  return INDEXABLE_PATHS.includes(path as (typeof INDEXABLE_PATHS)[number]) ? languagesFor(path) : null;
}

export function localizedSitemapEntries(lastmod: (path: string) => string | null | undefined): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const path of INDEXABLE_PATHS) {
    const languages = languagesFor(path);
    const d = lastmod(path);
    for (const l of INDEXABLE) {
      if (l.code === "en") continue;
      out.push({ url: absolute(localizedPath(path, l.code)), ...(d ? { lastModified: new Date(`${d}T12:00:00Z`) } : {}), alternates: { languages } });
    }
  }
  return out;
}
