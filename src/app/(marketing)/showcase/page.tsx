import type { Metadata } from "next";
import { ShowcaseView } from "@/components/i18n/pages/ShowcaseView";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta(
  "/showcase",
  "Sites Built With Keplar Create: Showcase",
  "Eight demo sites and apps built with Keplar Create, each designed for its brief: no purple glow, no three-card grid. See them live, then build your own.",
);

/** Rendered by the shared view so every locale shows the same page (src/components/i18n/pages/ShowcaseView.tsx). */
export default function ShowcaseIndex() {
  return <ShowcaseView />;
}
