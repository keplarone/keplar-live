/**
 * Slides decks. Every handler starts with slidesWorkspace(): signed out is 401, Free is 403
 * (`plan_required`, upgradeTo plus), regardless of what the page shows.
 *   GET  -> the user's decks (newest first, without slide bodies)
 *   POST -> generate a deck { topic, outline?, material?, count, style, theme }; charged from the cost the providers report
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { slidesWorkspace, dailyLimit, minuteLimit } from "@/lib/tools/access";
import { slidesLimitsFor } from "@/lib/tools/limits";
import { deadline, preflight, requireDeps, ToolModelError, ToolRun } from "@/lib/tools/run";
import { generateDeck } from "@/lib/slides/engine";
import { estimateDeckUsd } from "@/lib/slides/estimate";
import { decks, isStyle, isTheme, newDeck } from "@/lib/slides/repo";
import { normalizeText } from "@/lib/documents/ingest";
import { FIELD_MAX } from "@/lib/slides/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const ws = await slidesWorkspace(req);
    const rows = (await decks().list(ws.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json({ decks: rows.map((d) => ({ id: d.id, title: d.title, topic: d.topic, theme: d.theme, slides: d.slides.length, updatedAt: d.updatedAt })), limits: slidesLimitsFor(ws.plan) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  let run: ToolRun | null = null;
  let wsRef: Awaited<ReturnType<typeof slidesWorkspace>> | null = null;
  try {
    const ws = await slidesWorkspace(req);
    wsRef = ws;
    const L = slidesLimitsFor(ws.plan)!;
    const b = await body<Record<string, unknown>>(req);
    const topic = normalizeText(typeof b.topic === "string" ? b.topic : "").slice(0, FIELD_MAX.topic);
    const outline = normalizeText(typeof b.outline === "string" ? b.outline : "").slice(0, 6000);
    const material = normalizeText(typeof b.material === "string" ? b.material : "");
    if (topic.length < 3) throw new HttpError(400, "Tell Keplar what the deck is about (a few words at least).", "bad_request");
    if (material.length > L.maxMaterialChars) throw new HttpError(413, `That source is too long for your plan (up to ${L.maxMaterialChars.toLocaleString("en-US")} characters). Use less of it.`, "too_large");
    const count = Math.min(L.maxSlides, Math.max(3, Math.round(Number(b.count) || 8)));
    const style = isStyle(b.style) ? b.style : "clean";
    const theme = isTheme(b.theme) ? b.theme : "dark";
    await minuteLimit(`slides:${ws.id}:min`, 6);
    await dailyLimit(`slides:${ws.id}:gen`, L.perDay, "slide decks");
    if ((await decks().list(ws.id)).length >= L.maxDecks) throw new HttpError(409, `You've saved ${L.maxDecks} decks. Delete one to make room.`, "limit");
    const est = estimateDeckUsd(ws.plan, topic.length + outline.length + material.length, count);
    await preflight(ws, est);
    const deps = requireDeps(ws.plan);
    run = new ToolRun(ws, deps, deadline(req, 100_000));
    const out = await generateDeck(run, { topic, outline, material: material.slice(0, L.maxMaterialChars), count, style });
    const credits = await run.settle(ws, "slides.deck");
    const deck = newDeck(ws.id, { title: out.title, topic, style, theme, slides: out.slides, model: run.model ?? undefined, credits });
    await decks().insert(deck);
    return json({ deck, credits });
  } catch (e) {
    if (run && wsRef) await run.settle(wsRef, "slides.deck").catch(() => undefined);
    if (e instanceof ToolModelError) return json({ error: e.busy ? "The models are busy right now. You were not charged. Try again in a minute." : `${e.message}`, code: "model_error" }, { status: 502 });
    return errorResponse(e);
  }
}

