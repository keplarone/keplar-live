/**
 * Grade one answer. Multiple choice is graded on the server from the stored key (instant, free); short answers are
 * graded by a model (Free: free models; Plus/Pro: charged from the reported cost). Records progress, the study streak,
 * and (with `finish`) the diagnostic / mock result.
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { dailyLimit, minuteLimit, studyWorkspace } from "@/lib/tools/access";
import { studyLimitsFor } from "@/lib/tools/limits";
import { deadline, preflight, requireDeps, ToolModelError, ToolRun } from "@/lib/tools/run";
import { estimateCallUsd, tokensOf, type ToolPlan } from "@/lib/tools/models";
import { gradeShort } from "@/lib/study/engine";
import { emptyProgress } from "@/lib/study/progress";
import { progressRows, saveProgress, sets } from "@/lib/study/repo";
import { dayOf } from "@/lib/study/srs";
import type { Progress } from "@/lib/study/types";

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
    if (!set) throw new HttpError(404, "Study set not found.", "not_found");
    const b = await body<{ questionId?: unknown; choice?: unknown; answer?: unknown; finish?: unknown }>(req);
    const q = set.questions.find((x) => x.id === b.questionId);
    if (!q) throw new HttpError(400, "Unknown question.", "bad_request");
    await minuteLimit(`study:${ws.id}:answer`, 40);
    let correct: boolean;
    let feedback = "";
    let reference: string;
    let credits = 0;
    if (q.type === "mc") {
      const choice = Number(b.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new HttpError(400, "Pick one of the options.", "bad_request");
      correct = choice === q.answer;
      reference = q.options[q.answer];
    } else {
      const L = studyLimitsFor(ws.plan);
      await dailyLimit(`study:${ws.id}:grade`, L.gradesPerDay, "graded answers");
      const answer = typeof b.answer === "string" ? b.answer : "";
      await preflight(ws, estimateCallUsd(ws.plan as ToolPlan, tokensOf(answer.length + q.q.length + q.answer.length) + 500, 250));
      run = new ToolRun(ws, requireDeps(ws.plan as ToolPlan), deadline(req, 40_000));
      const v = await gradeShort(run, q, answer);
      credits = await run.settle(ws, "study.grade");
      correct = v.correct;
      feedback = v.feedback;
      reference = q.answer;
    }
    const today = dayOf();
    const p: Progress = (await progressRows().get(ws.id, set.id)) ?? emptyProgress(ws.id, set.id);
    const st = p.questions[q.id] ?? { seen: 0, correct: 0, lastCorrect: false, lastAt: "" };
    p.questions[q.id] = { seen: st.seen + 1, correct: st.correct + (correct ? 1 : 0), lastCorrect: correct, lastAt: today };
    if (!p.days.includes(today)) p.days = [...p.days, today].slice(-400);
    const fin = b.finish as { kind?: unknown; score?: unknown; total?: unknown } | undefined;
    if (fin?.kind === "diagnostic") p.diagnosticDone = true;
    p.updatedAt = now();
    await saveProgress(p);
    return json({ correct, explanation: q.explanation, reference, feedback, page: q.page, credits });
  } catch (e) {
    if (run && wsRef) await run.settle(wsRef, "study.grade").catch(() => undefined);
    if (e instanceof ToolModelError) return json({ error: e.busy ? "The models are busy right now. You were not charged. Try again in a minute." : e.message, code: "model_error" }, { status: 502 });
    return errorResponse(e);
  }
}
