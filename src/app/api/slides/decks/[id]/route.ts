/** One deck: read, save edits (reorder, edit text, theme, title), delete. Edits cost nothing. */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { slidesWorkspace } from "@/lib/tools/access";
import { slidesLimitsFor } from "@/lib/tools/limits";
import { cleanTitle, decks, isStyle, isTheme, sanitizeSlides } from "@/lib/slides/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, ctx: Ctx) {
  const ws = await slidesWorkspace(req);
  const { id } = await ctx.params;
  const deck = await decks().get(ws.id, id);
  if (!deck) throw new HttpError(404, "Deck not found.", "not_found");
  return { ws, deck };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    return json({ deck: (await load(req, ctx)).deck });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { ws, deck } = await load(req, ctx);
    const b = await body<Record<string, unknown>>(req);
    const L = slidesLimitsFor(ws.plan)!;
    const patch: Partial<typeof deck> = { updatedAt: now() };
    if (b.title !== undefined) patch.title = cleanTitle(b.title, deck.title);
    if (isTheme(b.theme)) patch.theme = b.theme;
    if (isStyle(b.style)) patch.style = b.style;
    if (b.slides !== undefined) {
      const slides = sanitizeSlides(b.slides, L.maxSlides);
      if (!slides) throw new HttpError(400, "A deck needs at least one slide.", "bad_request");
      patch.slides = slides;
    }
    const saved = await decks().update(ws.id, deck.id, patch);
    return json({ deck: saved });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { ws, deck } = await load(req, ctx);
    await decks().remove(ws.id, deck.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
