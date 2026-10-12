import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { addScripts, cloudOwner, jobOf } from "@/lib/roblox-cloud/api";
import { CLOUD_LIMITS } from "@/lib/roblox-cloud/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST { scripts: [{ path, className, source, runContext? }] } -> { scripts, bytes }: one batch of a draft job's snapshot. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    if (Number(req.headers.get("content-length") ?? 0) > CLOUD_LIMITS.maxBatchBytes + 64_000) throw new HttpError(413, "Send the scripts in smaller batches.", "too_large");
    const ws = await cloudOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    const b = await body<{ scripts?: unknown }>(req);
    return json(await addScripts(ws, job, b.scripts), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
