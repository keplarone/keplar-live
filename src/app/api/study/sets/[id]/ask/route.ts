/** Ask the guide / explain simply: grounded only in the uploaded material, with page citations. mode = ask | simple. */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { chunkPages } from "@/lib/documents/chunk";
import { dailyLimit, minuteLimit, studyWorkspace } from "@/lib/tools/access";
import { studyLimitsFor } from "@/lib/tools/limits";
import { deadline, preflight, requireDeps, ToolModelError, ToolRun } from "@/lib/tools/run";
import { estimateCallUsd, tokensOf, type ToolPlan } from "@/lib/tools/models";
import { askGuide } from "@/lib/study/engine";
import { guides, sets } from "@/lib/study/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let run: ToolRun | null = null;
  let wsRef: Awaited<ReturnType<typeof studyWorkspace>> | null = null;
  try {
    const ws = await studyWorkspace(req);
    wsRef = ws;
    const { id } = await ctx.params;
    const set = await sets().get(ws.id, id);
    const guide = await guides().get(ws.id, id);
    if (!set || !guide) throw new HttpError(404, "Study set not found.", "not_found");
    const b = await body<{ question?: unknown; mode?: unknown }>(req);
    const question = typeof b.question === "string" ? b.question.trim() : "";
    if (question.length < 2) throw new HttpError(400, "Type a question.", "bad_request");
    if (question.length > 800) throw new HttpError(413, "Keep the question under 800 characters.", "too_large");
    const L = studyLimitsFor(ws.plan);
    await minuteLimit(`study:${ws.id}:ask:min`, 12);
    await dailyLimit(`study:${ws.id}:ask`, L.asksPerDay, "questions to your guide");
    const mode = b.mode === "simple" ? "simple" : "ask";
    await preflight(ws, estimateCallUsd(ws.plan as ToolPlan, tokensOf(L.askExcerpts * 1500) + 400, L.askMaxOutputTokens));
    run = new ToolRun(ws, requireDeps(ws.plan as ToolPlan), deadline(req, 45_000));
    const reply = await askGuide(run, chunkPages(guide.pages), question, L, mode);
    const credits = await run.settle(ws, "study.ask");
    return json({ ...reply, credits });
  } catch (e) {
    if (run && wsRef) await run.settle(wsRef, "study.ask").catch(() => undefined);
    if (e instanceof ToolModelError) return json({ error: e.busy ? "The models are busy right now. You were not charged. Try again in a minute." : e.message, code: "model_error" }, { status: 502 });
    return errorResponse(e);
  }
}
