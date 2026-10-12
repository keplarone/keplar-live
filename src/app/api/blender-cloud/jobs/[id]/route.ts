import { after } from "next/server";
import { control, jobOf, removeJob, renderOwner } from "@/lib/blender-cloud/api";
import { jobView } from "@/lib/blender-cloud/model";
import { triggerNext } from "@/lib/blender-cloud/worker";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 *   GET                                  -> { job }   (a render whose watcher died is picked up again here and by the daily cron)
 *   POST { action: pause|resume|stop }   -> { job }
 *   DELETE                               -> { removed } (deletes its machine and files; not while it renders)
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await renderOwner(req, false);
    const job = await jobOf(ws, (await ctx.params).id);
    const watched = job.status === "queued" || job.status === "rendering";
    const stale = watched && (!job.leaseUntil || Date.parse(job.leaseUntil) < Date.now()) && Date.parse(job.heartbeatAt ?? job.updatedAt) < Date.now() - 60_000;
    if (stale) { try { after(triggerNext(job)); } catch { void triggerNext(job); } }
    return json({ job: jobView(job) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await renderOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    const b = await body<{ action?: unknown }>(req);
    return json({ job: jobView(await control(ws, job, b.action)) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await renderOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    if (job.status === "queued" || job.status === "rendering") throw new HttpError(409, "Stop the render before deleting it.", "job_running");
    await removeJob(job);
    return json({ removed: true }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}
