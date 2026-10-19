/**
 * Keplar Growth Intelligence jobs (Vercel Cron, daily; see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`; without
 * CRON_SECRET this endpoint answers 401 to everyone. Daily jobs run every day, weekly ones on Mondays, monthly ones on the 1st
 * (src/lib/growth/ops/runner.ts: one run per job per period, pause controls, timeouts, budgets, run log, failure alerts).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { cronBeat } from "@/lib/ops/health";
import { runDue } from "@/lib/growth/ops/runner";
import { GROWTH_JOBS } from "@/lib/growth/ops/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const results = await runDue(GROWTH_JOBS);
    const ok = !results.some((r) => r.status === "failed");
    await cronBeat("growth", ok);
    return json({ ok, results });
  } catch (e) {
    await cronBeat("growth", false);
    console.error("[growth] run failed:", e instanceof Error ? e.name : "error");
    return json({ error: "The growth run failed.", code: "internal" }, { status: 500 });
  }
}
