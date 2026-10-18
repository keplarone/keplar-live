import type { Metadata } from "next";
import { FeaturesView } from "@/components/i18n/pages/FeaturesView";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/features", "Keplar Features: Every Tool and Its Status", "Every Keplar feature in one list, with the plan it needs and whether it is live or in beta: multi-model answers, Study, Deep Research, Create, Studio and more.");

/** Rendered by the shared view so every locale shows the same page (src/components/i18n/pages/FeaturesView.tsx). */
export default function Features() {
  return <FeaturesView />;
}
