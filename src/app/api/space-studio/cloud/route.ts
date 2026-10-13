import { errorResponse, json } from "@/lib/create/platform/http";
import { jobs as blenderJobs, jobView as blenderView } from "@/lib/blender-cloud/model";
import { jobs as robloxJobs, jobView as robloxView } from "@/lib/roblox-cloud/model";
import { spaceOwner } from "@/lib/space-studio/account";
import { SPACE_PRODUCT, spaceCloudStatus } from "@/lib/space-studio/cloud";
import { effectivePlan, PLANS } from "@/lib/space-studio/core";
import { loadSubscription } from "@/lib/space-studio/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const newest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

/** GET -> { eligible, reason, plan, quotas, roblox: { jobs }, blender: { jobs } }. Ineligible: eligible false and empty lists, never an error. */
export async function GET(req: Request) {
  try {
    const ws = await spaceOwner(req, false);
    const now = Date.now();
    const [sub, d] = await Promise.all([loadSubscription(ws.id), spaceCloudStatus(ws.id, { now })]);
    const plan = effectivePlan(sub, now);
    const f = PLANS[plan];
    const quotas = { cloud: f.cloud, cloudReason: d.allowed ? null : d.reason, maxCloudJobsConcurrent: f.maxConcurrentCloudJobs, cloudMinutesMonthly: f.cloudMinutesMonthly, storageMb: f.storageMb };
    // Eligible = the plan includes cloud (a full concurrency/quota slot is reported in `reason`, but existing jobs stay visible).
    if (!f.cloud) return json({ eligible: false, reason: d.allowed ? null : d.reason, plan, quotas, roblox: { jobs: [] }, blender: { jobs: [] } });
    const [r, b] = await Promise.all([robloxJobs().list(ws.id, (j) => j.product === SPACE_PRODUCT), blenderJobs().list(ws.id, (j) => j.product === SPACE_PRODUCT)]);
    return json({ eligible: true, reason: d.allowed ? null : d.reason, plan, quotas, roblox: { jobs: r.sort(newest).map(robloxView) }, blender: { jobs: b.sort(newest).map(blenderView) } });
  } catch (e) {
    return errorResponse(e);
  }
}
