import { after } from "next/server";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { cloudOwner, control, jobOf, jobView, removeJob } from "@/lib/roblox-cloud/api";
import { triggerNext } from "@/lib/roblox-cloud/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 *   GET                                  -> { job }   (a job whose slice died is restarted here as well as by the daily cron)
 *   POST { action: pause|resume|stop }   -> { job }
 *   DELETE                               -> { removed } (not while it runs: stop it first)
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await cloudOwner(req, false);
    const job = await jobOf(ws, (await ctx.params).id);
    const active = job.status === "queued" || job.status === "running";
    const stale = active && (!job.leaseUntil || Date.parse(job.leaseUntil) < Date.now()) && Date.parse(job.heartbeatAt ?? job.updatedAt) < Date.now() - 60_000;
    if (stale) { try { after(triggerNext(job)); } catch { void triggerNext(job); } }
    return json({ job: jobView(job) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await cloudOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    const b = await body<{ action?: unknown }>(req);
    const next = await control(ws, job, b.action);
    if (b.action === "resume") { try { after(triggerNext(next)); } catch { void triggerNext(next); } }
    return json({ job: jobView(next) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await cloudOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    if (job.status === "queued" || job.status === "running") throw new HttpError(409, "Stop the job before deleting it.", "job_running");
    await removeJob(ws.id, job.id);
    return json({ removed: true }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}
