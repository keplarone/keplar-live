import { publishedRows } from "@/lib/trends/store";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Tracker pages that are published right now. lastmod = the day each was published. A paused tracker or a rollback removes the URL at once. */
export async function GET() {
  const rows = await publishedRows().catch(() => []);
  const urls = rows.length ? [`  <url><loc>${site.url}/topics</loc></url>`] : [];
  for (const r of rows) urls.push(`  <url><loc>${site.url}/topics/${r.id}</loc><lastmod>${(r.publishedAt ?? r.createdAt).slice(0, 10)}</lastmod></url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=600" } });
}
