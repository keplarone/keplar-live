import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { cloudOwner, createDraft, jobView } from "@/lib/roblox-cloud/api";
import { jobs } from "@/lib/roblox-cloud/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 * Roblox Cloud jobs (src/lib/roblox-cloud). Signed-in Lite, Plus and Pro only.
 *   GET                                                   -> { jobs: [view] } newest first
 *   POST { place, goal, mode, maxUnits, maxMinutes, tree } -> { job } a draft; send its scripts, then start it
 */
export async function GET(req: Request) {
  try {
    const ws = await cloudOwner(req, false);
    const all = (await jobs().list(ws.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ jobs: all.map(jobView) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 120_000) throw new HttpError(413, "That request is too large.", "too_large");
    const ws = await cloudOwner(req, true);
    const job = await createDraft(ws, await body<Record<string, unknown>>(req));
    return json({ job: jobView(job) }, { status: 201, ...NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
