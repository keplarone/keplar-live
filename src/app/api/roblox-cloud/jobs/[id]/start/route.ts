import { errorResponse, json } from "@/lib/create/platform/http";
import { assertCanStart, cloudOwner, jobOf, jobView } from "@/lib/roblox-cloud/api";
import { startJob } from "@/lib/roblox-cloud/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** POST -> { job }: checks the snapshot with Luau's analyzer (the baseline), queues the job and starts its first slice. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await cloudOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    await assertCanStart(ws, job);
    return json({ job: jobView(await startJob(job)) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
