import { BUSINESS_LASTMOD, businessSitemap } from "@/lib/business/seo";

export const dynamic = "force-static";

/** business.keplar.one/sitemap.xml: the Business host's one indexable page (the storefront), never keplar.one's URLs. */
export function GET() {
  return new Response(businessSitemap(BUSINESS_LASTMOD), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
