import { sitemapIndexXml } from "@/lib/seo/sitemaps";

/** Sitemap index. Child files stay at their existing URLs; this file only lists them. */
export function GET() {
  return new Response(sitemapIndexXml(), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=600" },
  });
}
