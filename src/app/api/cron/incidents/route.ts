/**
 * GET /api/cron/incidents: the incident detection sweep (src/lib/ops/incidents.ts). Reads the last 15 minutes of telemetry,
 * opens, updates and resolves incidents, and sends one deduplicated digest to the owner. Changes nothing in production.
 * Schedules: daily Vercel Cron (the Hobby plan allows daily only), every 5 minutes through Inngest when it is on, and every
 * 5 minutes from .github/workflows/ops-monitor.yml when the OPS_CHECK_SECRET repository secret is set. Overlapping runs are
 * harmless (a 2-minute lock in the sweep).
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) or `$OPS_CHECK_SECRET`, constant time; rate limited per IP first.
 */
import { json } from "@/lib/create/platform/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { opsAuthorized } from "@/lib/ops/openrouter-balance";
import { cronBeat } from "@/lib/ops/health";
import { runIncidentSweep } from "@/lib/ops/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await rateLimit(`ip:${clientIpOf(req)}:incidents`, 20, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: e.message, code: "rate_limited" }, { status: 429 });
    throw e;
  }
  if (!opsAuthorized(req.headers.get("authorization"))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const r = await runIncidentSweep();
    await cronBeat("incidents", true);
    return json({ ok: true, skipped: r.skipped ?? null, open: r.detected.map((d) => ({ key: d.key, sev: d.sev })), opened: r.opened, resolved: r.resolved, notified: r.notified });
  } catch (e) {
    await cronBeat("incidents", false);
    console.error("[incidents] sweep failed:", e instanceof Error ? e.name : "error");
    return json({ ok: false, error: e instanceof Error ? e.name : "error" }, { status: 500 });
  }
}
