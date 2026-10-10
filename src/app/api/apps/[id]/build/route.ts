/**
 * Build, continue or edit an app. Streams NDJSON BuildEvents (see lib/app-builder/pipeline.ts). A request runs for at most
 * ~5 minutes; when the build needs more it ends with {type:"continue", id} and the client calls again with {buildId}.
 * Refusals (limits, confirmation needed) are plain JSON errors with the right status.
 */
import { errorResponse, body, HttpError } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite } from "@/lib/site-builder/store";
import { getBuild, runBuild, startBuild } from "@/lib/app-builder/pipeline";
import { rateLimit } from "@/lib/create/platform/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  let ws, site, buildId: string;
  try {
    ws = await currentWorkspace(req, { team: true });
    // New builds have their own per-minute/per-day limits in startBuild; this also bounds continue/edit requests.
    await rateLimit(`apps:req:${ws.id}`, 12, 60, { shared: true });
    site = await getSite(ws, (await params).id);
    const input = await body<{ prompt?: string; design?: unknown; confirm?: boolean; edit?: boolean; buildId?: string }>(req);
    buildId = input.buildId ? (await getBuild(ws, input.buildId)).id : (await startBuild(ws, site, input)).id;
  } catch (e) {
    return errorResponse(e);
  }
  const enc = new TextEncoder();
  const w = ws;
  const s = site;
  const origin = new URL(req.url).origin;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          /* client went away: the request still runs to its checkpoint and is saved */
        }
      };
      try {
        for await (const ev of runBuild(w, s, buildId, { origin })) send(ev);
      } catch (e) {
        // The code lets the studio tell "the build slot is still held by the request from before a reload" (too_many_jobs) from a real failure.
        send({ type: "error", error: e instanceof Error && "status" in e ? e.message : "The build could not continue.", code: e instanceof HttpError ? e.code ?? "error" : "error" });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
