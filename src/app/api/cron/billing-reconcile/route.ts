/**
 * GET /api/cron/billing-reconcile: daily subscription reconciliation (src/lib/billing/reconcile.ts). Report only: compares
 * workspace plans with billing status, refunds, App Store state and webhook claims, and emails the owner what disagrees.
 * It never changes a plan, a credit or a charge.
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) or `$OPS_CHECK_SECRET`, constant time; rate limited per IP first.
 */
import { json } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { opsAuthorized } from "@/lib/ops/openrouter-balance";
import { cronBeat } from "@/lib/ops/health";
import { runReconciliation } from "@/lib/billing/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await rateLimit(`ip:${clientIpOf(req)}:billing-reconcile`, 10, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: e.message, code: "rate_limited" }, { status: 429 });
    throw e;
  }
  if (!opsAuthorized(req.headers.get("authorization"))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const r = await runReconciliation();
    await cronBeat("billing-reconcile", true);
    const counts: Record<string, number> = {};
    for (const f of r.findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    return json({ ok: true, checked: r.checked, findings: counts, alerted: r.alerted });
  } catch (e) {
    await cronBeat("billing-reconcile", false);
    console.error("[billing reconcile] failed:", e instanceof Error ? e.name : "error");
    return json({ ok: false, error: e instanceof Error ? e.name : "error" }, { status: 500 });
  }
}
