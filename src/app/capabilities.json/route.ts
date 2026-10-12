import { capabilitiesManifest } from "@/lib/content/product-facts";
import { isIndexable, site } from "@/lib/site";

export const dynamic = "force-static";

/**
 * /capabilities.json: every Keplar feature with its status, plans and per-product availability, as data, for search engines,
 * AI assistants and developers. Built from src/lib/content/product-facts.ts, the same source as /what-is-keplar and llms.txt,
 * so the three can never disagree.
 */
export function GET() {
  if (!isIndexable) return Response.json({ error: "Not available on this host." }, { status: 404 });
  return Response.json(capabilitiesManifest(site.url), { headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
