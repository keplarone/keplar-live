import type { MetadataRoute } from "next";
import { isIndexable, site } from "@/lib/site";
import { SITEMAP_INDEX_PATH, sitemapUrls } from "@/lib/seo/sitemaps";

/**
 * Crawling is open for every page. Keplar's own pages carry no noindex; only private share links (/r, /c, /sp, /i) and preview
 * hosts do, and a crawler can only obey that if it may fetch the page. The private app pages sit behind real auth.
 * Only API routes and the dev outbox are disallowed: they are not pages.
 */
/** Search and AI-answer crawlers published by their operators: allowed, with the same API/dev exclusions as everyone else. */
export const REPUTABLE_CRAWLERS = [
  "Googlebot", "Google-Extended", "Bingbot", "DuckDuckBot", "Applebot", "Applebot-Extended",
  "OAI-SearchBot", "GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
  // More AI assistants and the open web corpus many models learn from (Common Crawl): the more of them can read Keplar's pages,
  // the more often answers can know and cite it.
  "CCBot", "Amazonbot", "Meta-ExternalAgent", "MistralAI-User", "DuckAssistBot",
] as const;

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const open = { allow: "/", disallow: ["/api/", "/dev/"] };
  return {
    // Named groups repeat the disallow list (a crawler obeys only its most specific group). These are the documented user agents of
    // the major search and AI-answer crawlers; naming them makes the policy explicit. Any other crawler falls under "*".
    rules: [{ userAgent: "*", ...open }, { userAgent: [...REPUTABLE_CRAWLERS], ...open }],
    // The index first, then every file it lists (src/lib/seo/sitemaps.ts): a crawler that reads only the index still sees
    // every URL, and one that ignores indexes still finds every file. Adding a sitemap there adds it here.
    sitemap: [`${site.url}${SITEMAP_INDEX_PATH}`, ...sitemapUrls()],
  };
}
