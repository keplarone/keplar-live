import { CalmOverview } from "@/components/marketing/CalmOverview";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/overview",
  "What Keplar is",
  "Keplar asks multiple AI models your question, finds where they disagree, and gives you one synthesized answer. The product, how it works, and pricing.",
);

/** The marketing page, on the same solid graphite surface as the chat. */
export default function OverviewPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "About Keplar", path: "/overview" }])} />
      <CalmOverview />
    </>
  );
}
