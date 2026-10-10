import { errorResponse, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { adminReport } from "@/lib/referrals/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: every referral claim (masked address, outcome, why), program totals, today's cap use. No network or browser identifiers. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json(await adminReport());
  } catch (e) {
    return errorResponse(e);
  }
}
