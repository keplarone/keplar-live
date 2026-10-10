/**
 * One project.
 *   GET    -> { project, notes, files (no text), chats (no messages), gate }
 *   PATCH  { name?, instructions?, memoryOn? }
 *   DELETE { confirm: "DELETE", chats?: "keep" | "delete" } -> removes the project, its notes and files; chats are kept (moved out) unless "delete"
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { confirmed, projectOwner } from "@/lib/projects/api";
import { deleteProject, listFiles, listNotes, projectChats, requireProject, updateProject } from "@/lib/projects/repo";
import { freeEndpointsMayTrain } from "@/lib/orchestration/config";
import { FREE_PRIVACY_NOTE } from "@/lib/privacy/free-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req);
    const { id } = await ctx.params;
    const p = await requireProject(ws.id, id);
    const [notes, files, cs] = await Promise.all([listNotes(ws.id, id), listFiles(ws.id, id), projectChats(ws.id, id)]);
    return json({
      project: { id: p.id, name: p.name, instructions: p.instructions, memoryOn: p.memoryOn, createdAt: p.createdAt, updatedAt: p.updatedAt },
      notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt, updatedAt: n.updatedAt })),
      files: files.map((f) => ({ id: f.id, name: f.name, chars: f.chars, truncated: f.truncated, createdAt: f.createdAt })),
      chats: cs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
      // Free requests never carry project notes, files or instructions to free hosts that may train (src/lib/privacy/free-gate.ts).
      gate: { withheldOnThisPlan: ws.plan === "free" && freeEndpointsMayTrain(), note: FREE_PRIVACY_NOTE },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    const b = await body<{ name?: unknown; instructions?: unknown; memoryOn?: unknown }>(req);
    const p = await updateProject(ws.id, id, b);
    return json({ project: { id: p.id, name: p.name, instructions: p.instructions, memoryOn: p.memoryOn } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    const b = await body<{ confirm?: unknown; chats?: unknown }>(req);
    if (!confirmed(b.confirm)) throw new HttpError(400, "Type DELETE to confirm.", "confirm_required");
    const r = await deleteProject(ws.id, id, { chats: b.chats === "delete" ? "delete" : "keep" });
    if (!r) throw new HttpError(404, "Project not found.", "not_found");
    return json({ ok: true, ...r });
  } catch (e) {
    return errorResponse(e);
  }
}
