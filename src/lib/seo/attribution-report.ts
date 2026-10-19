/**
 * Paid plan payments by landing page for /admin/seo, from the payment rows the verified Whop webhook stored with their
 * first-touch attribution (src/lib/seo/attribution.ts). Server only: it reads the platform store.
 */
import { collection } from "@/lib/create/platform/store";
import type { Attribution } from "./attribution";

type PaidRow = { id: string; workspaceId: string; at: string; plan?: string; amountUsd?: number; refundedAt?: string; attribution?: Attribution };
export type PaidByLanding = { landing: string; src: string; payments: number; amountUsd: number | null };

/** Paid plan payments of the last `days` days grouped by landing page and source class. Only rows the webhook stored with attribution count; the rest are reported as one "(no attribution)" line so the share is visible. */
export async function paidByLanding(days = 90, now = Date.now()): Promise<PaidByLanding[]> {
  const since = new Date(now - days * 864e5).toISOString();
  const rows = (await collection<PaidRow>("whop_payments").listSystem().catch(() => [])) as PaidRow[];
  const by = new Map<string, PaidByLanding>();
  for (const r of rows) {
    if (r.at < since || r.refundedAt) continue;
    const key = r.attribution ? `${r.attribution.landing}\u0000${r.attribution.src}` : "(no attribution)\u0000";
    const cur = by.get(key) ?? { landing: r.attribution?.landing ?? "(no attribution)", src: r.attribution?.src ?? "", payments: 0, amountUsd: null };
    cur.payments += 1;
    if (typeof r.amountUsd === "number") cur.amountUsd = (cur.amountUsd ?? 0) + r.amountUsd;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.payments - a.payments || a.landing.localeCompare(b.landing));
}
