/** Pick quiz questions: kind = diagnostic | practice | adaptive | mock. Answers and explanations are NOT sent. */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { minuteLimit, studyWorkspace } from "@/lib/tools/access";
import { studyLimitsFor } from "@/lib/tools/limits";
import { emptyProgress, pickQuestions, publicQuestion, type QuizKind } from "@/lib/study/progress";
import { progressRows, sets } from "@/lib/study/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const KINDS: QuizKind[] = ["diagnostic", "practice", "adaptive", "mock"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await studyWorkspace(req);
    const { id } = await ctx.params;
    const set = await sets().get(ws.id, id);
    if (!set) throw new HttpError(404, "Study set not found.", "not_found");
    await minuteLimit(`study:${ws.id}:quiz`, 30);
    const b = await body<{ kind?: unknown; topicId?: unknown }>(req);
    const kind = KINDS.includes(b.kind as QuizKind) ? (b.kind as QuizKind) : "practice";
    const L = studyLimitsFor(ws.plan);
    const n = kind === "diagnostic" ? L.diagnosticQuestions : kind === "mock" ? L.mockQuestions : 10;
    const p = (await progressRows().get(ws.id, set.id)) ?? emptyProgress(ws.id, set.id);
    const topicId = typeof b.topicId === "string" && set.topics.some((t) => t.id === b.topicId) ? b.topicId : undefined;
    const qs = pickQuestions(set, p, kind, n, Date.now() & 0xffff, topicId);
    if (!qs.length) throw new HttpError(409, "There are no questions for this set yet.", "empty");
    return json({ kind, questions: qs.map(publicQuestion) });
  } catch (e) {
    return errorResponse(e);
  }
}
