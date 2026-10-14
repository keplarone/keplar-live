import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { allIdentities, identityViews, planView, providersView, spaceSession } from "@/lib/space-studio/account";
import { spaceCloudStatus } from "@/lib/space-studio/cloud";
import { ALLOWANCES, CREDIT_PACKS, creditBalance, effectivePlan, FAIR_RULES, MODELS, modelAllowed, PLANS, PRICES, PRICING_NOTE, publicView, TYPICAL_CREDITS } from "@/lib/space-studio/core";
import { loadCreditUsage, loadSubscription } from "@/lib/space-studio/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Space Studio account summary (contract: space-studio docs/api.md). Public: signed-out callers get { signedIn: false } with the
 * Free defaults and the model list (no account data). Everything plan-related comes from the stored Space Studio subscription.
 */
export async function GET(req: Request) {
  try {
    const providers = providersView();
    // Prices and allowances are public; checkoutOpen stays false until paid plans can actually be bought.
    const pricing = { published: true, checkoutOpen: false, note: PRICING_NOTE, prices: PRICES, allowances: ALLOWANCES, packs: CREDIT_PACKS, rules: FAIR_RULES, typicalCredits: TYPICAL_CREDITS };
    const s = await spaceSession(req);
    if (!s) {
      const f = PLANS.free;
      return json({
        signedIn: false, email: null, plan: planView(null), features: { cloud: false, cloudReason: "Sign in to use Space Studio.", maxCloudJobsConcurrent: 0, cloudMinutesMonthly: 0, storageMb: f.storageMb },
        models: MODELS.map((m) => publicView(m, false)), identities: identityViews([]), providers, robloxRequired: providers.roblox, robloxLinked: false, pricing, credits: null,
      });
    }
    const ws = await currentWorkspace(req);
    const now = Date.now();
    const [sub, ids, cloud, used] = await Promise.all([loadSubscription(ws.id), allIdentities(ws.id, s), spaceCloudStatus(ws.id, { now }), loadCreditUsage(ws.id, now)]);
    const plan = effectivePlan(sub, now);
    const f = PLANS[plan];
    return json({
      signedIn: true, email: s.email, plan: planView(sub, now),
      features: { cloud: f.cloud, cloudReason: cloud.allowed ? null : cloud.reason, maxCloudJobsConcurrent: f.maxConcurrentCloudJobs, cloudMinutesMonthly: f.cloudMinutesMonthly, storageMb: f.storageMb },
      models: MODELS.map((m) => publicView(m, modelAllowed(sub, now, m.id))),
      identities: identityViews(ids), providers, robloxRequired: providers.roblox, robloxLinked: ids.some((i) => i.provider === "roblox"), pricing,
      credits: creditBalance(plan, used, now),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
