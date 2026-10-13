import { jobOf, renderOwner, startJob } from "@/lib/blender-cloud/api";
import { jobView } from "@/lib/blender-cloud/model";
import { errorResponse, json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST -> { job }: after the desktop app uploaded the scene to the job's machine, queues the render and starts watching it. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await renderOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    return json({ job: jobView(await startJob(ws, job)) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
