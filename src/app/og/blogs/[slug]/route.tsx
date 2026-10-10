import { allPosts, postBySlug } from "@/lib/kb/blog";
import { renderOg } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const p = postBySlug((await ctx.params).slug);
  const title = p?.title ?? "Keplar blog";
  return renderOg({ label: p?.category ?? "Blog", title: title.length > 62 ? `${title.slice(0, 59)}…` : title, subtitle: "By Hassen and Hussain Keder" });
}
