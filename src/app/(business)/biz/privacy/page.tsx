import type { Metadata } from "next";
import { BusinessDoc } from "@/components/business-site/BusinessDoc";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacy } from "@/components/legal/content/privacy";
import { PRODUCTION_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Keplar handles your questions, files, memory and account data: what is stored, who processes it, how long it is kept, and the controls you have.",
  // The same document as keplar.one/privacy: that copy is the one search engines index.
  alternates: { canonical: `${PRODUCTION_URL}/privacy` },
};

/** business.keplar.one/privacy: keplar.one's Privacy Policy, word for word, in the Business look. */
export default function BusinessPrivacyPage() {
  return (
    <BusinessDoc>
      <LegalPage doc={privacy} sibling={{ href: "/terms", label: "Keplar Terms of Service" }} />
    </BusinessDoc>
  );
}
