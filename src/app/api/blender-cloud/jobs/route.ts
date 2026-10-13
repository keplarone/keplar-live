import { createJob, overview, renderOwner } from "@/lib/blender-cloud/api";
import { jobView } from "@/lib/blender-cloud/model";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The first job prepares the Blender image (about a minute). */
export const maxDuration = 300;

const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 * Blender Cloud renders (src/lib/blender-cloud). Signed-in Lite, Plus and Pro only.
 *   GET                                                         -> { jobs, capacity, machine }
 *   POST { report, settings, maxUnits, maxMinutes, sceneBytes } -> { job, upload: { url, token, maxBytes } }: the desktop app
 *                                                                  uploads the packed scene there, then calls /start
 */
export async function GET(req: Request) {
  try {
    const ws = await renderOwner(req, false);
    return json(await overview(ws), NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 60_000) throw new HttpError(413, "That request is too large.", "too_large");
    const ws = await renderOwner(req, true);
    const { job, upload } = await createJob(ws, await body<Record<string, unknown>>(req));
    return json({ job: jobView(job), upload }, { status: 201, ...NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
