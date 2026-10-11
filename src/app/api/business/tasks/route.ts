import { assertSameOrigin } from "@/lib/security/origin";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { requireBusiness } from "@/lib/business/require";
import { addTask, tasks } from "@/lib/business/workspace-data";
import { requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";

/** Tasks for one project (?projectId=), oldest first within status. */
export async function GET(req: Request) {
  try {
    const ws = await requireBusiness(req);
    const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
    if (!projectId) throw new HttpError(400, "projectId is required.");
    await requireProject(ws.id, projectId);
    const list = await tasks().list(ws.id, (t) => t.projectId === projectId);
    return json({ tasks: list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    const b = await body<{ projectId?: string; title?: unknown; due?: unknown }>(req);
    if (typeof b.projectId !== "string") throw new HttpError(400, "projectId is required.");
    await requireProject(ws.id, b.projectId);
    return json({ task: await addTask(ws.id, b.projectId, b) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
