import { latestRelease, releases } from "@/lib/kb/changelog";
import { brand, site } from "@/lib/site";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const at = (d: string) => `${d}T12:00:00Z`;

/** Atom feed of the release notes (same data as /changelog). */
export function GET() {
  const entries = releases
    .map(
      (r) =>
        `  <entry>\n    <id>${site.url}/changelog#${r.id}</id>\n    <title>${esc(r.title)}</title>\n    <link rel="alternate" href="${site.url}/changelog#${r.id}"/>\n    <updated>${at(r.date)}</updated>\n    <summary>${esc(r.summary)}</summary>\n    <content type="html">${esc(`<ul>${r.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`)}</content>\n  </entry>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <id>${site.url}/changelog</id>\n  <title>${esc(brand.name)} release notes</title>\n  <link rel="self" href="${site.url}/changelog/feed.xml"/>\n  <link rel="alternate" href="${site.url}/changelog"/>\n  <updated>${at(latestRelease())}</updated>\n  <author><name>${esc(brand.name)} Team</name></author>\n${entries}\n</feed>\n`;
  return new Response(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
