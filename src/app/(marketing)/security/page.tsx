import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta } from "@/lib/seo";
import { SecurityContent } from "@/components/security/SecurityContent";

export const metadata = pageMeta("/security", "Security and vulnerability disclosure", "How to report a security problem to Keplar, what we ask of researchers, and an honest summary of what protects your account today.");

/** Disclosure policy and a plain summary of protections (src/components/security/SecurityContent.tsx, shared with Keplar Business). */
export default function SecurityPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Security", path: "/security" }])} />
      <SecurityContent />
    </>
  );
}
