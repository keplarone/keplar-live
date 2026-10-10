import type { MetadataRoute } from "next";
import { isIndexable, site } from "@/lib/site";

/**
 * Crawling is open for every page that carries a noindex tag (/app, /signin, /signup, /welcome, /account, /checkout, ...):
 * a crawler can only obey noindex if it may fetch the page, and blocking would leave the bare URL eligible to be listed.
 * Those routes also send an X-Robots-Tag: noindex header (next.config.ts), and the private ones sit behind real auth.
 * Only API routes and the dev outbox are disallowed: they are not pages.
 */
/** Search and AI-answer crawlers published by their operators: allowed, with the same API/dev exclusions as everyone else. */
export const REPUTABLE_CRAWLERS = [
  "Googlebot", "Google-Extended", "Bingbot", "DuckDuckBot", "Applebot", "Applebot-Extended",
  "OAI-SearchBot", "GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
] as const;

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const open = { allow: "/", disallow: ["/api/", "/dev/"] };
  return {
    // Named groups repeat the disallow list (a crawler obeys only its most specific group). These are the documented user agents of
    // the major search and AI-answer crawlers; naming them makes the policy explicit. Any other crawler falls under "*".
    rules: [{ userAgent: "*", ...open }, { userAgent: [...REPUTABLE_CRAWLERS], ...open }],
    sitemap: [`${site.url}/sitemap.xml`, `${site.url}/answers-sitemap.xml`, `${site.url}/templates-sitemap.xml`, `${site.url}/topics-sitemap.xml`],
  };
}
