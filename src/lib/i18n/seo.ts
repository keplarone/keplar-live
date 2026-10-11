/**
 * Metadata for the localized pages: translated title and description, a self-canonical in the page's locale, hreflang to every
 * indexable locale plus x-default (English), og:locale with its alternates. Every locale is indexable, Beta ones included; auth
 * pages (sign in, sign up) stay noindex.
 */
import type { Metadata } from "next";
import { site } from "@/lib/site";
import { INDEXABLE, localeInfo } from "./locales";
import { INDEXABLE_PATHS, localeAlternates } from "./routing";
import { getMessages } from "./server";
import type { MarketingMessages } from "./types";

type PageKey = keyof MarketingMessages["meta"];
const PATH: Record<PageKey, string> = { home: "/", features: "/features", pricing: "/pricing", showcase: "/showcase", roadmap: "/roadmap", developers: "/developers", signin: "/signin", signup: "/signup" };

export async function localeMetadata(locale: string, page: PageKey): Promise<Metadata> {
  const m = (await getMessages(locale, "marketing")).meta[page];
  const info = localeInfo(locale);
  const path = PATH[page];
  const alternates = localeAlternates(path, locale);
  const indexable = INDEXABLE_PATHS.includes(path as (typeof INDEXABLE_PATHS)[number]);
  const fullTitle = page === "home" ? m.title : `${m.title} · ${site.name}`;
  return {
    title: page === "home" ? { absolute: m.title } : m.title,
    description: m.description,
    alternates,
    openGraph: {
      type: "website",
      siteName: site.name,
      url: alternates.canonical,
      title: fullTitle,
      description: m.description,
      locale: info.og,
      alternateLocale: indexable ? INDEXABLE.filter((l) => l.code !== locale).map((l) => l.og) : undefined,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${site.name}: ${site.tagline}` }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: m.description },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}
