/**
 * Saved projects, per user, in the store (Neon in production). Every row is scoped by workspaceId.
 * Deletion is a hard delete. Chats stay in `chat_threads` (their `projectId` points here), so the existing chat sync,
 * History, search and export keep working; this module only adds what the project itself holds.
 */
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { neutralize } from "@/lib/documents/guard";
import { cleanFact } from "@/lib/memory/facts";
import { chats } from "@/lib/memory/repo";
import { deleteChat } from "@/lib/memory/delete-chat";
import { PROJECT_LIMITS as L, type ProjectFile, type ProjectNote, type ProjectRow } from "./types";

export const projectRows = () => collection<ProjectRow>("projects");
export const noteRows = () => collection<ProjectNote>("project_notes");
export const fileRows = () => collection<ProjectFile>("project_files");

export const validProjectId = (v: unknown): v is string => typeof v === "string" && /^prj_[A-Za-z0-9]{4,40}$/.test(v);
const ctl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g;

export const cleanName = (v: unknown): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, L.name) : "");
export const cleanInstructions = (v: unknown): string => (typeof v === "string" ? neutralize(v).replace(ctl, " ").trim().slice(0, L.instructions) : "");

export async function listProjects(ws: string): Promise<ProjectRow[]> {
  return (await projectRows().list(ws)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const getProject = (ws: string, id: string) => projectRows().get(ws, id);

export async function requireProject(ws: string, id: string): Promise<ProjectRow> {
  const p = validProjectId(id) ? await getProject(ws, id) : null;
  if (!p) throw new HttpError(404, "Project not found.", "not_found");
  return p;
}

/** Create, or (for a project that so far only existed in this browser) adopt it under the id the chats already use. */
export async function saveProject(ws: string, input: { id?: unknown; name?: unknown; instructions?: unknown; memoryOn?: unknown }): Promise<ProjectRow> {
  const name = cleanName(input.name);
  if (!name) throw new HttpError(400, "Name the project.");
  const all = await listProjects(ws);
  const wanted = validProjectId(input.id) ? input.id : null;
  const existing = wanted ? all.find((p) => p.id === wanted) : undefined;
  if (existing) return existing; // adopting is idempotent; edits go through updateProject
  if (all.length >= L.projects) throw new HttpError(409, `You have ${L.projects} projects. Delete one to add another.`, "limit");
  if (all.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, "A project with that name exists.", "duplicate");
  const t = now();
  const row: ProjectRow = { id: wanted ?? `prj_${newId("x").slice(2)}`, workspaceId: ws, name, instructions: cleanInstructions(input.instructions), memoryOn: input.memoryOn !== false, createdAt: t, updatedAt: t };
  await projectRows().insert(row);
  return row;
}

export async function updateProject(ws: string, id: string, patch: { name?: unknown; instructions?: unknown; memoryOn?: unknown }): Promise<ProjectRow> {
  const cur = await requireProject(ws, id);
  const next: Partial<ProjectRow> = { updatedAt: now() };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) throw new HttpError(400, "Name the project.");
    if ((await listProjects(ws)).some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, "A project with that name exists.", "duplicate");
    next.name = name;
  }
  if (patch.instructions !== undefined) next.instructions = cleanInstructions(patch.instructions);
  if (typeof patch.memoryOn === "boolean") next.memoryOn = patch.memoryOn;
  return (await projectRows().update(ws, cur.id, next)) ?? cur;
}

// ---- memory (notes)
export async function listNotes(ws: string, projectId: string): Promise<ProjectNote[]> {
  return (await noteRows().list(ws, (n) => n.projectId === projectId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Same hygiene as account memory: a short fact (no links, secrets, birthdates or instructions to the assistant). */
export const cleanProjectNote = (v: unknown): string | null => cleanFact(v);

export async function addNote(ws: string, projectId: string, text: unknown): Promise<ProjectNote> {
  await requireProject(ws, projectId);
  const clean = cleanProjectNote(text);
  if (!clean) throw new HttpError(400, "That can't be saved. Keep it to a short fact about the project, without links, instructions to the assistant, or sensitive details.");
  const existing = await listNotes(ws, projectId);
  if (existing.some((n) => norm(n.text) === norm(clean))) throw new HttpError(409, "That note is already saved.", "duplicate");
  if (existing.length >= L.notes) throw new HttpError(409, `A project holds ${L.notes} notes. Delete one to add another.`, "limit");
  const t = now();
  const row: ProjectNote = { id: newId("pnote"), workspaceId: ws, projectId, text: clean, createdAt: t, updatedAt: t };
  await noteRows().insert(row);
  return row;
}

export async function editNote(ws: string, projectId: string, noteId: string, text: unknown): Promise<ProjectNote> {
  await requireProject(ws, projectId);
  const cur = (await noteRows().get(ws, noteId)) ?? null;
  if (!cur || cur.projectId !== projectId) throw new HttpError(404, "That note was not found.", "not_found");
  const clean = cleanProjectNote(text);
  if (!clean) throw new HttpError(400, "That can't be saved. Keep it to a short fact about the project, without links, instructions to the assistant, or sensitive details.");
  return (await noteRows().update(ws, noteId, { text: clean, updatedAt: now() })) ?? cur;
}

export async function deleteNote(ws: string, projectId: string, noteId: string): Promise<boolean> {
  const cur = await noteRows().get(ws, noteId);
  if (!cur || cur.projectId !== projectId) return false;
  return noteRows().remove(ws, noteId);
}

export async function clearNotes(ws: string, projectId: string): Promise<number> {
  const all = await listNotes(ws, projectId);
  for (const n of all) await noteRows().remove(ws, n.id);
  return all.length;
}

// ---- files (text already read by /api/keplar/extract)
export async function listFiles(ws: string, projectId: string): Promise<ProjectFile[]> {
  return (await fileRows().list(ws, (f) => f.projectId === projectId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addFile(ws: string, projectId: string, input: { name?: unknown; text?: unknown; truncated?: unknown }): Promise<ProjectFile> {
  await requireProject(ws, projectId);
  const name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120) : "";
  const raw = typeof input.text === "string" ? neutralize(input.text).replace(ctl, " ").trim() : "";
  if (!name || !raw) throw new HttpError(400, "Send the file's name and text.");
  const existing = await listFiles(ws, projectId);
  if (existing.length >= L.files) throw new HttpError(409, `A project holds ${L.files} files. Remove one to add another.`, "limit");
  const used = existing.reduce((s, f) => s + f.chars, 0);
  const room = L.totalFileChars - used;
  if (room <= 0) throw new HttpError(409, "This project's files are full. Remove one to add another.", "limit");
  const text = raw.slice(0, Math.min(L.fileChars, room));
  const row: ProjectFile = { id: newId("pfile"), workspaceId: ws, projectId, name, text, chars: text.length, truncated: input.truncated === true || text.length < raw.length, createdAt: now() };
  await fileRows().insert(row);
  return row;
}

export async function deleteFile(ws: string, projectId: string, fileId: string): Promise<boolean> {
  const cur = await fileRows().get(ws, fileId);
  if (!cur || cur.projectId !== projectId) return false;
  return fileRows().remove(ws, fileId);
}

export async function clearFiles(ws: string, projectId: string): Promise<number> {
  const all = await listFiles(ws, projectId);
  for (const f of all) await fileRows().remove(ws, f.id);
  return all.length;
}

// ---- chats
export async function projectChats(ws: string, projectId: string) {
  return (await chats().list(ws, (c) => c.projectId === projectId)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Delete the project's chats for good (same cascade as deleting a chat: summaries, learning marks). */
export async function clearProjectChats(ws: string, projectId: string): Promise<number> {
  const all = await projectChats(ws, projectId);
  for (const c of all) await deleteChat(ws, c.id);
  return all.length;
}

/** Delete the project and everything it holds. Its chats are kept (moved out of the project) unless `chats: "delete"`. */
export async function deleteProject(ws: string, projectId: string, opts: { chats?: "keep" | "delete" } = {}): Promise<{ notes: number; files: number; chats: number; detached: number } | null> {
  const p = await getProject(ws, projectId);
  if (!p) return null;
  const notes = await clearNotes(ws, projectId);
  const files = await clearFiles(ws, projectId);
  let deleted = 0;
  let detached = 0;
  if (opts.chats === "delete") deleted = await clearProjectChats(ws, projectId);
  else {
    for (const c of await projectChats(ws, projectId)) {
      await chats().update(ws, c.id, { projectId: null });
      detached += 1;
    }
  }
  await projectRows().remove(ws, projectId);
  return { notes, files, chats: deleted, detached };
}

/** "Erase my memory" also clears every project's notes (they are memory too). Files, instructions and chats are not touched. */
export async function eraseAllProjectNotes(ws: string): Promise<number> {
  const all = await noteRows().list(ws);
  for (const n of all) await noteRows().remove(ws, n.id);
  return all.length;
}
