import { errorResponse, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { adminOverview } from "@/lib/ops/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Real operational data for the admin console. Admin session only; everyone else gets 404. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json(await adminOverview());
  } catch (e) {
    return errorResponse(e);
  }
}
