import { errorResponse, json } from "@/lib/create/platform/http";
import { startLink } from "@/lib/business/plaid";
import { hideSetupDetail } from "@/lib/business/visibility";
import { requireBusinessRole } from "@/lib/business/team";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  let admin = false;
  try {
    const ws = await owner(req);
    requireBusinessRole(ws, "connect a bank");
    admin = ws.admin;
    const { url } = await startLink(ws.id);
    return json({ url });
  } catch (e) {
    return errorResponse(hideSetupDetail(e, admin));
  }
}
