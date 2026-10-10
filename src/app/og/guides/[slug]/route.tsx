import { guideBySlug, guides } from "@/lib/content/guides";
import { renderOg } from "@/lib/og";

/**
 * Share card for a guide: /og/guides/<slug>. A route handler like /og/blogs and /og/docs, not an opengraph-image file under
 * guides/[slug]: that file used generateImageMetadata, whose URL (/guides/<slug>/opengraph-image-<hash>/og) was never
 * prerendered or served in production (404 on keplar.one), so every guide shared without a card.
 */
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await ctx.params).slug);
  if (!g) return new Response("Not found", { status: 404 });
  return renderOg({ label: "Guide", title: g.title.length > 58 ? `${g.title.slice(0, 55)}…` : g.title, subtitle: "By Hassen and Hussain Keder" });
}
