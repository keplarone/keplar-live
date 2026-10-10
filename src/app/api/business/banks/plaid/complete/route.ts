import { errorResponse, json } from "@/lib/create/platform/http";
import { completeLinks, listBanks } from "@/lib/business/plaid";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const r = await completeLinks(ws.id);
    return json({ ...r, banks: await listBanks(ws.id, false) });
  } catch (e) {
    return errorResponse(e);
  }
}
