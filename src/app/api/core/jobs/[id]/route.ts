/**
 * Keplar Core background work ("Keep working"): a deep answer that reached its time limit before the checks passed.
 *   GET  /api/core/jobs/:id            the job (status, steps, result when done)
 *   GET  /api/core/jobs/:id?advance=1  also starts the next slice in the background when one is due (the open tab drives it)
 *   POST /api/core/jobs/:id {keepGoing} keep working until the checks pass or the plan's background limit is reached
 * Owner only. Paid plans are charged for each slice's model spend; Free uses :free models only. The daily cron
 * (/api/cron/core) also continues jobs nobody is watching.
 */
import { after } from "next/server";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { chargeSlice, mayContinue } from "@/lib/core/billing";
import { budgetFor } from "@/lib/core/config";
import { getJob, jobRows, jobView, runSlice, type CoreJob } from "@/lib/core/jobs";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, ctx: Ctx): Promise<{ ws: Workspace; job: CoreJob }> {
  const ws = await currentWorkspace(req);
  const { id } = await ctx.params;
  const job = await getJob(ws.id, String(id).slice(0, 80));
  if (!job) throw new HttpError(404, "Not found.", "not_found");
  return { ws, job };
}

const due = (j: CoreJob) => j.status === "running" && (!j.leaseUntil || Date.parse(j.leaseUntil) < Date.now());

async function slice(ws: Workspace, j: CoreJob) {
  const ok = await mayContinue(ws, budgetFor(j.plan, j.depth).usd);
  if (!ok.ok) {
    await jobRows().update(ws.id, j.id, { status: "paused", error: ok.why });
    return;
  }
  let usd = 0;
  await runSlice(j, { onUsd: (u) => { usd = u; } });
  if (usd > 0) await chargeSlice(ws, usd, `core-job:${j.id}`).catch(() => undefined);
}

function kick(ws: Workspace, j: CoreJob) {
  const p = slice(ws, j).catch((e) => console.error("[core] slice failed:", e instanceof Error ? e.name : "error"));
  try { after(p); } catch { /* outside a request scope: the promise still runs */ }
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { ws, job } = await load(req, ctx);
    await limitRequest(req, "core-job", { perIp: 900, perAccount: 900, accountId: ws.id, windowSec: 3600 });
    if (new URL(req.url).searchParams.get("advance") === "1" && due(job)) kick(ws, job);
    return json(jobView(job));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const { ws, job } = await load(req, ctx);
    await limitRequest(req, "core-job-start", { perIp: 60, perAccount: 60, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ keepGoing?: unknown }>(req);
    if (job.status === "done" || job.status === "failed") return json(jobView(job));
    if (b.keepGoing === false) {
      await jobRows().update(ws.id, job.id, { keepGoing: false, status: job.status === "running" ? "paused" : job.status });
      return json(jobView((await getJob(ws.id, job.id)) ?? job));
    }
    const ok = await mayContinue(ws, budgetFor(job.plan, job.depth).usd);
    if (!ok.ok) throw new HttpError(402, ok.why, "limit");
    await jobRows().update(ws.id, job.id, { keepGoing: true, status: "running", error: undefined });
    const fresh = (await getJob(ws.id, job.id)) ?? job;
    if (due(fresh)) kick(ws, fresh);
    return json(jobView(fresh));
  } catch (e) {
    return errorResponse(e);
  }
}
