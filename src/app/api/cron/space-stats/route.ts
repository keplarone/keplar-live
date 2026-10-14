import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/create/platform/http";
import { sampleAllTracked } from "@/lib/space-studio/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Daily (vercel.json "11 4 * * *"; the Hobby plan allows daily crons only): samples the live player count of every experience tracked in Space Studio (Roblox keeps no
 * history, so these samples ARE the history) and prunes stats past their retention. On a plan that only allows daily crons this
 * runs daily; stats reads still sample on demand.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  return json(await sampleAllTracked());
}
