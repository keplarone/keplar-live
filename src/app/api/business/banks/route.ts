import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { listBanks, removeBank } from "@/lib/business/plaid";
import { banksView } from "@/lib/business/visibility";
import { owner } from "../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    return json(banksView(await listBanks(ws.id, new URL(req.url).searchParams.get("data") === "1"), ws.admin));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<{ id: string }>(req);
    if (!(await removeBank(ws.id, String(b.id)))) throw new HttpError(404, "Bank not found.");
    return json(banksView(await listBanks(ws.id, false), ws.admin));
  } catch (e) {
    return errorResponse(e);
  }
}
