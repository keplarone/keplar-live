import { Suspense } from "react";
import { Pricing } from "@/components/sections/Pricing";
import { Faq } from "@/components/sections/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { TrackOnMount } from "@/components/growth/TrackOnMount";
import { PlanFit } from "@/components/growth/pricing/PlanFit";
import { PlanCompare } from "@/components/growth/pricing/PlanCompare";
import { PricingContext } from "@/components/growth/pricing/PricingContext";
import { PricingClosing } from "@/components/growth/pricing/PricingClosing";
import { pageMeta } from "@/lib/seo";
import { softwareApp } from "@/lib/structuredData";
import { breadcrumbs } from "@/lib/seo-graph";
import { faq } from "@/lib/faq";
import { pricingContext, pricingFaq } from "@/lib/growth/pricing-page";

export const metadata = pageMeta(
  "/pricing",
  "Keplar Pricing: Free, Lite $20, Plus $45, Pro $99",
  "Start free with 50 questions a day. Keplar Lite is $20/month, Plus $45/month and Pro $99/month, billed monthly, cancel any time. Business plans are separate.",
);

/** General questions kept on the pricing page next to the pricing ones (one FAQPage block per page). */
const GENERAL = ["Does Keplar ask every AI model every time?", "What happens when the models disagree?", "Is Keplar for personal use or for businesses?", "Who created Keplar?"];

export default function PricingPage() {
  const entries = [...pricingFaq(), ...faq.filter((f) => GENERAL.includes(f.q))];
  return (
    <div style={{ paddingTop: "calc(var(--l-nav-h) + var(--l-nav-offset))" }}>
      <Suspense fallback={null}>
        <PricingContext notes={pricingContext} />
      </Suspense>
      <Pricing headingLevel="h1" />
      <PlanFit />
      <PlanCompare />
      <Faq title="Pricing questions" entries={entries} />
      <PricingClosing />
      <JsonLd data={softwareApp()} />
      <JsonLd data={breadcrumbs([{ name: "Pricing", path: "/pricing" }])} />
      <TrackOnMount event="pricing_view" />
    </div>
  );
}
