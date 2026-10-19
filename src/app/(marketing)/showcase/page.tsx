import type { Metadata } from "next";
import { ShowcaseView } from "@/components/i18n/pages/ShowcaseView";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta(
  "/showcase",
  "Create showcase: eight demo sites and apps",
  "Eight demo sites and apps by the Keplar team showing the range Create aims for: menus, ledgers, boards, calendars and editorial pages, each in its own style.",
);

/** Rendered by the shared view so every locale shows the same page (src/components/i18n/pages/ShowcaseView.tsx). */
export default function ShowcaseIndex() {
  return <ShowcaseView />;
}
