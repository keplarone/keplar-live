import { allDocs, sectionById } from "@/lib/kb/docs";
import { plain } from "@/lib/kb/md";

export const dynamic = "force-static";

/** Small static search index for the docs: title, description, headings, keywords. Built at build time. */
export function GET() {
  const body = allDocs().map((d) => ({
    p: d.path,
    t: d.title,
    d: d.description,
    s: sectionById(d.section)?.title ?? d.section,
    h: d.nodes.filter((n) => n.t === "h2" || n.t === "h3").map((n) => plain((n as { text: string }).text)).join(" · "),
    k: d.keywords.join(" "),
  }));
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
