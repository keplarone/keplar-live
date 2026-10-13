/**
 * GET /api/cron/observatory: daily Vercel Cron (hourly through Inngest when it is on, and on demand with OPS_CHECK_SECRET). Measures
 * every model's success, timeout and latency over the last 24 h against the 7 days before, alerts the owner once per model, kind
 * and day when one measurably got worse, and reports feature regressions (src/lib/ops/observatory.ts). Changes nothing by itself.
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) or `$OPS_CHECK_SECRET`, constant time; rate limited per IP first.
 */
import { json } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { opsAuthorized } from "@/lib/ops/openrouter-balance";
import { cronBeat } from "@/lib/ops/health";
import { runObservatory } from "@/lib/ops/observatory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await rateLimit(`ip:${clientIpOf(req)}:observatory`, 10, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: e.message, code: "rate_limited" }, { status: 429 });
    throw e;
  }
  if (!opsAuthorized(req.headers.get("authorization"))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const r = await runObservatory();
    await cronBeat("observatory", true);
    return json({ ok: true, drift: r.drift.length, alerted: r.alerted, regressions: r.regressions });
  } catch (e) {
    await cronBeat("observatory", false);
    return json({ ok: false, error: e instanceof Error ? e.name : "error" }, { status: 500 });
  }
}
