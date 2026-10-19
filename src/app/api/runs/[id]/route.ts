/**
 * One run from the ledger, with a finished Core answer's text.
 *   GET /api/runs/:id   RunView   (`core.<job>`, `agent.<run>` or `tools.<turn>`); 404 when it is not the caller's
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { getRun } from "@/lib/runs/ledger";
import { ledgerScope } from "../scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const scope = await ledgerScope(req);
    const { id } = await ctx.params;
    const run = await getRun(scope, decodeURIComponent(String(id)).slice(0, 100));
    if (!run) throw new HttpError(404, "Not found.", "not_found");
    return json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
