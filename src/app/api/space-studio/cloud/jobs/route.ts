import { limitRequest } from "@/lib/create/platform/ratelimit";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { createJob } from "@/lib/blender-cloud/api";
import { jobView as blenderView } from "@/lib/blender-cloud/model";
import { createDraft } from "@/lib/roblox-cloud/api";
import { jobView as robloxView } from "@/lib/roblox-cloud/model";
import { spaceOwner } from "@/lib/space-studio/account";
import { requireSpaceCloud, SPACE_PRODUCT } from "@/lib/space-studio/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A first Blender job prepares the render image (about a minute). */
export const maxDuration = 300;

/**
 * POST { kind: "roblox"|"blender", ...job fields } -> 201 { job } (blender also { upload }) | 403 { code: "space_cloud_requires_pro" | ... }
 * The gate reads the stored Space Studio subscription only; a `plan` (or any other entitlement) in the body is ignored.
 * The job is tagged product "space-studio", so the workers re-check this gate every time they pick it up.
 */
export async function POST(req: Request) {
  try {
    await limitRequest(req, "space-cloud-jobs", { perIp: 20 });
    if (Number(req.headers.get("content-length") ?? 0) > 120_000) throw new HttpError(413, "That request is too large.", "too_large");
    const ws = await spaceOwner(req, true);
    const b = await body<Record<string, unknown>>(req);
    if (b?.kind !== "roblox" && b?.kind !== "blender") throw new HttpError(400, "kind must be roblox or blender.", "bad_request");
    await requireSpaceCloud(ws);
    if (b.kind === "roblox") {
      const job = await createDraft(ws, b, { product: SPACE_PRODUCT });
      return json({ job: robloxView(job) }, { status: 201 });
    }
    const { job, upload } = await createJob(ws, b, {}, { product: SPACE_PRODUCT });
    return json({ job: blenderView(job), upload }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
