import { listGallery } from "@/lib/templates/store";
import { site } from "@/lib/site";
import { sitemapUnavailable, urlEntry, urlsetResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** The gallery and every template that may be shown right now: Keplar starters and community templates that are live. Hidden, pending and withdrawn ones are absent. */
export async function GET() {
  let list: Awaited<ReturnType<typeof listGallery>>;
  try { list = await listGallery(); } catch { return sitemapUnavailable(); }
  return urlsetResponse([urlEntry(`${site.url}/templates`), ...list.map((t) => urlEntry(`${site.url}/templates/${t.slug}`, t.publishedAt))]);
}
