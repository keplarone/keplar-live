import type { Metadata } from "next";
import { Storefront } from "@/components/business-site/Storefront";
import { annualDiscountPct } from "@/lib/business/tiers";

export const metadata: Metadata = {
  title: "Keplar Business: the AI operating system for your business",
  description: "Research, design, build, automate and deploy from one desktop workspace. Plans from $199 a month, Enterprise by contract.",
  alternates: { canonical: "https://business.keplar.one/" },
};

/** business.keplar.one (src/proxy.ts businessHost rewrites / here): pricing, account status, download and sales inquiries. */
export default function BusinessLanding() {
  return <Storefront discountPct={annualDiscountPct()} />;
}
