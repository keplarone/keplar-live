import { promptCategories, promptCategoryBySlug } from "@/lib/kb/prompts";
import { renderOg } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return promptCategories.map((c) => ({ category: c.slug }));
}
export async function GET(_req: Request, ctx: { params: Promise<{ category: string }> }) {
  const c = promptCategoryBySlug((await ctx.params).category);
  return renderOg({ label: "Prompt library", title: `${c?.name ?? "Prompts"} prompts`, subtitle: `${c?.prompts.length ?? 0} copyable templates` });
}
