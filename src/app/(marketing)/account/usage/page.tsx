import { notFound } from "next/navigation";
import { costConfig } from "@/lib/cost/config";
import { FreeAllowance } from "@/components/usage/FreeAllowance";
import { OverageSettings } from "@/components/usage/OverageSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage", robots: { index: false, follow: true } };

/** Account → Usage: Free daily allowance and paid pay-as-you-go settings. Hidden (404) until the owner turns either flag on. */
export default async function UsagePage() {
  const cfg = await costConfig();
  if (!cfg.flags.freeDailyLimits && !cfg.flags.overage) notFound();
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "var(--s-16) var(--l-gutter) var(--s-24)", display: "grid", gap: "var(--s-6)" }}>
      <h1 style={{ fontSize: "var(--t-title)", fontWeight: "var(--w-regular)", letterSpacing: "var(--tr-title)", margin: 0 }}>Usage</h1>
      <FreeAllowance />
      <OverageSettings />
    </div>
  );
}
