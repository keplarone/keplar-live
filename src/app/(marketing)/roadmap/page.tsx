import type { Metadata } from "next";
import { RoadmapView } from "@/components/i18n/pages/RoadmapView";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/roadmap", "Roadmap", "What Keplar is building now, what is in beta and still being finished, and what shipped recently. No target dates we cannot keep.");

/** Rendered by the shared view so every locale shows the same page; the open-work list lives in the marketing catalog (src/components/i18n/pages/RoadmapView.tsx). */
export default function Roadmap() {
  return <RoadmapView />;
}
