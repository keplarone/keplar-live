import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { InquireExperience } from "@/components/inquire/InquireExperience";

export const metadata: Metadata = pageMeta(
  "/inquire",
  "Talk to Keplar",
  "Deploying agents, integrating Keplar, exploring a partnership, or asking about Business plans? Talk directly with the Keplar team.",
);

export default function InquirePage() {
  return <InquireExperience />;
}
