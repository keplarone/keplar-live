import { listPublic } from "@/lib/growth/share-public";
import { site } from "@/lib/site";
import { sitemapUnavailable, urlEntry, urlsetResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** Public shared answers only (opt-in, not taken down). lastmod = the day the owner made the page public. No answers = a valid empty urlset; a store error = 503 so crawlers keep the last list. */
export async function GET() {
  let list: Awaited<ReturnType<typeof listPublic>>;
  try { list = await listPublic(5000); } catch { return sitemapUnavailable(); }
  const urls = list.length ? [urlEntry(`${site.url}/answers`)] : [];
  for (const r of list) urls.push(urlEntry(`${site.url}/answers/${r.publicSlug}`, r.publicAt));
  return urlsetResponse(urls);
}
