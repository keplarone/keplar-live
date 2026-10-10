/**
 * Test a site in a real browser and (optionally) repair what the test finds. Streams NDJSON events:
 * {type:"step"|"check"|"issue"|"shot"|"critique"|"repaired"|"done"|"error", ...}
 * GET returns the latest saved result and the Screen Library listing.
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite } from "@/lib/site-builder/store";
import { listShots } from "@/lib/site-builder/qa/shots";
import { testSite } from "@/lib/site-builder/qa/service";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const site = await getSite(ws, (await params).id);
    return json({ qa: site.qa ?? null, shots: await listShots(ws, site.id), browser: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  let ws, site, repair: boolean;
  try {
    ws = await currentWorkspace(req, { team: true });
    site = await getSite(ws, (await params).id);
    if (!site.headVersion) throw new HttpError(409, "Build the site first, then it can be tested.", "no_version");
    if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms.", "taken_down");
    await rateLimit(`sb:qa:${ws.id}`, 8, 600, { shared: true });
    const input = await body<{ repair?: boolean }>(req).catch(() => ({}) as { repair?: boolean });
    repair = input.repair !== false;
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
          /* client went away: the run still finishes and is saved */
        }
      };
      try {
        for await (const ev of testSite(w, s, { baseUrl: origin, repair })) send(ev);
      } catch (e) {
        console.error("[site-qa] failed", e instanceof Error ? e.message : e);
        send({ type: "error", error: "The test run stopped unexpectedly. Nothing was changed.", code: "internal" });
      }
      try {
        controller.close();
      } catch {
        /* closed */
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
