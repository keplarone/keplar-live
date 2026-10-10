/** Flashcards: GET due cards, POST a review grade (again/hard/good/easy) -> SM-2 schedule + Leitner box, stored per user. No model, no cost. */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { minuteLimit, studyWorkspace } from "@/lib/tools/access";
import { emptyProgress } from "@/lib/study/progress";
import { progressRows, saveProgress, sets } from "@/lib/study/repo";
import { dayOf, isDue, isGrade, review } from "@/lib/study/srs";

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
    const all = new URL(req.url).searchParams.get("all") === "1";
    const cards = set.cards.filter((c) => all || isDue(p.cards[c.id], today)).map((c) => ({ ...c, state: p.cards[c.id] ?? null }));
    return json({ cards, total: set.cards.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { ws, set } = await load(req, ctx);
    await minuteLimit(`study:${ws.id}:cards`, 120);
    const b = await body<{ cardId?: unknown; grade?: unknown }>(req);
    if (!set.cards.some((c) => c.id === b.cardId) || !isGrade(b.grade)) throw new HttpError(400, "Unknown card or grade.", "bad_request");
    const today = dayOf();
    const p = (await progressRows().get(ws.id, set.id)) ?? emptyProgress(ws.id, set.id);
    const next = review(p.cards[b.cardId as string], b.grade, today);
    p.cards[b.cardId as string] = next;
    if (!p.days.includes(today)) p.days = [...p.days, today].slice(-400);
    p.updatedAt = now();
    await saveProgress(p);
    return json({ state: next });
  } catch (e) {
    return errorResponse(e);
  }
}
