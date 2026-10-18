import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { InquireExperience } from "@/components/inquire/InquireExperience";

export const metadata: Metadata = pageMeta(
  "/inquire",
  "Talk to Keplar",
  "Deploying agents, integrating Keplar, exploring a partnership, or asking about Business plans? Talk directly with the Keplar team.",
);

export default function InquirePage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Talk to Keplar", path: "/inquire" }])} />
      <InquireExperience />
    </>
  );
}
