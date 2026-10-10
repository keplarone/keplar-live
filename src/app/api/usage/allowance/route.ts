/**
 * GET /api/usage/allowance — Free plan daily heavy-feature allowance (OWNER-PENDING, flag `freeDailyLimits`, default OFF).
 * Off: { enabled: false } and the UI shows nothing (Free stays limited by the 50-questions/day count and the free-model pool).
 * On: per feature { limit, used, left } for today (UTC), counted per signed-in account from the cost meter's rollups.
 */
import { errorResponse, json } from "@/lib/create/platform/http";
import { requireAccount } from "@/lib/create/platform/workspace";
import { costConfig } from "@/lib/cost/config";
import { FEATURE_LABELS, type FeatureId } from "@/lib/cost/features";
import { userUsage } from "@/lib/cost/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await requireAccount(req);
    const cfg = await costConfig();
    if (!cfg.flags.freeDailyLimits) return json({ enabled: false });
    const now = new Date();
    const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
    if (ws.plan !== "free") return json({ enabled: true, plan: ws.plan, applies: false, resetsAt });
    const heavy = await Promise.all(
      (Object.entries(cfg.freeDaily.heavy) as [FeatureId, number][]).map(async ([feature, limit]) => {
        const used = ws.anonymous ? 0 : Math.min(limit, (await userUsage(ws.id, feature).catch(() => null))?.requests ?? 0);
        return { feature, label: FEATURE_LABELS[feature], limit, used, left: Math.max(0, limit - used) };
      }),
    );
    return json({ enabled: true, plan: "free", applies: true, signedIn: !ws.anonymous, questionsPerDay: ws.anonymous ? cfg.freeDaily.anonQuestions : cfg.freeDaily.questions, heavy, resetsAt, upgradeUrl: "/pricing" });
  } catch (e) {
    return errorResponse(e);
  }
}
