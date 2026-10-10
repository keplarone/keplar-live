import { errorResponse, json } from "@/lib/create/platform/http";
import { listInbox } from "@/lib/business/crm";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json({ messages: await listInbox(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
