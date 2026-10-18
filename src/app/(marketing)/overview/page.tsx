import { SkyHome } from "@/components/sky/SkyHome";
import { Pricing } from "@/components/sections/Pricing";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "/overview",
  "What Keplar is",
  "Keplar asks multiple AI models your question, finds where they disagree, and gives you one synthesized answer. The product, how it works, and a live demo.",
);

/**
 * The marketing landing (Oct 2026, src/components/sky), moved off / when the chat became the home page.
 * Hero, product window, feature list, how it works, use cases, the live demo (#demo) and pricing.
 */
export default function OverviewPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "About Keplar", path: "/overview" }])} />
      <SkyHome pricing={<Pricing showCompute={false} phoneFeatures={3} />} />
    </>
  );
}
