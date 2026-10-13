/**
 * Scheduled jobs of published Keplar apps (src/lib/app-runtime/schedules.ts), once a day (Vercel Cron, see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET this answers 401 to everyone.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { runDueSchedules } from "@/lib/app-runtime/schedules";
import { cronBeat } from "@/lib/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  try {
    const r = await runDueSchedules(Date.now() + 280_000);
    await cronBeat("app-schedules", true).catch(() => undefined);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error("[app-schedules] failed", e instanceof Error ? e.message : e);
    await cronBeat("app-schedules", false).catch(() => undefined);
    return json({ error: "Scheduled jobs failed.", code: "internal" }, { status: 500 });
  }
}
