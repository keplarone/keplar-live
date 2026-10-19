import { sitemapIndexXml } from "@/lib/seo/sitemaps";

/** /sitemap-index.xml: one file that points at every sitemap (src/lib/seo/sitemaps.ts). Static: the list changes only with a deploy. */
export const dynamic = "force-static";

export function GET() {
  return new Response(sitemapIndexXml(), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600" } });
}
