/** Record a finished diagnostic or mock exam (score is recomputed from the answers already recorded; the browser's number is only used as a total). */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { studyWorkspace } from "@/lib/tools/access";
import { emptyProgress } from "@/lib/study/progress";
import { progressRows, saveProgress, sets } from "@/lib/study/repo";
import { dayOf } from "@/lib/study/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await studyWorkspace(req);
    const { id } = await ctx.params;
    const set = await sets().get(ws.id, id);
    if (!set) throw new HttpError(404, "Study set not found.", "not_found");
    const b = await body<{ kind?: unknown; ids?: unknown }>(req);
    const p = (await progressRows().get(ws.id, set.id)) ?? emptyProgress(ws.id, set.id);
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string").slice(0, 100);
    const known = ids.filter((i) => set.questions.some((q) => q.id === i));
    if (b.kind === "diagnostic") p.diagnosticDone = true;
    if (b.kind === "mock" && known.length) {
      // Score from the server's own record of the last answer to each question in this exam.
      const score = known.filter((i) => p.questions[i]?.lastCorrect).length;
      p.mock = [...p.mock, { at: dayOf(), score, total: known.length }].slice(-20);
    }
    p.updatedAt = now();
    await saveProgress(p);
    return json({ ok: true, mock: p.mock });
  } catch (e) {
    return errorResponse(e);
  }
}
