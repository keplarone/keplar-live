/**
 *   GET  /api/browser/tasks/:id            one task (steps so far, newest screenshot, result)
 *   POST /api/browser/tasks/:id {stop:true} stop it before its next step; the browser is closed
 * Owner only (rows are scoped to the signed-in account).
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { isSameOrigin } from "@/lib/security/origin";
import { taskRows, taskView } from "@/lib/browser/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, ctx: Ctx) {
  const ws = await currentWorkspace(req, { allowAnonymous: false });
  await limitRequest(req, "browser-tasks", { perIp: 1200, perAccount: 1200, accountId: ws.id, windowSec: 3600 });
  const { id } = await ctx.params;
  const task = await taskRows().get(ws.id, String(id).slice(0, 80));
  if (!task) throw new HttpError(404, "Not found.", "not_found");
  return { ws, task };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { task } = await load(req, ctx);
    return json({ task: taskView(task) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const { ws, task } = await load(req, ctx);
    const b = await body<{ stop?: unknown }>(req);
    if (b.stop !== true) throw new HttpError(400, "Nothing to do.", "invalid");
    if (task.status !== "running") return json({ task: taskView(task) });
    const row = await taskRows().update(ws.id, task.id, { stopRequested: true });
    return json({ task: taskView(row ?? task) });
  } catch (e) {
    return errorResponse(e);
  }
}
