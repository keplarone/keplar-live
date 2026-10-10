import { CompareTemplate } from "@/components/compare/CompareTemplate";
import { comparePages, hub } from "@/lib/compare";
import { pageMeta } from "@/lib/seo";

// noindex until approved; intentionally absent from sitemap, nav, and footer.
export const metadata = pageMeta(hub.path, hub.metaTitle, hub.metaDescription, { absoluteTitle: true, noindex: true });

export default function CompareHub() {
  return <CompareTemplate page={hub} related={comparePages} />;
}
