import { createHash, timingSafeEqual } from "node:crypto";
import { cleanup } from "@/lib/blender-cloud/api";
import { resumeStale } from "@/lib/blender-cloud/worker";
import { json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Daily (vercel.json): picks up renders whose watcher died, ends abandoned uploads, and deletes expired renders and stray machines. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  const resumed = await resumeStale();
  return json({ resumed, ...(await cleanup()) });
}
