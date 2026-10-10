/** Rewrite one slide with the model. Charged from the reported cost; a reply that can't be used is not charged. */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { slidesWorkspace, dailyLimit, minuteLimit } from "@/lib/tools/access";
import { slidesLimitsFor } from "@/lib/tools/limits";
import { deadline, preflight, requireDeps, ToolModelError, ToolRun } from "@/lib/tools/run";
import { regenerateSlide } from "@/lib/slides/engine";
import { estimateSlideUsd } from "@/lib/slides/estimate";
import { decks } from "@/lib/slides/repo";
import { clean } from "@/lib/tools/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  let run: ToolRun | null = null;
  let wsRef: Awaited<ReturnType<typeof slidesWorkspace>> | null = null;
  try {
    const ws = await slidesWorkspace(req);
    wsRef = ws;
    const { id } = await ctx.params;
    const deck = await decks().get(ws.id, id);
    if (!deck) throw new HttpError(404, "Deck not found.", "not_found");
    const b = await body<{ index?: unknown; instruction?: unknown }>(req);
    const index = Number(b.index);
    if (!Number.isInteger(index) || index < 0 || index >= deck.slides.length) throw new HttpError(400, "Pick a slide to rewrite.", "bad_request");
    const instruction = clean(b.instruction, 500);
    const L = slidesLimitsFor(ws.plan)!;
    await minuteLimit(`slides:${ws.id}:min`, 10);
    await dailyLimit(`slides:${ws.id}:regen`, L.perDay * 5, "slide rewrites");
    const chars = JSON.stringify(deck.slides).length;
    await preflight(ws, estimateSlideUsd(ws.plan, chars));
    run = new ToolRun(ws, requireDeps(ws.plan), deadline(req, 50_000));
    const slide = await regenerateSlide(run, deck.title, deck.slides, index, instruction, deck.style);
    const credits = await run.settle(ws, "slides.slide");
    const slides = deck.slides.map((s, i) => (i === index ? slide : s));
    const saved = await decks().update(ws.id, deck.id, { slides, credits: deck.credits + credits, updatedAt: now() });
    return json({ deck: saved, slide, credits });
  } catch (e) {
    if (run && wsRef) await run.settle(wsRef, "slides.slide").catch(() => undefined);
    if (e instanceof ToolModelError) return json({ error: e.busy ? "The models are busy right now. You were not charged. Try again in a minute." : e.message, code: "model_error" }, { status: 502 });
    return errorResponse(e);
  }
}
