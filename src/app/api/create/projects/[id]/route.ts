import { blobs } from "@/lib/create/platform/blob";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { siteUrls } from "@/lib/create/hosting";
import { domains, projects } from "@/lib/create/repo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = (await currentWorkspace(req));
    const { id } = await params;
    const project = await projects().get(ws.id, id);
    if (!project) throw new HttpError(404, "Project not found.", "not_found");
    const doms = await domains().list(ws.id, (d) => d.projectId === id);
    return json({ project, urls: siteUrls(project), preview: project.draftVersion ? `/sites/preview/${project.id}/` : null, domains: doms });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const ws = (await currentWorkspace(req));
    const { id } = await params;
    const project = await projects().get(ws.id, id);
    if (!project) throw new HttpError(404, "Project not found.", "not_found");
    for (const d of await domains().list(ws.id, (x) => x.projectId === id)) await domains().remove(ws.id, d.id);
    await blobs().removePrefix(`drafts/${id}`);
    await blobs().removePrefix(`deploys/${id}`);
    await projects().remove(ws.id, id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
