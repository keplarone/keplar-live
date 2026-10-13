import type { Metadata } from "next";
import { BusinessDoc } from "@/components/business-site/BusinessDoc";
import { StatusContent } from "@/components/status/StatusContent";
import { PRODUCTION_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Status",
  description: "Is Keplar up? Live checks of the website, accounts and data, answers, checkout and scheduled jobs.",
  alternates: { canonical: `${PRODUCTION_URL}/status` },
};

/** business.keplar.one/status: the same live checks as keplar.one/status (one set of servers), in the Business look. */
export default function BusinessStatusPage() {
  return (
    <BusinessDoc>
      <StatusContent />
    </BusinessDoc>
  );
}
