import { site } from "@/lib/site";
import { xmlEscape } from "@/lib/sitemap-xml";

/**
 * Discoverable sitemap files. /sitemap-index.xml lists this. robots.txt points at the index only.
 * A new cluster or a shard of a programmatic collection is added here; the four
 * existing files stay at their current URLs.
 *
 * Google's limit is 50,000 URLs and 50 MB per file. SITEMAP_URL_CAP stays under both.
 */
export const SITEMAP_URL_CAP = 45_000;

export type SitemapRef = { /** Site path beginning with "/". */ path: string; lastmod?: string | null };

export const SITEMAP_FILES: SitemapRef[] = [
  { path: "/sitemap.xml" },
  { path: "/answers-sitemap.xml" },
  { path: "/templates-sitemap.xml" },
  { path: "/topics-sitemap.xml" },
];

/** robots.txt points at the sitemap index only. The index lists SITEMAP_FILES; those files stay at their URLs. */
export function robotsSitemapUrls(origin = site.url): string[] {
  return [`${origin}/sitemap-index.xml`];
}

export function sitemapIndexXml(files: SitemapRef[] = SITEMAP_FILES, origin = site.url): string {
  const body = files
    .map((f) => {
      const last = f.lastmod ? `<lastmod>${xmlEscape(f.lastmod.slice(0, 10))}</lastmod>` : "";
      return `  <sitemap><loc>${xmlEscape(`${origin}${f.path}`)}</loc>${last}</sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/**
 * File names for a collection that may grow past one sitemap.
 * The first file keeps the stable name (`answers-sitemap.xml`); further files are `answers-sitemap-2.xml`.
 */
export function shardNames(stem: string, count: number, cap = SITEMAP_URL_CAP): string[] {
  const n = Math.max(1, Math.ceil(Math.max(0, count) / cap));
  return Array.from({ length: n }, (_, i) => (i === 0 ? `${stem}.xml` : `${stem}-${i + 1}.xml`));
}

/** Slice `locs` into groups of at most `cap`, in order. */
export function shardLocs<T>(locs: T[], cap = SITEMAP_URL_CAP): T[][] {
  if (cap < 1) throw new Error("sitemap cap must be at least 1");
  if (locs.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < locs.length; i += cap) out.push(locs.slice(i, i + cap));
  return out;
}
