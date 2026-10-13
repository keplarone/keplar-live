import type { Metadata } from "next";
import { BusinessDoc } from "@/components/business-site/BusinessDoc";
import { LegalPage } from "@/components/legal/LegalPage";
import { terms } from "@/components/legal/content/terms";
import { PRODUCTION_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Keplar: accounts, plans and billing, acceptable use, your content, and the limits of AI-generated answers.",
  // The same document as keplar.one/terms: that copy is the one search engines index.
  alternates: { canonical: `${PRODUCTION_URL}/terms` },
};

/** business.keplar.one/terms: keplar.one's Terms of Service, word for word, in the Business look. */
export default function BusinessTermsPage() {
  return (
    <BusinessDoc>
      <LegalPage doc={terms} sibling={{ href: "/privacy", label: "Privacy at Keplar" }} />
    </BusinessDoc>
  );
}
