/**
 * Server-side 24/7 agent schedules through Vercel Cron (see vercel.json and docs/business-os.md §7a). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set this endpoint answers 401 to everyone.
 *
 * What this can honestly deliver:
 *   - Vercel's free Hobby plan runs a cron at most ONCE A DAY, at a time Vercel picks inside the scheduled hour. So this check looks back
 *     24 hours and runs each due agent's latest slot once (agents on a faster schedule still run at most once a day this way).
 *   - On Vercel Pro, change the schedule in vercel.json (for example every 5 minutes) and set KEPLAR_AGENT_CRON_WINDOW_MINUTES=15 and
 *     KEPLAR_VERCEL_CRON_MINUTES=5 so the app describes it correctly. With Inngest keys set, Inngest ticks every 5 minutes and this cron
 *     is only a one-hour safety net.
 *   - A run is claimed per (agent, slot), so Inngest, this cron and a retry can never run the same slot twice.
 *   - Everything outbound is queued for the owner's approval (forceApproval), and plan limits are checked again for every run.
 *   - Runs are sequential inside one function call (maxDuration below). Runs not started before the time budget are left for the next check.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { inngestEnabled } from "@/lib/inngest/client";
import { tick } from "@/lib/business/scheduler";
import { cronWindowMinutes } from "@/lib/business/schedule-limits";
import { cronBeat } from "@/lib/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
/** Leave room under maxDuration for one more run to finish. */
const BUDGET_MS = 90_000;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const t = await tick(new Date(), { windowMinutes: cronWindowMinutes(process.env, inngestEnabled()), deadline: Date.now() + BUDGET_MS });
    await cronBeat("agents", true);
    return json({ ok: true, driver: inngestEnabled() ? "inngest+cron" : "vercel-cron", due: t.due, deferred: t.deferred, ran: t.results.filter((r) => r.outcome === "ran").length, skipped: t.results.filter((r) => r.outcome === "skipped").length, duplicate: t.results.filter((r) => r.outcome === "duplicate").length });
  } catch {
    await cronBeat("agents", false);
    return json({ error: "The agent check failed.", code: "internal" }, { status: 500 });
  }
}
