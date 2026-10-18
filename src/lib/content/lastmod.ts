/**
 * Truthful <lastmod> for the sitemap. Each date is the day the page's content last changed in a way a reader would notice.
 * It is NOT the build or request time. When you edit a page's copy, update its date here (tests/seo-sitemap.test.ts checks
 * every sitemap path has one and that none is in the future). Pages generated from content files read the file's own date.
 */
import { guides } from "./guides";
import { editorialPages } from "./editorial";
import { aboutPage } from "./about-page";
import { modelsPage } from "./models-page";
import { kbLastmod } from "../kb/paths";

/** Hand-maintained static pages: path -> ISO date of last content change. */
export const staticLastmod: Record<string, string> = {
  "/": "2026-10-18",
  "/overview": "2026-10-18",
  "/what-is-keplar": "2026-10-11",
  "/features": "2026-10-06",
  "/showcase": "2026-10-06",
  "/roadmap": "2026-10-06",
  "/product": "2026-10-11",
  "/how-it-works": "2026-10-17",
  "/keplar-one": "2026-10-11",
  "/for-you": "2026-10-01",
  "/pricing": "2026-10-06",
  "/ai-app-builder": "2026-10-06",
  "/download": "2026-10-03",
  "/agents": "2026-09-28",
  "/enterprise": "2026-10-01",
  "/inquire": "2026-09-27",
  "/privacy": "2026-10-12",
  "/developers": "2026-10-04",
  "/terms": "2026-10-01",
  "/referral-terms": "2026-10-04",
  // Added to the sitemap on 2026-10-17; dates are each page's last content commit.
  "/contact": "2026-10-10",
  "/help": "2026-10-14",
  "/security": "2026-10-13",
  "/specialists": "2026-10-14",
  "/simulation": "2026-10-11",
  "/space-studio": "2026-10-14",
  "/guides": "2026-10-01",
  // Landing and use-case pages (src/lib/content/landing.ts). The FAQ wording on /ai-answer-engine changed on 2026-10-03.
  "/ai-answer-engine": "2026-10-03",
  "/compare-ai-models": "2026-10-01",
  "/chatgpt-alternative": "2026-10-01",
  "/ai-study-tool": "2026-10-01",
  "/ai-slideshow-maker": "2026-10-01",
  "/ai-fact-check": "2026-10-01",
  "/roblox-studio-ai": "2026-10-11",
  "/blender-ai": "2026-10-11",
  "/for-students": "2026-10-01",
  "/for-writers": "2026-10-04",
  "/for-founders": "2026-10-01",
  "/for-researchers": "2026-10-01",
  "/for-small-business": "2026-10-01",
  "/for-developers": "2026-10-17", // src/lib/growth/developers-page.ts (meta shortened 2026-10-17)
  // Comparison pages (src/lib/compare.ts): published 2026-10-12 with Keplar's prices updated from the plan data.
  "/compare": "2026-10-12",
  "/compare/perplexity-model-council": "2026-10-12",
  "/compare/poe": "2026-10-12",
  "/compare/chathub": "2026-10-12",
};

export function lastmodFor(path: string): string | undefined {
  const g = guides.find((x) => x.path === path);
  if (g) return g.updated;
  const e = [...editorialPages, aboutPage, modelsPage].find((x) => x.path === path);
  if (e) return e.updated;
  if (path.startsWith("/showcase/")) return staticLastmod["/showcase"];
  if (path === "/tools" || path.startsWith("/tools/")) return "2026-10-17";
  return staticLastmod[path] ?? kbLastmod(path);
}
