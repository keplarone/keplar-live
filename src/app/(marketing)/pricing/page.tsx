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
import { tiers } from "@/lib/tiers";
import { softwareApp } from "@/lib/structuredData";
import { breadcrumbs } from "@/lib/seo-graph";
import { faq } from "@/lib/faq";
import { pricingContext, pricingFaq } from "@/lib/growth/pricing-page";

/** "Free, Lite $20, Plus $45, Pro $99" and "Keplar Lite is $20 a month, …", from src/lib/tiers.ts so the metadata cannot drift from the plans. */
const PLAN_LINE = tiers.filter((t) => t.price !== null).map((t) => (t.price ? `${t.name.replace(/^Keplar /, "")} $${t.price}` : t.name)).join(", ");
const PLAN_SENTENCE = `${tiers.filter((t) => t.price).map((t) => `${t.name} is $${t.price} a month`).join(", ")}.`;

export const metadata = pageMeta(
  "/pricing",
  `Pricing: ${PLAN_LINE}`,
  `Start free. ${PLAN_SENTENCE} Business plans are at business.keplar.one. Usage you can see, never hidden.`,
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
