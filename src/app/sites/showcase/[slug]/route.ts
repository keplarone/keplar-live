/**
 * Curated Create showcase demo at /sites/showcase/<slug> (framed by /showcase pages). Static HTML, no scripts, strict site CSP,
 * never indexed. Under /sites/ so next.config.ts leaves it out of the app CSP and X-Frame-Options and the gallery can frame it.
 */
import { siteHeaders } from "@/lib/site-builder/render";
import { showcaseBySlug } from "@/lib/create/showcase/data";
import { renderShowcase } from "@/lib/create/showcase/render";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const it = showcaseBySlug((await params).slug);
  if (!it) return new Response("Not found", { status: 404, headers: siteHeaders("preview", "text/plain; charset=utf-8") });
  return new Response(renderShowcase(it), { headers: { ...siteHeaders("preview", "text/html; charset=utf-8", { scripts: false }), "cache-control": "public, max-age=300, s-maxage=86400" } });
}
