import { notFound } from "next/navigation";
import { CompareTemplate } from "@/components/compare/CompareTemplate";
import { comparePages, hub } from "@/lib/compare";
import { pageMeta } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return comparePages.map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = comparePages.find((p) => p.slug === slug);
  if (!page) return {};
  // noindex until approved; intentionally absent from sitemap, nav, and footer.
  return pageMeta(page.path, page.metaTitle, page.metaDescription, { absoluteTitle: true, noindex: true });
}

export default async function ComparePageRoute({ params }: Props) {
  const { slug } = await params;
  const page = comparePages.find((p) => p.slug === slug);
  if (!page) notFound();
  return <CompareTemplate page={page} related={[hub, ...comparePages.filter((p) => p.slug !== slug)]} />;
}
