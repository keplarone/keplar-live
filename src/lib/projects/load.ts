/** Loads a project's saved material for one chat request (store reads), then builds the fenced block. Never throws; "" on any problem. */
import { listFiles, listNotes, getProject, validProjectId } from "./repo";
import { projectBlock } from "./context";

export async function projectContextFor(i: { workspaceId: string; projectId: string | undefined; prompt: string; allowed: boolean; accountMemoryOn: boolean }): Promise<string> {
  if (!i.projectId || !validProjectId(i.projectId) || !i.allowed || !i.accountMemoryOn) return ""; // gate first: nothing is even read when it says no
  try {
    const project = await getProject(i.workspaceId, i.projectId); // scoped to the signed-in owner: another account's id finds nothing
    if (!project || !project.memoryOn) return "";
    const [notes, files] = await Promise.all([listNotes(i.workspaceId, project.id), listFiles(i.workspaceId, project.id)]);
    return projectBlock({ project, notes, files, prompt: i.prompt, allowed: true, accountMemoryOn: true });
  } catch (e) {
    console.error("[projects] context unavailable:", e instanceof Error ? e.name : "error");
    return "";
  }
}
