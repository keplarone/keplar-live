/**
 * Keplar Core daily run (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`; without
 * CRON_SECRET this answers 401 to everyone.
 *   1. continues background "Keep working" jobs nobody is watching (paid slices are charged; Free uses :free models only);
 *   2. runs the self-development pipeline (src/lib/core/selfdev/pipeline.ts): calibration, canary promote/rollback with a
 *      breaker, one guarded candidate eval on free models, scheduled eval + failure replay, gap finding, new candidates and
 *      code proposals (proposals are only queued for admin review, never applied).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { workspaceById } from "@/lib/create/platform/workspace";
import { chargeSlice, mayContinue } from "@/lib/core/billing";
import { budgetFor, coreDisabledByEnv } from "@/lib/core/config";
import { sweepJobs } from "@/lib/core/jobs";
import { runCorePipeline } from "@/lib/core/selfdev/pipeline";
import { engineDeps } from "@/lib/orchestration/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  const started = Date.now();
  let jobs: unknown = null;
  try {
    jobs = await sweepJobs(5, 80_000, {
      may: async (j) => { const ws = await workspaceById(j.workspaceId); return Boolean(ws && (await mayContinue(ws, budgetFor(j.plan, j.depth).usd)).ok); },
      charge: (j, usd) => chargeSlice(j.workspaceId, usd, `core-job:${j.id}`),
    });
  } catch (e) {
    jobs = { error: e instanceof Error ? e.name : "error" };
  }
  let pipeline: unknown = null;
  if (!coreDisabledByEnv()) {
    try {
      pipeline = await runCorePipeline({ deps: () => engineDeps({ keyTier: "free" }), deadline: started + 280_000 });
    } catch (e) {
      console.error("[core] pipeline failed:", e instanceof Error ? e.message : e);
      pipeline = { error: e instanceof Error ? e.name : "error" };
    }
  }
  return json({ ok: true, jobs, pipeline, ms: Date.now() - started });
}
