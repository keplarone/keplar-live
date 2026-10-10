import { allUseCases, getUseCase } from "@/lib/kb/usecases";
import { renderOg } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return allUseCases().map((u) => ({ slug: u.slug }));
}
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const u = getUseCase((await ctx.params).slug);
  const title = u?.title ?? "Keplar use cases";
  return renderOg({ label: "Use case", title: title.length > 62 ? `${title.slice(0, 59)}…` : title, subtitle: "How to use Keplar" });
}
