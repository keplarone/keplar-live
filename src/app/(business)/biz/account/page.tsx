import type { Metadata } from "next";
import { AccountSetup } from "@/components/business-site/AccountSetup";
import { annualDiscountPct } from "@/lib/business/tiers";

export const metadata: Metadata = { title: "Set up your account", robots: { index: false, follow: false } };

/** business.keplar.one/account: business account creation and plan checkout (signed in with the Keplar account). */
export default function BusinessAccountPage() {
  return <AccountSetup discountPct={annualDiscountPct()} />;
}
