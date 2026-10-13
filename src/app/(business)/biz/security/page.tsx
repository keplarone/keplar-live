import type { Metadata } from "next";
import { BusinessDoc } from "@/components/business-site/BusinessDoc";
import { SecurityContent } from "@/components/security/SecurityContent";
import { PRODUCTION_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security and vulnerability disclosure",
  description: "How to report a security problem to Keplar, what we ask of researchers, and an honest summary of what protects your account today.",
  alternates: { canonical: `${PRODUCTION_URL}/security` },
};

/** business.keplar.one/security: keplar.one's security page in the Business look. Account settings live on keplar.one. */
export default function BusinessSecurityPage() {
  return (
    <BusinessDoc>
      <SecurityContent accountOrigin={PRODUCTION_URL} />
    </BusinessDoc>
  );
}
