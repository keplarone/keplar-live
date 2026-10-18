import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { InquireExperience } from "@/components/inquire/InquireExperience";

export const metadata: Metadata = pageMeta(
  "/inquire",
  "Talk to Keplar: Partnerships and Business",
  "Talk to the Keplar team about partnerships, the API, embedding Keplar on your site or Keplar Business for your company.",
);

export default function InquirePage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Talk to Keplar: Partnerships and Business", path: "/inquire" }])} />
      <InquireExperience />
    </>
  );
}
