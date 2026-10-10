/**
 * Build or edit a site with the AI. Streams NDJSON events:
 * {type:"status"|"file"|"progress"|"saving"|"done"|"error", ...}
 * Refusals (limits, cooldown, confirmation needed) are plain JSON errors with the right status.
 */
import { errorResponse, body } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { prepareJob, runJob } from "@/lib/site-builder/job";
import { getSite } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  let ws, site, prep;
  try {
    ws = await currentWorkspace(req, { team: true });
    site = await getSite(ws, (await params).id);
    const input = await body<{ prompt?: string; confirm?: boolean; brief?: unknown }>(req);
    prep = await prepareJob(ws, site, input);
  } catch (e) {
    return errorResponse(e);
  }
  const enc = new TextEncoder();
  const w = ws;
  const s = site;
  const p = prep;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          /* client went away: the job still finishes and is saved */
        }
      };
      send({ type: "estimate", units: p.estimate.units, free: p.estimate.free, model: p.estimate.modelLabel });
      for await (const ev of runJob(w, s, p)) send(ev);
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
