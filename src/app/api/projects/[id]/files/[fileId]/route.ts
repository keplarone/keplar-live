/** Remove one project file. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { projectOwner } from "@/lib/projects/api";
import { deleteFile, requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const ws = await projectOwner(req, true);
    const { id, fileId } = await ctx.params;
    await requireProject(ws.id, id);
    if (!(await deleteFile(ws.id, id, fileId))) throw new HttpError(404, "That file was not found.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
