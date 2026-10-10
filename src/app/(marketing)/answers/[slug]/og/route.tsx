import { openPublic, publicTitle } from "@/lib/growth/share-public";
import { renderOg } from "@/lib/og";

export const dynamic = "force-dynamic";

/** Share card for a public answer: the owner's own question as the title. Only for pages that are public right now. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const r = await openPublic((await ctx.params).slug).catch(() => null);
  if (!r || !r.question) return new Response("Not found", { status: 404 });
  const t = publicTitle(r.question);
  const res = await renderOg({ label: "Shared answer", title: t.length > 62 ? `${t.slice(0, 59)}…` : t, subtitle: "Several AI models, one answer, on Keplar" });
  res.headers.set("cache-control", "public, max-age=300, s-maxage=300");
  return res;
}
