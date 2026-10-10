/**
 * A project's memory (notes the person can read, edit and delete).
 *   GET -> { enabled, notes }      POST { text } -> add a note      DELETE { confirm: "DELETE" } -> clear all notes
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { confirmed, projectOwner } from "@/lib/projects/api";
import { addNote, clearNotes, listNotes, requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const pub = (n: { id: string; text: string; createdAt: string; updatedAt: string }) => ({ id: n.id, text: n.text, createdAt: n.createdAt, updatedAt: n.updatedAt });

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req);
    const { id } = await ctx.params;
    const p = await requireProject(ws.id, id);
    return json({ enabled: p.memoryOn, notes: (await listNotes(ws.id, id)).map(pub) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    const b = await body<{ text?: unknown }>(req);
    return json({ note: pub(await addNote(ws.id, id, b.text)) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    await requireProject(ws.id, id);
    const b = await body<{ confirm?: unknown }>(req);
    if (!confirmed(b.confirm)) throw new HttpError(400, "Type DELETE to confirm.", "confirm_required");
    return json({ ok: true, deleted: await clearNotes(ws.id, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
