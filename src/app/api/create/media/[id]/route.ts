import { publicVideoJob, refreshJob } from "@/lib/higgsfield/video";
import { publicMediaJob } from "@/lib/create/media";
import { reapSoon } from "@/lib/create/platform/queue";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { mediaJobs } from "@/lib/create/repo";

export const runtime = "nodejs";
/** A stuck job found here is resumed after the response (platform/queue.ts), inside this function's time limit. */
export const maxDuration = 300;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ws = (await currentWorkspace(req));
    let job = await mediaJobs().get(ws.id, (await params).id);
    if (!job) throw new HttpError(404, "Job not found.", "not_found");
    if (job.hf) job = await refreshJob(job);
    else if (job.status === "queued" || job.status === "running") reapSoon(ws.id);
    return json({ job: job.hf ? publicVideoJob(job) : publicMediaJob(job) });
  } catch (e) {
    return errorResponse(e);
  }
}
