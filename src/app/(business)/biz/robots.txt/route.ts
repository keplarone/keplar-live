import { businessRobots } from "@/lib/business/seo";

export const dynamic = "force-static";

/** business.keplar.one/robots.txt (src/proxy.ts rewrites it here): the Business host's own, pointing at its own sitemap. */
export function GET() {
  return new Response(businessRobots(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
