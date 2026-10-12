/**
 * Keplar Browser tasks (src/lib/browser/tasks.ts): an isolated, AI-driven Chromium that keeps working on Keplar's servers.
 *   GET  /api/browser/tasks               the person's recent tasks, newest first
 *   POST /api/browser/tasks {goal, url?}  start one; it runs after this response, saving each step, so the tab can be closed
 * Signed-in only, same-origin, rate limited; one running task per account. Public websites only; it stops before anything
 * that spends, sends, deletes or signs in.
 */
import { after } from "next/server";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { MAX_GOAL_CHARS } from "@/lib/browser/policy";
import { createTask, listTasks, modelDecide, runStoredTask, TaskBusy, taskView } from "@/lib/browser/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req, { allowAnonymous: false });
    await limitRequest(req, "browser-tasks", { perIp: 1200, perAccount: 1200, accountId: ws.id, windowSec: 3600 });
    return json({ tasks: (await listTasks(ws.id)).map((t) => taskView(t)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: false });
    await limitRequest(req, "browser-run", { perIp: 20, perAccount: 20, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ goal?: unknown; url?: unknown }>(req);
    const goal = typeof b.goal === "string" ? b.goal.replace(/\s+/g, " ").trim().slice(0, MAX_GOAL_CHARS) : "";
    const url = typeof b.url === "string" ? b.url.trim().slice(0, 2048) : "";
    if (goal.length < 4) throw new HttpError(400, "Say what Keplar should do in the browser.", "invalid");
    // Not tied to this request: the task keeps going when the person closes the tab.
    const decide = modelDecide();
    if (!decide) throw new HttpError(503, "Keplar Browser needs the live models, which are off right now. Nothing was opened.", "unavailable");
    let task;
    try {
      task = await createTask(ws.id, goal, url || undefined);
    } catch (e) {
      if (e instanceof TaskBusy) throw new HttpError(409, e.message, "busy");
      throw e;
    }
    const work = runStoredTask(task, { decide }).catch((e) => console.error("[browser] task failed:", e instanceof Error ? e.name : "error"));
    try { after(work); } catch { /* outside a request scope: the promise still runs */ }
    return json({ task: taskView(task) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
