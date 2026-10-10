import { publicVideoJob, refreshJob } from "@/lib/higgsfield/video";
import { mediaUrl } from "@/lib/create/media";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { mediaJobs } from "@/lib/create/repo";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ws = (await currentWorkspace(req));
    let job = await mediaJobs().get(ws.id, (await params).id);
    if (!job) throw new HttpError(404, "Job not found.", "not_found");
    if (job.hf) job = await refreshJob(job);
    return json({ job: job.hf ? publicVideoJob(job) : { ...job, url: mediaUrl(job) } });
  } catch (e) {
    return errorResponse(e);
  }
}
