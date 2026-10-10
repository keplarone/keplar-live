import { blobs, contentTypeFor } from "./platform/blob";
import { id, now, slugify } from "./platform/ids";
import { EntitlementError } from "./platform/plans";
import type { Workspace } from "./platform/workspace";
import { projects } from "./repo";
import type { Project, ProjectKind } from "./types";

export const draftPrefix = (p: Pick<Project, "id">, v: number) => `drafts/${p.id}/v${v}/`;
export const deployPrefix = (projectId: string, deployId: string) => `deploys/${projectId}/${deployId}/`;

export async function createProject(ws: Workspace, input: { name?: string; kind?: ProjectKind }) {
  const existing = await projects().list(ws.id);
  if (existing.length >= ws.entitlements.projects) {
    throw new EntitlementError(`Your plan includes ${ws.entitlements.projects} project${ws.entitlements.projects === 1 ? "" : "s"}.`, "plus");
  }
  const name = (input.name ?? "Untitled project").trim().slice(0, 60) || "Untitled project";
  let slug = slugify(name);
  const taken = async (s: string) => Boolean(await projects().findSystemBy("slug", s));
  let n = 2;
  while (await taken(slug)) slug = `${slugify(name, 34)}-${n++}`;
  const t = now();
  const project: Project = {
    id: id("prj"),
    workspaceId: ws.id,
    name,
    slug,
    kind: input.kind ?? "site",
    spec: null,
    draftVersion: 0,
    files: [],
    messages: [],
    liveDeployId: null,
    publishedAt: null,
    scan: null,
    takenDown: false,
    createdAt: t,
    updatedAt: t,
  };
  return projects().insert(project);
}

export async function readFiles(prefix: string): Promise<Record<string, string>> {
  const keys = await blobs().list(prefix);
  const out: Record<string, string> = {};
  for (const k of keys) {
    const b = await blobs().get(k);
    if (b) out[k.slice(prefix.length)] = b.body.toString("utf8");
  }
  return out;
}

export async function writeDraft(project: Project, files: Record<string, string>): Promise<number> {
  const v = project.draftVersion + 1;
  for (const [path, content] of Object.entries(files)) {
    await blobs().put(draftPrefix(project, v) + path, content, contentTypeFor(path));
  }
  return v;
}

export function publicProject(p: Project) {
  return p;
}
