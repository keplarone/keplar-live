import type { MetadataRoute } from "next";
import { robotsSitemapUrls } from "@/lib/seo/sitemaps";
import { isIndexable } from "@/lib/site";

/**
 * Crawling is open for every page. Keplar's own pages carry no noindex, except an unapproved comparison
 * (src/lib/kb/vs.ts). Private share links (/r, /c, /sp, /i) and preview hosts are noindex too, and a crawler can only
 * obey that if it may fetch the page. The private app pages sit behind real auth.
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
    sitemap: robotsSitemapUrls(),
  };
}
