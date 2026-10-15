/**
 * Background re-check of custom domains (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * without CRON_SECRET set this endpoint answers 401 to everyone.
 * The same daily run is the backstop for durable background jobs (platform/queue.ts): it resumes or fails jobs whose instance
 * died and that nobody has looked at since (status reads resume them sooner).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { recheckDue } from "@/lib/domains/service";
import { purgeDueSites } from "@/lib/site-builder/deletion";
import { cronBeat } from "@/lib/ops/health";
import { reapJobs } from "@/lib/create/platform/queue";
// Register the job handlers the reaper may need to run.
import "@/lib/create/media";
import "@/lib/business/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  // No secret configured = nobody is authorized (never an open endpoint).
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const started = Date.now();
    const checked = await recheckDue();
    const sites = await purgeDueSites(); // also finalizes deleted sites whose undo window passed
    const jobs = await reapJobs({ limit: 25, deadline: started + 100_000 }).catch(() => []);
    const r = json({ ok: true, ...checked, sites, jobs: jobs.length });
    await cronBeat("domains", true);
    return r;
  } catch {
    await cronBeat("domains", false);
    return json({ error: "Re-check failed.", code: "internal" }, { status: 500 });
  }
}
