/**
 * The Space Studio cloud gate. Roblox Cloud and Blender Cloud jobs created from Space Studio (job.product === "space-studio")
 * are allowed by the Space Studio plan stored on the server (core cloudDecision), never by anything the client sends.
 * Called when a job is created (POST /api/space-studio/cloud/jobs) and again by both workers whenever a slice picks a job up
 * (every slice re-claims the job, so this also runs at each slice boundary); a job whose access ended stops safely there.
 */
import { HttpError } from "@/lib/create/platform/http";
import { jobs as blenderJobs, isActive as blenderActive } from "@/lib/blender-cloud/model";
import { jobs as robloxJobs } from "@/lib/roblox-cloud/model";
import { cloudDecision, effectivePlan, PLANS, type CloudDecision } from "./core";
import { loadSubscription, minutesThisMonth } from "./store";

export const SPACE_PRODUCT = "space-studio" as const;
export const SPACE_CLOUD_ENDED = "Space Studio cloud access ended";

/** Space Studio jobs of this workspace that are running or about to (both clouds), optionally not counting one job. */
export async function runningSpaceJobs(wsId: string, excludeJobId?: string): Promise<number> {
  const [r, b] = await Promise.all([
    robloxJobs().list(wsId, (j) => j.product === SPACE_PRODUCT && (j.status === "queued" || j.status === "running") && j.id !== excludeJobId),
    blenderJobs().list(wsId, (j) => j.product === SPACE_PRODUCT && blenderActive(j.status) && j.id !== excludeJobId),
  ]);
  return r.length + b.length;
}

/** The decision for this workspace right now (no throw). */
export async function spaceCloudStatus(wsId: string, opts: { excludeJobId?: string; now?: number } = {}): Promise<CloudDecision> {
  const now = opts.now ?? Date.now();
  const [sub, runningJobs, minutes] = await Promise.all([loadSubscription(wsId), runningSpaceJobs(wsId, opts.excludeJobId), minutesThisMonth(wsId, now)]);
  return cloudDecision(sub, now, { runningJobs, minutesThisMonth: minutes });
}

/** Throws 403 { code } when the workspace's Space Studio plan does not allow (another) cloud job now. */
export async function requireSpaceCloud(ws: { id: string }, opts: { excludeJobId?: string; now?: number } = {}): Promise<Extract<CloudDecision, { allowed: true }>> {
  const d = await spaceCloudStatus(ws.id, opts);
  if (!d.allowed) throw new HttpError(403, d.reason, d.code, { plan: d.plan });
  return d;
}

/** For the workers: may this already-created Space Studio job keep running? (The job itself is not counted against concurrency.) */
export async function spaceJobMayRun(wsId: string, jobId: string, now?: number): Promise<boolean> {
  try {
    return (await spaceCloudStatus(wsId, { excludeJobId: jobId, now })).allowed;
  } catch {
    return false; // fail closed: if the plan can't be read, the job stops at this boundary (history and outputs are kept)
  }
}

/**
 * Plan-level check for the follow-up Roblox Cloud / Blender Cloud routes (upload, start, pause, review, download): a Space Studio
 * Pro, Team or Enterprise subscription counts like a Keplar Lite-Pro plan there. Concurrency and minutes are still enforced when
 * a job is created and every time a worker slice picks it up.
 */
export async function hasSpaceCloudPlan(wsId: string, now = Date.now()): Promise<boolean> {
  return PLANS[effectivePlan(await loadSubscription(wsId), now)].cloud;
}
