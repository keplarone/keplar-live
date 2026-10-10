import { errorResponse, json, body } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { estimateFor } from "@/lib/site-builder/job";
import { briefToPrompt, normalizeBrief } from "@/lib/site-builder/brief";
import { BUILDER_LIMITS, confirmUnits } from "@/lib/site-builder/limits";
import { getSite } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Cost estimate shown before a job runs. Free for the user to call; reads only. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    const site = await getSite(ws, (await params).id);
    const { prompt = "", brief } = await body<{ prompt?: string; brief?: unknown }>(req);
    const extra = brief && typeof brief === "object" && !site.headVersion ? briefToPrompt(normalizeBrief(brief, site.brief), BUILDER_LIMITS[ws.plan].pages).length : 0;
    const estimate = await estimateFor(ws, site, Math.min(String(prompt).length + extra, 20_000));
    return json({ estimate, needsConfirm: estimate.units > confirmUnits() });
  } catch (e) {
    return errorResponse(e);
  }
}
