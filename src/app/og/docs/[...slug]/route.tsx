import { allDocs, docBySlug, docSections, sectionById } from "@/lib/kb/docs";
import { renderOg } from "@/lib/og";

/**
 * Share card for a docs page or section: /og/docs/<section> or /og/docs/<section>/<page>.
 * A route handler (not an opengraph-image file) because Next cannot place a file-based image under a catch-all segment.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [...docSections.map((x) => ({ slug: [x.id] })), ...allDocs().map((d) => ({ slug: d.slug.split("/") }))];
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const slug = (await ctx.params).slug;
  const d = docBySlug(slug.join("/"));
  const section = sectionById(slug[0])?.title ?? "";
  const title = d?.title ?? section ?? "Keplar docs";
  return renderOg({ label: `Docs · ${section}`.trim(), title: title.length > 58 ? `${title.slice(0, 55)}…` : title, subtitle: "Keplar docs" });
}
