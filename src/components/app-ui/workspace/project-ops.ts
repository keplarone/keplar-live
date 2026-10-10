/**
 * Project and chat housekeeping from a chat card: rename, merge and delete a project; rename and delete a chat. The same routes
 * the Projects and History tabs use (/api/projects/[id], /api/projects/[id]/memory, /api/chats/[id]); the local list changes
 * through the same reducer actions. Fetch and dispatch are injected so the rules are testable without a browser.
 */
import type { Project, Thread } from "../state/types";

export type OpsFetch = (url: string, init: { method: string; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
export type OpsDispatch = (a:
  | { type: "rename-project"; id: string; name: string }
  | { type: "remove-project"; id: string; chats: "keep" | "delete" }
  | { type: "move-thread"; id: string; projectId: string | null }) => void;
export type Ops = { fetch: OpsFetch; dispatch: OpsDispatch; signedIn: boolean };
export type OpResult = { ok: true; text: string } | { ok: false; text: string };

const call = async (o: Ops, url: string, method: string, body?: unknown) => {
  const r = await o.fetch(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  // A project that so far lived only in this browser is not on the server (404): the local change is all there is.
  if (!r.ok && r.status !== 404) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "That didn't save. Try again in a moment.");
  }
  return r.ok ? ((await r.json().catch(() => ({}))) as Record<string, unknown>) : null;
};

export const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, 60);

/** A project name must be non-empty and not taken by another project (case-insensitive). */
export function checkProjectName(projects: Project[], id: string | null, raw: string): { ok: true; name: string } | { ok: false; text: string } {
  const name = cleanName(raw);
  if (!name) return { ok: false, text: "Name the project." };
  if (projects.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) return { ok: false, text: `A project called “${name}” already exists.` };
  return { ok: true, name };
}

export async function renameProject(o: Ops, projects: Project[], id: string, raw: string): Promise<OpResult> {
  const p = projects.find((x) => x.id === id);
  if (!p) return { ok: false, text: "That project is gone." };
  const c = checkProjectName(projects, id, raw);
  if (!c.ok) return c;
  try {
    if (o.signedIn) await call(o, `/api/projects/${encodeURIComponent(id)}`, "PATCH", { name: c.name });
    o.dispatch({ type: "rename-project", id, name: c.name });
    return { ok: true, text: `Renamed “${p.name}” to “${c.name}”.` };
  } catch (e) { return { ok: false, text: (e as Error).message }; }
}

export async function deleteProject(o: Ops, projects: Project[], threads: Thread[], id: string, chats: "keep" | "delete"): Promise<OpResult> {
  const p = projects.find((x) => x.id === id);
  if (!p) return { ok: false, text: "That project is gone." };
  const n = threads.filter((t) => t.projectId === id).length;
  try {
    if (o.signedIn) await call(o, `/api/projects/${encodeURIComponent(id)}`, "DELETE", { confirm: "DELETE", chats });
    o.dispatch({ type: "remove-project", id, chats });
    return { ok: true, text: `Deleted “${p.name}”.${n ? (chats === "delete" ? ` Its ${n === 1 ? "chat was" : `${n} chats were`} deleted too.` : ` Its ${n === 1 ? "chat is" : `${n} chats are`} kept, outside any project.`) : ""}` };
  } catch (e) { return { ok: false, text: (e as Error).message }; }
}

/**
 * Merge `from` into `into`: every chat moves, saved notes are copied, then `from` is deleted. Files are not copied (the server
 * keeps only their text for answers, not the original file), which the confirm says before anything happens.
 */
export async function mergeProjects(o: Ops, projects: Project[], threads: Thread[], from: string, into: string): Promise<OpResult> {
  const a = projects.find((x) => x.id === from);
  const b = projects.find((x) => x.id === into);
  if (!a || !b) return { ok: false, text: "That project is gone." };
  if (from === into) return { ok: false, text: "Pick two different projects." };
  const moving = threads.filter((t) => t.projectId === from);
  try {
    let notes = 0;
    if (o.signedIn) {
      const d = await call(o, `/api/projects/${encodeURIComponent(from)}`, "GET");
      for (const n of ((d?.notes as { text: string }[] | undefined) ?? [])) {
        await call(o, `/api/projects/${encodeURIComponent(into)}/memory`, "POST", { text: n.text });
        notes++;
      }
    }
    for (const t of moving) {
      if (o.signedIn) await call(o, `/api/chats/${encodeURIComponent(t.id)}`, "PATCH", { projectId: into });
      o.dispatch({ type: "move-thread", id: t.id, projectId: into });
    }
    if (o.signedIn) await call(o, `/api/projects/${encodeURIComponent(from)}`, "DELETE", { confirm: "DELETE", chats: "keep" });
    o.dispatch({ type: "remove-project", id: from, chats: "keep" });
    return { ok: true, text: `Merged “${a.name}” into “${b.name}”: ${moving.length === 1 ? "1 chat" : `${moving.length} chats`}${notes ? ` and ${notes === 1 ? "1 note" : `${notes} notes`}` : ""} moved.` };
  } catch (e) { return { ok: false, text: (e as Error).message }; }
}
