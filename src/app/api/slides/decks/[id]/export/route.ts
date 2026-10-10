/** Export a saved deck: ?format=pptx | pdf. Free of charge (no model call). */
import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { slidesWorkspace, minuteLimit } from "@/lib/tools/access";
import { decks } from "@/lib/slides/repo";
import { deckToPdf, deckToPptx, safeFileName } from "@/lib/slides/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await slidesWorkspace(req);
    await minuteLimit(`slides:${ws.id}:export`, 20);
    const { id } = await ctx.params;
    const deck = await decks().get(ws.id, id);
    if (!deck) throw new HttpError(404, "Deck not found.", "not_found");
    const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "pptx";
    const name = safeFileName(deck.title);
    if (format === "pdf") {
      const bytes = await deckToPdf(deck);
      return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"`, "cache-control": "no-store" } });
    }
    const buf = await deckToPptx(deck);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "content-disposition": `attachment; filename="${name}.pptx"`, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
