import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { runSlice } from "@/lib/blender-cloud/worker";
import { json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Internal: runs one slice of a Blender Cloud render (src/lib/blender-cloud/worker.ts). Called only by Keplar itself (the
 * previous slice, a status poll or the daily cron) with `Authorization: Bearer $CRON_SECRET`. It answers 202 at once and
 * watches the render in the background of this invocation; the slice stops itself well before maxDuration and hands over.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(got), digest(`Bearer ${secret}`))) return json({ error: "Unauthorized.", code: "unauthenticated" }, { status: 401 });
  let b: { jobId?: unknown; workspaceId?: unknown } = {};
  try { b = await req.json(); } catch { /* checked below */ }
  if (typeof b.jobId !== "string" || typeof b.workspaceId !== "string") return json({ error: "jobId and workspaceId are required.", code: "bad_request" }, { status: 400 });
  const work = runSlice(b.workspaceId, b.jobId).catch((e) => { console.error("[blender-cloud] slice failed:", e instanceof Error ? e.message.slice(0, 200) : "error"); });
  try { after(work); } catch { /* outside a request scope: the promise still runs */ }
  return json({ accepted: true }, { status: 202 });
}
