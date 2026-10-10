import { errorResponse, json } from "@/lib/create/platform/http";
import { listOrders } from "@/lib/business/commerce";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json({ orders: await listOrders(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
