import type { Metadata } from "next";
import { FeaturesView } from "@/components/i18n/pages/FeaturesView";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/features", "Everything in Keplar", "Every Keplar feature on one page, grouped by what it is for: asking, reading files, creating sites and apps, shipping, API and trust, each marked live or beta.");

/** Rendered by the shared view so every locale shows the same page (src/components/i18n/pages/FeaturesView.tsx). */
export default function Features() {
  return <FeaturesView />;
}
