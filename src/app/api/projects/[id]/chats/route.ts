/** DELETE { confirm: "DELETE" } -> permanently delete every chat in this project (same cascade as deleting a chat). */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { confirmed, projectOwner } from "@/lib/projects/api";
import { clearProjectChats, requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    await requireProject(ws.id, id);
    const b = await body<{ confirm?: unknown }>(req);
    if (!confirmed(b.confirm)) throw new HttpError(400, "Type DELETE to confirm.", "confirm_required");
    return json({ ok: true, deleted: await clearProjectChats(ws.id, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
