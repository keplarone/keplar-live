/** One set: GET (content without quiz answers + progress + dashboard + plan), PATCH (title, exam date), DELETE (hard delete: set, guide text, progress). */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { studyWorkspace } from "@/lib/tools/access";
import { clean } from "@/lib/tools/json";
import { deleteSet, progressRows, sets } from "@/lib/study/repo";
import { emptyProgress, mastery, overallMastery, studyPlan } from "@/lib/study/progress";
import { dayOf, isDue, streak } from "@/lib/study/srs";
import { validExamDate } from "@/lib/study/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, ctx: Ctx) {
  const ws = await studyWorkspace(req);
  const { id } = await ctx.params;
  const set = await sets().get(ws.id, id);
  if (!set) throw new HttpError(404, "Study set not found.", "not_found");
  return { ws, set };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { ws, set } = await load(req, ctx);
    const p = (await progressRows().get(ws.id, set.id)) ?? emptyProgress(ws.id, set.id);
    const today = dayOf();
    const m = mastery(set, p);
    const { questions, ...rest } = set;
    return json({
      set: { ...rest, questionCount: questions.length },
      progress: { diagnosticDone: p.diagnosticDone, mock: p.mock, streak: streak(p.days, today), mastery: m, overall: overallMastery(m), dueCards: set.cards.filter((c) => isDue(p.cards[c.id], today)).length, cardStates: p.cards },
      plan: set.examDate ? studyPlan(set, m, set.examDate, today) : [],
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { ws, set } = await load(req, ctx);
    const b = await body<{ title?: unknown; examDate?: unknown }>(req);
    const patch: Partial<typeof set> = { updatedAt: now() };
    if (b.title !== undefined) patch.title = clean(b.title, 120) || set.title;
    if (b.examDate !== undefined) {
      if (b.examDate === null || b.examDate === "") patch.examDate = null;
      else {
        const d = validExamDate(b.examDate);
        if (!d) throw new HttpError(400, "Pick an exam date from today onward.", "bad_request");
        patch.examDate = d;
      }
    }
    await sets().update(ws.id, set.id, patch);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { ws, set } = await load(req, ctx);
    await deleteSet(ws.id, set.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
