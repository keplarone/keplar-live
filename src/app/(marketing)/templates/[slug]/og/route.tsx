import { renderOg } from "@/lib/og";
import { openTemplate } from "@/lib/templates/store";

export const dynamic = "force-dynamic";

/** Share card for a template that may be shown right now (live and not withdrawn, hidden or deleted). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const t = await openTemplate((await ctx.params).slug).catch(() => null);
  if (!t) return new Response("Not found", { status: 404 });
  const title = t.view.title;
  const res = await renderOg({ label: "Website template", title: title.length > 62 ? `${title.slice(0, 59)}…` : title, subtitle: "Remix it on Keplar" });
  res.headers.set("cache-control", "public, max-age=300, s-maxage=300");
  return res;
}
