import { errorResponse, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { createProject } from "@/lib/create/projects";
import { projects } from "@/lib/create/repo";
import type { ProjectKind } from "@/lib/create/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ws = (await currentWorkspace(req));
    const rows = (await projects().list(ws.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json({ projects: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = (await currentWorkspace(req));
    await rateLimit(`${ws.id}:create`, ws.entitlements.rpm);
    const input = await body<{ name?: string; kind?: ProjectKind }>(req);
    return json({ project: await createProject(ws, input) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
