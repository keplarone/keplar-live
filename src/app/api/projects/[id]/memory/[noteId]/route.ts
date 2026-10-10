/** One project note. PATCH { text } edits it; DELETE removes it for good. Another account's id answers 404. */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { projectOwner } from "@/lib/projects/api";
import { deleteNote, editNote, requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; noteId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id, noteId } = await ctx.params;
    const b = await body<{ text?: unknown }>(req);
    const n = await editNote(ws.id, id, noteId, b.text);
    return json({ note: { id: n.id, text: n.text, createdAt: n.createdAt, updatedAt: n.updatedAt } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id, noteId } = await ctx.params;
    await requireProject(ws.id, id);
    if (!(await deleteNote(ws.id, id, noteId))) throw new HttpError(404, "That note was not found.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
