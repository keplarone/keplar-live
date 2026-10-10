/**
 * Nightly self-improvement run (Vercel Cron, see vercel.json; one run a day fits the Hobby plan). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set this endpoint answers 401 to everyone.
 * The same run refreshes the "most frequently asked" snapshot (src/lib/faq). It can only create, promote (when every check passes and the change is small) or roll back a router policy.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { runNightly } from "@/lib/learning/pipeline";
import { aggregate as aggregateFaq } from "@/lib/faq/repo";
import { liveRosters } from "@/lib/learning/rosters";
import { cronBeat } from "@/lib/ops/health";
import { runTrends } from "@/lib/trends/run";
import { purgeDueDeletions } from "@/lib/privacy/deletion";
import { EVAL_SET } from "../../../../../tests/fixtures/eval-set";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  // Daily: refresh the "most frequently asked" snapshot (also prunes questions not asked within 60 days). Independent of the learning run.
  let faq: number | null = null;
  try {
    faq = (await aggregateFaq()).items.length;
  } catch (e) {
    console.error("[faq] daily aggregation failed:", e instanceof Error ? e.name : "error");
  }
  // Daily: the SEO trend tracker (docs/seo-trends.md). Rides on this cron because the Hobby plan allows two. Never fails the learning run; paused by the admin kill switch.
  let trends: { published: number; held: number; rejected: number; skipped?: string } | null = null;
  try {
    const t = await runTrends();
    trends = { published: t.published.length, held: t.held.length, rejected: t.rejected.length, ...(t.skipped ? { skipped: t.skipped } : {}) };
  } catch (e) {
    console.error("[trends] daily run failed:", e instanceof Error ? e.name : "error");
  }
  // Daily: delete accounts whose deletion grace period has ended (src/lib/privacy/deletion.ts). Never fails the learning run.
  let deletions: { purged: number; skipped: number } | null = null;
  try {
    deletions = await purgeDueDeletions();
  } catch (e) {
    console.error("[deletion] nightly purge failed:", e instanceof Error ? e.name : "error");
  }
  try {
    const r = json({ ok: true, faq, trends, deletions, ...(await runNightly({ rosters: liveRosters(), evalSet: EVAL_SET })) });
    await cronBeat("learning", true);
    return r;
  } catch (e) {
    await cronBeat("learning", false);
    console.error("[learning] nightly run failed:", e instanceof Error ? e.name : "error");
    return json({ error: "The nightly run failed.", code: "internal" }, { status: 500 });
  }
}
