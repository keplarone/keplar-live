/**
 * The Run ledger (src/lib/runs): everything Keplar is doing or has done for the signed-in person, newest first.
 *   GET /api/runs   { runs: RunView[] }   read only; each source keeps its own actions (Approvals, Core "Keep working")
 */
import { errorResponse, json } from "@/lib/create/platform/http";
import { listRuns } from "@/lib/runs/ledger";
import { ledgerScope } from "./scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const runs = await listRuns(await ledgerScope(req));
    return json({ runs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
