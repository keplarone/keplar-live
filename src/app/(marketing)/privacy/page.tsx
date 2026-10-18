import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacy } from "@/components/legal/content/privacy";

export const metadata: Metadata = pageMeta("/privacy", "Privacy Policy", "How Keplar handles your questions, files, memory and account data: what is stored, who processes it, how long it is kept, and the controls you have.");

export default function PrivacyPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Privacy", path: "/privacy" }])} />
      <LegalPage doc={privacy} sibling={{ href: "/terms", label: "Keplar Terms of Service" }} />
    </>
  );
}
