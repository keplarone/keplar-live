/** Edit (PATCH { text }) or delete (DELETE, hard delete) one memory item. */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { minuteLimit } from "@/lib/tools/access";
import { cleanFact } from "@/lib/memory/facts";
import { deleteItem, updateItemText } from "@/lib/memory/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await currentWorkspace(req);
    const { id } = await ctx.params;
    if (!(await deleteItem(ws.id, id))) throw new HttpError(404, "That item was not found.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await currentWorkspace(req);
    await minuteLimit(`memory:${ws.id}:write`, 30);
    const { id } = await ctx.params;
    const b = await body<{ text?: unknown }>(req);
    const text = cleanFact(b.text);
    if (!text) throw new HttpError(400, "That can't be saved. Keep it to a short personal fact, without links, instructions, birthdates or other sensitive details.");
    const item = await updateItemText(ws.id, id, text);
    if (!item) throw new HttpError(404, "That item was not found.", "not_found");
    return json({ item: { id: item.id, text: item.text, kind: item.kind, source: item.source, createdAt: item.createdAt } });
  } catch (e) {
    return errorResponse(e);
  }
}
