import { CompareTemplate } from "@/components/compare/CompareTemplate";
import { comparePages, hub } from "@/lib/compare";
import { pageMeta } from "@/lib/seo";
import { clusterAlso } from "@/lib/seo/clusters";

// Approved for publishing on 2026-10-12: indexable and listed in the sitemap.
export const metadata = pageMeta(hub.path, hub.metaTitle, hub.metaDescription, { absoluteTitle: true });

export default function CompareHub() {
  return <CompareTemplate page={hub} related={comparePages} also={clusterAlso(hub.path)} />;
}
