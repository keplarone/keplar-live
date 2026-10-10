import { errorResponse, json } from "@/lib/create/platform/http";
import { dashboard } from "@/lib/business/dashboard";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json({ plan: ws.plan, entitlements: ws.entitlements, ...(await dashboard(ws)) });
  } catch (e) {
    return errorResponse(e);
  }
}
