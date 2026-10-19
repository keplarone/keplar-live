/**
 * The source classes a visit is filed under: where the first page view came from. Pure and dependency-free because the
 * browser (src/lib/seo/attribution.ts, checkout) and the server (src/lib/seo/events.ts, the store) both read it.
 */
export const SEO_SOURCES = ["search", "ai", "social", "direct", "other", "internal"] as const;
export type SeoSource = (typeof SEO_SOURCES)[number];
