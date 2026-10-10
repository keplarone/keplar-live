import { listGallery } from "@/lib/templates/store";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The gallery and every template that may be shown right now: Keplar starters and community templates that are live. Hidden, pending and withdrawn ones are absent. */
export async function GET() {
  const list = await listGallery().catch(() => []);
  const urls = [`  <url><loc>${site.url}/templates</loc></url>`, ...list.map((t) => `  <url><loc>${site.url}/templates/${t.slug}</loc>${t.publishedAt ? `<lastmod>${t.publishedAt.slice(0, 10)}</lastmod>` : ""}</url>`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=600" } });
}
