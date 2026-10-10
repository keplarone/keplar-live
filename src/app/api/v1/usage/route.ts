/** GET /api/v1/usage -> plan, credits used and left this period, and this key's counters. Needs the "usage" scope. Spends nothing. */
import { meter } from "@/lib/create/platform/compute";
import { authenticateKey, publicKey } from "@/lib/api/keys";
import { API_POLICY } from "@/lib/api/policy";
import { preflight, v1Failure, v1Json } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  try {
    const { key, ws } = await authenticateKey(req, "usage");
    const m = await meter(ws);
    const pol = API_POLICY[ws.admin ? "business" : ws.plan];
    return v1Json({
      object: "usage",
      plan: ws.plan,
      credits: { used: m.used, total: m.total, left: m.total === null ? null : Math.max(0, m.total - m.used), resets_at: m.resetsAt },
      windows: (m.windows ?? []).map((w) => ({ id: w.id, used: w.used, limit: w.limit, resets_at: w.resetsAt })),
      key: { ...publicKey(key), limits: { per_minute: pol.keyPerMinute, per_day: pol.keyPerDay } },
    });
  } catch (e) {
    return v1Failure(e);
  }
}
