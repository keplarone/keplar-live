import type { Metadata } from "next";
import { site } from "./site";
import { localeAlternates } from "./i18n/routing";
import { pageOgUrl } from "./og-page";

/**
 * Per-page metadata helper. Next.js replaces nested openGraph/twitter objects
 * rather than merging them, so every page passes its own. Use this for every
 * route's `export const metadata`. Default share images point at the site-wide cards; a route that ships its own
 * opengraph-image / twitter-image file overrides them (file-based metadata wins).
 */
const SHARE_ALT = `${site.name}: ${site.tagline}`;

/**
 * Routes that ship their own opengraph-image file. Setting openGraph.images in metadata would override that file-based card,
 * so these pages must not set one (tests/seo-meta.test.ts keeps this list equal to the files on disk).
 */
export const OWN_SHARE_IMAGE = new Set([
  "/about", "/ai-answer-engine", "/blender-ai", "/roblox-studio-ai", "/ai-app-builder", "/ai-fact-check", "/ai-slideshow-maker", "/ai-study-tool", "/ai-vs-agi-vs-superintelligence", "/chatgpt-alternative",
  "/compare-ai-models", "/for-founders", "/for-researchers", "/for-small-business", "/for-students", "/for-writers", "/keplar-one", "/models", "/multi-model-ai",
  "/pricing", "/si-vs-ai", "/superintelligence",
]);

export function pageMeta(
  path: string,
  title: string,
  description: string,
  opts: { noindex?: boolean; absoluteTitle?: boolean; article?: { published: string; modified: string; authors?: string[] }; image?: string } = {},
): Metadata {
  const fullTitle = opts.absoluteTitle ? title : `${title} · ${site.name}`;
  const own = OWN_SHARE_IMAGE.has(path);
  // A page without its own card file gets a card with its own title (signed, see og-page.ts), else the site-wide card.
  const titled = opts.image || own || opts.noindex ? null : pageOgUrl(title);
  const image = opts.image ?? titled;
  const ogImages = image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : own ? {} : { images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SHARE_ALT }] };
  return {
    title: opts.absoluteTitle ? { absolute: title } : title,
    description,
    // Pages with localized versions also list them (hreflang + x-default); every other page keeps a plain self-canonical.
    alternates: localeAlternates(path, "en"),
    openGraph: opts.article
      ? { title: fullTitle, description, url: path, type: "article", siteName: site.name, locale: "en_US", ...ogImages, publishedTime: opts.article.published, modifiedTime: opts.article.modified, authors: opts.article.authors ?? [`${site.name} Team`] }
      : { title: fullTitle, description, url: path, type: "website", siteName: site.name, locale: "en_US", ...ogImages },
    twitter: { card: "summary_large_image", title: fullTitle, description, ...(image ? { images: [image] } : own ? {} : { images: ["/twitter-image"] }) },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Absolute URL for structured data. */
export const abs = (path = "/") => `${site.url}${path === "/" ? "/" : path}`;
