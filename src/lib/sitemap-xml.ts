/** Small helpers for the hand-written sitemap route handlers (answers, templates, topics). */

/** XML-escapes a URL or date for a <loc>/<lastmod> (a slug with "&" must not break the file). */
export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function urlEntry(loc: string, lastmod?: string | null): string {
  return `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(lastmod.slice(0, 10))}</lastmod>` : ""}</url>`;
}

export function urlsetResponse(entries: string[]): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } }); // CDN-cached: crawlers re-reading a sitemap must not wake the database each time
}

/**
 * When the data behind a sitemap can't be read, answer 503 (retry later) instead of an empty 200: an empty sitemap tells
 * crawlers every URL in it is gone, while a 503 makes them keep the last good copy.
 */
export function sitemapUnavailable(): Response {
  return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "retry-after": "600", "cache-control": "no-store" } });
}
