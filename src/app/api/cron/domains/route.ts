/**
 * Background re-check of custom domains (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * without CRON_SECRET set this endpoint answers 401 to everyone.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { recheckDue } from "@/lib/domains/service";
import { purgeDueSites } from "@/lib/site-builder/deletion";
import { cronBeat } from "@/lib/ops/health";

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
    const r = json({ ok: true, ...(await recheckDue()), sites: await purgeDueSites() }); // also finalizes deleted sites whose undo window passed
    await cronBeat("domains", true);
    return r;
  } catch {
    await cronBeat("domains", false);
    return json({ error: "Re-check failed.", code: "internal" }, { status: 500 });
  }
}
