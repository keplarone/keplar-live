import { errorResponse, json } from "@/lib/create/platform/http";
import { startStripeBank } from "@/lib/business/stripe-banks";
import { hideSetupDetail } from "@/lib/business/visibility";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let admin = false;
  try {
    const ws = await owner(req);
    admin = ws.admin;
    return json(await startStripeBank(ws.id));
  } catch (e) {
    return errorResponse(hideSetupDetail(e, admin));
  }
}
