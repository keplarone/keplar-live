import { deployProject, siteUrls, unpublish } from "@/lib/create/hosting";
import { assertCanSpend, charge, estimateUnits } from "@/lib/create/platform/compute";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { draftPrefix, readFiles } from "@/lib/create/projects";
import { projects } from "@/lib/create/repo";
import { scanSite } from "@/lib/create/safety";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Publish: safety scan → deploy → free subdomain URL. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = (await currentWorkspace(req));
    await rateLimit(`${ws.id}:deploy`, 10);
    if (!ws.verified) throw new HttpError(403, "Verify your email to publish.", "unverified");
    const { id } = await params;
    const project = await projects().get(ws.id, id);
    if (!project) throw new HttpError(404, "Project not found.", "not_found");
    if (project.takenDown) throw new HttpError(451, "This project was taken down after an abuse review.", "taken_down");
    if (!project.draftVersion) throw new HttpError(409, "Generate the project before publishing.");
    await assertCanSpend(ws, estimateUnits("site.deploy") + estimateUnits("scan.site"));

    const files = await readFiles(draftPrefix(project, project.draftVersion));
    const scan = await scanSite(files);
    await projects().update(ws.id, id, { scan: { ...scan, at: now() } });
    await charge(ws, "scan.site", { ref: id });
    if (scan.verdict === "block") {
      return json({ error: "Publishing was blocked by the safety scan.", code: "scan_blocked", scan }, { status: 422 });
    }
    const deploy = await deployProject({ ...project, scan: { ...scan, at: now() } });
    const units = await charge(ws, "site.deploy", { ref: deploy.id });
    return json({ deploy, urls: siteUrls(project), scan, units });
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
    await unpublish(project);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
