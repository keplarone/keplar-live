/** GET -> a JSON download of one project: instructions, memory notes, files (text) and chats with their messages. Owner only. */
import { errorResponse } from "@/lib/create/platform/http";
import { projectOwner } from "@/lib/projects/api";
import { listFiles, listNotes, projectChats, requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await projectOwner(req);
    const { id } = await ctx.params;
    const p = await requireProject(ws.id, id);
    const [notes, files, cs] = await Promise.all([listNotes(ws.id, id), listFiles(ws.id, id), projectChats(ws.id, id)]);
    const data = {
      exportedAt: new Date().toISOString(),
      project: { id: p.id, name: p.name, instructions: p.instructions, memoryOn: p.memoryOn, createdAt: p.createdAt, updatedAt: p.updatedAt },
      memory: notes.map((n) => ({ text: n.text, createdAt: n.createdAt, updatedAt: n.updatedAt })),
      files: files.map((f) => ({ name: f.name, truncated: f.truncated, text: f.text, createdAt: f.createdAt })),
      chats: cs.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messages: c.messages })),
    };
    const safe = p.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="keplar-project-${safe}.json"`, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
