import { body, errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { createVideoJobs, listVideoJobs, publicVideoJob, videoConfig, type VideoInput } from "@/lib/higgsfield/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Video studio state: provider status (Beta / Not configured), the model picker (Higgsfield default), limits, and the user's videos. */
export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const config = videoConfig(ws);
    const jobs = config.configured && config.available ? await listVideoJobs(ws) : [];
    return json({ config, jobs: jobs.map(publicVideoJob) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Starts one video, or several with Compare. Needs confirmUnits equal to the previewed credits (and acknowledgeLarge for big jobs). */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`vid:post:${ws.id}`, 20, 60, { shared: true });
    const input = await body<VideoInput>(req);
    const jobs = await createVideoJobs(ws, input);
    return json({ jobs: jobs.map(publicVideoJob) }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
