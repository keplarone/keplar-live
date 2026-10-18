import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { StatusContent } from "@/components/status/StatusContent";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta("/status", "Status", "Is Keplar up? Live checks of the website, accounts and data, answers, checkout and scheduled jobs.");

/** The live checks (src/components/status/StatusContent.tsx, shared with Keplar Business). */
export default function StatusPage() {
  return <StatusContent />;
}
