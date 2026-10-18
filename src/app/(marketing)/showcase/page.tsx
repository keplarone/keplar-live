import type { Metadata } from "next";
import { ShowcaseView } from "@/components/i18n/pages/ShowcaseView";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta(
  "/showcase",
  "Create showcase: what an app built with Keplar should look like",
  "Eight demo sites and apps made by the Keplar team to show the range Create aims for: menus, ledgers, boards, calendars and editorial pages, each in its own type and palette. Not customer sites.",
);

/** Rendered by the shared view so every locale shows the same page (src/components/i18n/pages/ShowcaseView.tsx). */
export default function ShowcaseIndex() {
  return <ShowcaseView />;
}
