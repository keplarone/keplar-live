import { assertSameOrigin } from "@/lib/security/origin";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { requireBusiness } from "@/lib/business/require";
import { reportFile, reportsStore } from "@/lib/business/reports";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** One saved report; ?format=md downloads it as a Markdown file with its sources. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await requireBusiness(req);
    const { id } = await ctx.params;
    const r = await reportsStore().get(ws.id, id);
    if (!r) throw new HttpError(404, "Report not found.", "not_found");
    if (new URL(req.url).searchParams.get("format") === "md") {
      const f = reportFile(r);
      return new Response(f.text, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, "cache-control": "no-store" } });
    }
    return json({ report: r });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    const { id } = await ctx.params;
    return json({ deleted: await reportsStore().remove(ws.id, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
