import { publishedRows } from "@/lib/trends/store";
import { site } from "@/lib/site";
import { sitemapUnavailable, urlEntry, urlsetResponse } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** Tracker pages that are published right now. lastmod = the day each was published. A paused tracker or a rollback removes the URL at once. */
export async function GET() {
  let rows: Awaited<ReturnType<typeof publishedRows>>;
  try { rows = await publishedRows(); } catch { return sitemapUnavailable(); }
  const urls = rows.length ? [urlEntry(`${site.url}/topics`)] : [];
  for (const r of rows) urls.push(urlEntry(`${site.url}/topics/${r.id}`, r.publishedAt ?? r.createdAt));
  return urlsetResponse(urls);
}
