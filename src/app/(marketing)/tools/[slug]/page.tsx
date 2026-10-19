import { notFound } from "next/navigation";
import { ToolPage } from "@/components/tools/ToolPage";
import { TOOLS, toolBySlug, toolPath } from "@/lib/free-tools/registry";
import { pageMeta } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const t = toolBySlug((await params).slug);
  if (!t) return {};
  return pageMeta(toolPath(t), t.metaTitle, t.metaDescription);
}

export default async function Page({ params }: Props) {
  const t = toolBySlug((await params).slug);
  if (!t) notFound();
  return <ToolPage tool={t} />;
}
