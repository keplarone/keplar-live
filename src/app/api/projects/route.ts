/**
 * Saved projects for the signed-in user.
 *   GET  -> { projects: [{ id, name, memoryOn, counts }] }
 *   POST { name, id?, instructions? } -> create (or adopt a project that so far lived only in this browser, under its id)
 * Signed out is 401: projects with memory need an account.
 */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { fileRows, listProjects, noteRows, saveProject } from "@/lib/projects/repo";
import { projectOwner } from "@/lib/projects/api";
import { chats } from "@/lib/memory/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await projectOwner(req);
    // Counts per project, made by the store (no note text, file text or chat messages are loaded for them).
    const [ps, notes, files, cs] = await Promise.all([listProjects(ws.id), noteRows().countBy(ws.id, "projectId"), fileRows().countBy(ws.id, "projectId"), chats().countBy(ws.id, "projectId")]);
    const count = (counts: Map<string, number>, id: string) => counts.get(id) ?? 0;
    return json({ projects: ps.map((p) => ({ id: p.id, name: p.name, memoryOn: p.memoryOn, createdAt: p.createdAt, counts: { notes: count(notes, p.id), files: count(files, p.id), chats: count(cs, p.id) } })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await projectOwner(req, true);
    const b = await body<{ id?: unknown; name?: unknown; instructions?: unknown }>(req);
    const p = await saveProject(ws.id, b);
    return json({ project: { id: p.id, name: p.name, memoryOn: p.memoryOn, createdAt: p.createdAt } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
