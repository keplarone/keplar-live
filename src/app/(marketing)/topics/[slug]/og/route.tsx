import { livePage } from "@/lib/trends/store";
import { renderOg } from "@/lib/og";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const r = await livePage((await ctx.params).slug);
  if (!r?.page) return new Response("Not found", { status: 404 });
  const res = await renderOg({ label: "Topic", title: r.page.term.length > 40 ? `${r.page.term.slice(0, 37)}…` : r.page.term, subtitle: "What it means and how to check claims about it" });
  res.headers.set("cache-control", "public, max-age=300, s-maxage=300");
  return res;
}
