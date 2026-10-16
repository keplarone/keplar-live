import { errorResponse, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { allIdentities, identityViews, planView, providersView, spaceSession } from "@/lib/space-studio/account";
import { spaceCloudStatus } from "@/lib/space-studio/cloud";
import { effectivePlan, MODELS, modelAllowed, PLANS, PRICING_NOTE, publicView } from "@/lib/space-studio/core";
import { loadSubscription } from "@/lib/space-studio/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Space Studio account summary (contract: space-studio docs/api.md). Public: signed-out callers get { signedIn: false } with the
 * Free defaults and the model list (no account data). Everything plan-related comes from the stored Space Studio subscription.
 */
export async function GET(req: Request) {
  try {
    const providers = providersView();
    const pricing = { published: false, note: PRICING_NOTE };
    const s = await spaceSession(req);
    if (!s) {
      const f = PLANS.free;
      return json({
        signedIn: false, email: null, plan: planView(null), features: { cloud: false, cloudReason: "Sign in to use Space Studio.", maxCloudJobsConcurrent: 0, cloudMinutesMonthly: 0, storageMb: f.storageMb },
        models: MODELS.map((m) => publicView(m, false)), identities: identityViews([]), providers, robloxRequired: providers.roblox, robloxLinked: false, pricing,
      });
    }
    const ws = await currentWorkspace(req);
    const now = Date.now();
    const [sub, ids, cloud] = await Promise.all([loadSubscription(ws.id), allIdentities(ws.id, s), spaceCloudStatus(ws.id, { now })]);
    const f = PLANS[effectivePlan(sub, now)];
    return json({
      signedIn: true, email: s.email, plan: planView(sub, now),
      features: { cloud: f.cloud, cloudReason: cloud.allowed ? null : cloud.reason, maxCloudJobsConcurrent: f.maxConcurrentCloudJobs, cloudMinutesMonthly: f.cloudMinutesMonthly, storageMb: f.storageMb },
      models: MODELS.map((m) => publicView(m, modelAllowed(sub, now, m.id))),
      identities: identityViews(ids), providers, robloxRequired: providers.roblox, robloxLinked: ids.some((i) => i.provider === "roblox"), pricing,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
