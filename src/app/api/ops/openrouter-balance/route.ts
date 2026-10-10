/**
 * GET /api/ops/openrouter-balance — OpenRouter credit balance for the external hourly check and the daily Vercel cron.
 * Auth: `Authorization: Bearer $OPS_CHECK_SECRET` (or Vercel Cron's `Bearer $CRON_SECRET`), compared in constant time.
 * With neither secret configured nobody is authorized. Rate limited per IP before the secret is checked.
 * Answers {totalCredits, totalUsage, remaining, percent, low, checkedAt}; when low, the owner gets one email per crossing
 * (src/lib/ops/openrouter-balance.ts). The OpenRouter key is never returned or logged.
 */
import { json } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { checkOpenRouterBalance, opsAuthorized } from "@/lib/ops/openrouter-balance";
import { logEvent } from "@/lib/ops/log";
import { cronBeat } from "@/lib/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    await rateLimit(`ip:${clientIpOf(req)}:ops-balance`, 20, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) {
      logEvent("warn", "security.rate_limited", { bucket: "ops-balance" }, req);
      return json({ error: e.message, code: "rate_limited" }, { status: 429, headers: { "retry-after": String(e.retryAfterSec) } });
    }
    throw e;
  }
  if (!opsAuthorized(req.headers.get("authorization"))) {
    logEvent("warn", "security.ops_auth_failed", { route: "ops/openrouter-balance" }, req);
    return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  }
  const r = await checkOpenRouterBalance();
  await cronBeat("openrouter-balance", r.ok);
  if (!r.ok) return json({ error: r.error, code: r.code, checkedAt: r.checkedAt }, { status: r.code === "not_configured" ? 503 : 502 });
  const { totalCredits, totalUsage, remaining, percent, low, checkedAt, alerted } = r;
  return json({ totalCredits, totalUsage, remaining, percent, low, checkedAt, alerted: Boolean(alerted) });
}
