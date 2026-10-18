import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { referralTerms } from "@/components/legal/content/referral";
import { referralConfig } from "@/lib/referrals/config";

export const metadata: Metadata = pageMeta("/referral-terms", "Keplar Referral Program Terms", "The terms of the Keplar referral program: who qualifies, how extra credit is earned for you and the friend you invite, and the limits that apply.");
export const dynamic = "force-dynamic"; // the amounts come from the live program settings

export default function ReferralTermsPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Referral terms", path: "/referral-terms" }])} />
      <LegalPage doc={referralTerms(referralConfig())} sibling={{ href: "/terms", label: "Keplar Terms of Service" }} />
    </>
  );
}
