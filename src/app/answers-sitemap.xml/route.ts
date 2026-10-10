import { listPublic } from "@/lib/growth/share-public";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Public shared answers only (opt-in, not taken down). lastmod = the day the owner made the page public. Empty list = valid empty urlset. */
export async function GET() {
  const list = await listPublic(5000).catch(() => []);
  const urls = list.length ? [`  <url><loc>${site.url}/answers</loc></url>`] : [];
  for (const r of list) urls.push(`  <url><loc>${site.url}/answers/${r.publicSlug}</loc><lastmod>${r.publicAt!.slice(0, 10)}</lastmod></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=600" } });
}
