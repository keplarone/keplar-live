import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta } from "@/lib/seo";
import { SecurityContent } from "@/components/security/SecurityContent";

export const metadata = pageMeta("/security", "Keplar Security and Vulnerability Disclosure", "How to report a security problem to Keplar, what to include, what is in scope and what to expect after you report.");

/** Disclosure policy and a plain summary of protections (src/components/security/SecurityContent.tsx, shared with Keplar Business). */
export default function SecurityPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Security", path: "/security" }])} />
      <SecurityContent />
    </>
  );
}
