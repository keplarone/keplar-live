/**
 * The registry of every sitemap keplar.one publishes. One place to add a sitemap: robots.txt and the sitemap index both read
 * this list, so a new content family (tools, reports, a programmatic cluster) is discovered by crawlers the moment its sitemap
 * route exists. Each child file stays under the sitemaps.org limits (50,000 URLs, 50 MB); a family that outgrows one file
 * splits into several entries here rather than growing one file.
 */
import { site } from "@/lib/site";

export type SitemapEntry = {
  /** Path of the sitemap file, e.g. "/sitemap.xml". */
  path: string;
  /** What it lists, for the admin page and docs. */
  holds: string;
  /** "static" = generated at build from content files; "dynamic" = read from the store on request. */
  kind: "static" | "dynamic";
};

export const SITEMAPS: readonly SitemapEntry[] = [
  { path: "/sitemap.xml", holds: "Marketing pages, docs, blog, glossary, prompts, use cases, guides, comparisons and their localized versions", kind: "static" },
  { path: "/answers-sitemap.xml", holds: "Public shared answers (opt-in)", kind: "dynamic" },
  { path: "/templates-sitemap.xml", holds: "Community and starter templates that are live", kind: "dynamic" },
  { path: "/topics-sitemap.xml", holds: "Published trend topic pages", kind: "dynamic" },
] as const;

/** Path of the sitemap index that lists every file above. */
export const SITEMAP_INDEX_PATH = "/sitemap-index.xml";

export const sitemapUrls = () => SITEMAPS.map((s) => `${site.url}${s.path}`);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The sitemap index XML. No <lastmod>: each child file carries real per-URL dates, and an index date would be a build time. */
export function sitemapIndexXml(urls: string[] = sitemapUrls()): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <sitemap><loc>${esc(u)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}
