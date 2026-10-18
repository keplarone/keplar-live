import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { guides } from "@/lib/content/guides";
import { landingPages } from "@/lib/content/landing";
import { editorialPages } from "@/lib/content/editorial";
import { lastmodFor } from "@/lib/content/lastmod";
import { kbPaths } from "@/lib/kb/paths";
import { SHOWCASE } from "@/lib/create/showcase/data";
import { comparePages, hub as compareHub } from "@/lib/compare";
import { localizedSitemapAlternates, localizedSitemapEntries } from "@/lib/i18n/sitemap";
import { toolPaths } from "@/lib/seo/tools";

/**
 * Canonical, indexable, 200 public URLs only. /app, /api, auth, checkout and account are excluded (private or transactional);
 * The /compare pages were approved on 2026-10-12. lastmod is the real content date (src/lib/content/lastmod.ts).
 * changeFrequency and priority are omitted on purpose: Google ignores them.
 */
export const sitemapPaths: string[] = [
  "/",
  "/overview",
  "/what-is-keplar",
  "/product",
  "/how-it-works",
  "/keplar-one",
  "/for-you",
  "/features",
  "/showcase",
  ...SHOWCASE.map((i) => `/showcase/${i.slug}`),
  "/roadmap",
  "/pricing",
  "/download",
  "/inquire",
  "/for-developers",
  "/ai-app-builder",
  "/developers",
  "/about",
  "/models",
  "/privacy",
  "/terms",
  "/referral-terms",
  "/contact",
  "/help",
  "/security",
  "/specialists",
  "/simulation",
  "/space-studio",
  "/guides",
  ...editorialPages.map((p) => p.path),
  ...landingPages.map((p) => p.path),
  ...guides.map((g) => g.path),
  ...kbPaths().map((p) => p.path), // docs, blog, glossary, prompts, use cases, approved comparisons
  compareHub.path,
  ...comparePages.map((p) => p.path),
  ...toolPaths(),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const english = sitemapPaths.map((path) => {
    const d = lastmodFor(path);
    const languages = localizedSitemapAlternates(path);
    return { url: path === "/" ? site.url : `${site.url}${path}`, ...(d ? { lastModified: new Date(`${d}T12:00:00Z`) } : {}), ...(languages ? { alternates: { languages } } : {}) };
  });
  // Every translated page of every indexable locale, each with the same full set of alternates (src/lib/i18n/sitemap.ts).
  return [...english, ...localizedSitemapEntries((path) => lastmodFor(path))];
}
