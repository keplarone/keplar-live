/**
 * GET /api/cron/cost-guard — daily Vercel Cron (and on-demand with OPS_CHECK_SECRET): OpenRouter balance check, per-feature
 * negative-margin check with auto-throttle, cost anomaly alerts, cost-event retention (src/lib/cost/watch.ts).
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) or `$OPS_CHECK_SECRET`, constant time; rate limited per IP first.
 */
import { json } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { opsAuthorized } from "@/lib/ops/openrouter-balance";
import { cronBeat } from "@/lib/ops/health";
import { runCostWatch } from "@/lib/cost/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await rateLimit(`ip:${clientIpOf(req)}:cost-guard`, 10, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: e.message, code: "rate_limited" }, { status: 429 });
    throw e;
  }
  if (!opsAuthorized(req.headers.get("authorization"))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const r = await runCostWatch({ trigger: "cron" });
    await cronBeat("cost-guard", true);
    return json({ ok: true, balance: r?.balance, margin: r?.margin, throttled: r?.throttled ?? [], alerts: r?.alerts ?? 0, anomalies: (r?.anomalies ?? []).length });
  } catch (e) {
    await cronBeat("cost-guard", false);
    return json({ ok: false, error: e instanceof Error ? e.name : "error" }, { status: 500 });
  }
}
