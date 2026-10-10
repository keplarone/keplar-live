import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { deleteJob, getJob, listJobs, publicJob, TERMINAL } from "@/lib/images/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Live status of one job (the UI polls this) plus every version of the same image. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const job = await getJob(ws.id, (await params).id);
    if (!job) throw new HttpError(404, "Image not found.", "not_found");
    const history = (await listJobs(ws.id)).filter((j) => j.rootId === job.rootId).sort((a, b) => b.version - a.version);
    return json({ job: publicJob(job), history: history.map(publicJob) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Deletes one version. An image used in a site needs ?force=1 (the site then shows a broken image until edited). */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const job = await getJob(ws.id, (await params).id);
    if (!job) throw new HttpError(404, "Image not found.", "not_found");
    if (!TERMINAL(job.status)) throw new HttpError(409, "This image is still being created.", "busy");
    if (job.usedIn.length > 0 && new URL(req.url).searchParams.get("force") !== "1") {
      throw new HttpError(409, `This image is used in ${job.usedIn.map((u) => u.siteName).join(", ")}. Deleting it breaks it there.`, "in_use", { usedIn: job.usedIn });
    }
    await deleteJob(job);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
